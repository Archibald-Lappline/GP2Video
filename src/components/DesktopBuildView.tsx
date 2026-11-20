import {
  Check,
  Copy,
  Download,
  ExternalLink,
  GitBranch,
  History,
  RefreshCw,
  Scale,
  Tag,
  X,
} from 'lucide-react';
import {useMemo, useState} from 'react';
import {
  getIndexedProgramVersions,
  LICENSE_NAME,
  LICENSE_SPDX,
  LICENSE_URL,
  RELEASES_URL,
  REPOSITORY_URL,
} from '../constants/appInfo';
import {
  compareVersions,
  normalizeVersion,
  openExternalUrl,
  type UpdateCheckState,
} from '../services/updateChecker';

interface DesktopBuildViewProps {
  isOpen: boolean;
  onClose: () => void;
  appVersion: string;
  updateState: UpdateCheckState;
  isCheckingUpdates: boolean;
  onCheckUpdates: () => void;
}

interface CombinedVersionItem {
  version: string;
  title: string;
  date: string | null;
  notes: string[];
  releaseUrl: string | null;
  exeUrl: string | null;
  exeName: string | null;
  isCurrent: boolean;
  isLatest: boolean;
  isPrerelease: boolean;
}

function formatDateLabel(raw: string | null): string | null {
  if (!raw) {
    return null;
  }
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return raw;
  }
  return parsed.toISOString().slice(0, 10);
}

