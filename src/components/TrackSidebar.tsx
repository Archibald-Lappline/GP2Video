import {Check, FolderOpen, Music, Plus, Trash2, Upload, Volume2, VolumeX} from 'lucide-react';
import {useRef, useState} from 'react';
import type {AudioTrackState, ScoreMetadata, TrackState} from '../types/studio';
import {formatDurationMs} from '../utils/scoreUtils';

interface TrackSidebarProps {
  metadata: ScoreMetadata | null;
  tracks: TrackState[];
  audioTracks: AudioTrackState[];
  onFileSelected: (fileName: string, data: ArrayBuffer) => void;
  onClearProject: () => void;
  onAddAudioFiles: (files: Array<{name: string; mimeType: string; bytes: Uint8Array}>) => void;
  onToggleTrackSelected: (trackIndex: number) => void;
  onSelectAllTracks: () => void;
  onSelectFirstTrack: () => void;
  onRemoveTrack: (trackIndex: number) => void;
  onToggleMute: (trackIndex: number) => void;
  onToggleSolo: (trackIndex: number) => void;
  onVolumeChange: (trackIndex: number, volume: number) => void;
  onToggleAudioMute: (audioId: string) => void;
  onToggleAudioSolo: (audioId: string) => void;
  onAudioVolumeChange: (audioId: string, volume: number) => void;
  onAudioOffsetChange: (audioId: string, offsetMs: number) => void;
  onRemoveAudioTrack: (audioId: string) => void;
}

function SyncOffsetControl({
  name,
  offsetMs,
  onChange,
}: {
  name: string;
  offsetMs: number;
  onChange: (nextOffsetMs: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const displayValue = isEditing
    ? draft
    : offsetMs > 0
    ? `+${offsetMs}`
    : String(offsetMs);

  const commitDraft = (raw: string) => {
    const trimmed = raw.trim();
    if (trimmed === '' || trimmed === '-' || trimmed === '+') {
      onChange(0);
    } else {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed)) {
        onChange(parsed);
      }
    }
    setIsEditing(false);
  };

  return (
    <div className="mt-2.5 pt-2 border-t border-white/6 space-y-1.5">
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <span className="text-zinc-400">Sync Offset</span>
        <div className="flex items-center gap-1.5">
          {offsetMs !== 0 && (
            <button
              type="button"
              onClick={() => onChange(0)}
              className="px-1.5 py-0.5 rounded bg-white/8 hover:bg-white/15 text-[10px] text-zinc-300 hover:text-white transition-colors cursor-pointer"
            >
              Reset
            </button>
          )}
          <label className="inline-flex items-center gap-1 rounded bg-[#0B0D11] border border-white/15 focus-within:border-[var(--sf-accent)] px-1.5 py-0.5 transition-colors cursor-text">
            <input
              type="text"
              inputMode="numeric"
              value={displayValue}
              aria-label={`${name} offset value in milliseconds`}
              onFocus={(e) => {
                setIsEditing(true);
                setDraft(String(offsetMs));
                e.currentTarget.select();
              }}
              onChange={(e) => {
                const raw = e.target.value;
                if (/^[+-]?\d*$/.test(raw)) {
                  setDraft(raw);
                  const parsed = Number.parseInt(raw, 10);
                  if (Number.isFinite(parsed)) {
                    onChange(parsed);
                  }
                }
              }}
              onBlur={() => commitDraft(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.currentTarget.blur();
                } else if (e.key === 'Escape') {
                  setIsEditing(false);
                  e.currentTarget.blur();
                }
              }}
              className="w-12 bg-transparent font-mono text-[11px] text-white text-right tabular-nums focus:outline-none"
            />
            <span className="font-mono text-[10px] text-zinc-400 select-none">ms</span>
          </label>
        </div>
      </div>
      <div className="relative flex items-center py-1">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 w-0.5 h-2.5 bg-white/25 rounded-full"
        />
        <input
          type="range"
          min={-5000}
          max={5000}
          step={25}
          value={Math.max(-5000, Math.min(5000, offsetMs))}
          aria-label={`${name} offset slider in milliseconds`}
          onChange={(e) => onChange(Number(e.target.value))}
          className="relative z-10 w-full h-1.5 appearance-none rounded-full bg-white/12 border border-white/10 cursor-pointer accent-[var(--sf-accent)] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[var(--sf-accent)] [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-[#0B0D11] [&::-webkit-slider-thumb]:shadow [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-110 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[var(--sf-accent)] [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-[#0B0D11]"
        />
      </div>
    </div>
  );
}

