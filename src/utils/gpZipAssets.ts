export interface ExtractedAudioAsset {
  name: string;
  mimeType: string;
  bytes: Uint8Array;
}

const AUDIO_EXTENSIONS = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac', '.opus', '.webm'];

function guessMimeType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) return 'audio/mp4';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.opus')) return 'audio/opus';
  if (lower.endsWith('.webm')) return 'audio/webm';
  return 'audio/mpeg';
}

function isAudioPath(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();

  const readPromise = (async () => {
    const chunks: Uint8Array[] = [];
    let totalLength = 0;
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      chunks.push(value);
      totalLength += value.byteLength;
    }
    const output = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      output.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return output;
  })();

  const safeCopy = new Uint8Array(compressed.byteLength);
  safeCopy.set(compressed);
  const writePromise = (async () => {
    await writer.write(safeCopy);
    await writer.close();
  })();

  const [, output] = await Promise.all([writePromise, readPromise]);
  return output;
}

export async function extractAudioAssetsFromGpBuffer(buffer: ArrayBuffer): Promise<ExtractedAudioAsset[]> {
  try {
    const bytes = new Uint8Array(buffer);
    if (bytes.byteLength < 22 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      return [];
    }

    const view = new DataView(buffer);
    let eocdOffset = -1;
    const minOffset = Math.max(0, bytes.byteLength - 65557);
    for (let i = bytes.byteLength - 22; i >= minOffset; i--) {
      if (
        bytes[i] === 0x50 &&
        bytes[i + 1] === 0x4b &&
        bytes[i + 2] === 0x05 &&
        bytes[i + 3] === 0x06
      ) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset < 0) {
      return [];
    }

    const totalEntries = view.getUint16(eocdOffset + 10, true);
    const centralDirOffset = view.getUint32(eocdOffset + 16, true);
    const decoder = new TextDecoder('utf-8');
    const assets: ExtractedAudioAsset[] = [];

    let ptr = centralDirOffset;
    for (let entryIdx = 0; entryIdx < totalEntries; entryIdx++) {
      if (ptr + 46 > bytes.byteLength) {
        break;
      }
      const sig = view.getUint32(ptr, true);
      if (sig !== 0x02014b50) {
        break;
      }
      const method = view.getUint16(ptr + 10, true);
      const compressedSize = view.getUint32(ptr + 20, true);
      const nameLen = view.getUint16(ptr + 28, true);
      const extraLen = view.getUint16(ptr + 30, true);
      const commentLen = view.getUint16(ptr + 32, true);
      const localHeaderOffset = view.getUint32(ptr + 42, true);
      const fileName = decoder.decode(bytes.subarray(ptr + 46, ptr + 46 + nameLen));
      ptr += 46 + nameLen + extraLen + commentLen;

      if (!isAudioPath(fileName)) {
        continue;
      }

      if (localHeaderOffset + 30 > bytes.byteLength) {
        continue;
      }
      const localNameLen = view.getUint16(localHeaderOffset + 26, true);
      const localExtraLen = view.getUint16(localHeaderOffset + 28, true);
      const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
      const dataEnd = Math.min(bytes.byteLength, dataStart + compressedSize);
      const compressedSlice = bytes.subarray(dataStart, dataEnd);

      let rawBytes: Uint8Array | null = null;
      if (method === 0) {
        rawBytes = compressedSlice.slice();
      } else if (method === 8) {
        try {
          rawBytes = await inflateRaw(compressedSlice);
        } catch {
          rawBytes = null;
        }
      }

      if (rawBytes && rawBytes.byteLength > 0) {
        const baseName = fileName.split('/').pop() || fileName;
        assets.push({
          name: baseName,
          mimeType: guessMimeType(baseName),
          bytes: rawBytes,
        });
      }
    }

    return assets;
  } catch {
    return [];
  }
}