export function DesktopBuildView({
  isOpen,
  onClose,
  appVersion,
  updateState,
  isCheckingUpdates,
  onCheckUpdates,
}: DesktopBuildViewProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const normalizedCurrent = normalizeVersion(appVersion);

  const combinedVersions = useMemo<CombinedVersionItem[]>(() => {
    const byVersion = new Map<string, CombinedVersionItem>();
    const builtIn = getIndexedProgramVersions(normalizedCurrent);

    for (const entry of builtIn) {
      const ver = normalizeVersion(entry.version);
      byVersion.set(ver, {
        version: ver,
        title: entry.title,
        date: entry.date,
        notes: entry.notes,
        releaseUrl: null,
        exeUrl: null,
        exeName: null,
        isCurrent: ver === normalizedCurrent,
        isLatest: false,
        isPrerelease: false,
      });
    }

    for (const remote of updateState.releases) {
      const ver = normalizeVersion(remote.version);
      const existing = byVersion.get(ver);
      const primaryExe = remote.exeAssets[0] ?? null;
      const remoteNotes = remote.body
        .split(/\r?\n/)
        .map((line) => line.replace(/^[-*]\s+/, '').trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .slice(0, 4);

      byVersion.set(ver, {
        version: ver,
        title: remote.title || existing?.title || `ScoreFrame v${ver}`,
        date: formatDateLabel(remote.publishedAt) ?? existing?.date ?? null,
        notes: remoteNotes.length > 0 ? remoteNotes : existing?.notes ?? [],
        releaseUrl: remote.htmlUrl,
        exeUrl: primaryExe?.downloadUrl ?? null,
        exeName: primaryExe?.name ?? null,
        isCurrent: ver === normalizedCurrent,
        isLatest: updateState.latestVersion === ver,
        isPrerelease: remote.prerelease,
      });
    }

    return Array.from(byVersion.values()).sort((a, b) => compareVersions(b.version, a.version));
  }, [normalizedCurrent, updateState.latestVersion, updateState.releases]);

  if (!isOpen) {
    return null;
  }

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1800);
  };

  const handleLinkClick = (url: string, event: React.MouseEvent<HTMLAnchorElement>) => {
    if (window.scoreFrameDesktop?.openExternal) {
      event.preventDefault();
      openExternalUrl(url);
    }
  };

  const primaryLatestExe = updateState.latestRelease?.exeAssets[0] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="desktop-build-title"
    >
      <div className="w-full max-w-3xl max-h-[88vh] rounded-xl border border-white/12 bg-[#12161F] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <h2
              id="desktop-build-title"
              className="font-[var(--font-display)] text-base font-semibold text-white"
            >
              Windows EXE &amp; Application Versions
            </h2>
            <span className="font-mono text-xs px-2 py-0.5 rounded bg-white/8 text-zinc-200 border border-white/10">
              v{normalizedCurrent}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Windows EXE dialog"
            className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <section className="p-4 rounded-lg border border-white/10 bg-[#0D1016] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-white">Startup Update Check</p>
                <p className="text-xs text-zinc-400 mt-1">
                  {isCheckingUpdates
                    ? 'Checking GitHub Releases for a newer Windows EXE version...'
                    : updateState.status === 'update-available' && updateState.latestVersion
                      ? `New version v${updateState.latestVersion} is available (installed: v${normalizedCurrent}).`
                      : updateState.status === 'error'
                        ? `Could not verify updates: ${updateState.errorMessage}`
                        : `You are running v${normalizedCurrent}${
                            updateState.releases.length > 0
                              ? ' (up to date with latest release).'
                              : ' (checked GitHub Releases on startup).'
                          }`}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {updateState.status === 'update-available' && updateState.latestRelease && (
                  <a
                    href={primaryLatestExe?.downloadUrl ?? updateState.latestRelease.htmlUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) =>
                      handleLinkClick(
                        primaryLatestExe?.downloadUrl ?? updateState.latestRelease!.htmlUrl,
                        e
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-[var(--sf-accent)] text-[#0B0D11] hover:brightness-110 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Download v{updateState.latestVersion}</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={onCheckUpdates}
                  disabled={isCheckingUpdates}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-white/8 hover:bg-white/14 disabled:opacity-50 text-zinc-200 cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${isCheckingUpdates ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  <span>{isCheckingUpdates ? 'Checking...' : 'Check Updates'}</span>
                </button>
              </div>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4">
            <section className="p-4 rounded-lg border border-white/10 bg-[#0D1016] space-y-2">
              <label
                htmlFor="repo-url-field"
                className="text-xs font-semibold text-white flex items-center gap-2"
              >
                <GitBranch className="w-3.5 h-3.5 text-[var(--sf-accent)]" aria-hidden="true" />
                <span>Repository URL</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="repo-url-field"
                  type="text"
                  readOnly
                  value={REPOSITORY_URL}
                  className="flex-1 min-w-0 px-3 py-2 rounded-md border border-white/10 bg-[#0B0D11] font-mono text-xs text-zinc-200 focus:outline-none focus:border-white/25"
                />
                <button
                  type="button"
                  onClick={() => void copyText('repo', REPOSITORY_URL)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-white/8 hover:bg-white/14 text-zinc-200 shrink-0 cursor-pointer"
                >
                  {copiedId === 'repo' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
                <a
                  href={REPOSITORY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handleLinkClick(REPOSITORY_URL, e)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-md bg-white/8 hover:bg-white/14 text-zinc-200 shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Open</span>
                </a>
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <section className="p-4 rounded-lg border border-white/10 bg-[#0D1016] flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-[var(--sf-accent)]" aria-hidden="true" />
                    <span>Releases</span>
                  </div>
                  <p className="font-mono text-[11px] text-zinc-400 break-all">{RELEASES_URL}</p>
                </div>
                <a
                  href={RELEASES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handleLinkClick(RELEASES_URL, e)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-md bg-white/10 hover:bg-white/16 text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--sf-accent)]" aria-hidden="true" />
                  <span>Open GitHub Releases (.exe)</span>
                  <ExternalLink className="w-3 h-3 opacity-75" aria-hidden="true" />
                </a>
              </section>

              <section className="p-4 rounded-lg border border-white/10 bg-[#0D1016] flex flex-col justify-between gap-3">
                <div className="space-y-1.5">
                  <div className="text-xs font-semibold text-white flex items-center gap-2">
                    <Scale className="w-3.5 h-3.5 text-[var(--sf-accent)]" aria-hidden="true" />
                    <span>License</span>
                  </div>
                  <p className="text-xs font-medium text-zinc-100">{LICENSE_NAME}</p>
                  <p className="font-mono text-[11px] text-zinc-400">SPDX: {LICENSE_SPDX}</p>
                </div>
                <a
                  href={LICENSE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => handleLinkClick(LICENSE_URL, e)}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-md bg-white/8 hover:bg-white/14 text-zinc-200 transition-colors"
                >
                  <span>View PolyForm Noncommercial Terms</span>
                  <ExternalLink className="w-3 h-3 opacity-75" aria-hidden="true" />
                </a>
              </section>
            </div>
          </div>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-300 flex items-center gap-2">
                <History className="w-3.5 h-3.5 text-[var(--sf-accent)]" aria-hidden="true" />
                <span>Versions (Indexed in EXE)</span>
              </h3>
              <span className="text-[11px] text-zinc-400">
                Active EXE Version: v{normalizedCurrent}
              </span>
            </div>

            <div className="space-y-2.5">
              {combinedVersions.map((item) => (
                <div
                  key={item.version}
                  className={`p-3.5 rounded-lg border ${
                    item.isCurrent
                      ? 'border-[var(--sf-accent)]/45 bg-[var(--sf-accent)]/6'
                      : 'border-white/10 bg-[#0D1016]'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-white">
                        v{item.version}
                      </span>
                      <span className="text-xs font-medium text-zinc-200">{item.title}</span>
                      {item.isCurrent && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-[var(--sf-accent)] text-[#0B0D11]">
                          Installed
                        </span>
                      )}
                      {item.isLatest && !item.isCurrent && (
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Latest
                        </span>
                      )}
                      {item.isPrerelease && (
                        <span className="text-[10px] font-medium uppercase px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30">
                          Pre-release
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3">
                      {item.date && <span className="font-mono text-[11px] text-zinc-400">{item.date}</span>}
                      {item.exeUrl && (
                        <a
                          href={item.exeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => handleLinkClick(item.exeUrl!, e)}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--sf-accent)] hover:underline"
                        >
                          <Download className="w-3 h-3" aria-hidden="true" />
                          <span>EXE</span>
                        </a>
                      )}
                      {item.releaseUrl && (
                        <a
                          href={item.releaseUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => handleLinkClick(item.releaseUrl!, e)}
                          className="inline-flex items-center gap-1 text-[11px] text-zinc-300 hover:text-white hover:underline"
                        >
                          <span>Release</span>
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                      )}
                    </div>
                  </div>

                  {item.notes.length > 0 && (
                    <ul className="mt-2 space-y-1 text-xs text-zinc-400 list-disc list-inside">
                      {item.notes.map((note, idx) => (
                        <li key={idx}>{note}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
