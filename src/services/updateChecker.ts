import {GITHUB_RELEASES_API_URL, RELEASES_URL} from '../constants/appInfo';

export interface ReleaseAssetInfo {
  name: string;
  downloadUrl: string;
  sizeBytes: number;
}

export interface RemoteReleaseInfo {
  tagName: string;
  version: string;
  title: string;
  publishedAt: string | null;
  htmlUrl: string;
  body: string;
  prerelease: boolean;
  exeAssets: ReleaseAssetInfo[];
}

export type UpdateStatusKind = 'idle' | 'checking' | 'up-to-date' | 'update-available' | 'error';

export interface UpdateCheckState {
  status: UpdateStatusKind;
  currentVersion: string;
  latestVersion: string | null;
  latestRelease: RemoteReleaseInfo | null;
  releases: RemoteReleaseInfo[];
  checkedAt: string | null;
  errorMessage: string | null;
}

interface GitHubReleaseAssetApi {
  name?: unknown;
  browser_download_url?: unknown;
  size?: unknown;
}

interface GitHubReleaseApi {
  tag_name?: unknown;
  name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  published_at?: unknown;
  created_at?: unknown;
  html_url?: unknown;
  body?: unknown;
  assets?: unknown;
}

export function normalizeVersion(rawVersion: string): string {
  return rawVersion.trim().replace(/^v/i, '');
}

function parseVersionParts(rawVersion: string): {numbers: number[]; prerelease: string | null} {
  const cleaned = normalizeVersion(rawVersion);
  const [mainPart, prePart] = cleaned.split('-', 2);
  const numbers = mainPart
    .split('.')
    .map((segment) => {
      const match = /^\d+/.exec(segment);
      return match ? Number.parseInt(match[0], 10) : 0;
    });
  while (numbers.length < 3) {
    numbers.push(0);
  }
  return {
    numbers,
    prerelease: prePart ? prePart.trim() : null,
  };
}

export function compareVersions(a: string, b: string): number {
  const parsedA = parseVersionParts(a);
  const parsedB = parseVersionParts(b);
  const maxLen = Math.max(parsedA.numbers.length, parsedB.numbers.length);

  for (let i = 0; i < maxLen; i++) {
    const valA = parsedA.numbers[i] ?? 0;
    const valB = parsedB.numbers[i] ?? 0;
    if (valA > valB) return 1;
    if (valA < valB) return -1;
  }

  if (parsedA.prerelease === null && parsedB.prerelease !== null) return 1;
  if (parsedA.prerelease !== null && parsedB.prerelease === null) return -1;
  if (parsedA.prerelease !== null && parsedB.prerelease !== null) {
    return parsedA.prerelease.localeCompare(parsedB.prerelease, undefined, {numeric: true});
  }
  return 0;
}

function mapGitHubRelease(item: GitHubReleaseApi): RemoteReleaseInfo | null {
  const tagName = typeof item.tag_name === 'string' ? item.tag_name.trim() : '';
  if (!tagName) {
    return null;
  }
  const version = normalizeVersion(tagName);
  const title =
    typeof item.name === 'string' && item.name.trim().length > 0 ? item.name.trim() : tagName;
  const publishedAt =
    typeof item.published_at === 'string'
      ? item.published_at
      : typeof item.created_at === 'string'
        ? item.created_at
        : null;
  const htmlUrl =
    typeof item.html_url === 'string' && item.html_url.trim().length > 0
      ? item.html_url.trim()
      : `${RELEASES_URL}/tag/${encodeURIComponent(tagName)}`;
  const body = typeof item.body === 'string' ? item.body : '';
  const prerelease = Boolean(item.prerelease);
  const rawAssets = Array.isArray(item.assets) ? (item.assets as GitHubReleaseAssetApi[]) : [];
  const exeAssets: ReleaseAssetInfo[] = [];

  for (const asset of rawAssets) {
    const name = typeof asset.name === 'string' ? asset.name : '';
    const downloadUrl =
      typeof asset.browser_download_url === 'string' ? asset.browser_download_url : '';
    const sizeBytes = typeof asset.size === 'number' ? asset.size : 0;
    if (name.toLowerCase().endsWith('.exe') && downloadUrl) {
      exeAssets.push({name, downloadUrl, sizeBytes});
    }
  }

  return {
    tagName,
    version,
    title,
    publishedAt,
    htmlUrl,
    body,
    prerelease,
    exeAssets,
  };
}

export async function checkForAppUpdates(
  currentVersion: string,
  signal?: AbortSignal
): Promise<UpdateCheckState> {
  const normalizedCurrent = normalizeVersion(currentVersion);
  const checkedAt = new Date().toISOString();

  try {
    const response = await fetch(GITHUB_RELEASES_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/vnd.github+json',
      },
      signal,
    });

    if (response.status === 404) {
      return {
        status: 'up-to-date',
        currentVersion: normalizedCurrent,
        latestVersion: null,
        latestRelease: null,
        releases: [],
        checkedAt,
        errorMessage: null,
      };
    }

    if (!response.ok) {
      return {
        status: 'error',
        currentVersion: normalizedCurrent,
        latestVersion: null,
        latestRelease: null,
        releases: [],
        checkedAt,
        errorMessage: `Update check returned HTTP ${response.status}`,
      };
    }

    const payload = (await response.json()) as unknown;
    const rawList = Array.isArray(payload) ? (payload as GitHubReleaseApi[]) : [];
    const releases = rawList
      .filter((item) => !item.draft)
      .map(mapGitHubRelease)
      .filter((item): item is RemoteReleaseInfo => item !== null)
      .sort((a, b) => compareVersions(b.version, a.version));

    const stableCandidate = releases.find((item) => !item.prerelease) ?? releases[0] ?? null;

    if (!stableCandidate) {
      return {
        status: 'up-to-date',
        currentVersion: normalizedCurrent,
        latestVersion: normalizedCurrent,
        latestRelease: null,
        releases: [],
        checkedAt,
        errorMessage: null,
      };
    }

    const hasNewer = compareVersions(stableCandidate.version, normalizedCurrent) > 0;

    return {
      status: hasNewer ? 'update-available' : 'up-to-date',
      currentVersion: normalizedCurrent,
      latestVersion: stableCandidate.version,
      latestRelease: stableCandidate,
      releases,
      checkedAt,
      errorMessage: null,
    };
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }
    return {
      status: 'error',
      currentVersion: normalizedCurrent,
      latestVersion: null,
      latestRelease: null,
      releases: [],
      checkedAt,
      errorMessage: err instanceof Error ? err.message : 'Unable to reach GitHub Releases.',
    };
  }
}

export function openExternalUrl(url: string): void {
  if (window.scoreFrameDesktop?.openExternal) {
    void window.scoreFrameDesktop.openExternal(url);
  }
}
