import * as alphaTab from '@coderline/alphatab';
import {TRACK_SWATCHES} from '../constants/themes';
import type {NotationDisplayMode, ScoreMetadata, TrackState} from '../types/studio';

const MIDI_NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const GENERAL_MIDI_INSTRUMENTS: Record<number, string> = {
  24: 'Nylon Guitar',
  25: 'Steel Guitar',
  26: 'Jazz Guitar',
  27: 'Clean Guitar',
  28: 'Muted Guitar',
  29: 'Overdrive Guitar',
  30: 'Distortion Guitar',
  31: 'Guitar Harmonics',
  32: 'Acoustic Bass',
  33: 'Finger Bass',
  34: 'Pick Bass',
  35: 'Fretless Bass',
  36: 'Slap Bass 1',
  37: 'Slap Bass 2',
  38: 'Synth Bass 1',
  39: 'Synth Bass 2',
  0: 'Acoustic Piano',
  4: 'Electric Piano',
  40: 'Violin',
  42: 'Cello',
  48: 'Strings Ensemble',
};

export interface NotationAvailability {
  hasScore: boolean;
  hasTab: boolean;
}

export function getNotationAvailability(
  score: alphaTab.model.Score | null,
  tracks: TrackState[]
): NotationAvailability {
  if (!score || score.tracks.length === 0) {
    return {hasScore: true, hasTab: true};
  }
  const selectedSet = new Set(tracks.filter((t) => t.selected).map((t) => t.index));
  const targetTracks =
    selectedSet.size > 0 ? score.tracks.filter((tr) => selectedSet.has(tr.index)) : score.tracks;
  const effectiveTracks = targetTracks.length > 0 ? targetTracks : score.tracks;

  let hasScore = false;
  let hasTab = false;
  for (const track of effectiveTracks) {
    for (const staff of track.staves) {
      if (staff.showStandardNotation) {
        hasScore = true;
      }
      if (!staff.isPercussion && staff.showTablature && staff.tuning.length > 0) {
        hasTab = true;
      }
    }
  }
  return {hasScore, hasTab};
}

export function normalizeNotationMode(
  mode: NotationDisplayMode,
  availability: NotationAvailability
): NotationDisplayMode {
  if (availability.hasScore && availability.hasTab) {
    return mode;
  }
  if (availability.hasTab && !availability.hasScore) {
    return 'tab-only';
  }
  if (availability.hasScore && !availability.hasTab) {
    return 'score-only';
  }
  return mode;
}

export function midiNoteToName(midi: number): string {
  const name = MIDI_NOTE_NAMES[((midi % 12) + 12) % 12];
  return name;
}

export function formatTuning(track: alphaTab.model.Track): string {
  const primaryStaff = track.staves.find((s) => s.stringTuning && s.stringTuning.tunings.length > 0) ?? track.staves[0];
  if (!primaryStaff || primaryStaff.isPercussion) {
    return 'Percussion';
  }
  const tunings = primaryStaff.stringTuning?.tunings ?? [];
  if (tunings.length === 0) {
    return 'Standard';
  }
  return tunings
    .slice()
    .reverse()
    .map((midi) => midiNoteToName(midi))
    .join(' ');
}

export function getInstrumentLabel(track: alphaTab.model.Track): string {
  if (track.staves.some((s) => s.isPercussion) || track.playbackInfo.primaryChannel === 9) {
    return 'Drums / Percussion';
  }
  const prog = track.playbackInfo.program;
  return GENERAL_MIDI_INSTRUMENTS[prog] ?? `MIDI Program ${prog}`;
}

export function extractTracksFromScore(score: alphaTab.model.Score): TrackState[] {
  return score.tracks.map((track, idx) => {
    const primaryStaff = track.staves[0];
    const stringCount = primaryStaff?.tuning?.length ?? 0;
    const isPercussion = track.staves.some((s) => s.isPercussion) || track.playbackInfo.primaryChannel === 9;
    const rawVolume = Number.isFinite(track.playbackInfo.volume) ? track.playbackInfo.volume : 16;
    const normalizedVolume = Math.max(0, Math.min(1.5, rawVolume / 16));
    return {
      index: track.index,
      name: track.name?.trim() || `Track ${idx + 1}`,
      shortName: track.shortName?.trim() || `T${idx + 1}`,
      instrumentLabel: getInstrumentLabel(track),
      tuningLabel: formatTuning(track),
      isPercussion,
      stringCount,
      selected: true,
      muted: track.playbackInfo.isMute,
      solo: track.playbackInfo.isSolo,
      volume: normalizedVolume,
      color: TRACK_SWATCHES[idx % TRACK_SWATCHES.length],
    };
  });
}

