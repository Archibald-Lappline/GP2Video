import * as alphaTab from '@coderline/alphatab';
import {Muxer as Mp4Muxer, ArrayBufferTarget as Mp4ArrayBufferTarget} from 'mp4-muxer';
import {Muxer as WebmMuxer, ArrayBufferTarget as WebmArrayBufferTarget} from 'webm-muxer';
import {RESOLUTION_PRESETS, VIDEO_THEMES} from '../constants/themes';
import type {
  AudioTrackState,
  ExportProgressState,
  NotationDisplayMode,
  ScoreMetadata,
  SheetLayoutMode,
  TrackState,
  VideoExportSettings,
  VideoFormatId,
} from '../types/studio';
import {computePlaybackRangeForBars, ensureBravuraFontLoaded, formatDurationMs} from '../utils/scoreUtils';
import {loadBundledSoundFontBytes} from '../utils/soundFontLoader';

export type BeatDrawOp =
  | {type: 'beginPath'}
  | {type: 'closePath'}
  | {type: 'moveTo'; x: number; y: number}
  | {type: 'lineTo'; x: number; y: number}
  | {type: 'quad'; cpx: number; cpy: number; x: number; y: number}
  | {type: 'bezier'; cp1x: number; cp1y: number; cp2x: number; cp2y: number; x: number; y: number}
  | {type: 'fill'}
  | {type: 'stroke'; lineWidth: number}
  | {type: 'fillRect'; x: number; y: number; w: number; h: number}
  | {type: 'strokeRect'; x: number; y: number; w: number; h: number; lineWidth: number}
  | {type: 'fillCircle'; x: number; y: number; radius: number}
  | {type: 'strokeCircle'; x: number; y: number; radius: number; lineWidth: number}
  | {
      type: 'fillText';
      text: string;
      x: number;
      y: number;
      fontCss: string;
      textAlign: CanvasTextAlign;
      textBaseline: CanvasTextBaseline;
    }
  | {type: 'fillMusic'; text: string; x: number; y: number; fontCss: string; center: boolean}
  | {type: 'beginRotate'; cx: number; cy: number; angle: number}
  | {type: 'endRotate'};

export interface RenderedSheetTile {
  x: number;
  y: number;
  width: number;
  height: number;
  canvas: HTMLCanvasElement;
  bitmap?: ImageBitmap;
  beatGroups: Map<string, BeatDrawOp[]>;
}

export interface FrameScrollState {
  scrollX: number;
  scrollY: number;
}

export interface RenderedSheetLayout {
  tiles: RenderedSheetTile[];
  totalWidth: number;
  totalHeight: number;
  boundsLookup: alphaTab.rendering.BoundsLookup | null;
  contentWidth: number;
  contentPaddingX: number;
  sheetScale: number;
  layoutMode: SheetLayoutMode;
}

export interface FrameRenderCache {
  selectedTrackIndicesKey: string;
  selectedTrackIndices: Set<number>;
  trackLabelList: string;
  headerKey: string;
  headerCanvas: HTMLCanvasElement | null;
  lastBarNumber: number;
  lastHudText: string;
  lastHudWidth: number;
  lastHudFont: string;
  lastTimeKey: string;
  lastTimeText: string;
  lastTimeWidth: number;
  sheetCacheCanvas: HTMLCanvasElement | null;
  lastSheetScrollX: number;
  lastSheetScrollY: number;
  lastHighlightKey: string;
  lastSheetModeKey: string;
}

export function createFrameRenderCache(): FrameRenderCache {
  return {
    selectedTrackIndicesKey: '',
    selectedTrackIndices: new Set<number>(),
    trackLabelList: '',
    headerKey: '',
    headerCanvas: null,
    lastBarNumber: -1,
    lastHudText: '',
    lastHudWidth: 0,
    lastHudFont: '',
    lastTimeKey: '',
    lastTimeText: '',
    lastTimeWidth: 0,
    sheetCacheCanvas: null,
    lastSheetScrollX: Number.NaN,
    lastSheetScrollY: Number.NaN,
    lastHighlightKey: '',
    lastSheetModeKey: '',
  };
}

export function disposeRenderedLayout(layout: RenderedSheetLayout | null): void {
  if (!layout) {
    return;
  }
  for (const tile of layout.tiles) {
    if (tile.bitmap) {
      tile.bitmap.close();
      tile.bitmap = undefined;
    }
  }
}

interface TimeTickPoint {
  timeMs: number;
  tick: number;
}

function getStaveProfile(mode: NotationDisplayMode): alphaTab.StaveProfile {
  switch (mode) {
    case 'tab-only':
      return alphaTab.StaveProfile.Tab;
    case 'score-only':
      return alphaTab.StaveProfile.Score;
    default:
      return alphaTab.StaveProfile.ScoreTab;
  }
}

function mapTextAlign(align: number): CanvasTextAlign {
  switch (align) {
    case 1:
      return 'center';
    case 2:
      return 'right';
    default:
      return 'left';
  }
}

function mapTextBaseline(baseline: number): CanvasTextBaseline {
  switch (baseline) {
    case 1:
      return 'middle';
    case 2:
      return 'bottom';
    case 3:
      return 'alphabetic';
    default:
      return 'hanging';
  }
}

const hangingBaselineCache = new Map<string, number>();

function getHangingBaselineCorrection(ctx: CanvasRenderingContext2D): number {
  const font = ctx.font;
  let correction = hangingBaselineCache.get(font);
  if (correction === undefined) {
    const metrics = ctx.measureText('');
    correction =
      0.8 * (metrics.fontBoundingBoxAscent - metrics.alphabeticBaseline) +
      metrics.alphabeticBaseline;
    if (!Number.isFinite(correction)) {
      correction = 0;
    }
    hangingBaselineCache.set(font, correction);
  }
  return correction;
}

function replayBeatDrawOps(ctx: CanvasRenderingContext2D, ops: BeatDrawOp[]): void {
  ctx.beginPath();
  for (const op of ops) {
    switch (op.type) {
      case 'beginPath':
        ctx.beginPath();
        break;
      case 'closePath':
        ctx.closePath();
        break;
      case 'moveTo':
        ctx.moveTo(op.x, op.y);
        break;
      case 'lineTo':
        ctx.lineTo(op.x, op.y);
        break;
      case 'quad':
        ctx.quadraticCurveTo(op.cpx, op.cpy, op.x, op.y);
        break;
      case 'bezier':
        ctx.bezierCurveTo(op.cp1x, op.cp1y, op.cp2x, op.cp2y, op.x, op.y);
        break;
      case 'fill':
        ctx.fill();
        ctx.beginPath();
        break;
      case 'stroke':
        ctx.lineWidth = Math.max(0.5, op.lineWidth);
        ctx.stroke();
        ctx.beginPath();
        break;
      case 'fillRect':
        if (op.w > 0) {
          ctx.fillRect(op.x, op.y, op.w, op.h);
        }
        break;
      case 'strokeRect': {
        ctx.lineWidth = Math.max(0.5, op.lineWidth);
        const blurOffset = op.lineWidth % 2 === 0 ? 0 : 0.5;
        ctx.strokeRect(op.x + blurOffset, op.y + blurOffset, op.w, op.h);
        break;
      }
      case 'fillCircle':
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2, true);
        ctx.fill();
        ctx.beginPath();
        break;
      case 'strokeCircle':
        ctx.lineWidth = Math.max(0.5, op.lineWidth);
        ctx.beginPath();
        ctx.arc(op.x, op.y, op.radius, 0, Math.PI * 2, true);
        ctx.stroke();
        ctx.beginPath();
        break;
      case 'fillText': {
        ctx.font = op.fontCss;
        ctx.textAlign = op.textAlign;
        ctx.textBaseline = op.textBaseline;
        let y = op.y;
        if (op.textBaseline === 'hanging') {
          y += getHangingBaselineCorrection(ctx);
        }
        ctx.fillText(op.text, op.x, y);
        break;
      }
      case 'fillMusic':
        ctx.font = op.fontCss;
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = op.center ? 'center' : 'left';
        ctx.fillText(op.text, op.x, op.y);
        break;
      case 'beginRotate':
        ctx.save();
        ctx.translate(op.cx, op.cy);
        ctx.rotate((op.angle * Math.PI) / 180);
        break;
      case 'endRotate':
        ctx.restore();
        break;
    }
  }
}

export function findVisibleBeatLookup(
  tickCache: alphaTab.midi.MidiTickLookup | null,
  boundsLookup: alphaTab.rendering.BoundsLookup | null,
  selectedTrackIndices: Set<number>,
  tick: number
): alphaTab.midi.MidiTickLookupFindBeatResult | null {
  if (!tickCache || selectedTrackIndices.size === 0) {
    return null;
  }
  const checker: alphaTab.midi.IBeatVisibilityChecker = {
    isVisible: (beat) =>
      selectedTrackIndices.has(beat.voice.bar.staff.track.index) &&
      (!boundsLookup || boundsLookup.findBeat(beat) !== null),
  };
  return (
    tickCache.findBeatWithChecker(checker, tick) ??
    tickCache.findBeat(selectedTrackIndices, tick)
  );
}

