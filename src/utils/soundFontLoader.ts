import bundledSf2Url from '@coderline/alphatab/soundfont/sonivox.sf2?url';
import bundledSf3Url from '@coderline/alphatab/soundfont/sonivox.sf3?url';

let cachedSoundFontPromise: Promise<Uint8Array> | null = null;

function isValidSoundFontHeader(bytes: Uint8Array): boolean {
  if (bytes.byteLength < 64) {
    return false;
  }
  return (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x73 &&
    bytes[9] === 0x66 &&
    bytes[10] === 0x62 &&
    bytes[11] === 0x6b
  );
}

function loadViaXhr(url: string): Promise<Uint8Array | null> {
  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.onload = () => {
        if ((xhr.status >= 200 && xhr.status < 300) || xhr.status === 0) {
          const buffer = xhr.response as ArrayBuffer | null;
          if (buffer) {
            const bytes = new Uint8Array(buffer);
            if (isValidSoundFontHeader(bytes)) {
              resolve(bytes);
              return;
            }
          }
        }
        resolve(null);
      };
      xhr.onerror = () => resolve(null);
      xhr.send();
    } catch {
      resolve(null);
    }
  });
}

async function fetchValidatedSoundFont(url: string): Promise<Uint8Array | null> {
  try {
    const response = await fetch(url);
    if (response.ok) {
      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      if (isValidSoundFontHeader(bytes)) {
        return bytes;
      }
    }
  } catch {
  }
  return loadViaXhr(url);
}

function buildCandidateUrls(): string[] {
  const base = import.meta.env.BASE_URL || '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const raw = [
    bundledSf2Url,
    bundledSf3Url,
    `${normalizedBase}soundfont/sonivox.sf2`,
    `${normalizedBase}soundfont/sonivox.sf3`,
    './soundfont/sonivox.sf2',
    './soundfont/sonivox.sf3',
    '/soundfont/sonivox.sf2',
    '/soundfont/sonivox.sf3',
  ].filter((u): u is string => typeof u === 'string' && u.length > 0);
  return Array.from(new Set(raw));
}

async function loadWithRetries(): Promise<Uint8Array> {
  const candidates = buildCandidateUrls();

  for (let attempt = 0; attempt < 4; attempt++) {
    for (const url of candidates) {
      const bytes = await fetchValidatedSoundFont(url);
      if (bytes) {
        return bytes;
      }
    }
    if (attempt < 3) {
      await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
    }
  }

  throw new Error('Failed to load a valid SoundFont2 bank.');
}

export async function loadBundledSoundFontBytes(): Promise<Uint8Array> {
  if (!cachedSoundFontPromise) {
    cachedSoundFontPromise = loadWithRetries().catch((err) => {
      cachedSoundFontPromise = null;
      throw err;
    });
  }
  const bytes = await cachedSoundFontPromise;
  return new Uint8Array(bytes);
}
