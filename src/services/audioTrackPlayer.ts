import type {AudioTrackState} from '../types/studio';

interface ActiveVoice {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class ExternalAudioSyncEngine {
  private ctx: AudioContext | null = null;
  private activeVoices = new Map<string, ActiveVoice>();
  private isPlaying = false;
  private currentSpeed = 1.0;
  private playSessionId = 0;

  private ensureContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext();
    }
    return this.ctx;
  }

  public unlock(): void {
    const ctx = this.ensureContext();
    if (ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
  }

  public async decodeAudioBytes(bytes: Uint8Array): Promise<AudioBuffer> {
    const ctx = this.ensureContext();
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    return await ctx.decodeAudioData(copy.buffer);
  }

  private clearActiveVoices(): void {
    for (const voice of this.activeVoices.values()) {
      try {
        voice.source.stop();
        voice.source.disconnect();
        voice.gain.disconnect();
      } catch {
        continue;
      }
    }
    this.activeVoices.clear();
  }

  private scheduleVoices(
    ctx: AudioContext,
    positionMs: number,
    speed: number,
    audioTracks: AudioTrackState[],
    anyMidiSolo: boolean
  ): void {
    this.clearActiveVoices();
    const safeSpeed = Math.max(0.1, Number.isFinite(speed) ? speed : 1.0);
    const anyAudioSolo = audioTracks.some((t) => t.solo);
    const anySolo = anyMidiSolo || anyAudioSolo;

    for (const track of audioTracks) {
      if (!track.audioBuffer) {
        continue;
      }
      const isAudible = anySolo ? track.solo : !track.muted;
      const gainValue = isAudible ? track.volume : 0;

      const source = ctx.createBufferSource();
      source.buffer = track.audioBuffer;
      source.playbackRate.value = safeSpeed;

      const gain = ctx.createGain();
      gain.gain.value = gainValue;

      source.connect(gain);
      gain.connect(ctx.destination);

      const trackStartOffsetSec = (positionMs - track.offsetMs) / 1000;
      if (trackStartOffsetSec >= track.audioBuffer.duration) {
        continue;
      }

      if (trackStartOffsetSec >= 0) {
        source.start(0, trackStartOffsetSec);
      } else {
        const delaySec = Math.abs(trackStartOffsetSec) / safeSpeed;
        source.start(ctx.currentTime + delaySec, 0);
      }

      this.activeVoices.set(track.id, {source, gain});
    }
  }

  public startAt(
    positionMs: number,
    speed: number,
    audioTracks: AudioTrackState[],
    anyMidiSolo: boolean
  ): void {
    this.stop();
    if (audioTracks.length === 0) {
      return;
    }

    const safeSpeed = Math.max(0.1, Number.isFinite(speed) ? speed : 1.0);
    const sessionId = ++this.playSessionId;
    this.isPlaying = true;
    this.currentSpeed = safeSpeed;

    const ctx = this.ensureContext();
    if (ctx.state === 'running') {
      this.scheduleVoices(ctx, positionMs, safeSpeed, audioTracks, anyMidiSolo);
      return;
    }

    void ctx
      .resume()
      .then(() => {
        if (this.playSessionId === sessionId && this.isPlaying && ctx.state === 'running') {
          this.scheduleVoices(ctx, positionMs, safeSpeed, audioTracks, anyMidiSolo);
        }
      })
      .catch(() => {});
  }

  public updateMix(audioTracks: AudioTrackState[], anyMidiSolo: boolean): void {
    const anyAudioSolo = audioTracks.some((t) => t.solo);
    const anySolo = anyMidiSolo || anyAudioSolo;

    for (const track of audioTracks) {
      const voice = this.activeVoices.get(track.id);
      if (!voice) {
        continue;
      }
      const isAudible = anySolo ? track.solo : !track.muted;
      voice.gain.gain.value = isAudible ? track.volume : 0;
    }
  }

  public updateSpeed(speed: number): void {
    const safeSpeed = Math.max(0.1, Number.isFinite(speed) ? speed : 1.0);
    this.currentSpeed = safeSpeed;
    for (const voice of this.activeVoices.values()) {
      voice.source.playbackRate.value = safeSpeed;
    }
  }

  public stop(): void {
    this.playSessionId++;
    this.isPlaying = false;
    this.clearActiveVoices();
  }

  public getPlayingState(): boolean {
    return this.isPlaying;
  }

  public getSpeed(): number {
    return this.currentSpeed;
  }

  public destroy(): void {
    this.stop();
    if (this.ctx && this.ctx.state !== 'closed') {
      void this.ctx.close();
    }
    this.ctx = null;
  }
}