function createRecordingCanvas(
  inner: alphaTab.platform.ICanvas,
  fontFamilyName: string,
  musicFontSize: number,
  staffLineColorRgba: string | null
): {proxy: alphaTab.platform.ICanvas; takeCompletedGroups: () => Map<string, BeatDrawOp[]>} {
  const musicFont = new alphaTab.model.Font(fontFamilyName, musicFontSize, 0, 0);
  let groupStack: string[] = [];
  let currentGroups = new Map<string, BeatDrawOp[]>();
  let completedGroups = new Map<string, BeatDrawOp[]>();

  const recordOp = (op: BeatDrawOp) => {
    if (groupStack.length === 0) {
      return;
    }
    const recordedIds = new Set<string>();
    for (const id of groupStack) {
      if (recordedIds.has(id)) {
        continue;
      }
      recordedIds.add(id);
      let list = currentGroups.get(id);
      if (!list) {
        list = [];
        currentGroups.set(id, list);
      }
      list.push(op);
    }
  };

  const proxy: alphaTab.platform.ICanvas = {
    get settings() {
      return inner.settings;
    },
    set settings(value) {
      inner.settings = value;
    },
    get color() {
      return inner.color;
    },
    set color(value) {
      inner.color = value;
    },
    get lineWidth() {
      return inner.lineWidth;
    },
    set lineWidth(value) {
      inner.lineWidth = value;
    },
    get font() {
      return inner.font;
    },
    set font(value) {
      inner.font = value;
    },
    get textAlign() {
      return inner.textAlign;
    },
    set textAlign(value) {
      inner.textAlign = value;
    },
    get textBaseline() {
      return inner.textBaseline;
    },
    set textBaseline(value) {
      inner.textBaseline = value;
    },
    beginRender(width: number, height: number) {
      groupStack = [];
      currentGroups = new Map();
      inner.beginRender(width, height);
    },
    endRender() {
      completedGroups = currentGroups;
      currentGroups = new Map();
      groupStack = [];
      return inner.endRender();
    },
    onRenderFinished() {
      return inner.onRenderFinished();
    },
    destroy() {
      inner.destroy();
    },
    beginGroup(identifier: string) {
      groupStack.push(identifier);
      inner.beginGroup(identifier);
    },
    endGroup() {
      groupStack.pop();
      inner.endGroup();
    },
    fillRect(x: number, y: number, w: number, h: number) {
      if (staffLineColorRgba === null || inner.color?.rgba !== staffLineColorRgba) {
        recordOp({type: 'fillRect', x, y, w, h});
      }
      inner.fillRect(x, y, w, h);
    },
    strokeRect(x: number, y: number, w: number, h: number) {
      recordOp({type: 'strokeRect', x, y, w, h, lineWidth: inner.lineWidth});
      inner.strokeRect(x, y, w, h);
    },
    fillCircle(x: number, y: number, radius: number) {
      recordOp({type: 'fillCircle', x, y, radius});
      inner.fillCircle(x, y, radius);
    },
    strokeCircle(x: number, y: number, radius: number) {
      recordOp({type: 'strokeCircle', x, y, radius, lineWidth: inner.lineWidth});
      inner.strokeCircle(x, y, radius);
    },
    fillText(text: string, x: number, y: number) {
      recordOp({
        type: 'fillText',
        text,
        x,
        y,
        fontCss: inner.font.toCssString(1),
        textAlign: mapTextAlign(inner.textAlign),
        textBaseline: mapTextBaseline(inner.textBaseline),
      });
      inner.fillText(text, x, y);
    },
    measureText(text: string) {
      return inner.measureText(text);
    },
    fillMusicFontSymbol(
      x: number,
      y: number,
      relativeScale: number,
      symbol: alphaTab.model.MusicFontSymbol,
      centerAtPosition = false
    ) {
      if ((symbol as number) !== -1) {
        recordOp({
          type: 'fillMusic',
          text: String.fromCharCode(symbol),
          x,
          y,
          fontCss: musicFont.toCssString(relativeScale),
          center: centerAtPosition,
        });
      }
      inner.fillMusicFontSymbol(x, y, relativeScale, symbol, centerAtPosition);
    },
    fillMusicFontSymbols(
      x: number,
      y: number,
      relativeScale: number,
      symbols: alphaTab.model.MusicFontSymbol[],
      centerAtPosition = false
    ) {
      let text = '';
      for (const symbol of symbols) {
        if ((symbol as number) !== -1) {
          text += String.fromCharCode(symbol);
        }
      }
      if (text.length > 0) {
        recordOp({
          type: 'fillMusic',
          text,
          x,
          y,
          fontCss: musicFont.toCssString(relativeScale),
          center: centerAtPosition,
        });
      }
      inner.fillMusicFontSymbols(x, y, relativeScale, symbols, centerAtPosition);
    },
    beginRotate(centerX: number, centerY: number, angle: number) {
      recordOp({type: 'beginRotate', cx: centerX, cy: centerY, angle});
      inner.beginRotate(centerX, centerY, angle);
    },
    endRotate() {
      recordOp({type: 'endRotate'});
      inner.endRotate();
    },
    beginPath() {
      recordOp({type: 'beginPath'});
      inner.beginPath();
    },
    closePath() {
      recordOp({type: 'closePath'});
      inner.closePath();
    },
    fill() {
      recordOp({type: 'fill'});
      inner.fill();
    },
    stroke() {
      recordOp({type: 'stroke', lineWidth: inner.lineWidth});
      inner.stroke();
    },
    moveTo(x: number, y: number) {
      recordOp({type: 'moveTo', x, y});
      inner.moveTo(x, y);
    },
    lineTo(x: number, y: number) {
      recordOp({type: 'lineTo', x, y});
      inner.lineTo(x, y);
    },
    bezierCurveTo(cp1X: number, cp1Y: number, cp2X: number, cp2Y: number, x: number, y: number) {
      recordOp({type: 'bezier', cp1x: cp1X, cp1y: cp1Y, cp2x: cp2X, cp2y: cp2Y, x, y});
      inner.bezierCurveTo(cp1X, cp1Y, cp2X, cp2Y, x, y);
    },
    quadraticCurveTo(cpx: number, cpy: number, x: number, y: number) {
      recordOp({type: 'quad', cpx, cpy, x, y});
      inner.quadraticCurveTo(cpx, cpy, x, y);
    },
  };

  return {
    proxy,
    takeCompletedGroups: () => completedGroups,
  };
}