export function TrackSidebar({
  metadata,
  tracks,
  audioTracks,
  onFileSelected,
  onClearProject,
  onAddAudioFiles,
  onToggleTrackSelected,
  onSelectAllTracks,
  onSelectFirstTrack,
  onRemoveTrack,
  onToggleMute,
  onToggleSolo,
  onVolumeChange,
  onToggleAudioMute,
  onToggleAudioSolo,
  onAudioVolumeChange,
  onAudioOffsetChange,
  onRemoveAudioTrack,
}: TrackSidebarProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const selectedCount = tracks.filter((t) => t.selected).length;

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const file = files[0];
    const buffer = await file.arrayBuffer();
    onFileSelected(file.name, buffer);
  };

  const handleAudioFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) {
      return;
    }
    const items: Array<{name: string; mimeType: string; bytes: Uint8Array}> = [];
    for (const file of Array.from(files)) {
      const buffer = await file.arrayBuffer();
      items.push({
        name: file.name,
        mimeType: file.type || 'audio/mpeg',
        bytes: new Uint8Array(buffer),
      });
    }
    onAddAudioFiles(items);
  };

  const handleOpenClick = async () => {
    const desktopApi = (window as unknown as {
      scoreFrameDesktop?: {openGpFile?: () => Promise<{name: string; data: ArrayBuffer} | null>};
    }).scoreFrameDesktop;

    if (desktopApi?.openGpFile) {
      const result = await desktopApi.openGpFile();
      if (result) {
        onFileSelected(result.name, result.data);
        return;
      }
    }
    fileInputRef.current?.click();
  };

  return (
    <aside className="w-[312px] shrink-0 border-r border-white/10 bg-[#10131A] flex flex-col min-h-0">
      <div className="p-4 border-b border-white/10">
        <input
          ref={fileInputRef}
          type="file"
          accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp8,.xml,.musicxml,.mxl,.cap,.tg"
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <input
          ref={audioInputRef}
          type="file"
          multiple
          accept=".mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.webm,audio/*"
          className="hidden"
          onChange={(e) => {
            void handleAudioFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <div
          onClick={() => {
            void handleOpenClick();
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            void handleFiles(e.dataTransfer.files);
          }}
          className={`rounded-lg border border-dashed p-3.5 transition-colors cursor-pointer ${
            isDragging
              ? 'border-[var(--sf-accent)] bg-white/10'
              : 'border-white/15 bg-[#151922] hover:border-white/25'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">
                {metadata ? metadata.fileName : 'Load Guitar Pro File'}
              </p>
              <p className="text-[11px] text-zinc-400 mt-0.5">
                Supports .gp, .gp3–.gp8, .gpx, MusicXML
              </p>
            </div>
            {metadata ? (
              <button
                type="button"
                title="Remove project file"
                aria-label="Remove project file"
                onClick={(e) => {
                  e.stopPropagation();
                  onClearProject();
                }}
                className="p-1 rounded bg-white/6 text-zinc-400 hover:text-red-400 hover:bg-red-500/15 transition-colors shrink-0 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            ) : (
              <Upload className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" aria-hidden="true" />
            )}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void handleOpenClick();
            }}
            className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md bg-white/8 hover:bg-white/14 text-xs font-medium text-white transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-accent)]"
          >
            <FolderOpen className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Open GP File</span>
          </button>
        </div>
      </div>

      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-xs font-semibold text-white">Project Tracks</h2>
          <p className="text-[11px] text-zinc-400 tabular-nums mt-0.5">
            {tracks.length > 0
              ? `${selectedCount} of ${tracks.length} score · ${audioTracks.length} audio`
              : `${audioTracks.length} external audio tracks`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {tracks.length > 0 && (
            <>
              <button
                type="button"
                onClick={onSelectAllTracks}
                className="px-2 py-1 text-[11px] font-medium text-zinc-300 hover:text-white bg-white/6 hover:bg-white/12 rounded transition-colors cursor-pointer"
              >
                All
              </button>
              <button
                type="button"
                onClick={onSelectFirstTrack}
                className="px-2 py-1 text-[11px] font-medium text-zinc-300 hover:text-white bg-white/6 hover:bg-white/12 rounded transition-colors cursor-pointer"
              >
                Solo 1st
              </button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto divide-y divide-white/6">
        {tracks.length === 0 && audioTracks.length === 0 && (
          <div className="px-4 py-8 text-center">
            <p className="text-xs text-zinc-400">
              Open a Guitar Pro project to inspect score tracks and embedded MP3 backing tracks.
            </p>
          </div>
        )}

        {tracks.map((track) => {
          const isOnlySelected = track.selected && selectedCount === 1;
          return (
            <div
              key={track.index}
              className={`px-4 py-3 transition-colors ${
                track.selected ? 'bg-white/[0.03]' : 'opacity-70 hover:opacity-95'
              }`}
            >
              <div className="flex items-start gap-2.5">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={track.selected}
                  aria-label={`Include ${track.name} in sheet music`}
                  disabled={isOnlySelected}
                  onClick={() => onToggleTrackSelected(track.index)}
                  style={
                    track.selected
                      ? {backgroundColor: 'var(--sf-accent)', borderColor: 'var(--sf-accent)'}
                      : undefined
                  }
                  className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center border shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed ${
                    track.selected
                      ? 'text-[#0B0D11]'
                      : 'border-white/25 bg-transparent hover:border-white/45'
                  }`}
                >
                  {track.selected && <Check className="w-3 h-3 stroke-[3]" aria-hidden="true" />}
                </button>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate">
                      {track.index + 1}. {track.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleMute(track.index)}
                        title="Mute track"
                        className={`w-6 h-5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          track.muted
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : 'bg-white/6 text-zinc-400 hover:text-white'
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleSolo(track.index)}
                        title="Solo track"
                        className={`w-6 h-5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          track.solo
                            ? 'bg-white/15 text-[var(--sf-accent)] border border-[var(--sf-accent)]'
                            : 'bg-white/6 text-zinc-400 hover:text-white'
                        }`}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveTrack(track.index)}
                        title="Delete track from project"
                        aria-label={`Delete ${track.name}`}
                        className="w-6 h-5 rounded flex items-center justify-center bg-white/6 text-zinc-400 hover:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-0.5 truncate">
                    {track.instrumentLabel}
                    <span aria-hidden="true"> · </span>
                    {track.isPercussion
                      ? 'Percussion'
                      : `${track.stringCount} str · ${track.tuningLabel}`}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    {track.muted ? (
                      <VolumeX className="w-3 h-3 text-zinc-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden="true" />
                    )}
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={track.volume}
                      aria-label={`${track.name} volume`}
                      onChange={(e) => onVolumeChange(track.index, Number(e.target.value))}
                      className="w-full h-1 accent-[var(--sf-accent)] bg-white/10 rounded cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-zinc-400 tabular-nums w-8 text-right">
                      {Math.round(track.volume * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        <div className="px-4 py-3 bg-[#0D1016]/60">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[11px] font-semibold text-zinc-300 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-[var(--sf-accent)]" aria-hidden="true" />
              <span>Audio Tracks (MP3 / WAV)</span>
            </span>
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-white bg-white/8 hover:bg-white/14 rounded transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3" aria-hidden="true" />
              <span>Add MP3</span>
            </button>
          </div>

          {audioTracks.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              No embedded or external audio files attached.
            </p>
          ) : (
            <div className="space-y-3 mt-2">
              {audioTracks.map((audio) => (
                <div key={audio.id} className="pt-2 border-t border-white/6 first:border-t-0 first:pt-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white truncate" title={audio.name}>
                      {audio.name}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onToggleAudioMute(audio.id)}
                        title="Mute audio track"
                        className={`w-6 h-5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          audio.muted
                            ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                            : 'bg-white/6 text-zinc-400 hover:text-white'
                        }`}
                      >
                        M
                      </button>
                      <button
                        type="button"
                        onClick={() => onToggleAudioSolo(audio.id)}
                        title="Solo audio track"
                        className={`w-6 h-5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                          audio.solo
                            ? 'bg-white/15 text-[var(--sf-accent)] border border-[var(--sf-accent)]'
                            : 'bg-white/6 text-zinc-400 hover:text-white'
                        }`}
                      >
                        S
                      </button>
                      <button
                        type="button"
                        onClick={() => onRemoveAudioTrack(audio.id)}
                        title="Delete audio track from project"
                        aria-label={`Delete ${audio.name}`}
                        className="w-6 h-5 rounded flex items-center justify-center bg-white/6 text-zinc-400 hover:text-red-400 hover:bg-red-500/15 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3 h-3" aria-hidden="true" />
                      </button>
                    </div>
                  </div>

                  <p className="text-[11px] text-zinc-400 mt-0.5 tabular-nums">
                    {audio.sourceType === 'embedded' ? 'Embedded in GP' : 'External Audio'}
                    <span aria-hidden="true"> · </span>
                    {formatDurationMs(audio.durationSec * 1000)}
                  </p>

                  <div className="mt-2 flex items-center gap-2">
                    {audio.muted ? (
                      <VolumeX className="w-3 h-3 text-zinc-500 shrink-0" aria-hidden="true" />
                    ) : (
                      <Volume2 className="w-3 h-3 text-zinc-400 shrink-0" aria-hidden="true" />
                    )}
                    <input
                      type="range"
                      min={0}
                      max={1.5}
                      step={0.05}
                      value={audio.volume}
                      aria-label={`${audio.name} volume`}
                      onChange={(e) => onAudioVolumeChange(audio.id, Number(e.target.value))}
                      className="w-full h-1 accent-[var(--sf-accent)] bg-white/10 rounded cursor-pointer"
                    />
                    <span className="text-[10px] font-mono text-zinc-400 tabular-nums w-8 text-right">
                      {Math.round(audio.volume * 100)}%
                    </span>
                  </div>

                  <SyncOffsetControl
                    name={audio.name}
                    offsetMs={audio.offsetMs}
                    onChange={(nextOffset) => onAudioOffsetChange(audio.id, nextOffset)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
