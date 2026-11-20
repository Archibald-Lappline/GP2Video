import {ACCENT_COLORS, RESOLUTION_PRESETS, VIDEO_THEMES} from '../constants/themes';
import type {
  CameraMotionMode,
  NotationDisplayMode,
  SheetLayoutMode,
  VideoExportSettings,
  VideoFormatId,
  VideoResolutionId,
  VideoThemeId,
} from '../types/studio';

import type {NotationAvailability} from '../utils/scoreUtils';

interface VideoSettingsPanelProps {
  settings: VideoExportSettings;
  notationAvailability?: NotationAvailability;
  onChange: (patch: Partial<VideoExportSettings>) => void;
}

export function VideoSettingsPanel({
  settings,
  notationAvailability = {hasScore: true, hasTab: true},
  onChange,
}: VideoSettingsPanelProps) {
  const resolutionList = Object.values(RESOLUTION_PRESETS);
  const themeList = Object.values(VIDEO_THEMES);

  const notationOptions: Array<{id: NotationDisplayMode; label: string}> = [];
  if (notationAvailability.hasScore && notationAvailability.hasTab) {
    notationOptions.push({id: 'score-tab', label: 'Score + Tab'});
  }
  if (notationAvailability.hasTab) {
    notationOptions.push({id: 'tab-only', label: 'Tab Only'});
  }
  if (notationAvailability.hasScore) {
    notationOptions.push({id: 'score-only', label: 'Score Only'});
  }
  const notationColsClass =
    notationOptions.length >= 3
      ? 'grid-cols-3'
      : notationOptions.length === 2
      ? 'grid-cols-2'
      : 'grid-cols-1';

  return (
    <div className="w-[300px] shrink-0 border-l border-white/10 bg-[#10131A] overflow-y-auto p-4 space-y-6">
      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-white">Output Canvas &amp; Format</h2>

        <div className="grid grid-cols-2 gap-2">
          {resolutionList.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange({resolution: preset.id as VideoResolutionId})}
              style={
                settings.resolution === preset.id
                  ? {borderColor: 'var(--sf-accent)'}
                  : undefined
              }
              className={`text-left px-3 py-2 rounded-md border transition-colors cursor-pointer ${
                settings.resolution === preset.id
                  ? 'bg-white/10 text-white'
                  : 'border-white/10 bg-[#151922] text-zinc-300 hover:border-white/25'
              }`}
            >
              <div className="text-xs font-medium">{preset.label}</div>
              <div className="text-[11px] font-mono text-zinc-400 tabular-nums mt-0.5">
                {preset.dimensionsLabel}
              </div>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 pt-1">
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Frame Rate</label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-white/6">
              {([30, 60] as const).map((fpsVal) => (
                <button
                  key={fpsVal}
                  type="button"
                  onClick={() => onChange({fps: fpsVal})}
                  className={`py-1.5 text-xs font-mono tabular-nums rounded transition-colors cursor-pointer ${
                    settings.fps === fpsVal
                      ? 'bg-white/16 text-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {fpsVal} fps
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">Container</label>
            <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-white/6">
              {(['webm', 'mp4'] as VideoFormatId[]).map((fmt) => {
                const disabled = settings.transparentBackground && fmt === 'mp4';
                const active = (settings.transparentBackground ? 'webm' : settings.format) === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    disabled={disabled}
                    title={disabled ? 'Transparent background requires WebM alpha export' : undefined}
                    onClick={() => onChange({format: fmt})}
                    className={`py-1.5 text-xs font-mono uppercase rounded transition-colors ${
                      disabled
                        ? 'text-zinc-600 cursor-not-allowed'
                        : active
                        ? 'bg-white/16 text-white font-semibold cursor-pointer'
                        : 'text-zinc-400 hover:text-white cursor-pointer'
                    }`}
                  >
                    {fmt}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="space-y-3 border-t border-white/10 pt-5">
        <h2 className="text-xs font-semibold text-white">Sheet Appearance</h2>

        <div className="grid grid-cols-2 gap-2">
          {themeList.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => onChange({theme: theme.id as VideoThemeId})}
              style={
                settings.theme === theme.id
                  ? {borderColor: 'var(--sf-accent)'}
                  : undefined
              }
              className={`flex items-center gap-2.5 px-3 py-2 rounded-md border text-left transition-colors cursor-pointer ${
                settings.theme === theme.id
                  ? 'bg-white/10 text-white'
                  : 'border-white/10 bg-[#151922] text-zinc-300 hover:border-white/25'
              }`}
            >
              <span
                className="w-4 h-4 rounded border border-white/20 shrink-0"
                style={{backgroundColor: theme.background}}
              />
              <span className="text-xs font-medium truncate">{theme.label}</span>
            </button>
          ))}
        </div>

        <button
          type="button"
          aria-pressed={settings.transparentBackground}
          onClick={() => {
            const next = !settings.transparentBackground;
            onChange(next ? {transparentBackground: true, format: 'webm'} : {transparentBackground: false});
          }}
          style={settings.transparentBackground ? {borderColor: 'var(--sf-accent)'} : undefined}
          className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-md border text-left transition-colors cursor-pointer ${
            settings.transparentBackground
              ? 'bg-white/10 text-white'
              : 'border-white/10 bg-[#151922] text-zinc-300 hover:border-white/25'
          }`}
        >
          <span className="flex items-center gap-2.5 min-w-0">
            <span className="w-4 h-4 rounded border border-white/25 shrink-0 checkerboard-light" />
            <span className="text-xs font-medium truncate">Transparent Background</span>
          </span>
          <span className="text-[10px] font-mono text-zinc-400 shrink-0">
            {settings.transparentBackground ? 'WebM Alpha' : 'Off'}
          </span>
        </button>

        {notationOptions.length > 0 && (
          <div>
            <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
              Notation Mode
            </label>
            <div className={`grid ${notationColsClass} gap-1 p-1 rounded-md bg-white/6`}>
              {notationOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChange({notationMode: opt.id})}
                  className={`py-1.5 px-1.5 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                    settings.notationMode === opt.id
                      ? 'bg-white/16 text-white font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
            Sheet Arrangement
          </label>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-white/6">
            {(
              [
                {id: 'page', label: 'Vertical Wrap'},
                {id: 'horizontal', label: 'Horizontal Strip'},
              ] as Array<{id: SheetLayoutMode; label: string}>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({layoutMode: opt.id})}
                className={`py-1.5 px-2 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  settings.layoutMode === opt.id
                    ? 'bg-white/16 text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
            Camera Tracking
          </label>
          <div className="grid grid-cols-2 gap-1 p-1 rounded-md bg-white/6">
            {(
              [
                {id: 'smooth-scroll', label: 'Smooth Scroll'},
                {id: 'page-flip', label: 'Page Flip'},
              ] as Array<{id: CameraMotionMode; label: string}>
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => onChange({cameraMotion: opt.id})}
                className={`py-1.5 px-2 text-[11px] font-medium rounded transition-colors cursor-pointer whitespace-nowrap ${
                  settings.cameraMotion === opt.id
                    ? 'bg-white/16 text-white font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-medium text-zinc-400 mb-1.5">
            Playhead Accent
          </label>
          <div className="flex items-center gap-2">
            {ACCENT_COLORS.map((swatch) => (
              <button
                key={swatch.id}
                type="button"
                title={swatch.label}
                aria-label={swatch.label}
                aria-pressed={settings.accentColor === swatch.value}
                onClick={() => onChange({accentColor: swatch.value})}
                className={`w-7 h-7 rounded-md border transition-transform cursor-pointer ${
                  settings.accentColor === swatch.value
                    ? 'border-white scale-110 ring-2 ring-white/40'
                    : 'border-white/20 opacity-80 hover:opacity-100'
                }`}
                style={{backgroundColor: swatch.value}}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-2.5 border-t border-white/10 pt-5">
        <h2 className="text-xs font-semibold text-white">Video Overlays &amp; Audio</h2>
        {(
          [
            {key: 'showHeader', label: 'Song Title & Artist Header'},
            {key: 'showTrackNames', label: 'Show Selected Track Names'},
            {key: 'showMeasureHud', label: 'Live Bar & Tempo HUD'},
            {key: 'showProgressBar', label: 'Bottom Timeline Progress Bar'},
            {key: 'highlightActiveBeat', label: 'Highlight Active Notes & Playhead'},
            {key: 'includeMetronome', label: 'Bake Metronome Click Track'},
          ] as Array<{key: keyof VideoExportSettings; label: string}>
        ).map((item) => {
          const checked = Boolean(settings[item.key]);
          return (
            <label
              key={item.key}
              className="flex items-center justify-between gap-3 py-1 text-xs text-zinc-300 cursor-pointer"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange({[item.key]: e.target.checked})}
                className="w-4 h-4 accent-[var(--sf-accent)] rounded cursor-pointer"
              />
            </label>
          );
        })}
      </section>
    </div>
  );
}