export async function renderScoreToTiles(
  score: alphaTab.model.Score,
  selectedTrackIndices: number[],
  settings: VideoExportSettings
): Promise<RenderedSheetLayout> {
  const preset = RESOLUTION_PRESETS[settings.resolution];
  const palette = VIDEO_THEMES[settings.theme];
  const contentPaddingX = settings.resolution === '720p' ? 44 : 68;
  const contentWidth = preset.width - contentPaddingX * 2;

  const atSettings = new alphaTab.Settings();
  atSettings.core.engine = 'html5';
  atSettings.core.useWorkers = false;
  atSettings.core.enableLazyLoading = false;
  atSettings.core.fontDirectory = `${import.meta.env.BASE_URL}font/`;
  atSettings.core.includeNoteBounds = false;
  const isHorizontal = settings.layoutMode === 'horizontal';
  atSettings.display.layoutMode = isHorizontal
    ? alphaTab.LayoutMode.Horizontal
    : alphaTab.LayoutMode.Page;
  if (isHorizontal) {
    atSettings.display.barCountPerPartial = 6;
  }
  atSettings.display.scale = preset.sheetScale;
  atSettings.display.staveProfile = getStaveProfile(settings.notationMode);

  const fontFamilyName = 'alphaTab';
  await ensureBravuraFontLoaded(atSettings.core.fontDirectory, fontFamilyName);
  (atSettings.display.resources as unknown as {smuflFontFamilyName?: string}).smuflFontFamilyName = fontFamilyName;

  const staffLineColor = alphaTab.model.Color.fromJson(palette.staffLine);
  const barSepColor = alphaTab.model.Color.fromJson(palette.barSeparator);
  const barNumColor = alphaTab.model.Color.fromJson(palette.barNumber);
  const mainGlyphColor = alphaTab.model.Color.fromJson(palette.mainGlyph);
  const secondaryGlyphColor = alphaTab.model.Color.fromJson(palette.secondaryGlyph);
  const scoreInfoColor = alphaTab.model.Color.fromJson(palette.scoreInfo);

  if (staffLineColor) atSettings.display.resources.staffLineColor = staffLineColor;
  if (barSepColor) atSettings.display.resources.barSeparatorColor = barSepColor;
  if (barNumColor) atSettings.display.resources.barNumberColor = barNumColor;
  if (mainGlyphColor) atSettings.display.resources.mainGlyphColor = mainGlyphColor;
  if (secondaryGlyphColor) atSettings.display.resources.secondaryGlyphColor = secondaryGlyphColor;
  if (scoreInfoColor) atSettings.display.resources.scoreInfoColor = scoreInfoColor;

  return new Promise<RenderedSheetLayout>((resolve, reject) => {
    const renderer = new alphaTab.rendering.ScoreRenderer(atSettings);
    renderer.width = contentWidth;

    const rendererInternal = renderer as unknown as {canvas: alphaTab.platform.ICanvas};
    const {proxy, takeCompletedGroups} = createRecordingCanvas(
      rendererInternal.canvas,
      fontFamilyName,
      atSettings.display.resources.engravingSettings.musicFontSize,
      staffLineColor?.rgba ?? null
    );
    rendererInternal.canvas = proxy;

    const tiles: RenderedSheetTile[] = [];
    let totalWidth = isHorizontal ? 0 : contentWidth;
    let totalHeight = 0;

    renderer.partialRenderFinished.on((args) => {
      const beatGroups = takeCompletedGroups();
      if (args.renderResult instanceof HTMLCanvasElement && args.width > 0 && args.height > 0) {
        tiles.push({
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
          canvas: args.renderResult,
          beatGroups,
        });
      }
      totalWidth = Math.max(totalWidth, args.totalWidth, args.x + args.width);
      totalHeight = Math.max(totalHeight, args.totalHeight, args.y + args.height);
    });

    renderer.renderFinished.on((args) => {
      const beatGroups = takeCompletedGroups();
      if (args.renderResult instanceof HTMLCanvasElement && args.width > 0 && args.height > 0) {
        tiles.push({
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
          canvas: args.renderResult,
          beatGroups,
        });
      }
      totalWidth = Math.max(totalWidth, args.totalWidth, args.x + args.width);
      totalHeight = Math.max(totalHeight, args.totalHeight, args.y + args.height);
    });

    renderer.postRenderFinished.on(() => {
      const boundsLookup = renderer.boundsLookup;
      if (boundsLookup && !boundsLookup.isFinished) {
        boundsLookup.finish();
      }
      renderer.destroy();

      const buildBitmaps =
        typeof createImageBitmap === 'function'
          ? Promise.all(
              tiles.map(async (tile) => {
                try {
                  tile.bitmap = await createImageBitmap(tile.canvas);
                } catch {
                  tile.bitmap = undefined;
                }
              })
            )
          : Promise.resolve();

      void buildBitmaps.then(() => {
        resolve({
          tiles,
          totalWidth: Math.max(contentWidth, totalWidth),
          totalHeight,
          boundsLookup,
          contentWidth,
          contentPaddingX,
          sheetScale: preset.sheetScale,
          layoutMode: settings.layoutMode,
        });
      });
    });

    renderer.error.on((err) => {
      renderer.destroy();
      reject(err instanceof Error ? err : new Error('Sheet music layout rendering failed.'));
    });

    renderer.renderScore(score, selectedTrackIndices);
  });
}

function ticksToMillisExact(ticks: number, tempo: number): number {
  return (ticks * 60000) / (Math.max(1, tempo) * 960);
}

function buildTimelineFromTickCache(
  tickCache: alphaTab.midi.MidiTickLookup | null,
  startTick: number,
  endTick: number,
  defaultTempo: number
): {points: TimeTickPoint[]; rangeStartMs: number} {
  if (!tickCache || tickCache.masterBars.length === 0) {
    return {points: [], rangeStartMs: 0};
  }

  const points: TimeTickPoint[] = [{timeMs: 0, tick: startTick}];
  let absMs = 0;
  let rangeStartMs: number | null = startTick <= 0 ? 0 : null;
  let curTempo = Number.isFinite(defaultTempo) && defaultTempo > 0 ? defaultTempo : 120;

  for (const mb of tickCache.masterBars) {
    let cursorTick = mb.start;
    const changes =
      mb.tempoChanges && mb.tempoChanges.length > 0
        ? mb.tempoChanges
        : [{tick: mb.start, tempo: curTempo}];

    for (const ch of changes) {
      const segEnd = Math.min(mb.end, Math.max(cursorTick, ch.tick));
      if (segEnd > cursorTick) {
        const segStart = cursorTick;
        const segStartMs = absMs;
        const segDurMs = ticksToMillisExact(segEnd - segStart, curTempo);
        if (rangeStartMs === null && startTick >= segStart && startTick <= segEnd) {
          rangeStartMs = segStartMs + ticksToMillisExact(startTick - segStart, curTempo);
        }
        if (rangeStartMs !== null && segEnd > startTick && segStart < endTick) {
          const clampedEnd = Math.min(endTick, segEnd);
          const clampedEndMs = segStartMs + ticksToMillisExact(clampedEnd - segStart, curTempo);
          points.push({timeMs: clampedEndMs - rangeStartMs, tick: clampedEnd});
        }
        absMs += segDurMs;
        cursorTick = segEnd;
      }
      if (Number.isFinite(ch.tempo) && ch.tempo > 0) {
        curTempo = ch.tempo;
      }
    }

    if (mb.end > cursorTick) {
      const segStart = cursorTick;
      const segEnd = mb.end;
      const segStartMs = absMs;
      const segDurMs = ticksToMillisExact(segEnd - segStart, curTempo);
      if (rangeStartMs === null && startTick >= segStart && startTick <= segEnd) {
        rangeStartMs = segStartMs + ticksToMillisExact(startTick - segStart, curTempo);
      }
      if (rangeStartMs !== null && segEnd > startTick && segStart < endTick) {
        const clampedEnd = Math.min(endTick, segEnd);
        const clampedEndMs = segStartMs + ticksToMillisExact(clampedEnd - segStart, curTempo);
        points.push({timeMs: clampedEndMs - rangeStartMs, tick: clampedEnd});
      }
      absMs += segDurMs;
    }
  }

  return {points, rangeStartMs: rangeStartMs ?? 0};
}

