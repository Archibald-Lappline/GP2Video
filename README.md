# ScoreFrame

ScoreFrame is a multi-track Guitar Pro sheet music video generator with synchronized SoundFont MIDI and audio track playback, live video preview, transparent background export, and automated Windows `.exe` packaging via Electron and GitHub Actions.

## Features

- **Guitar Pro & Sheet Music Import**: Supports `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp8`, `.xml`, `.musicxml`, `.mxl`, and `.cap` files.
- **Multi-Track Selection**: Select one or multiple notation tracks simultaneously with independent mute, solo, and volume controls.
- **Synchronized Audio Engine**: Combines bundled SoundFont (`sonivox.sf2` / `sonivox.sf3`) synthesis with embedded Guitar Pro backing tracks and external audio files (`.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`).
- **Live Video Preview & Customization**: Preview the rendered video canvas in real time with automatic updates for themes, transparent backgrounds, accent highlighting, display modes (`Score + Tab`, `Score`, `Tab`), resolution, FPS, bar range, and metronome options.
- **Video Export**: Exports synchronized sheet music videos as WebM or MP4 directly in the browser or desktop app.
- **Windows Desktop App (`.exe`)**: Packages as both an NSIS installer and a portable Windows executable via Electron and GitHub Actions.

## Prerequisites

- **Node.js**: Version 20 or 22 LTS (recommended: Node 22)
- **npm**: Bundled with Node.js

## Getting Started (Web Development)

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```

3. Open your browser at:

```text
http://localhost:3000
```

## Available Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the Vite development server on port `3000` |
| `npm run build` | Builds the production web bundle into `dist/` |
| `npm run preview` | Previews the built `dist/` bundle locally |
| `npm run lint` | Runs TypeScript type-checking (`tsc --noEmit`) |
| `npm run clean` | Removes generated `dist/` and `server.js` build outputs |
| `npm run build:exe` | Builds `dist/` and packages Windows x64 `.exe` installers into `release/` |

## Building the Web Bundle

```bash
npm run lint
npm run build
```

To test the production build locally:

```bash
npm run preview
```

## Running and Building the Windows Desktop App (`.exe`)

`electron` and `electron-builder` are installed on demand so standard web installs remain lightweight.

### Run Electron Locally in Development

1. Start the Vite dev server in one terminal:

```bash
npm run dev
```

2. Install Electron (one-time, without modifying `package.json`) and launch the desktop window in another terminal:

```bash
npm install --no-save electron@35.1.5
```

On Windows PowerShell:

```powershell
$env:ELECTRON_START_URL="http://localhost:3000"; npx electron .
```

On macOS / Linux:

```bash
ELECTRON_START_URL=http://localhost:3000 npx electron .
```

### Build Windows `.exe` Locally

Run on Windows (or a configured Wine environment on Linux/macOS):

```bash
npm install
npm install --no-save electron@35.1.5 electron-builder@26.0.12
npm run build:exe
```

Generated executables will be placed in `release/`:

- `ScoreFrame-1.0.0-win-x64-nsis.exe` (Windows installer)
- `ScoreFrame-1.0.0-win-x64-portable.exe` (Portable standalone executable)

## Automated `.exe` Builds on GitHub

The repository includes `.github/workflows/build-exe.yml`, which automatically builds the Windows `.exe` files on `windows-latest`:

1. Push your code to the `main` or `master` branch on GitHub (or trigger **Build Windows EXE** manually from the repository **Actions** tab).
2. Wait for the `build-windows` job to finish.
3. Download the `ScoreFrame-Windows-EXE` artifact from the workflow run summary.
4. To publish a GitHub Release with the `.exe` files attached automatically, push a version tag:

```bash
git tag v1.0.0
git push origin v1.0.0
```

## Project Structure

```text
.
├── .github/workflows/build-exe.yml
├── electron/
│   ├── main.cjs
│   └── preload.cjs
├── electron-builder.json
├── LICENSE
├── public/
├── src/
│   ├── components/
│   ├── constants/
│   ├── services/
│   ├── types/
│   ├── utils/
│   └── App.tsx
├── package.json
└── vite.config.ts
```

## Repository, Releases & Versioning

- **Repository**: [https://github.com/Archibald-Lappline/GP2Video](https://github.com/Archibald-Lappline/GP2Video)
- **Releases (Windows EXE)**: [https://github.com/Archibald-Lappline/GP2Video/releases](https://github.com/Archibald-Lappline/GP2Video/releases)
- Updating `package.json` `"version"` or pushing a `v*` tag indexes the version into the web UI, `Windows EXE` Versions panel, and the Windows `.exe` binary metadata (`FileVersion`, `ProductVersion`, and output `.exe` filename).

## License

Licensed under the **PolyForm Noncommercial License 1.0.0** (`PolyForm-Noncommercial-1.0.0`). See [`LICENSE`](./LICENSE) or [https://polyformproject.org/licenses/noncommercial/1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0) for full terms.

