import {Pause, Play, Square} from 'lucide-react';
import type {ScoreMetadata, ViewportTab} from '../types/studio';
import {formatDurationMs} from '../utils/scoreUtils';

interface TransportBarProps {
  metadata: ScoreMetadata | null;
  isPlaying: boolean;
  isPlayerReady: boolean;
  currentTimeMs: number;
  totalDurationMs: number;
  playbackSpeed: number;
  metronomeEnabled: boolean;
  activeViewportTab: ViewportTab;
  onTogglePlay: () => void;
  onStop: () => void;
  onSeek: (timeMs: number) => void;
  onSpeedChange: (speed: number) => void;
  onToggleMetronome: () => void;
  onViewportTabChange: (tab: ViewportTab) => void;
}

const SPEED_OPTIONS = [0.5, 0.75, 1.0, 1.25];

export function TransportBar({
  metadata,
  isPlaying,
  isPlayerReady,
  currentTimeMs,
  totalDurationMs,
  playbackSpeed,
  metronomeEnabled,
  activeViewportTab,
  onTogglePlay,
  onStop,
  onSeek,
  onSpeedChange,
  onToggleMetronome,
  onViewportTabChange,
}: TransportBarProps) {
  return (
    <div className="border-b border-white/10 bg-[#12161F] px-5 py-3 flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-[var(--font-display)] text-base font-semibold text-white truncate">
            {metadata?.title ?? 'No Score Loaded'}
          </h1>
          <p className="text-xs text-zinc-400 mt-0.5 truncate">
            {metadata
              ? `${metadata.artist} · ${metadata.tempo} BPM · ${metadata.timeSignature} · ${metadata.barCount} bars`
              : 'Open a Guitar Pro file (.gp, .gp3–.gp8, .gpx, MusicXML) to start'}
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 rounded-md bg-white/6 shrink-0" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeViewportTab === 'sheet'}
            onClick={() => onViewportTabChange('sheet')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              activeViewportTab === 'sheet'
                ? 'bg-[#1D2330] text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Sheet Music
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeViewportTab === 'video'}
            onClick={() => onViewportTabChange('video')}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
              activeViewportTab === 'video'
                ? 'bg-[#1D2330] text-white'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            Video Preview
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!isPlayerReady}
            aria-label={isPlaying ? 'Pause playback' : 'Play score'}
            className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-[var(--sf-accent)] hover:brightness-110 disabled:opacity-40 text-[#0B0D11] transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" aria-hidden="true" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onStop}
            disabled={!isPlayerReady}
            aria-label="Stop and rewind"
            className="inline-flex items-center justify-center w-9 h-9 rounded-md bg-white/7 hover:bg-white/14 disabled:opacity-40 text-zinc-200 transition-colors cursor-pointer"
          >
            <Square className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 min-w-[200px] flex items-center gap-3">
          <span className="font-mono text-xs text-zinc-200 tabular-nums w-16 shrink-0">
            {formatDurationMs(currentTimeMs)}
          </span>
          <input
            type="range"
            min={0}
            max={Math.max(100, totalDurationMs)}
            step={50}
            value={Math.min(currentTimeMs, totalDurationMs)}
            disabled={!isPlayerReady || totalDurationMs <= 0}
            aria-label="Playback position"
            onChange={(e) => onSeek(Number(e.target.value))}
            className="w-full h-1.5 accent-[var(--sf-accent)] bg-white/12 rounded cursor-pointer"
          />
          <span className="font-mono text-xs text-zinc-400 tabular-nums w-16 text-right shrink-0">
            {formatDurationMs(totalDurationMs)}
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-1 bg-white/6 p-0.5 rounded-md">
            {SPEED_OPTIONS.map((spd) => (
              <button
                key={spd}
                type="button"
                onClick={() => onSpeedChange(spd)}
                className={`px-2 py-1 text-[11px] font-mono tabular-nums rounded transition-colors cursor-pointer ${
                  playbackSpeed === spd
                    ? 'bg-white/16 text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {spd}x
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleMetronome}
            className={`px-2.5 py-1.5 text-xs font-medium rounded-md border transition-colors cursor-pointer whitespace-nowrap ${
              metronomeEnabled
                ? 'border-[var(--sf-accent)] bg-white/10 text-[var(--sf-accent)]'
                : 'border-white/10 bg-white/5 text-zinc-400 hover:text-white'
            }`}
          >
            Metronome
          </button>
        </div>
      </div>
    </div>
  );
}