function interpolateTickFromTime(timeline: TimeTickPoint[], timeMs: number): number {
  if (timeline.length === 0) {
    return 0;
  }
  if (timeMs <= timeline[0].timeMs) {
    return timeline[0].tick;
  }
  const last = timeline[timeline.length - 1];
  if (timeMs >= last.timeMs) {
    return last.tick;
  }
  let lo = 0;
  let hi = timeline.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (timeline[mid].timeMs <= timeMs) {
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const idx = Math.max(0, lo - 1);
  const a = timeline[idx];
  const b = timeline[Math.min(timeline.length - 1, idx + 1)];
  const span = b.timeMs - a.timeMs;
  if (span <= 0) {
    return a.tick;
  }
  const ratio = (timeMs - a.timeMs) / span;
  return a.tick + (b.tick - a.tick) * ratio;
}

async function mixExternalAudioIntoChunks(
  audioChunks: alphaTab.synth.AudioExportChunk[],
  audioTracks: AudioTrackState[],
  anySolo: boolean,
  sampleRate: number,
  rangeStartOffsetMs: number
): Promise<void> {
  const audibleTracks = audioTracks.filter((track) => {
    if (!track.audioBuffer) {
      return false;
    }
    return anySolo ? track.solo : !track.muted;
  });

  if (audibleTracks.length === 0 || audioChunks.length === 0) {
    return;
  }

  const totalFrames = audioChunks.reduce((sum, c) => sum + c.samples.length / 2, 0);
  const offline = new OfflineAudioContext(2, totalFrames, sampleRate);

  for (const track of audibleTracks) {
    if (!track.audioBuffer || track.volume <= 0) {
      continue;
    }
    const source = offline.createBufferSource();
    source.buffer = track.audioBuffer;
    const gain = offline.createGain();
    gain.gain.value = track.volume;
    source.connect(gain);
    gain.connect(offline.destination);

    const startInTrackSec = (rangeStartOffsetMs - track.offsetMs) / 1000;
    if (startInTrackSec >= track.audioBuffer.duration) {
      continue;
    }
    if (startInTrackSec >= 0) {
      source.start(0, startInTrackSec);
    } else {
      source.start(Math.abs(startInTrackSec), 0);
    }
  }

  const mixedBuffer = await offline.startRendering();
  const mixL = mixedBuffer.getChannelData(0);
  const mixR = mixedBuffer.getChannelData(1);

  let frameCursor = 0;
  for (const chunk of audioChunks) {
    const chunkFrames = chunk.samples.length / 2;
    for (let i = 0; i < chunkFrames; i++) {
      const idx = frameCursor + i;
      const l = chunk.samples[i * 2] + (idx < mixL.length ? mixL[idx] : 0);
      const r = chunk.samples[i * 2 + 1] + (idx < mixR.length ? mixR[idx] : 0);
      chunk.samples[i * 2] = Math.max(-1, Math.min(1, l));
      chunk.samples[i * 2 + 1] = Math.max(-1, Math.min(1, r));
    }
    frameCursor += chunkFrames;
  }
}

function drawTilesAndBeatHighlights(params: {
  ctx: CanvasRenderingContext2D;
  layout: RenderedSheetLayout;
  viewportWidth: number;
  viewportTop: number;
  viewportHeight: number;
  sheetOffsetX: number;
  sheetOffsetY: number;
  accentColor: string;
  highlightedGroupIds: Set<string>;
}): void {
  const {
    ctx,
    layout,
    viewportWidth,
    viewportTop,
    viewportHeight,
    sheetOffsetX,
    sheetOffsetY,
    accentColor,
    highlightedGroupIds,
  } = params;

  for (const tile of layout.tiles) {
    const tileScreenX = sheetOffsetX + tile.x;
    const tileScreenY = sheetOffsetY + tile.y;
    if (
      tileScreenX + tile.width < 0 ||
      tileScreenX > viewportWidth ||
      tileScreenY + tile.height < viewportTop ||
      tileScreenY > viewportTop + viewportHeight
    ) {
      continue;
    }
    const source = tile.bitmap ?? tile.canvas;
    ctx.drawImage(
      source,
      0,
      0,
      source.width,
      source.height,
      tileScreenX,
      tileScreenY,
      tile.width,
      tile.height
    );

    if (highlightedGroupIds.size > 0 && tile.beatGroups.size > 0) {
      let hasTileHighlight = false;
      for (const groupId of highlightedGroupIds) {
        if (tile.beatGroups.has(groupId)) {
          hasTileHighlight = true;
          break;
        }
      }
      if (hasTileHighlight) {
        ctx.save();
        ctx.translate(tileScreenX, tileScreenY);
        ctx.scale(layout.sheetScale, layout.sheetScale);
        ctx.fillStyle = accentColor;
        ctx.strokeStyle = accentColor;
        for (const groupId of highlightedGroupIds) {
          const ops = tile.beatGroups.get(groupId);
          if (ops) {
            replayBeatDrawOps(ctx, ops);
          }
        }
        ctx.restore();
      }
    }
  }
}

export function drawVideoFrame(params: {
  ctx: CanvasRenderingContext2D;
  layout: RenderedSheetLayout;
  settings: VideoExportSettings;
  metadata: ScoreMetadata;
  tracks: TrackState[];
  tickCache: alphaTab.midi.MidiTickLookup | null;
  currentTick: number;
  currentTimeMs: number;
  totalDurationMs: number;
  smoothedScrollX?: number;
  smoothedScrollY: number;
  instantScroll?: boolean;
  scrollLerp?: number;
  cache?: FrameRenderCache;
}): FrameScrollState {
  const {
    ctx,
    layout,
    settings,
    metadata,
    tracks,
    tickCache,
    currentTick,
    currentTimeMs,
    totalDurationMs,
    smoothedScrollX = 0,
    smoothedScrollY,
    instantScroll = false,
    scrollLerp = 0.16,
    cache,
  } = params;

  const preset = RESOLUTION_PRESETS[settings.resolution];
  const palette = VIDEO_THEMES[settings.theme];
  const width = preset.width;
  const height = preset.height;

  const headerHeight = settings.showHeader ? (settings.resolution === '720p' ? 84 : 114) : 28;
  const footerHeight = settings.showProgressBar ? (settings.resolution === '720p' ? 46 : 60) : 24;
  const viewportTop = headerHeight;
  const viewportHeight = height - headerHeight - footerHeight;

  let selectedTrackIndices: Set<number>;
  let trackLabelList: string;
  if (cache) {
    let key = '';
    for (let i = 0; i < tracks.length; i++) {
      const t = tracks[i];
      if (t.selected) {
        key += `${t.index}:${t.name}|`;
      }
    }
    if (cache.selectedTrackIndicesKey !== key) {
      cache.selectedTrackIndicesKey = key;
      const nextSet = new Set<number>();
      const names: string[] = [];
      for (let i = 0; i < tracks.length; i++) {
        const t = tracks[i];
        if (t.selected) {
          nextSet.add(t.index);
          names.push(t.name);
        }
      }
      cache.selectedTrackIndices = nextSet;
      cache.trackLabelList = names.join(' · ');
    }
    selectedTrackIndices = cache.selectedTrackIndices;
    trackLabelList = cache.trackLabelList;
  } else {
    selectedTrackIndices = new Set(tracks.filter((t) => t.selected).map((t) => t.index));
    trackLabelList = tracks
      .filter((t) => t.selected)
      .map((t) => t.name)
      .join(' · ');
  }

  const beatLookup = findVisibleBeatLookup(
    tickCache,
    layout.boundsLookup,
    selectedTrackIndices,
    currentTick
  );
  const activeBeat = beatLookup?.beat ?? null;
  let activeBeatBounds =
    activeBeat && layout.boundsLookup ? layout.boundsLookup.findBeat(activeBeat) : null;
  if (!activeBeatBounds && beatLookup?.beatLookup && layout.boundsLookup) {
    for (const h of beatLookup.beatLookup.highlightedBeats) {
      if (h.beat && selectedTrackIndices.has(h.beat.voice.bar.staff.track.index)) {
        const candidateBounds = layout.boundsLookup.findBeat(h.beat);
        if (candidateBounds) {
          activeBeatBounds = candidateBounds;
          break;
        }
      }
    }
  }
  const activeBarBounds = activeBeatBounds?.barBounds ?? null;
  const activeMasterBarBounds = activeBarBounds?.masterBarBounds ?? null;
  const activeSystemBounds = activeMasterBarBounds?.staffSystemBounds ?? null;

  let cursorX: number | null = null;
  if (activeBeatBounds && activeMasterBarBounds) {
    cursorX = activeBeatBounds.onNotesX;
    if (beatLookup && beatLookup.tickDuration > 0) {
      const elapsedTick = Math.max(0, currentTick - beatLookup.start);
      const beatProgress = Math.max(
        0,
        Math.min(1, elapsedTick / Math.max(1, beatLookup.tickDuration))
      );
      const nextBounds = beatLookup.nextBeat
        ? layout.boundsLookup?.findBeat(beatLookup.nextBeat.beat) ?? null
        : null;
      let targetX = Math.max(
        activeBeatBounds.onNotesX,
        Math.min(
          activeMasterBarBounds.realBounds.x + activeMasterBarBounds.realBounds.w,
          activeBeatBounds.realBounds.x + activeBeatBounds.realBounds.w
        )
      );
      if (
        beatLookup.cursorMode === 1 &&
        nextBounds &&
        nextBounds.barBounds.masterBarBounds.staffSystemBounds === activeSystemBounds &&
        nextBounds.onNotesX >= activeBeatBounds.onNotesX
      ) {
        targetX = nextBounds.onNotesX;
      }
      cursorX = activeBeatBounds.onNotesX + (targetX - activeBeatBounds.onNotesX) * beatProgress;
    }
  }

  const isHorizontal = layout.layoutMode === 'horizontal';
  let targetScrollX = smoothedScrollX;
  let targetScrollY = smoothedScrollY;
  const maxScrollY = Math.max(0, layout.totalHeight - viewportHeight + 60);
  const contentSpanW = Math.max(1, width - layout.contentPaddingX * 2);
  const maxScrollX = isHorizontal ? Math.max(0, layout.totalWidth - contentSpanW) : 0;

  if (isHorizontal) {
    if (settings.cameraMotion === 'page-flip') {
      const pageStepX = Math.max(240, contentSpanW * 0.78);
      const anchorX = activeMasterBarBounds ? activeMasterBarBounds.visualBounds.x : cursorX ?? 0;
      const desiredPageX = Math.floor(Math.max(0, anchorX - 40) / pageStepX) * pageStepX;
      targetScrollX = Math.max(0, Math.min(maxScrollX, desiredPageX));
    } else if (cursorX !== null) {
      const desiredX = cursorX - width * 0.32;
      targetScrollX = Math.max(0, Math.min(maxScrollX, desiredX));
    } else {
      targetScrollX = Math.max(0, Math.min(maxScrollX, smoothedScrollX));
    }

    if (layout.totalHeight <= viewportHeight - 40) {
      targetScrollY = 0;
    } else if (activeSystemBounds) {
      const sysTop = activeSystemBounds.visualBounds.y;
      const sysH = activeSystemBounds.visualBounds.h;
      const desiredCenter = sysTop + sysH * 0.5 - viewportHeight * 0.44;
      targetScrollY = Math.max(0, Math.min(maxScrollY, desiredCenter));
    } else {
      targetScrollY = Math.max(0, Math.min(maxScrollY, smoothedScrollY));
    }
  } else {
    targetScrollX = 0;
    if (activeSystemBounds) {
      const sysTop = activeSystemBounds.visualBounds.y;
      const sysH = activeSystemBounds.visualBounds.h;
      if (settings.cameraMotion === 'page-flip') {
        const pageStep = Math.max(240, viewportHeight * 0.78);
        const desiredPage = Math.floor(Math.max(0, sysTop - 40) / pageStep) * pageStep;
        targetScrollY = Math.max(0, Math.min(maxScrollY, desiredPage));
      } else {
        const desiredCenter = sysTop + sysH * 0.5 - viewportHeight * 0.44;
        targetScrollY = Math.max(0, Math.min(maxScrollY, desiredCenter));
      }
    } else {
      targetScrollY = Math.max(0, Math.min(maxScrollY, smoothedScrollY));
    }
  }

  const nextScrollX = !isHorizontal
    ? 0
    : instantScroll || settings.cameraMotion === 'page-flip'
    ? targetScrollX
    : smoothedScrollX + (targetScrollX - smoothedScrollX) * scrollLerp;

  const nextScrollY =
    instantScroll || settings.cameraMotion === 'page-flip'
      ? targetScrollY
      : smoothedScrollY + (targetScrollY - smoothedScrollY) * scrollLerp;

  const highlightedGroupIds = new Set<string>();
  let highlightKey = '';
  if (settings.highlightActiveBeat && beatLookup) {
    const beatsToHighlight = beatLookup.beatLookup?.highlightedBeats ?? [];
    for (const h of beatsToHighlight) {
      if (
        h.beat &&
        selectedTrackIndices.has(h.beat.voice.bar.staff.track.index) &&
        (!layout.boundsLookup || layout.boundsLookup.findBeat(h.beat) !== null)
      ) {
        const id = `b${h.beat.id}`;
        if (!highlightedGroupIds.has(id)) {
          highlightedGroupIds.add(id);
          highlightKey += `${id},`;
        }
      }
    }
    if (activeBeatBounds) {
      const id = `b${activeBeatBounds.beat.id}`;
      if (!highlightedGroupIds.has(id)) {
        highlightedGroupIds.add(id);
        highlightKey += `${id},`;
      }
    } else if (activeBeat && highlightedGroupIds.size === 0) {
      const id = `b${activeBeat.id}`;
      highlightedGroupIds.add(id);
      highlightKey = id;
    }
  }

  ctx.save();
  if (settings.transparentBackground) {
    ctx.clearRect(0, 0, width, height);
  } else {
    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);
  }

  const sheetOffsetX = isHorizontal
    ? layout.totalWidth <= contentSpanW
      ? Math.max(layout.contentPaddingX, Math.floor((width - layout.totalWidth) * 0.5))
      : layout.contentPaddingX - nextScrollX
    : Math.max(0, Math.floor((width - layout.contentWidth) * 0.5));
  const sheetOffsetY =
    isHorizontal && layout.totalHeight <= viewportHeight - 40
      ? viewportTop + Math.floor((viewportHeight - layout.totalHeight) * 0.5) - nextScrollY
      : viewportTop + 20 - nextScrollY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, viewportTop, width, viewportHeight);
  ctx.clip();

  if (cache && settings.cameraMotion === 'page-flip') {
    const modeKey = `${width}x${viewportHeight}:${settings.theme}:${settings.transparentBackground}:${settings.accentColor}:${settings.notationMode}:${settings.layoutMode}:${layout.totalWidth}:${layout.totalHeight}`;
    let sheetCanvas = cache.sheetCacheCanvas;
    if (!sheetCanvas || cache.lastSheetModeKey !== modeKey) {
      sheetCanvas = document.createElement('canvas');
      sheetCanvas.width = width;
      sheetCanvas.height = viewportHeight;
      cache.sheetCacheCanvas = sheetCanvas;
      cache.lastSheetModeKey = modeKey;
      cache.lastSheetScrollX = Number.NaN;
      cache.lastSheetScrollY = Number.NaN;
    }
    if (
      Math.abs(nextScrollX - cache.lastSheetScrollX) > 0.01 ||
      Math.abs(nextScrollY - cache.lastSheetScrollY) > 0.01 ||
      highlightKey !== cache.lastHighlightKey
    ) {
      const sCtx = sheetCanvas.getContext('2d', {alpha: settings.transparentBackground});
      if (sCtx) {
        if (settings.transparentBackground) {
          sCtx.clearRect(0, 0, width, viewportHeight);
        } else {
          sCtx.fillStyle = palette.background;
          sCtx.fillRect(0, 0, width, viewportHeight);
        }
        drawTilesAndBeatHighlights({
          ctx: sCtx,
          layout,
          viewportWidth: width,
          viewportTop: 0,
          viewportHeight,
          sheetOffsetX,
          sheetOffsetY: sheetOffsetY - viewportTop,
          accentColor: settings.accentColor,
          highlightedGroupIds,
        });
        cache.lastSheetScrollX = nextScrollX;
        cache.lastSheetScrollY = nextScrollY;
        cache.lastHighlightKey = highlightKey;
      }
    }
    ctx.drawImage(sheetCanvas, 0, viewportTop);
  } else {
    drawTilesAndBeatHighlights({
      ctx,
      layout,
      viewportWidth: width,
      viewportTop,
      viewportHeight,
      sheetOffsetX,
      sheetOffsetY,
      accentColor: settings.accentColor,
      highlightedGroupIds,
    });
  }

  if (cursorX !== null && activeMasterBarBounds) {
    const linePad = Math.round(10 * layout.sheetScale);
    const visualTop = activeMasterBarBounds.visualBounds.y;
    const visualBottom = visualTop + activeMasterBarBounds.visualBounds.h;
    const lineBounds = activeMasterBarBounds.lineAlignedBounds;
    let barY = visualTop;
    let barH = activeMasterBarBounds.visualBounds.h;
    if (lineBounds && lineBounds.h > 0) {
      const paddedTop = Math.max(visualTop, lineBounds.y - linePad);
      const paddedBottom = Math.min(visualBottom, lineBounds.y + lineBounds.h + linePad);
      if (paddedBottom > paddedTop) {
        barY = paddedTop;
        barH = paddedBottom - paddedTop;
      }
    }

    ctx.fillStyle = settings.accentColor;
    ctx.fillRect(sheetOffsetX + cursorX - 1.5, sheetOffsetY + barY, 3, barH);
  }

  ctx.restore();

  if (settings.showHeader) {
    const scaleFactor = settings.resolution === '720p' ? 0.78 : 1;
    const padX = layout.contentPaddingX;
    const subText = settings.showTrackNames && trackLabelList
      ? `${metadata.artist} — ${trackLabelList}`
      : metadata.artist;

    if (cache) {
      const nextHeaderKey = `${width}x${headerHeight}:${settings.theme}:${settings.transparentBackground}:${metadata.title}:${subText}:${padX}:${scaleFactor}`;
      if (!cache.headerCanvas || cache.headerKey !== nextHeaderKey) {
        const hc = document.createElement('canvas');
        hc.width = width;
        hc.height = headerHeight;
        const hCtx = hc.getContext('2d', {alpha: settings.transparentBackground});
        if (hCtx) {
          if (!settings.transparentBackground) {
            hCtx.fillStyle = palette.surface;
            hCtx.fillRect(0, 0, width, headerHeight);
          }
          hCtx.fillStyle = palette.headerBorder;
          hCtx.fillRect(0, headerHeight - 1, width, 1);

          hCtx.fillStyle = palette.titleText;
          hCtx.font = `700 ${Math.round(28 * scaleFactor)}px "Bricolage Grotesque", "Plus Jakarta Sans", sans-serif`;
          hCtx.textBaseline = 'middle';
          hCtx.fillText(metadata.title, padX, headerHeight * 0.36);

          hCtx.fillStyle = palette.mutedText;
          hCtx.font = `500 ${Math.round(16 * scaleFactor)}px "Plus Jakarta Sans", sans-serif`;
          hCtx.fillText(subText, padX, headerHeight * 0.72);
        }
        cache.headerCanvas = hc;
        cache.headerKey = nextHeaderKey;
      }
      ctx.drawImage(cache.headerCanvas, 0, 0);
    } else {
      if (!settings.transparentBackground) {
        ctx.fillStyle = palette.surface;
        ctx.fillRect(0, 0, width, headerHeight);
      }
      ctx.fillStyle = palette.headerBorder;
      ctx.fillRect(0, headerHeight - 1, width, 1);

      ctx.fillStyle = palette.titleText;
      ctx.font = `700 ${Math.round(28 * scaleFactor)}px "Bricolage Grotesque", "Plus Jakarta Sans", sans-serif`;
      ctx.textBaseline = 'middle';
      ctx.fillText(metadata.title, padX, headerHeight * 0.36);

      ctx.fillStyle = palette.mutedText;
      ctx.font = `500 ${Math.round(16 * scaleFactor)}px "Plus Jakarta Sans", sans-serif`;
      ctx.fillText(subText, padX, headerHeight * 0.72);
    }

    if (settings.showMeasureHud) {
      const barNumber = activeBeat ? activeBeat.voice.bar.index + 1 : settings.barStart;
      const hudFont = `600 ${Math.round(15 * scaleFactor)}px "JetBrains Mono", monospace`;
      ctx.font = hudFont;
      ctx.textBaseline = 'middle';
      let hudText: string;
      let hudWidth: number;
      if (cache && cache.lastBarNumber === barNumber && cache.lastHudFont === hudFont) {
        hudText = cache.lastHudText;
        hudWidth = cache.lastHudWidth;
      } else {
        hudText = `BAR ${String(barNumber).padStart(2, '0')} / ${String(metadata.barCount).padStart(2, '0')}   ·   ${metadata.tempo} BPM`;
        hudWidth = ctx.measureText(hudText).width;
        if (cache) {
          cache.lastBarNumber = barNumber;
          cache.lastHudFont = hudFont;
          cache.lastHudText = hudText;
          cache.lastHudWidth = hudWidth;
        }
      }
      ctx.fillStyle = palette.titleText;
      ctx.fillText(hudText, width - padX - hudWidth, headerHeight * 0.52);
    }
  }

  if (settings.showProgressBar) {
    const footerTop = height - footerHeight;
    if (!settings.transparentBackground) {
      ctx.fillStyle = palette.surface;
      ctx.fillRect(0, footerTop, width, footerHeight);
    }
    ctx.fillStyle = palette.headerBorder;
    ctx.fillRect(0, footerTop, width, 1);

    const padX = layout.contentPaddingX;
    const barW = width - padX * 2 - 220;
    const barH = 6;
    const barY = footerTop + Math.floor((footerHeight - barH) * 0.5);
    const ratio = totalDurationMs > 0 ? Math.max(0, Math.min(1, currentTimeMs / totalDurationMs)) : 0;

    ctx.fillStyle = settings.transparentBackground ? 'rgba(148, 163, 184, 0.32)' : palette.headerBorder;
    ctx.fillRect(padX, barY, barW, barH);
    ctx.fillStyle = settings.accentColor;
    ctx.fillRect(padX, barY, Math.round(barW * ratio), barH);

    ctx.font = `500 14px "JetBrains Mono", monospace`;
    ctx.fillStyle = palette.mutedText;
    ctx.textBaseline = 'middle';

    const curDeci = Math.floor(Math.max(0, currentTimeMs) / 100);
    const totDeci = Math.floor(Math.max(0, totalDurationMs) / 100);
    const timeKey = `${curDeci}/${totDeci}`;
    let timeText: string;
    let timeWidth: number;
    if (cache && cache.lastTimeKey === timeKey) {
      timeText = cache.lastTimeText;
      timeWidth = cache.lastTimeWidth;
    } else {
      timeText = `${formatDurationMs(currentTimeMs)} / ${formatDurationMs(totalDurationMs)}`;
      timeWidth = ctx.measureText(timeText).width;
      if (cache) {
        cache.lastTimeKey = timeKey;
        cache.lastTimeText = timeText;
        cache.lastTimeWidth = timeWidth;
      }
    }
    ctx.fillText(timeText, width - padX - timeWidth, footerTop + footerHeight * 0.5);
  }

  ctx.restore();
  return {scrollX: nextScrollX, scrollY: nextScrollY};
}

