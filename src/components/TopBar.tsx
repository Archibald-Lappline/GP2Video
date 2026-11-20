import {Film, MonitorDown} from 'lucide-react';

interface TopBarProps {
  appVersion: string;
  hasUpdate: boolean;
  onOpenDesktopBuild: () => void;
  onExportClick: () => void;
  canExport: boolean;
  isExporting: boolean;
}

export function TopBar({
  appVersion,
  hasUpdate,
  onOpenDesktopBuild,
  onExportClick,
  canExport,
  isExporting,
}: TopBarProps) {
  return (
    <header className="h-14 shrink-0 border-b border-white/10 bg-[#0F1218] px-6 flex items-center justify-between gap-8">
      <div className="flex items-baseline gap-2.5 shrink-0">
        <span className="font-[var(--font-display)] text-lg font-bold tracking-tight text-white whitespace-nowrap">
          ScoreFrame
        </span>
        <span className="font-mono text-[11px] font-medium text-zinc-400">v{appVersion}</span>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <button
          type="button"
          onClick={onOpenDesktopBuild}
          className="relative inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-white/6 hover:bg-white/12 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--sf-accent)]"
        >
          <MonitorDown className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Windows EXE</span>
          {hasUpdate && (
            <span
              className="w-2 h-2 rounded-full bg-emerald-400 shrink-0"
              aria-label="Update available"
            />
          )}
        </button>

        <button
          type="button"
          onClick={onExportClick}
          disabled={!canExport || isExporting}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-[#0B0D11] bg-[var(--sf-accent)] hover:brightness-110 disabled:opacity-45 disabled:cursor-not-allowed rounded-md transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <Film className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{isExporting ? 'Rendering Video...' : 'Export Video'}</span>
        </button>
      </div>
    </header>
  );
}
