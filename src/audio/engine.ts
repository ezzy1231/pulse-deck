import type { DeckId } from '../types';
import { DeckEngine, type DeckEngineHooks } from './deck';

export class AudioEngine {
  readonly ctx: AudioContext;
  readonly crossGainA: GainNode;
  readonly crossGainB: GainNode;
  readonly masterGain: GainNode;
  private echoIn: GainNode;
  private reverbIn: GainNode;
  private masterAnalyser: AnalyserNode;
  private timeData: Float32Array<ArrayBuffer>;
  readonly decks: Record<DeckId, DeckEngine>;

  constructor(hooks: Omit<DeckEngineHooks, 'deckId'>) {
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    this.crossGainA = this.ctx.createGain();
    this.crossGainB = this.ctx.createGain();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.8;
    const limiter = this.ctx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 512;
    this.timeData = new Float32Array(this.masterAnalyser.fftSize);
    this.echoIn = this.ctx.createGain();
    this.reverbIn = this.ctx.createGain();
    const delay = this.ctx.createDelay(1.5);
    delay.delayTime.value = 0.32;
    const feedback = this.ctx.createGain();
    feedback.gain.value = 0.38;
    const echoTone = this.ctx.createBiquadFilter();
    echoTone.type = 'lowpass';
    echoTone.frequency.value = 2600;
    this.echoIn.connect(delay);
    delay.connect(echoTone);
    echoTone.connect(feedback);
    feedback.connect(delay);
    echoTone.connect(this.masterGain);
    const convolver = this.ctx.createConvolver();
    convolver.buffer = this.buildImpulse(1.6, 2.2);
    const reverbTone = this.ctx.createBiquadFilter();
    reverbTone.type = 'lowpass';
    reverbTone.frequency.value = 3200;
    this.reverbIn.connect(convolver);
    convolver.connect(reverbTone);
    reverbTone.connect(this.masterGain);
    this.crossGainA.connect(this.masterGain);
    this.crossGainB.connect(this.masterGain);
    this.masterGain.connect(limiter);
    limiter.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);
    this.setCrossfader(0.5);
    const effects = { echo: this.echoIn, reverb: this.reverbIn };
    this.decks = {
      A: new DeckEngine(this.ctx, this.crossGainA, { ...hooks, deckId: 'A' }, effects),
      B: new DeckEngine(this.ctx, this.crossGainB, { ...hooks, deckId: 'B' }, effects),
    };
  }

  private buildImpulse(duration: number, decay: number): AudioBuffer {
    const rate = this.ctx.sampleRate;
    const length = Math.floor(rate * duration);
    const impulse = this.ctx.createBuffer(2, length, rate);
    for (let channel = 0; channel < 2; channel++) {
      const data = impulse.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  async resume(): Promise<void> {
    if (this.ctx.state !== 'running') {
      await this.ctx.resume();
    }
  }

  setMaster(value: number): void {
    const clamped = Math.min(1, Math.max(0, value));
    this.masterGain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.015);
  }

  panic(): void {
    const t = this.ctx.currentTime;
    const gain = this.masterGain.gain;
    gain.cancelScheduledValues(t);
    gain.setValueAtTime(gain.value, t);
    gain.linearRampToValueAtTime(0, t + 0.8);
  }

  setCrossfader(value: number): void {
    const v = Math.min(1, Math.max(0, value));
    const t = this.ctx.currentTime;
    this.crossGainA.gain.setTargetAtTime(Math.cos((v * Math.PI) / 2), t, 0.015);
    this.crossGainB.gain.setTargetAtTime(Math.sin((v * Math.PI) / 2), t, 0.015);
  }

  readMasterDb(): number {
    this.masterAnalyser.getFloatTimeDomainData(this.timeData);
    let peak = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const abs = Math.abs(this.timeData[i]);
      if (abs > peak) peak = abs;
    }
    if (peak < 0.0001) return -Infinity;
    return 20 * Math.log10(peak);
  }

  getLatencyMs(): number {
    const base = this.ctx.baseLatency ?? 0;
    const output = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((base + output) * 1000);
  }
}

let engine: AudioEngine | null = null;

export function getEngine(): AudioEngine | null {
  return engine;
}

export function setEngine(next: AudioEngine | null): void {
  engine = next;
}