interface ResolvedCodecConfig {
  format: VideoFormatId;
  useWebCodecs: boolean;
  videoCodec?: string;
  audioCodec?: string;
  muxerVideoCodec?: string;
  muxerAudioCodec?: 'aac' | 'opus';
  hardwareAcceleration?: HardwareAcceleration;
}

async function findSupportedAudioCodec(
  candidates: Array<{codec: string; muxerCodec: 'aac' | 'opus'}>
): Promise<{codec: string; muxerCodec: 'aac' | 'opus'} | null> {
  for (const candidate of candidates) {
    try {
      const check = await AudioEncoder.isConfigSupported({
        codec: candidate.codec,
        sampleRate: 48000,
        numberOfChannels: 2,
        bitrate: 192_000,
      });
      if (check.supported) {
        return candidate;
      }
    } catch {
      continue;
    }
  }
  return null;
}

async function resolveVideoCodecConfig(
  requestedFormat: VideoFormatId,
  width: number,
  height: number,
  fps: number,
  transparentBackground: boolean
): Promise<ResolvedCodecConfig> {
  if (transparentBackground) {
    return {format: 'webm', useWebCodecs: false};
  }
  if (typeof VideoEncoder === 'undefined' || typeof AudioEncoder === 'undefined') {
    return {format: 'webm', useWebCodecs: false};
  }

  const bitrate = width * height > 1280 * 720 ? 7_500_000 : 4_200_000;
  const hwModes: HardwareAcceleration[] = ['prefer-hardware', 'no-preference'];

  if (requestedFormat === 'mp4') {
    const audioMatch = await findSupportedAudioCodec([
      {codec: 'mp4a.40.2', muxerCodec: 'aac'},
      {codec: 'opus', muxerCodec: 'opus'},
    ]);
    if (audioMatch) {
      const mp4Candidates: Array<{webCodecs: string; muxer: string}> = [
        {webCodecs: 'avc1.4d002a', muxer: 'avc'},
        {webCodecs: 'avc1.64002a', muxer: 'avc'},
        {webCodecs: 'avc1.42001f', muxer: 'avc'},
        {webCodecs: 'av01.0.08M.08', muxer: 'av1'},
      ];
      for (const hw of hwModes) {
        for (const candidate of mp4Candidates) {
          try {
            const vCheck = await VideoEncoder.isConfigSupported({
              codec: candidate.webCodecs,
              width,
              height,
              bitrate,
              framerate: fps,
              hardwareAcceleration: hw,
              latencyMode: 'realtime',
            });
            if (vCheck.supported) {
              return {
                format: 'mp4',
                useWebCodecs: true,
                videoCodec: candidate.webCodecs,
                audioCodec: audioMatch.codec,
                muxerVideoCodec: candidate.muxer,
                muxerAudioCodec: audioMatch.muxerCodec,
                hardwareAcceleration: hw,
              };
            }
          } catch {
            continue;
          }
        }
      }
    }
  }

  const webmAudio = await findSupportedAudioCodec([{codec: 'opus', muxerCodec: 'opus'}]);
  if (webmAudio) {
    const hwWebmCandidates: Array<{webCodecs: string; muxer: string}> = [
      {webCodecs: 'vp09.00.10.08', muxer: 'V_VP9'},
      {webCodecs: 'vp8', muxer: 'V_VP8'},
      {webCodecs: 'av01.0.08M.08', muxer: 'V_AV1'},
    ];
    for (const candidate of hwWebmCandidates) {
      try {
        const vCheck = await VideoEncoder.isConfigSupported({
          codec: candidate.webCodecs,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'prefer-hardware',
          latencyMode: 'realtime',
        });
        if (vCheck.supported) {
          return {
            format: 'webm',
            useWebCodecs: true,
            videoCodec: candidate.webCodecs,
            audioCodec: webmAudio.codec,
            muxerVideoCodec: candidate.muxer,
            muxerAudioCodec: webmAudio.muxerCodec,
            hardwareAcceleration: 'prefer-hardware',
          };
        }
      } catch {
        continue;
      }
    }

    const swWebmCandidates: Array<{webCodecs: string; muxer: string}> = [
      {webCodecs: 'vp8', muxer: 'V_VP8'},
      {webCodecs: 'vp09.00.10.08', muxer: 'V_VP9'},
    ];
    for (const candidate of swWebmCandidates) {
      try {
        const vCheck = await VideoEncoder.isConfigSupported({
          codec: candidate.webCodecs,
          width,
          height,
          bitrate,
          framerate: fps,
          hardwareAcceleration: 'no-preference',
          latencyMode: 'realtime',
        });
        if (vCheck.supported) {
          return {
            format: 'webm',
            useWebCodecs: true,
            videoCodec: candidate.webCodecs,
            audioCodec: webmAudio.codec,
            muxerVideoCodec: candidate.muxer,
            muxerAudioCodec: webmAudio.muxerCodec,
            hardwareAcceleration: 'no-preference',
          };
        }
      } catch {
        continue;
      }
    }
  }

  return {format: 'webm', useWebCodecs: false};
}

