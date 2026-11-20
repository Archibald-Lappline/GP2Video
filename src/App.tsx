import * as alphaTab from '@coderline/alphatab';
import {FolderOpen} from 'lucide-react';
import {type CSSProperties, useCallback, useEffect, useRef, useState} from 'react';
import {DesktopBuildView} from './components/DesktopBuildView';
import {ExportModal} from './components/ExportModal';
import {TopBar} from './components/TopBar';
import {TrackSidebar} from './components/TrackSidebar';
import {TransportBar} from './components/TransportBar';
import {VideoPreviewCanvas} from './components/VideoPreviewCanvas';
import {VideoSettingsPanel} from './components/VideoSettingsPanel';
import {APP_VERSION} from './constants/appInfo';
import {DEFAULT_VIDEO_SETTINGS, VIDEO_THEMES} from './constants/themes';
import {ExternalAudioSyncEngine} from './services/audioTrackPlayer';
import {
  checkForAppUpdates,
  openExternalUrl,
  type UpdateCheckState,
} from './services/updateChecker';
import {generateSheetMusicVideo} from './services/videoRenderer';
import type {
  AudioTrackState,
  ExportProgressState,
  NotationDisplayMode,
  ScoreMetadata,
  SheetLayoutMode,
  TrackState,
  VideoExportSettings,
  ViewportTab,
} from './types/studio';
import {extractAudioAssetsFromGpBuffer} from './utils/gpZipAssets';
import {
  extractScoreMetadata,
  extractTracksFromScore,
  getNotationAvailability,
  normalizeNotationMode,
  normalizeScorePlaybackForSynth,
} from './utils/scoreUtils';
import {loadBundledSoundFontBytes} from './utils/soundFontLoader';

const INITIAL_EXPORT_STATE: ExportProgressState = {
  phase: 'idle',
  progress: 0,
  currentFrame: 0,
  totalFrames: 0,
  message: '',
  outputUrl: null,
  outputFilename: null,
  outputSizeBytes: 0,
  durationMs: 0,
  errorMessage: null,
};

function mapNotationMode(mode: NotationDisplayMode): alphaTab.StaveProfile {
  switch (mode) {
    case 'tab-only':
      return alphaTab.StaveProfile.Tab;
    case 'score-only':
      return alphaTab.StaveProfile.Score;
    default:
      return alphaTab.StaveProfile.ScoreTab;
  }
}

function mapLayoutMode(mode: SheetLayoutMode): alphaTab.LayoutMode {
  return mode === 'horizontal' ? alphaTab.LayoutMode.Horizontal : alphaTab.LayoutMode.Page;
}

