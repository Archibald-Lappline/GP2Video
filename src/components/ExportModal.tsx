import {AlertCircle, CheckCircle2, Download, X} from 'lucide-react';
import type {ExportProgressState} from '../types/studio';
import {formatBytes, formatDurationMs} from '../utils/scoreUtils';

interface ExportModalProps {
  state: ExportProgressState;
  isTransparent?: boolean;
  isLightInk?: boolean;
  onCancel: () => void;
  onClose: () => void;
}

export function ExportModal({state, isTransparent = false, isLightInk = false, onCancel, onClose}: ExportModalProps) {
  if (state.phase === 'idle') {
    return null;
  }

  const isRunning =
    state.phase === 'audio' ||
    state.phase === 'layout' ||
    state.phase === 'encoding' ||
    state.phase === 'finalizing';

  const handleDownload = () => {
    if (!state.outputUrl || !state.outputFilename) {
      return;
    }
    const anchor = document.createElement('a');
    anchor.href = state.outputUrl;
    anchor.download = state.outputFilename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div className="w-full max-w-2xl rounded-xl border border-white/12 bg-[#12161F] overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 id="export-modal-title" className="font-[var(--font-display)] text-base font-semibold text-white">
            {state.phase === 'done'
              ? 'Video Export Complete'
              : state.phase === 'error'
              ? 'Export Failed'
              : state.phase === 'cancelled'
              ? 'Export Cancelled'
              : 'Generating Sheet Music Video'}
          </h2>
          {!isRunning && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close export modal"
              className="p-1.5 rounded-md text-zinc-400 hover:text-white hover:bg-white/10 cursor-pointer"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="p-6 space-y-5">
          {isRunning && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs">
                <span className="text-zinc-200 font-medium">{state.message}</span>
                <span className="font-mono text-[var(--sf-accent)] tabular-nums font-semibold">
                  {state.progress}%
                </span>
              </div>

              <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-[var(--sf-accent)] transition-[width] duration-150"
                  style={{width: `${state.progress}%`}}
                />
              </div>

              {state.totalFrames > 0 && (
                <p className="text-xs font-mono text-zinc-400 tabular-nums">
                  Frame {state.currentFrame} / {state.totalFrames}
                </p>
              )}

              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={onCancel}
                  className="px-4 py-2 text-xs font-medium rounded-md border border-white/15 text-zinc-200 hover:bg-white/10 cursor-pointer"
                >
                  Cancel Render
                </button>
              </div>
            </div>
          )}

          {state.phase === 'done' && state.outputUrl && (
            <div className="space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-300">
                <span className="inline-flex items-center gap-2 text-emerald-400 font-medium">
                  <CheckCircle2 className="w-4 h-4" aria-hidden="true" />
                  <span>Rendered {state.outputFilename}</span>
                </span>
                <span className="font-mono text-zinc-400 tabular-nums">
                  {formatDurationMs(state.durationMs)} · {formatBytes(state.outputSizeBytes)}
                </span>
              </div>

              <video
                src={state.outputUrl}
                controls
                playsInline
                className={`w-full max-h-[360px] rounded-lg border border-white/10 ${
                  isTransparent ? (isLightInk ? 'checkerboard-dark' : 'checkerboard-light') : 'bg-black'
                }`}
              />

              <div className="flex items-center justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-md border border-white/15 text-zinc-200 hover:bg-white/10 cursor-pointer"
                >
                  Back to Studio
                </button>
                <button
                  type="button"
                  onClick={handleDownload}
                  className="inline-flex items-center gap-2 px-5 py-2 text-xs font-semibold rounded-md bg-[var(--sf-accent)] hover:brightness-110 text-[#0B0D11] cursor-pointer"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                  <span>Download Video</span>
                </button>
              </div>
            </div>
          )}

          {(state.phase === 'error' || state.phase === 'cancelled') && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg border border-red-500/30 bg-red-500/10 text-xs text-red-200">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{state.errorMessage || 'Video export did not complete.'}</span>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium rounded-md bg-white/10 hover:bg-white/16 text-white cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
