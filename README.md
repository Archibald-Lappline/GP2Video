# ScoreFrame

ScoreFrame turns Guitar Pro and MusicXML scores into sheet music videos. It renders notation with [alphaTab](https://www.alphatab.net/), plays it back with a bundled SoundFont synthesizer and optional backing audio, and exports the result as a WebM or MP4 file. Everything runs locally in the browser or in a Windows desktop app built with Electron.

## Features

- **Score import**: `.gp`, `.gp3`, `.gp4`, `.gp5`, `.gpx`, `.gp8`, `.xml`, `.musicxml`, `.mxl`, `.cap` and `.tg`.
- **Multi-track view**: show several tracks at once, each with its own mute, solo and volume controls.
- **Audio engine**: a bundled SoundFont (`sonivox.sf2` / `sonivox.sf3`), backing tracks embedded in Guitar Pro files, and external audio files (`.mp3`, `.wav`, `.ogg`, `.m4a`, `.aac`, `.flac`, `.opus`, `.webm`) with a per-track millisecond offset.
- **Audio mix modes**: selected tracks only, or the full band. A metronome can be enabled for playback and export.
- **Live video preview**: switch between the sheet view and the rendered video view, and see setting changes immediately.
- **Notation modes**: Score + Tab, Score only, Tab only.
- **Layouts and camera**: vertical page layout or horizontal strip, with smooth scrolling or page-flip camera motion.
- **Video themes**: Studio Paper, Concert Dark, Manuscript, Midnight Slate, plus a custom accent color.
- **Overlays**: header, track names, measure HUD, progress bar and active beat highlight can each be turned on or off.
- **Export presets**:

  | Setting | Options |
    | --- | --- |
  | Resolution | 1080p (1920×1080), 720p (1280×720), Vertical 9:16 (1080×1920), Square 1:1 (1080×1080) |
  | Frame rate | 30 or 60 fps |
  | Format | WebM or MP4 |
  | Bar range | any start and end bar |
  | Background | solid or transparent (transparent export is WebM only) |

- **Windows app**: NSIS installer and portable `.exe`, built with Electron and GitHub Actions.
- **Update check**: the app checks GitHub Releases for a newer version and lists the version history.

## Requirements

- **Node.js** 20.19+ or 22.12+ (Node 22 LTS recommended), required by Vite 8.
- **npm**, bundled with Node.js.
- **A Chromium-based browser** (Chrome, Edge) for video export. Export uses the WebCodecs API (`VideoEncoder`, `AudioEncoder`); the desktop app ships its own Chromium.

## Getting Started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Starts the Vite dev server on port 3000 |
| `npm run build` | Builds the production web bundle into `dist/` |
| `npm run preview` | Serves the built `dist/` bundle locally |
| `npm run lint` | Type-checks the project (`tsc --noEmit`) |
| `npm run clean` | Removes `dist/` |
| `npm run build:exe` | Builds `dist/` and packages Windows x64 installers into `release/` |

alphaTab's fonts (Bravura) and SoundFont files are copied from `node_modules` into `public/font/` and `public/soundfont/` automatically on every `dev` and `build` run. These folders are git-ignored; do not commit them.

## Desktop App (Windows `.exe`)

`electron` and `electron-builder` are not listed in `package.json`, so web installs stay lightweight. Install them on demand.

### Run Electron in development

1. Start the Vite dev server in one terminal:

   ```bash
   npm run dev
   ```

2. In another terminal, install Electron once without saving it to `package.json`:

   ```bash
   npm install --no-save electron@35.1.5
   ```

3. Launch the desktop window.

   Windows PowerShell:

   ```powershell
   $env:ELECTRON_START_URL="http://localhost:3000"; npx electron .
   ```

   macOS / Linux:

   ```bash
   ELECTRON_START_URL=http://localhost:3000 npx electron .
   ```

Without `ELECTRON_START_URL`, Electron serves the built `dist/` folder from a local static server, so run `npm run build` first.

### Build the `.exe` locally

Run this on Windows, or on Linux/macOS with Wine:

```bash
npm install
npm install --no-save electron@35.1.5 electron-builder@26.0.12
npm run build:exe
```

The files appear in `release/`:

- `ScoreFrame-<version>-win-x64-nsis.exe`: installer
- `ScoreFrame-<version>-win-x64-portable.exe`: portable executable

### Build on GitHub Actions

`.github/workflows/build-exe.yml` builds both executables on `windows-latest`.

1. Push to `main` or `master`, or run **Build Windows EXE** manually from the **Actions** tab.
2. Download the `ScoreFrame-Windows-EXE` artifact from the finished run.
3. To publish a GitHub Release with the `.exe` files attached, push a version tag:

   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

   The workflow sets `package.json` to the tag's version before building, so the version appears in the app, in the file name and in the `.exe` metadata.

## Project Structure

```text
.
├── .github/workflows/build-exe.yml   # Windows EXE build and release
├── electron/
│   ├── main.cjs                      # Electron main process, local static server
│   └── preload.cjs                   # scoreFrameDesktop bridge for the renderer
├── public/                           # font/ and soundfont/ are generated, git-ignored
├── src/
│   ├── components/                   # TopBar, TrackSidebar, TransportBar, VideoSettingsPanel,
│   │                                 # VideoPreviewCanvas, ExportModal, DesktopBuildView
│   ├── constants/                    # appInfo (version, links), themes (presets, palettes)
│   ├── services/                     # videoRenderer, audioTrackPlayer, updateChecker
│   ├── types/                        # shared TypeScript types
│   ├── utils/                        # scoreUtils, soundFontLoader, gpZipAssets
│   ├── App.tsx
│   ├── index.css
│   └── main.tsx
├── electron-builder.json
├── index.html
├── LICENSE
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Built With

- [alphaTab](https://www.alphatab.net/): notation rendering and MIDI playback
- [React](https://react.dev/), [Vite](https://vite.dev/) and [Tailwind CSS](https://tailwindcss.com/)
- [mp4-muxer](https://github.com/Vanilagy/mp4-muxer) and [webm-muxer](https://github.com/Vanilagy/webm-muxer): video container output
- [Electron](https://www.electronjs.org/) and electron-builder: desktop packaging
- [Bravura](https://github.com/steinbergmedia/bravura) music font (SIL Open Font License) and the SONiVOX SoundFont; see `public/soundfont/README.md` after the first build for its notes

## Repository and Releases

- Repository: <https://github.com/Archibald-Lappline/GP2Video>
- Releases: <https://github.com/Archibald-Lappline/GP2Video/releases>

The version is read from `package.json`.

## License

Licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See [`LICENSE`](./LICENSE) for the full terms.