export async function generateSheetMusicVideo(params: {
  api: alphaTab.AlphaTabApi;
  score: alphaTab.model.Score;
  tracks: TrackState[];
  audioTracks: AudioTrackState[];
  metadata: ScoreMetadata;
  settings: VideoExportSettings;
  onProgress: (state: Partial<ExportProgressState>) => void;
  abortSignal: AbortSignal;
}): Promise<{blob: Blob; filename: string; durationMs: number; actualFormat: VideoFormatId}> {
  const {api, score, tracks, audioTracks, metadata, settings, onProgress, abortSignal} = params;
  const selectedTrackIndices = tracks.filter((t) => t.selected).map((t) => t.index);
  if (selectedTrackIndices.length === 0) {
    throw new Error('Select at least one track to render in the video.');
  }

  onProgress({
    phase: 'audio',
    progress: 5,
    message: 'Synthesizing multi-track SoundFont audio...',
  });

  const hasAudibleEmbeddedSync =
    audioTracks.some((t) => t.sourceType === 'embedded' && !t.muted) &&
    score.masterBars.some((mb) => mb.syncPoints && mb.syncPoints.length > 0);

  const soundFontBytes = await loadBundledSoundFontBytes();
  const sampleRate = 48000;
  const exportOptions = new alphaTab.synth.AudioExportOptions();
  exportOptions.sampleRate = sampleRate;
  exportOptions.soundFonts = [soundFontBytes];
  exportOptions.masterVolume = 1.0;
  exportOptions.metronomeVolume = settings.includeMetronome ? 0.65 : 0.0;
  exportOptions.useSyncPoints = hasAudibleEmbeddedSync;

  const playbackRange = computePlaybackRangeForBars(
    api.tickCache,
    score,
    settings.barStart,
    settings.barEnd
  );
  if (playbackRange) {
    exportOptions.playbackRange = playbackRange;
  }

  const anySolo = tracks.some((t) => t.solo) || audioTracks.some((t) => t.solo);
  const trackVolumes = new Map<number, number>();
  for (const modelTrack of score.tracks) {
    trackVolumes.set(modelTrack.index, 0);
  }
  for (const track of tracks) {
    let active = !track.muted;
    if (anySolo) {
      active = track.solo;
    } else if (settings.audioMixMode === 'selected-only') {
      active = active && track.selected;
    }
    trackVolumes.set(track.index, active ? track.volume : 0);
  }
  exportOptions.trackVolume = trackVolumes;

  const startTick = playbackRange ? playbackRange.startTick : 0;
  const exporter = await api.exportAudio(exportOptions);
  const layoutPromise = renderScoreToTiles(score, selectedTrackIndices, settings);
  const audioChunks: alphaTab.synth.AudioExportChunk[] = [];
  const chunkTimeline: TimeTickPoint[] = [{timeMs: 0, tick: startTick}];
  let cumulativeAudioFrames = 0;

  try {
    let chunkIndex = 0;
    while (true) {
      if (abortSignal.aborted) {
        throw new Error('Export cancelled.');
      }
      const chunk = await exporter.render(250);
      if (!chunk || chunk.samples.length === 0) {
        break;
      }
      audioChunks.push(chunk);
      cumulativeAudioFrames += chunk.samples.length / 2;
      const chunkEndMs = (cumulativeAudioFrames / sampleRate) * 1000;
      const prevTick = chunkTimeline[chunkTimeline.length - 1].tick;
      const clampedTick = Math.max(prevTick, Math.min(chunk.endTick, chunk.currentTick));
      chunkTimeline.push({
        timeMs: chunkEndMs,
        tick: clampedTick,
      });
      chunkIndex++;
      if (chunk.endTime > 0 && chunkIndex % 2 === 0) {
        const audioPct = Math.min(22, 5 + Math.round((chunkEndMs / chunk.endTime) * 17));
        onProgress({
          phase: 'audio',
          progress: audioPct,
          message: `Synthesizing audio (${formatDurationMs(chunkEndMs)} / ${formatDurationMs(chunk.endTime)})`,
        });
      }
    }
  } catch (err) {
    exporter.destroy();
    void layoutPromise.then(disposeRenderedLayout).catch(() => {});
    throw err;
  }
  exporter.destroy();

  if (audioChunks.length === 0) {
    void layoutPromise.then(disposeRenderedLayout).catch(() => {});
    throw new Error('No audio was generated for the selected range.');
  }

  const lastChunk = audioChunks[audioChunks.length - 1];
  const totalDurationMs = Math.max(500, (cumulativeAudioFrames / sampleRate) * 1000);
  const endTick = playbackRange ? playbackRange.endTick : lastChunk.endTick;
  const exactMap = buildTimelineFromTickCache(
    api.tickCache,
    startTick,
    endTick,
    score.tempo || metadata.tempo || 120
  );

  if (audioTracks.length > 0) {
    onProgress({
      phase: 'audio',
      progress: 24,
      message: 'Mixing embedded and external audio tracks...',
    });
    const startOffsetMs = settings.barStart > 1 ? exactMap.rangeStartMs : 0;
    try {
      await mixExternalAudioIntoChunks(audioChunks, audioTracks, anySolo, sampleRate, startOffsetMs);
    } catch (err) {
      void layoutPromise.then(disposeRenderedLayout).catch(() => {});
      throw err;
    }
  }

  const timeline =
    !hasAudibleEmbeddedSync && exactMap.points.length >= 2 ? exactMap.points : chunkTimeline;

  if (abortSignal.aborted) {
    void layoutPromise.then(disposeRenderedLayout).catch(() => {});
    throw new Error('Export cancelled.');
  }

  onProgress({
    phase: 'layout',
    progress: 26,
    message: 'Preparing GPU sheet music textures...',
  });

  const layout = await layoutPromise;

  try {
    const preset = RESOLUTION_PRESETS[settings.resolution];
    const width = preset.width;
    const height = preset.height;
    const fps = settings.fps;
    const totalFrames = Math.max(1, Math.ceil((totalDurationMs / 1000) * fps));

    const codecResolution = await resolveVideoCodecConfig(
      settings.format,
      width,
      height,
      fps,
      settings.transparentBackground
    );

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', {alpha: settings.transparentBackground});
    if (!ctx) {
      throw new Error('Unable to acquire 2D canvas context for video rendering.');
    }

    const safeSlug = metadata.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'scoreframe-video';

    if (codecResolution.useWebCodecs && codecResolution.videoCodec && codecResolution.audioCodec) {
      const accelTag = codecResolution.hardwareAcceleration === 'prefer-hardware' ? 'GPU' : 'CPU';
      onProgress({
        phase: 'encoding',
        progress: 30,
        currentFrame: 0,
        totalFrames,
        message: `Encoding ${totalFrames} frames (${codecResolution.format.toUpperCase()} · ${accelTag})...`,
      });

      const bitrate = width * height > 1280 * 720 ? 7_500_000 : 4_200_000;
      const isMp4 = codecResolution.format === 'mp4';

      const mp4Target = isMp4 ? new Mp4ArrayBufferTarget() : null;
      const webmTarget = isMp4 ? null : new WebmArrayBufferTarget();

      const mp4Muxer = mp4Target
        ? new Mp4Muxer({
            target: mp4Target,
            video: {
              codec: (codecResolution.muxerVideoCodec as 'avc' | 'hevc' | 'vp9' | 'av1') || 'avc',
              width,
              height,
              frameRate: fps,
            },
            audio: {
              codec: codecResolution.muxerAudioCodec || 'aac',
              numberOfChannels: 2,
              sampleRate,
            },
            fastStart: {
              expectedVideoChunks: totalFrames,
              expectedAudioChunks: audioChunks.length,
            },
          })
        : null;

      const webmMuxer = webmTarget
        ? new WebmMuxer({
            target: webmTarget,
            video: {
              codec: codecResolution.muxerVideoCodec || 'V_VP8',
              width,
              height,
              frameRate: fps,
            },
            audio: {
              codec: 'A_OPUS',
              numberOfChannels: 2,
              sampleRate,
            },
          })
        : null;

      let encoderError: Error | null = null;
      let queueWaiter: (() => void) | null = null;

      const videoEncoder = new VideoEncoder({
        output: (chunk, meta) => {
          if (mp4Muxer) {
            mp4Muxer.addVideoChunk(chunk, meta);
          } else if (webmMuxer) {
            webmMuxer.addVideoChunk(chunk, meta);
          }
        },
        error: (err) => {
          encoderError = err instanceof Error ? err : new Error('Video encoder failed.');
          if (queueWaiter) {
            const resolve = queueWaiter;
            queueWaiter = null;
            resolve();
          }
        },
      });

      videoEncoder.ondequeue = () => {
        if (queueWaiter && videoEncoder.encodeQueueSize <= 8) {
          const resolve = queueWaiter;
          queueWaiter = null;
          resolve();
        }
      };

      videoEncoder.configure({
        codec: codecResolution.videoCodec,
        width,
        height,
        bitrate,
        framerate: fps,
        hardwareAcceleration: codecResolution.hardwareAcceleration || 'no-preference',
        latencyMode: 'realtime',
      });

      const audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          if (mp4Muxer) {
            mp4Muxer.addAudioChunk(chunk, meta);
          } else if (webmMuxer) {
            webmMuxer.addAudioChunk(chunk, meta);
          }
        },
        error: (err) => {
          encoderError = err instanceof Error ? err : new Error('Audio encoder failed.');
        },
      });
      audioEncoder.configure({
        codec: codecResolution.audioCodec,
        numberOfChannels: 2,
        sampleRate,
        bitrate: 192_000,
      });

      let encodedAudioFrames = 0;
      for (const chunk of audioChunks) {
        if (encoderError) {
          throw encoderError;
        }
        const frameCount = chunk.samples.length / 2;
        const audioTimestampUs = Math.round((encodedAudioFrames / sampleRate) * 1_000_000);
        const audioData = new AudioData({
          format: 'f32',
          sampleRate,
          numberOfFrames: frameCount,
          numberOfChannels: 2,
          timestamp: audioTimestampUs,
          data: new Float32Array(chunk.samples),
        });
        audioEncoder.encode(audioData);
        audioData.close();
        encodedAudioFrames += frameCount;
      }

      const frameCache = createFrameRenderCache();
      let scrollX = 0;
      let scrollY = 0;
      const scrollLerp = fps === 60 ? 0.12 : 0.2;
      const keyFrameInterval = fps * 2;
      let lastUiYieldPerf = performance.now();

      try {
        for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
          if (abortSignal.aborted) {
            throw new Error('Export cancelled.');
          }
          if (encoderError) {
            throw encoderError;
          }

          if (videoEncoder.encodeQueueSize >= 16) {
            await new Promise<void>((resolve) => {
              if (videoEncoder.encodeQueueSize <= 8 || encoderError) {
                resolve();
                return;
              }
              queueWaiter = resolve;
            });
            if (encoderError) {
              throw encoderError;
            }
          }

          const timeMs = (frameIdx / fps) * 1000;
          const tick = interpolateTickFromTime(timeline, timeMs);

          const nextScroll = drawVideoFrame({
            ctx,
            layout,
            settings,
            metadata,
            tracks,
            tickCache: api.tickCache,
            currentTick: tick,
            currentTimeMs: timeMs,
            totalDurationMs,
            smoothedScrollX: scrollX,
            smoothedScrollY: scrollY,
            instantScroll: frameIdx === 0,
            scrollLerp,
            cache: frameCache,
          });
          scrollX = nextScroll.scrollX;
          scrollY = nextScroll.scrollY;

          const frameStartUs = Math.round((frameIdx / fps) * 1_000_000);
          const frameEndUs = Math.round(((frameIdx + 1) / fps) * 1_000_000);
          const videoFrame = new VideoFrame(canvas, {
            timestamp: frameStartUs,
            duration: Math.max(1, frameEndUs - frameStartUs),
          });
          videoEncoder.encode(videoFrame, {keyFrame: frameIdx % keyFrameInterval === 0});
          videoFrame.close();

          const now = performance.now();
          if (now - lastUiYieldPerf >= 60 || frameIdx === totalFrames - 1) {
            lastUiYieldPerf = now;
            const pct = 30 + Math.round(((frameIdx + 1) / totalFrames) * 65);
            onProgress({
              phase: 'encoding',
              progress: pct,
              currentFrame: frameIdx + 1,
              totalFrames,
              message: `Rendering frame ${frameIdx + 1} of ${totalFrames} (${accelTag})`,
            });
            await new Promise((r) => setTimeout(r, 0));
          }
        }

        onProgress({
          phase: 'finalizing',
          progress: 96,
          message: isMp4 ? 'Muxing MP4 video and audio streams...' : 'Finalizing WebM container...',
        });

        await Promise.all([videoEncoder.flush(), audioEncoder.flush()]);
        if (encoderError) {
          throw encoderError;
        }
      } finally {
        if (videoEncoder.state !== 'closed') {
          videoEncoder.close();
        }
        if (audioEncoder.state !== 'closed') {
          audioEncoder.close();
        }
      }

      if (mp4Muxer && mp4Target) {
        mp4Muxer.finalize();
        const blob = new Blob([mp4Target.buffer], {type: 'video/mp4'});
        return {
          blob,
          filename: `${safeSlug}-${settings.resolution}.mp4`,
          durationMs: totalDurationMs,
          actualFormat: 'mp4',
        };
      }

      if (webmMuxer && webmTarget) {
        webmMuxer.finalize();
        const blob = new Blob([webmTarget.buffer], {type: 'video/webm'});
        return {
          blob,
          filename: `${safeSlug}-${settings.resolution}.webm`,
          durationMs: totalDurationMs,
          actualFormat: 'webm',
        };
      }
    }

    return await renderWithMediaRecorderFallback({
      canvas,
      ctx,
      audioChunks,
      sampleRate,
      totalDurationMs,
      fps,
      totalFrames,
      layout,
      settings,
      metadata,
      tracks,
      tickCache: api.tickCache,
      timeline,
      safeSlug,
      onProgress,
      abortSignal,
    });
  } finally {
    disposeRenderedLayout(layout);
  }
}