export default function App() {
  const sheetMountRef = useRef<HTMLDivElement | null>(null);
  const sheetScrollRef = useRef<HTMLDivElement | null>(null);
  const emptyFileInputRef = useRef<HTMLInputElement | null>(null);
  const apiRef = useRef<alphaTab.AlphaTabApi | null>(null);
  const scoreRef = useRef<alphaTab.model.Score | null>(null);
  const pendingFilenameRef = useRef<string>('');
  const exportAbortRef = useRef<AbortController | null>(null);
  const audioEngineRef = useRef<ExternalAudioSyncEngine>(new ExternalAudioSyncEngine());
  const tracksRef = useRef<TrackState[]>([]);
  const audioTracksRef = useRef<AudioTrackState[]>([]);
  const playbackSpeedRef = useRef<number>(1.0);
  const metronomeEnabledRef = useRef<boolean>(false);
  const audioMixModeRef = useRef<VideoExportSettings['audioMixMode']>('selected-only');
  const loadGenerationRef = useRef<number>(0);
  const lastPositionRef = useRef<{timeMs: number; perfMs: number}>({timeMs: 0, perfMs: 0});
  const isPlayingRef = useRef<boolean>(false);

  const [appVersion, setAppVersion] = useState<string>(APP_VERSION);
  const [updateState, setUpdateState] = useState<UpdateCheckState>({
    status: 'idle',
    currentVersion: APP_VERSION,
    latestVersion: null,
    latestRelease: null,
    releases: [],
    checkedAt: null,
    errorMessage: null,
  });
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);

  const [isDesktopBuildOpen, setIsDesktopBuildOpen] = useState(false);
  const [activeViewportTab, setActiveViewportTab] = useState<ViewportTab>('sheet');
  const [score, setScore] = useState<alphaTab.model.Score | null>(null);
  const [metadata, setMetadata] = useState<ScoreMetadata | null>(null);
  const [tracks, setTracks] = useState<TrackState[]>([]);
  const [audioTracks, setAudioTracks] = useState<AudioTrackState[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isPlayerReady, setIsPlayerReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [totalDurationMs, setTotalDurationMs] = useState(0);
  const [currentTick, setCurrentTick] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [metronomeEnabled, setMetronomeEnabled] = useState(false);

  const [videoSettings, setVideoSettings] = useState<VideoExportSettings>(DEFAULT_VIDEO_SETTINGS);
  const [exportState, setExportState] = useState<ExportProgressState>(INITIAL_EXPORT_STATE);
  const videoSettingsRef = useRef<VideoExportSettings>(videoSettings);

  tracksRef.current = tracks;
  audioTracksRef.current = audioTracks;
  playbackSpeedRef.current = playbackSpeed;
  metronomeEnabledRef.current = metronomeEnabled;
  audioMixModeRef.current = videoSettings.audioMixMode;
  isPlayingRef.current = isPlaying;
  videoSettingsRef.current = videoSettings;

  useEffect(() => {
    document.documentElement.style.setProperty('--sf-accent', videoSettings.accentColor);
  }, [videoSettings.accentColor]);

  const runUpdateCheck = useCallback(async (versionToCheck: string, signal?: AbortSignal) => {
    setIsCheckingUpdates(true);
    try {
      const result = await checkForAppUpdates(versionToCheck, signal);
      if (!signal?.aborted) {
        setUpdateState(result);
      }
    } catch {
    } finally {
      if (!signal?.aborted) {
        setIsCheckingUpdates(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    const initVersionAndCheck = async () => {
      let resolvedVersion = APP_VERSION;
      try {
        const nativeVersion = await window.scoreFrameDesktop?.getVersion?.();
        if (nativeVersion && nativeVersion.trim().length > 0) {
          resolvedVersion = nativeVersion.trim();
        }
      } catch {
      }
      if (!mounted || controller.signal.aborted) {
        return;
      }
      setAppVersion(resolvedVersion);
      await runUpdateCheck(resolvedVersion, controller.signal);
    };

    void initVersionAndCheck();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [runUpdateCheck]);

  const applyThemeAndProfileToApi = useCallback(
    (api: alphaTab.AlphaTabApi, settings: VideoExportSettings) => {
      const palette = VIDEO_THEMES[settings.theme];
      api.settings.display.staveProfile = mapNotationMode(settings.notationMode);
      api.settings.display.layoutMode = mapLayoutMode(settings.layoutMode);
      api.settings.display.barCountPerPartial = settings.layoutMode === 'horizontal' ? 6 : 10;

      const staffLine = alphaTab.model.Color.fromJson(palette.staffLine);
      const barSep = alphaTab.model.Color.fromJson(palette.barSeparator);
      const barNum = alphaTab.model.Color.fromJson(palette.barNumber);
      const mainGlyph = alphaTab.model.Color.fromJson(palette.mainGlyph);
      const secondaryGlyph = alphaTab.model.Color.fromJson(palette.secondaryGlyph);
      const scoreInfo = alphaTab.model.Color.fromJson(palette.scoreInfo);

      if (staffLine) api.settings.display.resources.staffLineColor = staffLine;
      if (barSep) api.settings.display.resources.barSeparatorColor = barSep;
      if (barNum) api.settings.display.resources.barNumberColor = barNum;
      if (mainGlyph) api.settings.display.resources.mainGlyphColor = mainGlyph;
      if (secondaryGlyph) api.settings.display.resources.secondaryGlyphColor = secondaryGlyph;
      if (scoreInfo) api.settings.display.resources.scoreInfoColor = scoreInfo;

      api.updateSettings();
    },
    []
  );

  const syncSelectedAudioMix = useCallback(
    (
      nextTracks: TrackState[],
      nextAudioTracks: AudioTrackState[],
      mixMode: VideoExportSettings['audioMixMode']
    ) => {
      const api = apiRef.current;
      const currentScore = scoreRef.current;
      const anyMidiSolo = nextTracks.some((t) => t.solo);
      const anyAudioSolo = nextAudioTracks.some((t) => t.solo);
      const anySolo = anyMidiSolo || anyAudioSolo;

      if (api && currentScore) {
        const activeIndices = new Set(nextTracks.map((t) => t.index));
        const removedModels = currentScore.tracks.filter((tr) => !activeIndices.has(tr.index));
        if (removedModels.length > 0) {
          api.changeTrackMute(removedModels, true);
          api.changeTrackSolo(removedModels, false);
        }

        const channelGroup = new Map<
          number,
          {models: alphaTab.model.Track[]; shouldHear: boolean; solo: boolean; volume: number}
        >();

        for (const tState of nextTracks) {
          const modelTrack = currentScore.tracks.find((tr) => tr.index === tState.index);
          if (!modelTrack) {
            continue;
          }
          let shouldHear = !tState.muted;
          if (anySolo) {
            shouldHear = tState.solo;
          } else if (mixMode === 'selected-only') {
            shouldHear = shouldHear && tState.selected;
          }
          const ch = modelTrack.playbackInfo.primaryChannel;
          const existing = channelGroup.get(ch);
          if (existing) {
            existing.models.push(modelTrack);
            existing.shouldHear = existing.shouldHear || shouldHear;
            existing.solo = existing.solo || tState.solo;
            existing.volume = Math.max(existing.volume, tState.volume);
          } else {
            channelGroup.set(ch, {
              models: [modelTrack],
              shouldHear,
              solo: tState.solo,
              volume: tState.volume,
            });
          }
        }

        for (const group of channelGroup.values()) {
          api.changeTrackMute(group.models, !group.shouldHear);
          api.changeTrackSolo(group.models, group.solo);
          api.changeTrackVolume(group.models, group.volume);
        }
      }

      audioEngineRef.current.updateMix(nextAudioTracks, anyMidiSolo);
    },
    []
  );

  useEffect(() => {
    const mountEl = sheetMountRef.current;
    const scrollEl = sheetScrollRef.current;
    if (!mountEl || !scrollEl) {
      return;
    }

    const palette = VIDEO_THEMES[DEFAULT_VIDEO_SETTINGS.theme];
    const settings = new alphaTab.Settings();
    settings.core.engine = 'svg';
    settings.core.fontDirectory = `${import.meta.env.BASE_URL}font/`;
    settings.display.layoutMode = mapLayoutMode(DEFAULT_VIDEO_SETTINGS.layoutMode);
    settings.display.staveProfile = mapNotationMode(DEFAULT_VIDEO_SETTINGS.notationMode);
    settings.player.enablePlayer = true;
    settings.player.playerMode = alphaTab.PlayerMode.EnabledSynthesizer;
    settings.player.enableCursor = true;
    settings.player.enableUserInteraction = true;
    settings.player.scrollElement = scrollEl;
    settings.player.scrollOffsetX = -100;

    const staffLine = alphaTab.model.Color.fromJson(palette.staffLine);
    const barSep = alphaTab.model.Color.fromJson(palette.barSeparator);
    const barNum = alphaTab.model.Color.fromJson(palette.barNumber);
    const mainGlyph = alphaTab.model.Color.fromJson(palette.mainGlyph);
    const secondaryGlyph = alphaTab.model.Color.fromJson(palette.secondaryGlyph);
    const scoreInfo = alphaTab.model.Color.fromJson(palette.scoreInfo);

    if (staffLine) settings.display.resources.staffLineColor = staffLine;
    if (barSep) settings.display.resources.barSeparatorColor = barSep;
    if (barNum) settings.display.resources.barNumberColor = barNum;
    if (mainGlyph) settings.display.resources.mainGlyphColor = mainGlyph;
    if (secondaryGlyph) settings.display.resources.secondaryGlyphColor = secondaryGlyph;
    if (scoreInfo) settings.display.resources.scoreInfoColor = scoreInfo;

    const api = new alphaTab.AlphaTabApi(mountEl, settings);
    apiRef.current = api;
    const audioEngine = audioEngineRef.current;

    let disposed = false;
    let sfLoaded = false;
    let sfBytes: Uint8Array | null = null;

    const tryLoadSoundFont = () => {
      if (disposed || sfLoaded || !sfBytes || !api.player?.isReady) {
        return;
      }
      sfLoaded = true;
      api.loadSoundFont(new Uint8Array(sfBytes), false);
    };

    api.player?.ready.on(tryLoadSoundFont);
    if (api.player?.isReady) {
      tryLoadSoundFont();
    }

    void loadBundledSoundFontBytes()
      .then((bytes) => {
        if (disposed) {
          return;
        }
        sfBytes = bytes;
        tryLoadSoundFont();
      })
      .catch((err) => {
        if (!disposed) {
          setLoadError(err instanceof Error ? err.message : 'Unable to load audio SoundFont.');
        }
      });

    api.scoreLoaded.on((loadedScore) => {
      const generation = loadGenerationRef.current;
      scoreRef.current = loadedScore;
      api.playbackRange = null;
      setScore(loadedScore);
      setLoadError(null);
      setIsPlayerReady(false);
      const nextMeta = extractScoreMetadata(loadedScore, pendingFilenameRef.current);
      const nextTracks = extractTracksFromScore(loadedScore);
      const availability = getNotationAvailability(loadedScore, nextTracks);
      normalizeScorePlaybackForSynth(loadedScore);
      tracksRef.current = nextTracks;
      setMetadata(nextMeta);
      setTracks(nextTracks);
      setCurrentTimeMs(0);
      setTotalDurationMs(0);
      setCurrentTick(0);
      const nextNotationMode = normalizeNotationMode(
        videoSettingsRef.current.notationMode,
        availability
      );
      if (nextNotationMode !== videoSettingsRef.current.notationMode) {
        api.settings.display.staveProfile = mapNotationMode(nextNotationMode);
        api.updateSettings();
      }
      setVideoSettings((prev) => ({
        ...prev,
        barStart: 1,
        barEnd: Math.max(1, nextMeta.barCount),
        notationMode: normalizeNotationMode(prev.notationMode, availability),
      }));

      if (loadedScore.backingTrack?.rawAudioFile) {
        const raw = loadedScore.backingTrack.rawAudioFile;
        void audioEngine
          .decodeAudioBytes(raw)
          .then((decoded) => {
            if (generation !== loadGenerationRef.current) {
              return;
            }
            if (audioTracksRef.current.some((t) => t.sourceType === 'embedded')) {
              return;
            }
            const embeddedTrack: AudioTrackState = {
              id: `embedded-bt-${Date.now()}`,
              name: 'Embedded Backing Track',
              sourceType: 'embedded',
              mimeType: 'audio/mpeg',
              durationSec: decoded.duration,
              muted: false,
              solo: false,
              volume: 1.0,
              offsetMs: 0,
              audioBuffer: decoded,
              rawBytes: raw,
            };
            const nextAudio = [embeddedTrack, ...audioTracksRef.current];
            audioTracksRef.current = nextAudio;
            setAudioTracks(nextAudio);
            if (isPlayingRef.current) {
              audioEngine.startAt(
                api.timePosition,
                playbackSpeedRef.current,
                nextAudio,
                tracksRef.current.some((t) => t.solo)
              );
            }
          })
          .catch(() => {});
      }
    });

    api.midiLoaded.on((e) => {
      setTotalDurationMs(e.endTime);
    });

    api.playerReady.on(() => {
      setIsPlayerReady(true);
      const applyReadyMix = () => {
        if (apiRef.current !== api) {
          return;
        }
        api.playbackSpeed = playbackSpeedRef.current;
        api.metronomeVolume = metronomeEnabledRef.current ? 1.0 : 0.0;
        syncSelectedAudioMix(
          tracksRef.current,
          audioTracksRef.current,
          audioMixModeRef.current
        );
      };
      applyReadyMix();
      queueMicrotask(applyReadyMix);
    });

    api.playerStateChanged.on((e) => {
      const playing = e.state === alphaTab.synth.PlayerState.Playing;
      setIsPlaying(playing);
      if (playing) {
        lastPositionRef.current = {timeMs: api.timePosition, perfMs: performance.now()};
        const anyMidiSolo = tracksRef.current.some((t) => t.solo);
        audioEngine.startAt(
          api.timePosition,
          playbackSpeedRef.current,
          audioTracksRef.current,
          anyMidiSolo
        );
      } else {
        audioEngine.stop();
      }
    });

    api.playerPositionChanged.on((e) => {
      setCurrentTimeMs(e.currentTime);
      setTotalDurationMs(e.endTime);
      setCurrentTick(e.currentTick);

      if (isPlayingRef.current) {
        const now = performance.now();
        const elapsedWall = (now - lastPositionRef.current.perfMs) * playbackSpeedRef.current;
        const expectedTime = lastPositionRef.current.timeMs + elapsedWall;
        if (Math.abs(e.currentTime - expectedTime) > 350) {
          const anyMidiSolo = tracksRef.current.some((t) => t.solo);
          audioEngine.startAt(
            e.currentTime,
            playbackSpeedRef.current,
            audioTracksRef.current,
            anyMidiSolo
          );
        }
        lastPositionRef.current = {timeMs: e.currentTime, perfMs: now};
      }
    });

    api.error.on((err) => {
      setLoadError(err?.message || 'Unable to parse the selected score file.');
    });

    return () => {
      disposed = true;
      audioEngine.destroy();
      api.destroy();
      apiRef.current = null;
    };
  }, [syncSelectedAudioMix]);

  useEffect(() => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    if (sheetScrollRef.current && videoSettings.layoutMode !== 'horizontal') {
      sheetScrollRef.current.scrollLeft = 0;
    }
    applyThemeAndProfileToApi(api, videoSettings);
    if (scoreRef.current) {
      api.render();
    }
  }, [
    videoSettings.theme,
    videoSettings.notationMode,
    videoSettings.layoutMode,
    applyThemeAndProfileToApi,
  ]);

  useEffect(() => {
    if (!score || activeViewportTab !== 'sheet') {
      return;
    }
    const rafId = requestAnimationFrame(() => {
      const api = apiRef.current;
      const mountEl = sheetMountRef.current;
      if (!api || !scoreRef.current || !mountEl || mountEl.offsetWidth <= 0) {
        return;
      }
      const svgs = mountEl.querySelectorAll('svg');
      if (svgs.length === 0) {
        return;
      }
      let hasVisibleSvg = false;
      for (let i = 0; i < svgs.length; i++) {
        const rect = svgs[i].getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          hasVisibleSvg = true;
          break;
        }
      }
      if (!hasVisibleSvg) {
        applyThemeAndProfileToApi(api, videoSettingsRef.current);
        api.render();
      }
    });
    return () => cancelAnimationFrame(rafId);
  }, [score, activeViewportTab, applyThemeAndProfileToApi]);

  const handleFileSelected = async (fileName: string, data: ArrayBuffer) => {
    const api = apiRef.current;
    if (!api) {
      setLoadError('Notation engine is not initialized yet. Please try again.');
      return;
    }
    const generation = ++loadGenerationRef.current;
    try {
      api.stop();
      if (scoreRef.current && scoreRef.current.tracks.length > 0) {
        api.changeTrackSolo(scoreRef.current.tracks, false);
        api.changeTrackMute(scoreRef.current.tracks, false);
        api.changeTrackVolume(scoreRef.current.tracks, 1.0);
      }
      api.playbackRange = null;
    } catch {
    }
    audioEngineRef.current.stop();
    setLoadError(null);
    setIsPlayerReady(false);
    setCurrentTimeMs(0);
    setTotalDurationMs(0);
    setCurrentTick(0);
    pendingFilenameRef.current = fileName;

    const externalOnly = audioTracksRef.current.filter((t) => t.sourceType === 'external');
    audioTracksRef.current = externalOnly;
    setAudioTracks(externalOnly);

    try {
      const loaded = api.load(new Uint8Array(data), [-1]);
      if (!loaded) {
        setLoadError(`Could not open "${fileName}". Ensure it is a valid Guitar Pro or MusicXML file.`);
        return;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Could not parse "${fileName}".`;
      setLoadError(msg);
      return;
    }

    const extracted = await extractAudioAssetsFromGpBuffer(data);
    if (generation !== loadGenerationRef.current) {
      return;
    }
    if (extracted.length > 0) {
      const decodedAudioTracks: AudioTrackState[] = [];
      for (let idx = 0; idx < extracted.length; idx++) {
        const asset = extracted[idx];
        try {
          const buffer = await audioEngineRef.current.decodeAudioBytes(asset.bytes);
          if (generation !== loadGenerationRef.current) {
            return;
          }
          decodedAudioTracks.push({
            id: `embedded-${idx}-${asset.name}`,
            name: asset.name,
            sourceType: 'embedded',
            mimeType: asset.mimeType,
            durationSec: buffer.duration,
            muted: false,
            solo: false,
            volume: 1.0,
            offsetMs: 0,
            audioBuffer: buffer,
            rawBytes: asset.bytes,
          });
        } catch {
          continue;
        }
      }
      if (decodedAudioTracks.length > 0 && generation === loadGenerationRef.current) {
        const currentExternal = audioTracksRef.current.filter((t) => t.sourceType === 'external');
        const nextAudio = [...decodedAudioTracks, ...currentExternal];
        audioTracksRef.current = nextAudio;
        setAudioTracks(nextAudio);
        syncSelectedAudioMix(tracksRef.current, nextAudio, audioMixModeRef.current);
        if (isPlayingRef.current) {
          audioEngineRef.current.startAt(
            api.timePosition,
            playbackSpeedRef.current,
            nextAudio,
            tracksRef.current.some((t) => t.solo)
          );
        }
      }
    }
  };

  const handleAddAudioFiles = async (
    items: Array<{name: string; mimeType: string; bytes: Uint8Array}>
  ) => {
    audioEngineRef.current.unlock();
    const added: AudioTrackState[] = [];
    for (const item of items) {
      try {
        const buffer = await audioEngineRef.current.decodeAudioBytes(item.bytes);
        added.push({
          id: `ext-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: item.name,
          sourceType: 'external',
          mimeType: item.mimeType,
          durationSec: buffer.duration,
          muted: false,
          solo: false,
          volume: 1.0,
          offsetMs: 0,
          audioBuffer: buffer,
          rawBytes: item.bytes,
        });
      } catch {
        setLoadError(`Could not decode audio file "${item.name}".`);
      }
    }

    if (added.length > 0) {
      const nextAudio = [...audioTracksRef.current, ...added];
      audioTracksRef.current = nextAudio;
      setAudioTracks(nextAudio);
      syncSelectedAudioMix(tracksRef.current, nextAudio, audioMixModeRef.current);
      if (isPlayingRef.current && apiRef.current) {
        audioEngineRef.current.startAt(
          apiRef.current.timePosition,
          playbackSpeedRef.current,
          nextAudio,
          tracksRef.current.some((t) => t.solo)
        );
      }
    }
  };

  const applyTrackSelectionRender = (nextTracks: TrackState[]) => {
    const api = apiRef.current;
    const currentScore = scoreRef.current;
    if (!api || !currentScore) {
      return;
    }
    const availability = getNotationAvailability(currentScore, nextTracks);
    const normalizedMode = normalizeNotationMode(videoSettings.notationMode, availability);
    if (normalizedMode !== videoSettings.notationMode) {
      api.settings.display.staveProfile = mapNotationMode(normalizedMode);
      api.updateSettings();
      setVideoSettings((prev) =>
        prev.notationMode === normalizedMode ? prev : {...prev, notationMode: normalizedMode}
      );
    }
    const selectedModels = currentScore.tracks.filter((tr) =>
      nextTracks.some((st) => st.index === tr.index && st.selected)
    );
    if (selectedModels.length > 0) {
      api.renderTracks(selectedModels);
    }
    syncSelectedAudioMix(nextTracks, audioTracks, videoSettings.audioMixMode);
  };

  const handleToggleTrackSelected = (trackIndex: number) => {
    const selectedCount = tracks.filter((t) => t.selected).length;
    const target = tracks.find((t) => t.index === trackIndex);
    if (!target || (target.selected && selectedCount === 1)) {
      return;
    }
    const nextTracks = tracks.map((t) =>
      t.index === trackIndex ? {...t, selected: !t.selected} : t
    );
    setTracks(nextTracks);
    applyTrackSelectionRender(nextTracks);
  };

  const handleSelectAllTracks = () => {
    const nextTracks = tracks.map((t) => ({...t, selected: true}));
    setTracks(nextTracks);
    applyTrackSelectionRender(nextTracks);
  };

  const handleSelectFirstTrack = () => {
    if (tracks.length === 0) {
      return;
    }
    const nextTracks = tracks.map((t, idx) => ({...t, selected: idx === 0}));
    setTracks(nextTracks);
    applyTrackSelectionRender(nextTracks);
  };

  const handleToggleMute = (trackIndex: number) => {
    const nextTracks = tracks.map((t) =>
      t.index === trackIndex ? {...t, muted: !t.muted} : t
    );
    setTracks(nextTracks);
    syncSelectedAudioMix(nextTracks, audioTracks, videoSettings.audioMixMode);
  };

  const handleToggleSolo = (trackIndex: number) => {
    const nextTracks = tracks.map((t) =>
      t.index === trackIndex ? {...t, solo: !t.solo} : t
    );
    setTracks(nextTracks);
    syncSelectedAudioMix(nextTracks, audioTracks, videoSettings.audioMixMode);
  };

  const handleVolumeChange = (trackIndex: number, volume: number) => {
    const nextTracks = tracks.map((t) =>
      t.index === trackIndex ? {...t, volume} : t
    );
    setTracks(nextTracks);
    syncSelectedAudioMix(nextTracks, audioTracks, videoSettings.audioMixMode);
  };

  const handleToggleAudioMute = (audioId: string) => {
    const nextAudio = audioTracks.map((a) =>
      a.id === audioId ? {...a, muted: !a.muted} : a
    );
    setAudioTracks(nextAudio);
    syncSelectedAudioMix(tracks, nextAudio, videoSettings.audioMixMode);
  };

  const handleToggleAudioSolo = (audioId: string) => {
    const nextAudio = audioTracks.map((a) =>
      a.id === audioId ? {...a, solo: !a.solo} : a
    );
    setAudioTracks(nextAudio);
    syncSelectedAudioMix(tracks, nextAudio, videoSettings.audioMixMode);
  };

  const handleAudioVolumeChange = (audioId: string, volume: number) => {
    const nextAudio = audioTracks.map((a) =>
      a.id === audioId ? {...a, volume} : a
    );
    setAudioTracks(nextAudio);
    syncSelectedAudioMix(tracks, nextAudio, videoSettings.audioMixMode);
  };

  const handleAudioOffsetChange = (audioId: string, offsetMs: number) => {
    const nextAudio = audioTracks.map((a) =>
      a.id === audioId ? {...a, offsetMs} : a
    );
    setAudioTracks(nextAudio);
    if (isPlaying && apiRef.current) {
      audioEngineRef.current.startAt(
        apiRef.current.timePosition,
        playbackSpeed,
        nextAudio,
        tracks.some((t) => t.solo)
      );
    }
  };

  const handleClearProject = () => {
    loadGenerationRef.current++;
    const api = apiRef.current;
    if (api) {
      try {
        api.stop();
        api.playbackRange = null;
      } catch {
      }
    }
    audioEngineRef.current.stop();
    scoreRef.current = null;
    pendingFilenameRef.current = '';
    setScore(null);
    setMetadata(null);
    tracksRef.current = [];
    setTracks([]);
    const externalOnly = audioTracksRef.current.filter((t) => t.sourceType === 'external');
    audioTracksRef.current = externalOnly;
    setAudioTracks(externalOnly);
    setIsPlayerReady(false);
    setIsPlaying(false);
    setCurrentTimeMs(0);
    setTotalDurationMs(0);
    setCurrentTick(0);
    setLoadError(null);
  };

  const handleRemoveTrack = (trackIndex: number) => {
    const remaining = tracks.filter((t) => t.index !== trackIndex);
    if (remaining.length === 0) {
      handleClearProject();
      return;
    }
    const nextTracks = remaining.some((t) => t.selected)
      ? remaining
      : remaining.map((t, idx) => (idx === 0 ? {...t, selected: true} : t));
    tracksRef.current = nextTracks;
    setTracks(nextTracks);
    applyTrackSelectionRender(nextTracks);
  };

  const handleRemoveAudioTrack = (audioId: string) => {
    const nextAudio = audioTracks.filter((a) => a.id !== audioId);
    audioTracksRef.current = nextAudio;
    setAudioTracks(nextAudio);
    syncSelectedAudioMix(tracks, nextAudio, videoSettings.audioMixMode);
    if (isPlaying && apiRef.current) {
      audioEngineRef.current.startAt(
        apiRef.current.timePosition,
        playbackSpeed,
        nextAudio,
        tracks.some((t) => t.solo)
      );
    }
  };

  const handleTogglePlay = () => {
    const api = apiRef.current;
    if (!api || !isPlayerReady) {
      return;
    }
    audioEngineRef.current.unlock();
    api.playPause();
  };

  const handleStop = () => {
    const api = apiRef.current;
    audioEngineRef.current.stop();
    if (!api) {
      return;
    }
    api.stop();
  };

  const handleSeek = (timeMs: number) => {
    const api = apiRef.current;
    if (!api) {
      return;
    }
    audioEngineRef.current.unlock();
    api.timePosition = timeMs;
    setCurrentTimeMs(timeMs);
    lastPositionRef.current = {timeMs, perfMs: performance.now()};
    if (isPlaying) {
      audioEngineRef.current.startAt(
        timeMs,
        playbackSpeed,
        audioTracks,
        tracks.some((t) => t.solo)
      );
    }
  };

  const handleSpeedChange = (speed: number) => {
    const api = apiRef.current;
    setPlaybackSpeed(speed);
    audioEngineRef.current.updateSpeed(speed);
    if (api) {
      api.playbackSpeed = speed;
    }
  };

  const handleToggleMetronome = () => {
    const api = apiRef.current;
    const next = !metronomeEnabled;
    setMetronomeEnabled(next);
    if (api) {
      api.metronomeVolume = next ? 1.0 : 0.0;
    }
  };

  const handleVideoSettingsChange = (patch: Partial<VideoExportSettings>) => {
    setVideoSettings((prev) => ({...prev, ...patch}));
  };

  const handleStartExport = async () => {
    const api = apiRef.current;
    const currentScore = scoreRef.current;
    if (!api || !currentScore || !metadata) {
      return;
    }

    if (isPlaying) {
      api.pause();
    }
    audioEngineRef.current.stop();

    if (exportState.outputUrl) {
      URL.revokeObjectURL(exportState.outputUrl);
    }

    const abortController = new AbortController();
    exportAbortRef.current = abortController;

    setExportState({
      ...INITIAL_EXPORT_STATE,
      phase: 'audio',
      progress: 2,
      message: 'Preparing audio and sheet music pipeline...',
    });

    try {
      const result = await generateSheetMusicVideo({
        api,
        score: currentScore,
        tracks,
        audioTracks,
        metadata,
        settings: videoSettings,
        abortSignal: abortController.signal,
        onProgress: (patch) => {
          setExportState((prev) => ({...prev, ...patch}));
        },
      });

      const url = URL.createObjectURL(result.blob);
      setExportState((prev) => ({
        ...prev,
        phase: 'done',
        progress: 100,
        message: 'Export complete',
        outputUrl: url,
        outputFilename: result.filename,
        outputSizeBytes: result.blob.size,
        durationMs: result.durationMs,
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unexpected video export error.';
      if (abortController.signal.aborted) {
        setExportState({
          ...INITIAL_EXPORT_STATE,
          phase: 'cancelled',
          errorMessage: 'Video rendering was cancelled.',
        });
      } else {
        setExportState({
          ...INITIAL_EXPORT_STATE,
          phase: 'error',
          errorMessage: message,
        });
      }
    } finally {
      exportAbortRef.current = null;
    }
  };

  const handleCancelExport = () => {
    exportAbortRef.current?.abort();
  };

  const handleCloseExportModal = () => {
    if (exportState.outputUrl) {
      URL.revokeObjectURL(exportState.outputUrl);
    }
    setExportState(INITIAL_EXPORT_STATE);
  };

  const activeTheme = VIDEO_THEMES[videoSettings.theme];
  const notationAvailability = getNotationAvailability(score, tracks);
  const isLightInk =
    videoSettings.theme === 'concert-dark' || videoSettings.theme === 'midnight-slate';
  const isExporting =
    exportState.phase === 'audio' ||
    exportState.phase === 'layout' ||
    exportState.phase === 'encoding' ||
    exportState.phase === 'finalizing';

  const rootAccentStyle = {'--sf-accent': videoSettings.accentColor} as CSSProperties;

  return (
    <div
      style={rootAccentStyle}
      className="h-screen w-screen overflow-hidden flex flex-col bg-[#0B0D11] text-[#F3F4F6]"
    >
      <TopBar
        appVersion={appVersion}
        hasUpdate={updateState.status === 'update-available'}
        onOpenDesktopBuild={() => setIsDesktopBuildOpen(true)}
        onExportClick={() => {
          void handleStartExport();
        }}
        canExport={Boolean(score && tracks.some((t) => t.selected))}
        isExporting={isExporting}
      />

      <div className="flex-1 min-h-0 flex">
        <TrackSidebar
          metadata={metadata}
          tracks={tracks}
          audioTracks={audioTracks}
          onFileSelected={(name, data) => {
            void handleFileSelected(name, data);
          }}
          onClearProject={handleClearProject}
          onAddAudioFiles={(items) => {
            void handleAddAudioFiles(items);
          }}
          onToggleTrackSelected={handleToggleTrackSelected}
          onSelectAllTracks={handleSelectAllTracks}
          onSelectFirstTrack={handleSelectFirstTrack}
          onRemoveTrack={handleRemoveTrack}
          onToggleMute={handleToggleMute}
          onToggleSolo={handleToggleSolo}
          onVolumeChange={handleVolumeChange}
          onToggleAudioMute={handleToggleAudioMute}
          onToggleAudioSolo={handleToggleAudioSolo}
          onAudioVolumeChange={handleAudioVolumeChange}
          onAudioOffsetChange={handleAudioOffsetChange}
          onRemoveAudioTrack={handleRemoveAudioTrack}
        />

        <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-[#0B0D11]">
          <TransportBar
            metadata={metadata}
            isPlaying={isPlaying}
            isPlayerReady={isPlayerReady}
            currentTimeMs={currentTimeMs}
            totalDurationMs={totalDurationMs}
            playbackSpeed={playbackSpeed}
            metronomeEnabled={metronomeEnabled}
            activeViewportTab={activeViewportTab}
            onTogglePlay={handleTogglePlay}
            onStop={handleStop}
            onSeek={handleSeek}
            onSpeedChange={handleSpeedChange}
            onToggleMetronome={handleToggleMetronome}
            onViewportTabChange={setActiveViewportTab}
          />

          {updateState.status === 'update-available' &&
            updateState.latestRelease &&
            !updateBannerDismissed && (
              <div className="mx-5 mt-3 px-4 py-2.5 rounded-md border border-emerald-500/35 bg-emerald-500/10 text-xs text-emerald-100 flex flex-wrap items-center justify-between gap-3">
                <span>
                  Update available: <strong className="font-mono">v{updateState.latestVersion}</strong>{' '}
                  (current: <span className="font-mono">v{appVersion}</span>)
                </span>
                <div className="flex items-center gap-3">
                  <a
                    href={
                      updateState.latestRelease.exeAssets[0]?.downloadUrl ??
                      updateState.latestRelease.htmlUrl
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => {
                      const targetUrl =
                        updateState.latestRelease?.exeAssets[0]?.downloadUrl ??
                        updateState.latestRelease?.htmlUrl;
                      if (targetUrl && window.scoreFrameDesktop?.openExternal) {
                        e.preventDefault();
                        openExternalUrl(targetUrl);
                      }
                    }}
                    className="font-semibold text-emerald-300 hover:text-white underline"
                  >
                    Download Release
                  </a>
                  <button
                    type="button"
                    onClick={() => setIsDesktopBuildOpen(true)}
                    className="text-emerald-200 hover:text-white underline cursor-pointer"
                  >
                    Versions
                  </button>
                  <button
                    type="button"
                    onClick={() => setUpdateBannerDismissed(true)}
                    className="text-zinc-300 hover:text-white cursor-pointer"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

          {loadError && (
            <div className="mx-5 mt-3 px-4 py-2.5 rounded-md border border-red-500/35 bg-red-500/10 text-xs text-red-200 flex items-center justify-between">
              <span>{loadError}</span>
              <button
                type="button"
                onClick={() => setLoadError(null)}
                className="text-red-300 hover:text-white underline cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="flex-1 min-h-0 flex relative overflow-hidden">
            <div
              ref={sheetScrollRef}
              aria-hidden={activeViewportTab !== 'sheet'}
              className={`${
                activeViewportTab === 'sheet'
                  ? `relative z-10 flex-1 min-h-0 overflow-y-auto px-6 py-6 ${
                      videoSettings.layoutMode === 'horizontal' ? 'overflow-x-auto' : 'overflow-x-hidden'
                    }`
                  : 'absolute inset-0 z-0 opacity-0 pointer-events-none overflow-y-auto px-6 py-6'
              } ${
                score && videoSettings.transparentBackground
                  ? isLightInk
                    ? 'checkerboard-dark'
                    : 'checkerboard-light'
                  : ''
              }`}
              style={
                score && videoSettings.transparentBackground
                  ? undefined
                  : {backgroundColor: score ? activeTheme.background : '#0B0D11'}
              }
            >
              <div
                className={
                  score && videoSettings.layoutMode === 'horizontal'
                    ? 'min-w-max'
                    : 'max-w-5xl mx-auto'
                }
              >
                <div
                  ref={sheetMountRef}
                  className={
                    score ? 'w-full' : 'w-full h-0 overflow-hidden opacity-0 pointer-events-none'
                  }
                />
              </div>

              {!score && (
                <div className="h-full min-h-[420px] flex flex-col items-center justify-center text-center px-6">
                  <input
                    ref={emptyFileInputRef}
                    type="file"
                    accept=".gp,.gp3,.gp4,.gp5,.gpx,.gp8,.xml,.musicxml,.mxl,.cap,.tg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        void file.arrayBuffer().then((buf) => handleFileSelected(file.name, buf));
                      }
                      e.target.value = '';
                    }}
                  />
                  <h2 className="font-[var(--font-display)] text-xl font-semibold text-white">
                    Open a Guitar Pro Project
                  </h2>
                  <p className="text-sm text-zinc-400 mt-2 max-w-md">
                    Load a .gp, .gp3–.gp8, .gpx, or MusicXML file to view simultaneous tracks, sync
                    embedded or external MP3 audio tracks, and render sheet music videos.
                  </p>
                  <button
                    type="button"
                    onClick={() => emptyFileInputRef.current?.click()}
                    className="mt-5 inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-[var(--sf-accent)] hover:brightness-110 text-xs font-semibold text-[#0B0D11] transition-all cursor-pointer"
                  >
                    <FolderOpen className="w-4 h-4" aria-hidden="true" />
                    <span>Choose Guitar Pro File</span>
                  </button>
                </div>
              )}
            </div>

            {activeViewportTab === 'video' && (
              <div className="relative z-20 flex-1 min-h-0 flex">
                <VideoPreviewCanvas
                  score={score}
                  tracks={tracks}
                  metadata={metadata}
                  settings={videoSettings}
                  tickCache={apiRef.current?.tickCache ?? null}
                  currentTick={currentTick}
                  currentTimeMs={currentTimeMs}
                  totalDurationMs={totalDurationMs}
                  isPlaying={isPlaying}
                  playbackSpeed={playbackSpeed}
                />
              </div>
            )}
          </div>
        </main>

        <VideoSettingsPanel
          settings={videoSettings}
          notationAvailability={notationAvailability}
          onChange={handleVideoSettingsChange}
        />
      </div>

      <DesktopBuildView
        isOpen={isDesktopBuildOpen}
        onClose={() => setIsDesktopBuildOpen(false)}
        appVersion={appVersion}
        updateState={updateState}
        isCheckingUpdates={isCheckingUpdates}
        onCheckUpdates={() => {
          setUpdateBannerDismissed(false);
          void runUpdateCheck(appVersion);
        }}
      />

      <ExportModal
        state={exportState}
        isTransparent={videoSettings.transparentBackground}
        isLightInk={isLightInk}
        onCancel={handleCancelExport}
        onClose={handleCloseExportModal}
      />
    </div>
  );
}
