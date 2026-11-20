export interface AppVersionEntry {
  version: string;
  date: string;
  title: string;
  notes: string[];
}

export const APP_NAME = 'ScoreFrame';

export const APP_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '1.0.0';

export const REPOSITORY_URL = 'https://github.com/Archibald-Lappline/GP2Video';

export const RELEASES_URL = 'https://github.com/Archibald-Lappline/GP2Video/releases';

export const GITHUB_RELEASES_API_URL =
  'https://api.github.com/repos/Archibald-Lappline/GP2Video/releases?per_page=15';

export const LICENSE_NAME = 'PolyForm Noncommercial License 1.0.0';

export const LICENSE_SPDX = 'PolyForm-Noncommercial-1.0.0';

export const LICENSE_URL = 'https://polyformproject.org/licenses/noncommercial/1.0.0';

export const BUILT_IN_VERSIONS: AppVersionEntry[] = [
  {
    version: '1.0.0',
    date: '2026-11-20',
    title: 'Initial Studio & Windows EXE Release',
    notes: [
      'Multi-track Guitar Pro / MusicXML notation viewer with bundled SoundFont2 synthesizer',
      'GPU/CPU video renderer supporting Vertical Wrap and Horizontal Strip layouts',
      'Synced audio track mixer with inline millisecond offset controls',
      'Automated Windows x64 NSIS and Portable EXE packaging with PolyForm Noncommercial License 1.0.0',
    ],
  },
];

export function getIndexedProgramVersions(activeVersion: string): AppVersionEntry[] {
  const normalizedActive = activeVersion.replace(/^v/i, '').trim() || APP_VERSION;
  const hasActiveEntry = BUILT_IN_VERSIONS.some(
    (entry) => entry.version.replace(/^v/i, '').trim() === normalizedActive
  );
  if (hasActiveEntry) {
    return BUILT_IN_VERSIONS;
  }
  return [
    {
      version: normalizedActive,
      date: new Date().toISOString().slice(0, 10),
      title: `ScoreFrame v${normalizedActive} EXE Build`,
      notes: [
        'Version indexed directly from application package and Windows EXE metadata',
        'Includes startup release update checks against GitHub Releases',
      ],
    },
    ...BUILT_IN_VERSIONS,
  ];
}