async function renderWithMediaRecorderFallback(params: {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  audioChunks: alphaTab.synth.AudioExportChunk[];
  sampleRate: number;
  totalDurationMs: number;
  fps: number;
  totalFrames: number;
  layout: RenderedSheetLayout;
  settings: VideoExportSettings;
  metadata: ScoreMetadata;
  tracks: TrackState[];
  tickCache: alphaTab.midi.MidiTickLookup | null;
  timeline: TimeTickPoint[];
  safeSlug: string;
  onProgress: (state: Partial<ExportProgressState>) => void;
  abortSignal: AbortSignal;
}): Promise<{blob: Blob; filename: string; durationMs: number; actualFormat: VideoFormatId}> {
  const {
    canvas,
    ctx,
    audioChunks,
    sampleRate,
    totalDurationMs,
    fps,
    totalFrames,
    layout,
    settings,
    metadata,
    tracks,
    tickCache,
    timeline,
    safeSlug,
    onProgress,
    abortSignal,
  } = params;

  const audioCtx = new AudioContext({sampleRate});
  const totalSamples = audioChunks.reduce((acc, c) => acc + c.samples.length / 2, 0);
  const audioBuffer = audioCtx.createBuffer(2, totalSamples, sampleRate);
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.getChannelData(1);

  let writeOffset = 0;
  for (const chunk of audioChunks) {
    const frames = chunk.samples.length / 2;
    for (let i = 0; i < frames; i++) {
      left[writeOffset + i] = chunk.samples[i * 2];
      right[writeOffset + i] = chunk.samples[i * 2 + 1];
    }
    writeOffset += frames;
  }

  if (audioCtx.state === 'suspended') {
    await audioCtx.resume();
  }

  const dest = audioCtx.createMediaStreamDestination();
  const sourceNode = audioCtx.createBufferSource();
  sourceNode.buffer = audioBuffer;
  sourceNode.connect(dest);

  const canvasStream = canvas.captureStream(fps);
  const combinedStream = new MediaStream([
    ...canvasStream.getVideoTracks(),
    ...dest.stream.getAudioTracks(),
  ]);

  const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
    ? 'video/webm;codecs=vp9,opus'
    : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
    ? 'video/webm;codecs=vp8,opus'
    : 'video/webm';

  const recorder = new MediaRecorder(combinedStream, {
    mimeType,
    videoBitsPerSecond: 6_000_000,
  });

  const recordedChunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      recordedChunks.push(e.data);
    }
  };

  const frameCache = createFrameRenderCache();

  return new Promise((resolve, reject) => {
    let scrollState = drawVideoFrame({
      ctx,
      layout,
      settings,
      metadata,
      tracks,
      tickCache,
      currentTick: interpolateTickFromTime(timeline, 0),
      currentTimeMs: 0,
      totalDurationMs,
      smoothedScrollX: 0,
      smoothedScrollY: 0,
      instantScroll: true,
      cache: frameCache,
    });
    let timerId: number | null = null;

    recorder.onstop = async () => {
      if (timerId !== null) {
        cancelAnimationFrame(timerId);
      }
      await audioCtx.close();
      if (abortSignal.aborted) {
        reject(new Error('Export cancelled.'));
        return;
      }
      const blob = new Blob(recordedChunks, {type: 'video/webm'});
      resolve({
        blob,
        filename: `${safeSlug}-${settings.resolution}.webm`,
        durationMs: totalDurationMs,
        actualFormat: 'webm',
      });
    };

    const startAudioSec = audioCtx.currentTime;
    recorder.start(250);
    sourceNode.start(startAudioSec);

    const step = () => {
      if (abortSignal.aborted) {
        sourceNode.stop();
        recorder.stop();
        return;
      }
      const elapsed = Math.max(0, (audioCtx.currentTime - startAudioSec) * 1000);
      const clampedMs = Math.min(totalDurationMs, elapsed);
      const tick = interpolateTickFromTime(timeline, clampedMs);

      scrollState = drawVideoFrame({
        ctx,
        layout,
        settings,
        metadata,
        tracks,
        tickCache,
        currentTick: tick,
        currentTimeMs: clampedMs,
        totalDurationMs,
        smoothedScrollX: scrollState.scrollX,
        smoothedScrollY: scrollState.scrollY,
        scrollLerp: fps === 60 ? 0.12 : 0.2,
        cache: frameCache,
      });

      const pct = 30 + Math.round((clampedMs / totalDurationMs) * 65);
      const frameEst = Math.min(totalFrames, Math.round((clampedMs / 1000) * fps));
      onProgress({
        phase: 'encoding',
        progress: pct,
        currentFrame: frameEst,
        totalFrames,
        message: `Recording real-time stream (${formatDurationMs(clampedMs)} / ${formatDurationMs(totalDurationMs)})`,
      });

      if (elapsed < totalDurationMs) {
        timerId = requestAnimationFrame(step);
      } else {
        sourceNode.stop();
        recorder.stop();
      }
    };

    timerId = requestAnimationFrame(step);
  });
}
