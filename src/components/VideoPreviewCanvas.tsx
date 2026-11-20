import * as alphaTab from '@coderline/alphatab';
import {useEffect, useRef, useState} from 'react';
import {RESOLUTION_PRESETS} from '../constants/themes';
import {
  createFrameRenderCache,
  disposeRenderedLayout,
  drawVideoFrame,
  findVisibleBeatLookup,
  renderScoreToTiles,
  type RenderedSheetLayout,
} from '../services/videoRenderer';
import type {ScoreMetadata, TrackState, VideoExportSettings} from '../types/studio';

interface VideoPreviewCanvasProps {
  score: alphaTab.model.Score | null;
  tracks: TrackState[];
  metadata: ScoreMetadata | null;
  settings: VideoExportSettings;
  tickCache: alphaTab.midi.MidiTickLookup | null;
  currentTick: number;
  currentTimeMs: number;
  totalDurationMs: number;
  isPlaying: boolean;
  playbackSpeed: number;
}

export function VideoPreviewCanvas({
  score,
  tracks,
  metadata,
  settings,
  tickCache,
  currentTick,
  currentTimeMs,
  totalDurationMs,
  isPlaying,
  playbackSpeed,
}: VideoPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const scrollXRef = useRef(0);
  const scrollYRef = useRef(0);
  const frameCacheRef = useRef(createFrameRenderCache());
  const activeLayoutRef = useRef<RenderedSheetLayout | null>(null);
  const needsInstantScrollRef = useRef(false);
  const syncAnchorRef = useRef({tick: currentTick, timeMs: currentTimeMs, perfMs: performance.now()});
  const [layout, setLayout] = useState<RenderedSheetLayout | null>(null);
  const [isRenderingLayout, setIsRenderingLayout] = useState(false);

  const selectedTrackIndicesKey = tracks
    .filter((t) => t.selected)
    .map((t) => t.index)
    .join(',');

  const latestRef = useRef({
    layout,
    metadata,
    tracks,
    settings,
    tickCache,
    totalDurationMs,
    playbackSpeed,
    isPlaying,
  });

  latestRef.current = {
    layout,
    metadata,
    tracks,
    settings,
    tickCache,
    totalDurationMs,
    playbackSpeed,
    isPlaying,
  };

  useEffect(() => {
    syncAnchorRef.current = {
      tick: currentTick,
      timeMs: currentTimeMs,
      perfMs: performance.now(),
    };
  }, [currentTick, currentTimeMs, isPlaying]);

  useEffect(() => {
    if (!score) {
      setLayout(null);
      return;
    }
    const indices = tracks.filter((t) => t.selected).map((t) => t.index);
    if (indices.length === 0) {
      setLayout(null);
      return;
    }

    let cancelled = false;
    setIsRenderingLayout(true);

    void renderScoreToTiles(score, indices, settings)
      .then((rendered) => {
        if (cancelled) {
          disposeRenderedLayout(rendered);
          return;
        }
        if (activeLayoutRef.current && activeLayoutRef.current !== rendered) {
          disposeRenderedLayout(activeLayoutRef.current);
        }
        activeLayoutRef.current = rendered;
        frameCacheRef.current.lastSheetScrollX = Number.NaN;
        frameCacheRef.current.lastSheetScrollY = Number.NaN;
        needsInstantScrollRef.current = true;
        setLayout(rendered);
        setIsRenderingLayout(false);
      })
      .catch(() => {
        if (!cancelled) {
          setIsRenderingLayout(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    score,
    selectedTrackIndicesKey,
    settings.resolution,
    settings.theme,
    settings.notationMode,
    settings.layoutMode,
  ]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout || !metadata) {
      return;
    }
    const preset = RESOLUTION_PRESETS[settings.resolution];
    if (canvas.width !== preset.width || canvas.height !== preset.height) {
      canvas.width = preset.width;
      canvas.height = preset.height;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    if (!isPlaying) {
      const nextScroll = drawVideoFrame({
        ctx,
        layout,
        settings,
        metadata,
        tracks,
        tickCache,
        currentTick,
        currentTimeMs,
        totalDurationMs,
        smoothedScrollX: scrollXRef.current,
        smoothedScrollY: scrollYRef.current,
        instantScroll: true,
        cache: frameCacheRef.current,
      });
      scrollXRef.current = nextScroll.scrollX;
      scrollYRef.current = nextScroll.scrollY;
    }
  }, [
    layout,
    metadata,
    tracks,
    settings,
    tickCache,
    currentTick,
    currentTimeMs,
    totalDurationMs,
    isPlaying,
  ]);

  useEffect(() => {
    if (!isPlaying || !layout || !metadata) {
      return;
    }

    let rafId = 0;
    let lastFramePerf = performance.now();

    const renderLoop = (now: number) => {
      const state = latestRef.current;
      const canvas = canvasRef.current;
      if (!canvas || !state.layout || !state.metadata || !state.isPlaying) {
        return;
      }

      const preset = RESOLUTION_PRESETS[state.settings.resolution];
      if (canvas.width !== preset.width || canvas.height !== preset.height) {
        canvas.width = preset.width;
        canvas.height = preset.height;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return;
      }

      const anchor = syncAnchorRef.current;
      const elapsedWallMs = Math.min(100, Math.max(0, (now - anchor.perfMs) * state.playbackSpeed));
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastFramePerf) / 1000));
      lastFramePerf = now;

      let smoothTick = anchor.tick;
      if (state.tickCache && elapsedWallMs > 0) {
        const selectedIndices = new Set<number>();
        for (let i = 0; i < state.tracks.length; i++) {
          if (state.tracks[i].selected) {
            selectedIndices.add(state.tracks[i].index);
          }
        }
        const anchorLookup = findVisibleBeatLookup(
          state.tickCache,
          state.layout.boundsLookup,
          selectedIndices,
          anchor.tick
        );
        if (anchorLookup && anchorLookup.duration > 0) {
          const ticksPerMs = anchorLookup.tickDuration / anchorLookup.duration;
          smoothTick = Math.min(anchorLookup.end, anchor.tick + elapsedWallMs * ticksPerMs);
        }
      }
      const smoothTimeMs = state.totalDurationMs > 0
        ? Math.min(state.totalDurationMs, anchor.timeMs + elapsedWallMs)
        : anchor.timeMs + elapsedWallMs;

      const scrollLerp = Math.min(1, 1 - Math.pow(0.001, dtSec));
      const shouldInstantScroll = needsInstantScrollRef.current;
      needsInstantScrollRef.current = false;

      const nextScroll = drawVideoFrame({
        ctx,
        layout: state.layout,
        settings: state.settings,
        metadata: state.metadata,
        tracks: state.tracks,
        tickCache: state.tickCache,
        currentTick: smoothTick,
        currentTimeMs: smoothTimeMs,
        totalDurationMs: state.totalDurationMs,
        smoothedScrollX: scrollXRef.current,
        smoothedScrollY: scrollYRef.current,
        instantScroll: shouldInstantScroll,
        scrollLerp,
        cache: frameCacheRef.current,
      });
      scrollXRef.current = nextScroll.scrollX;
      scrollYRef.current = nextScroll.scrollY;

      rafId = requestAnimationFrame(renderLoop);
    };

    rafId = requestAnimationFrame(renderLoop);
    return () => {
      cancelAnimationFrame(rafId);
    };
  }, [isPlaying, layout, metadata]);

  useEffect(() => {
    return () => {
      disposeRenderedLayout(activeLayoutRef.current);
      activeLayoutRef.current = null;
    };
  }, []);

  const preset = RESOLUTION_PRESETS[settings.resolution];
  const isLightInk = settings.theme === 'concert-dark' || settings.theme === 'midnight-slate';
  const canvasBgClass = settings.transparentBackground
    ? isLightInk
      ? 'checkerboard-dark'
      : 'checkerboard-light'
    : 'bg-black';

  if (!score) {
    return (
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-8 bg-[#0B0D11] text-center">
        <p className="text-sm font-medium text-zinc-300">No score loaded for video preview</p>
        <p className="text-xs text-zinc-500 mt-1">
          Open a Guitar Pro file to preview the rendered video frame in real time.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center p-6 bg-[#0B0D11] overflow-auto">
      <div className="w-full max-w-5xl flex items-center justify-between text-xs text-zinc-400 mb-3">
        <span>
          Live Video Preview · {preset.label} ({preset.dimensionsLabel})
          {settings.transparentBackground ? ' · Transparent' : ''}
        </span>
        <span className="font-mono tabular-nums">
          {isRenderingLayout
            ? 'Applying settings...'
            : `${settings.fps} fps · ${(settings.transparentBackground ? 'webm' : settings.format).toUpperCase()}`}
        </span>
      </div>

      <div className="relative flex items-center justify-center max-h-[calc(100vh-250px)] w-full">
        <canvas
          ref={canvasRef}
          width={preset.width}
          height={preset.height}
          className={`max-w-full max-h-[calc(100vh-265px)] w-auto h-auto rounded-lg border border-white/15 shadow-2xl ${canvasBgClass}`}
        />
      </div>
    </div>
  );
}