export function normalizeScorePlaybackForSynth(score: alphaTab.model.Score): void {
  for (const track of score.tracks) {
    track.playbackInfo.volume = 16;
    for (const staff of track.staves) {
      for (const bar of staff.bars) {
        for (const voice of bar.voices) {
          for (const beat of voice.beats) {
            if (beat.automations.length === 0) {
              continue;
            }
            beat.automations = beat.automations.filter(
              (a) => !(a.type === alphaTab.model.AutomationType.Volume && (a.value <= 0 || (bar.index === 0 && beat.index === 0)))
            );
          }
        }
      }
    }
  }

  for (const masterBar of score.masterBars) {
    if (masterBar.tempoAutomations.length === 0) {
      continue;
    }
    for (const automation of masterBar.tempoAutomations) {
      if (!Number.isFinite(automation.value) || automation.value <= 0) {
        automation.value = 120;
      }
    }
    masterBar.tempoAutomations.sort((a, b) => a.ratioPosition - b.ratioPosition);
  }
}

export function extractScoreMetadata(score: alphaTab.model.Score, fileName: string): ScoreMetadata {
  const firstMasterBar = score.masterBars[0];
  const numerator = firstMasterBar?.timeSignatureNumerator ?? 4;
  const denominator = firstMasterBar?.timeSignatureDenominator ?? 4;
  const safeTempo = Number.isFinite(score.tempo) && score.tempo > 0 ? score.tempo : 120;
  return {
    title: score.title?.trim() || fileName.replace(/\.[^/.]+$/, '') || 'Untitled Score',
    subtitle: score.subTitle?.trim() || '',
    artist: score.artist?.trim() || 'Unknown Artist',
    album: score.album?.trim() || '',
    tempo: Math.round(safeTempo),
    barCount: score.masterBars.length,
    timeSignature: `${numerator}/${denominator}`,
    fileName,
  };
}

export function formatDurationMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const tenths = Math.floor((clamped % 1000) / 100);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export async function ensureBravuraFontLoaded(fontDirectory: string, fontFamilyName: string): Promise<void> {
  const loaded = Array.from(document.fonts).some(
    (face) => face.family.replace(/['"]/g, '') === fontFamilyName && face.status === 'loaded'
  );
  if (loaded) {
    return;
  }
  try {
    const face = new FontFace(fontFamilyName, `url("${fontDirectory}Bravura.woff2") format("woff2")`, {
      style: 'normal',
      weight: 'normal',
    });
    await face.load();
    document.fonts.add(face);
    await document.fonts.ready;
  } catch {
    await document.fonts.ready;
  }
}

export function computePlaybackRangeForBars(
  tickCache: alphaTab.midi.MidiTickLookup | null,
  score: alphaTab.model.Score | null,
  barStart: number,
  barEnd: number
): alphaTab.synth.PlaybackRange | undefined {
  if (!tickCache || !score || score.masterBars.length === 0) {
    return undefined;
  }
  const totalBars = score.masterBars.length;
  const clampedStart = Math.max(1, Math.min(totalBars, barStart));
  const clampedEnd = Math.max(clampedStart, Math.min(totalBars, barEnd));
  if (clampedStart === 1 && clampedEnd === totalBars) {
    return undefined;
  }
  const startBarObj = score.masterBars[clampedStart - 1];
  const endBarObj = score.masterBars[clampedEnd - 1];
  const startLookup = tickCache.getMasterBar(startBarObj);
  const endLookup = tickCache.getMasterBar(endBarObj);
  if (!startLookup || !endLookup) {
    return undefined;
  }
  const range = new alphaTab.synth.PlaybackRange();
  range.startTick = startLookup.start;
  range.endTick = endLookup.end;
  return range;
}
