import {
  getWebAudioNode,
  SimpleFilter,
  SoundTouch,
  WebAudioBufferSource,
} from 'soundtouchjs';
import { analyze, guess } from 'web-audio-beat-detector';
import type { Band, DeckId } from '../types';

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  peaks: number[];
}

export interface DeckEngineHooks {
  deckId: DeckId;
  onPlayingChange: (deckId: DeckId, playing: boolean) => void;
  onTrackLoaded: (deckId: DeckId, info: TrackInfo) => void;
  onCuePointChanged: (deckId: DeckId, sec: number) => void;
  onBpmDetected: (deckId: DeckId, bpm: number) => void;
}

const PEAK_COUNT = 1400;
const BEND_RANGE_PCT = 4;
export const TEMPO_LIMIT_PCT = 32;
const LOOP_BEATS = 4;

export function fileToTrackId(file: File): string {
  return `${file.name}::${file.size}::${file.lastModified}`;
}

export function computePeaks(buffer: AudioBuffer, count: number): number[] {
  const data = buffer.getChannelData(0);
  const block = Math.max(1, Math.floor(data.length / count));
  const peaks: number[] = [];
  for (let i = 0; i < count; i++) {
    let peak = 0;
    const start = i * block;
    const end = Math.min(start + block, data.length);
    for (let j = start; j < end; j += 16) {
      const value = Math.abs(data[j]);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
  }
  return peaks;
}

export class DeckEngine {
  private ctx: AudioContext;
  private hooks: DeckEngineHooks;
  private mainVoice: GainNode;
  private trim: GainNode;
  private eqLow: BiquadFilterNode;
  private eqMid: BiquadFilterNode;
  private eqHigh: BiquadFilterNode;
  private filter: BiquadFilterNode;
  private echoSend: GainNode;
  private reverbSend: GainNode;
  private fader: GainNode;
  readonly analyser: AnalyserNode;
  private timeData: Float32Array<ArrayBuffer>;

  private buffer: AudioBuffer | null = null;
  private position = 0;
  private cuePoint = 0;
  private playing = false;
  private cueHeld = false;
  private latched = false;
  private scratching = false;
  private scratchWasPlaying = false;
  private scratchPosition = 0;

  private bpm = 0;
  private tempoPct = 0;
  private bendPct = 0;
  private syncBendPct = 0;
  private rate = 1;
  private loop = { on: false, start: 0, end: 0 };

  private peaks: number[] = [];
  private source: AudioBufferSourceNode | null = null;
  private startOffset = 0;
  private rateBase = 1;
  private rateTarget = 1;
  private rateTau = 0;
  private rateAt = 0;

  private keyLock = false;
  private st: SoundTouch | null = null;
  private stFilter: SimpleFilter | null = null;
  private stNode: ScriptProcessorNode | null = null;
  private stPos = 0;
  private stEnded = false;

  constructor(
    ctx: AudioContext,
    output: AudioNode,
    hooks: DeckEngineHooks,
    effects: { echo: AudioNode; reverb: AudioNode },
  ) {
    this.ctx = ctx;
    this.hooks = hooks;
    this.mainVoice = ctx.createGain();
    this.trim = ctx.createGain();
    this.eqLow = ctx.createBiquadFilter();
    this.eqLow.type = 'lowshelf';
    this.eqLow.frequency.value = 200;
    this.eqMid = ctx.createBiquadFilter();
    this.eqMid.type = 'peaking';
    this.eqMid.frequency.value = 1000;
    this.eqMid.Q.value = 1;
    this.eqHigh = ctx.createBiquadFilter();
    this.eqHigh.type = 'highshelf';
    this.eqHigh.frequency.value = 4000;
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 20000;
    this.fader = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 512;
    this.timeData = new Float32Array(this.analyser.fftSize);
    this.echoSend = ctx.createGain();
    this.echoSend.gain.value = 0;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.mainVoice.connect(this.trim);
    this.trim.connect(this.eqLow);
    this.eqLow.connect(this.eqMid);
    this.eqMid.connect(this.eqHigh);
    this.eqHigh.connect(this.filter);
    this.filter.connect(this.echoSend);
    this.echoSend.connect(effects.echo);
    this.filter.connect(this.reverbSend);
    this.reverbSend.connect(effects.reverb);
    this.filter.connect(this.fader);
    this.fader.connect(this.analyser);
    this.analyser.connect(output);
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  get isCueHeld(): boolean {
    return this.cueHeld;
  }

  getBpm(): number {
    return this.bpm;
  }

  async loadFile(file: File): Promise<void> {
    const data = await file.arrayBuffer();
    const buffer = await this.ctx.decodeAudioData(data);
    this.load(buffer);
    this.peaks = computePeaks(buffer, PEAK_COUNT);
    const fallback = file.name.replace(/\.[^.]+$/, '');
    const separator = fallback.indexOf(' - ');
    const artist = separator > 0 ? fallback.slice(0, separator) : '';
    const title = separator > 0 ? fallback.slice(separator + 3) : fallback;
    this.hooks.onTrackLoaded(this.hooks.deckId, {
      id: fileToTrackId(file),
      title,
      artist,
      durationSec: buffer.duration,
      peaks: this.peaks,
    });
    void analyze(buffer)
      .catch(() => guess(buffer).then((r) => (typeof r === 'number' ? r : r.bpm)))
      .then((bpm) => {
        if (this.buffer !== buffer) return;
        this.bpm = bpm;
        this.hooks.onBpmDetected(this.hooks.deckId, bpm);
      })
      .catch(() => {});
  }

  load(buffer: AudioBuffer): void {
    this.stopSource();
    this.buffer = buffer;
    this.position = 0;
    this.cuePoint = 0;
    this.cueHeld = false;
    this.latched = false;
    this.startOffset = 0;
    this.rateBase = 1;
    this.rateTarget = 1;
    this.rateTau = 0;
    this.rateAt = 0;
    this.bpm = 0;
    this.tempoPct = 0;
    this.bendPct = 0;
    this.syncBendPct = 0;
    this.rate = 1;
    this.scratching = false;
    this.stPos = 0;
    this.stEnded = false;
    this.mainVoice.gain.cancelScheduledValues(this.ctx.currentTime);
    this.mainVoice.gain.value = 1;
    this.loop = { on: false, start: 0, end: 0 };
  }

  togglePlay(): void {
    if (!this.buffer) return;
    if (this.scratching) this.scratchEnd();
    if (!this.playing) {
      this.startFrom(this.position);
      return;
    }
    if (this.cueHeld) {
      this.latched = true;
      return;
    }
    const current = this.getPosition();
    this.stopSource();
    this.position = current;
    this.cuePoint = current;
    this.hooks.onCuePointChanged(this.hooks.deckId, current);
  }

  cueDown(): void {
    if (!this.buffer) return;
    if (this.scratching) this.scratchEnd();
    if (this.playing) {
      this.stopSource();
      this.position = this.cuePoint;
      return;
    }
    this.cueHeld = true;
    this.startFrom(this.cuePoint);
  }

  cueUp(): void {
    if (this.cueHeld && !this.latched) {
      this.stopSource();
      this.position = this.cuePoint;
    }
    this.cueHeld = false;
    this.latched = false;
  }

  seek(sec: number): void {
    if (!this.buffer) return;
    if (this.scratching) this.scratchEnd();
    const target = Math.min(Math.max(sec, 0), this.buffer.duration);
    if (!this.playing) {
      this.position = target;
      return;
    }
    this.stopSource();
    this.startFrom(target);
  }

  setTempo(pct: number, glide = false): void {
    this.tempoPct = Math.min(TEMPO_LIMIT_PCT, Math.max(-TEMPO_LIMIT_PCT, pct));
    this.applyRate(glide ? 0.35 : 0.02);
  }

  setBend(value: number): void {
    this.bendPct = Math.min(1, Math.max(-1, value)) * BEND_RANGE_PCT;
    this.applyRate();
  }

  setSyncBend(value: number): void {
    const next = Math.min(1, Math.max(-1, value)) * 12;
    if (Math.abs(next - this.syncBendPct) < 0.005) return;
    this.syncBendPct = next;
    this.applyRate(0.08);
  }

  setLoop(on: boolean): void {
    if (!this.buffer) return;
    if (!on) {
      if (this.playing && (this.source || this.stFilter)) {
        const now = this.ctx.currentTime;
        const current = this.getPosition();
        this.loop = { on: false, start: 0, end: 0 };
        this.position = current;
        if (this.source) {
          this.source.loop = false;
          this.startOffset = current;
          this.rateBase = this.currentRate(now);
          this.rateAt = now;
        } else {
          this.stPos = current;
        }
        return;
      }
      this.loop = { on: false, start: 0, end: 0 };
      return;
    }
    const beat = this.bpm > 0 ? 60 / this.bpm : 0.5;
    const duration = this.buffer.duration;
    const length = beat * LOOP_BEATS;
    const current = this.playing ? this.getPosition() : this.position;
    let start = Math.floor(current / beat) * beat;
    if (start + length > duration) start = Math.max(0, duration - length);
    this.loop = { on: true, start, end: Math.min(duration, start + length) };
    if (this.playing && (this.source || this.stFilter)) {
      const active = this.getPosition();
      if (this.source) {
        this.source.loop = true;
        this.source.loopStart = this.loop.start;
        this.source.loopEnd = this.loop.end;
      }
      if (active < this.loop.start || active >= this.loop.end) {
        this.seek(this.loop.start);
      } else if (this.source) {
        const now = this.ctx.currentTime;
        this.position = active;
        this.startOffset = active;
        this.rateBase = this.currentRate(now);
        this.rateAt = now;
      } else {
        this.stPos = active;
      }
    }
  }

  getPosition(): number {
    if (!this.buffer) return 0;
    if (!this.playing) return this.position;
    if (this.stFilter) return Math.min(this.stPos, this.buffer.duration);
    if (!this.source) return this.position;
    const now = this.ctx.currentTime;
    let position = this.startOffset + this.integrateRate(this.rateAt, now);
    if (this.loop.on && this.startOffset < this.loop.end) {
      const length = this.loop.end - this.loop.start;
      if (length > 0 && position >= this.loop.end) {
        position = this.loop.start + ((position - this.loop.start) % length);
      }
    }
    return Math.min(position, this.buffer.duration);
  }

  private currentRate(now: number): number {
    if (this.rateTau <= 0) return this.rateTarget;
    const progress = Math.exp(-(now - this.rateAt) / this.rateTau);
    return this.rateTarget + (this.rateBase - this.rateTarget) * progress;
  }

  private integrateRate(from: number, to: number): number {
    const delta = Math.max(0, to - from);
    if (this.rateTau <= 0) return this.rateTarget * delta;
    const progress = Math.exp(-delta / this.rateTau);
    return (
      this.rateTarget * delta -
      (this.rateTarget - this.rateBase) * this.rateTau * (1 - progress)
    );
  }

  scratchStart(): void {
    if (!this.buffer || this.scratching) return;
    this.scratching = true;
    this.scratchWasPlaying = this.playing;
    this.scratchPosition = this.playing ? this.getPosition() : this.position;
    const now = this.ctx.currentTime;
    this.mainVoice.gain.cancelScheduledValues(now);
    this.mainVoice.gain.setTargetAtTime(0, now, 0.008);
    const source = this.source;
    if (source) {
      this.source = null;
      try {
        source.stop();
      } catch {}
    }
    const stNode = this.stNode;
    if (stNode) {
      this.stNode = null;
      this.st = null;
      this.stFilter = null;
      stNode.onaudioprocess = null;
      try {
        stNode.disconnect();
      } catch {}
    }
    this.position = this.scratchPosition;
  }

  scratchMove(velocity: number, dt: number): void {
    if (!this.scratching || !this.buffer) return;
    this.scratchPosition = Math.min(
      this.buffer.duration,
      Math.max(0, this.scratchPosition + velocity * dt),
    );
    this.position = this.scratchPosition;
    const rate = Math.min(3, Math.max(0.25, Math.abs(velocity)));
    const grain = 0.03;
    const now = this.ctx.currentTime;
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = rate;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 0.008);
    gain.gain.setValueAtTime(1, now + grain - 0.012);
    gain.gain.linearRampToValueAtTime(0, now + grain);
    source.connect(gain);
    gain.connect(this.trim);
    source.start(now, this.scratchPosition, grain * rate);
  }

  scratchEnd(): void {
    if (!this.scratching) return;
    this.scratching = false;
    this.mainVoice.gain.setTargetAtTime(1, this.ctx.currentTime, 0.01);
    if (this.scratchWasPlaying && this.buffer) {
      this.startFrom(this.scratchPosition);
    } else {
      this.position = this.scratchPosition;
    }
  }

  setEcho(amount: number): void {
    this.echoSend.gain.setTargetAtTime(
      Math.min(1, Math.max(0, amount)) * 0.9,
      this.ctx.currentTime,
      0.03,
    );
  }

  setReverb(amount: number): void {
    this.reverbSend.gain.setTargetAtTime(
      Math.min(1, Math.max(0, amount)) * 0.8,
      this.ctx.currentTime,
      0.03,
    );
  }

  setFader(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    this.fader.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.012);
  }

  setEq(band: Band, value: number): void {
    const clamped = Math.min(1, Math.max(-1, value));
    const db = clamped >= 0 ? clamped * 12 : clamped * 26;
    const node = band === 'hi' ? this.eqHigh : band === 'mid' ? this.eqMid : this.eqLow;
    node.gain.setTargetAtTime(db, this.ctx.currentTime, 0.02);
  }

  setFilter(value: number): void {
    const v = Math.min(100, Math.max(0, value));
    const t = this.ctx.currentTime;
    if (v < 50) {
      const morph = (50 - v) / 50;
      this.filter.type = 'lowpass';
      this.filter.frequency.setTargetAtTime(20000 * Math.pow(0.004, morph), t, 0.02);
    } else if (v > 50) {
      const morph = (v - 50) / 50;
      this.filter.type = 'highpass';
      this.filter.frequency.setTargetAtTime(20 * Math.pow(800, morph), t, 0.02);
    } else {
      this.filter.type = 'lowpass';
      this.filter.frequency.setTargetAtTime(20000, t, 0.02);
    }
  }

  setCuePoint(sec: number): void {
    this.cuePoint = Math.min(Math.max(sec, 0), this.buffer?.duration ?? 0);
  }

  setKeyLock(on: boolean): void {
    if (this.keyLock === on) return;
    if (this.scratching) this.scratchEnd();
    if (this.playing) {
      const current = this.getPosition();
      this.stopSource();
      this.keyLock = on;
      this.position = current;
      this.startFrom(current);
      return;
    }
    this.keyLock = on;
  }

  readLevel(): number {
    this.analyser.getFloatTimeDomainData(this.timeData);
    let peak = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const abs = Math.abs(this.timeData[i]);
      if (abs > peak) peak = abs;
    }
    return peak;
  }

  private applyRate(timeConstant = 0.02): void {
    const next = 1 + (this.tempoPct + this.bendPct + this.syncBendPct) / 100;
    if (this.st) {
      this.rate = next;
      this.rateTarget = next;
      this.rateTau = timeConstant;
      this.st.tempo = next;
      return;
    }
    const now = this.ctx.currentTime;
    const active = this.playing && this.source;
    if (active) {
      const position = this.getPosition();
      this.position = position;
      this.startOffset = position;
      this.rateBase = this.currentRate(now);
      this.rateAt = now;
    }
    this.rate = next;
    this.rateTarget = next;
    this.rateTau = timeConstant;
    if (active && this.source) {
      this.source.playbackRate.setTargetAtTime(next, now, timeConstant);
    }
  }

  private startFrom(offset: number): void {
    if (!this.buffer) return;
    if (this.keyLock) {
      this.startFromStretch(offset);
      return;
    }
    const source = this.ctx.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.rate;
    if (this.loop.on) {
      source.loop = true;
      source.loopStart = this.loop.start;
      source.loopEnd = this.loop.end;
    }
    source.connect(this.mainVoice);
    source.onended = () => {
      if (this.source !== source) return;
      this.source = null;
      this.startOffset = 0;
      this.rateAt = 0;
      this.position = 0;
      this.setPlaying(false);
    };
    this.source = source;
    this.startOffset = offset;
    this.position = offset;
    this.rateBase = this.rate;
    this.rateTarget = this.rate;
    this.rateTau = 0;
    this.rateAt = this.ctx.currentTime;
    source.start(0, offset);
    this.setPlaying(true);
  }

  private startFromStretch(offset: number): void {
    if (!this.buffer) return;
    const st = new SoundTouch();
    st.tempo = this.rate;
    const source = new WebAudioBufferSource(this.buffer);
    const frames = Math.min(
      Math.max(Math.floor(offset * this.buffer.sampleRate), 0),
      this.buffer.length - 1,
    );
    const filter = new SimpleFilter(source, st);
    filter.sourcePosition = frames;
    const node = getWebAudioNode(
      this.ctx,
      filter,
      (position) => this.onStretchTick(position),
      1024,
    );
    node.connect(this.mainVoice);
    this.st = st;
    this.stFilter = filter;
    this.stNode = node;
    this.stPos = frames / this.buffer.sampleRate;
    this.stEnded = false;
    this.startOffset = offset;
    this.position = offset;
    this.rateBase = this.rate;
    this.rateTarget = this.rate;
    this.rateTau = 0;
    this.rateAt = this.ctx.currentTime;
    this.setPlaying(true);
  }

  private onStretchTick(position: number): void {
    if (!this.stFilter || !this.buffer) return;
    const sampleRate = this.buffer.sampleRate;
    if (this.loop.on) {
      if (position >= this.loop.end * sampleRate) {
        this.stFilter.sourcePosition = Math.floor(this.loop.start * sampleRate);
        this.stPos = this.loop.start;
        return;
      }
      this.stPos = Math.min(this.loop.end, position / sampleRate);
      return;
    }
    if (position >= this.buffer.length - Math.floor(sampleRate * 0.03)) {
      this.stPos = this.buffer.duration;
      if (!this.stEnded) {
        this.stEnded = true;
        this.stopSource();
        this.position = 0;
      }
      return;
    }
    this.stPos = position / sampleRate;
  }

  private stopSource(): void {
    const node = this.stNode;
    if (node) {
      this.stNode = null;
      this.st = null;
      this.stFilter = null;
      node.onaudioprocess = null;
      try {
        node.disconnect();
      } catch {}
      this.setPlaying(false);
      return;
    }
    const source = this.source;
    if (!source) return;
    this.source = null;
    try {
      source.stop();
    } catch {}
    this.setPlaying(false);
  }

  private setPlaying(value: boolean): void {
    if (this.playing === value) return;
    this.playing = value;
    this.hooks.onPlayingChange(this.hooks.deckId, value);
  }
}
