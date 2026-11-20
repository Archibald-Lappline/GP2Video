declare const __APP_VERSION__: string;

interface ScoreFrameDesktopBridge {
  isElectron?: boolean;
  platform?: string;
  openGpFile?: () => Promise<{name: string; data: ArrayBuffer} | null>;
  getVersion?: () => Promise<string>;
  openExternal?: (url: string) => Promise<void>;
}

interface Window {
  scoreFrameDesktop?: ScoreFrameDesktopBridge;
}
