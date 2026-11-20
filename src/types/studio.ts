export type VideoResolutionId = '1080p' | '720p' | 'vertical' | 'square';

export type VideoThemeId = 'studio-paper' | 'concert-dark' | 'manuscript' | 'midnight-slate';

export type NotationDisplayMode = 'score-tab' | 'tab-only' | 'score-only';

export type SheetLayoutMode = 'page' | 'horizontal';

export type CameraMotionMode = 'smooth-scroll' | 'page-flip';

export type VideoFormatId = 'webm' | 'mp4';

export type AudioMixMode = 'selected-only' | 'full-band';

export type ViewportTab = 'sheet' | 'video';

export interface TrackState {
  index: number;
  name: string;
  shortName: string;
  instrumentLabel: string;
  tuningLabel: string;
  isPercussion: boolean;
  stringCount: number;
  selected: boolean;
  muted: boolean;
  solo: boolean;
  volume: number;
  color: string;
}

export interface AudioTrackState {
  id: string;
  name: string;
  sourceType: 'embedded' | 'external';
  mimeType: string;
  durationSec: number;
  muted: boolean;
  solo: boolean;
  volume: number;
  offsetMs: number;
  audioBuffer: AudioBuffer | null;
  rawBytes: Uint8Array;
}

export interface VideoExportSettings {
  resolution: VideoResolutionId;
  fps: 30 | 60;
  format: VideoFormatId;
  theme: VideoThemeId;
  transparentBackground: boolean;
  notationMode: NotationDisplayMode;
  layoutMode: SheetLayoutMode;
  cameraMotion: CameraMotionMode;
  accentColor: string;
  showHeader: boolean;
  showTrackNames: boolean;
  showMeasureHud: boolean;
  showProgressBar: boolean;
  highlightActiveBeat: boolean;
  includeMetronome: boolean;
  audioMixMode: AudioMixMode;
  barStart: number;
  barEnd: number;
}

export interface ExportProgressState {
  phase: 'idle' | 'audio' | 'layout' | 'encoding' | 'finalizing' | 'done' | 'error' | 'cancelled';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  message: string;
  outputUrl: string | null;
  outputFilename: string | null;
  outputSizeBytes: number;
  durationMs: number;
  errorMessage: string | null;
}

export interface ScoreMetadata {
  title: string;
  subtitle: string;
  artist: string;
  album: string;
  tempo: number;
  barCount: number;
  timeSignature: string;
  fileName: string;
}

export interface ResolutionPreset {
  id: VideoResolutionId;
  label: string;
  dimensionsLabel: string;
  width: number;
  height: number;
  sheetScale: number;
}

export interface VideoThemePalette {
  id: VideoThemeId;
  label: string;
  background: string;
  surface: string;
  headerBorder: string;
  titleText: string;
  mutedText: string;
  staffLine: string;
  barSeparator: string;
  barNumber: string;
  mainGlyph: string;
  secondaryGlyph: string;
  scoreInfo: string;
}
