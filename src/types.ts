export type DeckId = 'A' | 'B';
export type Band = 'hi' | 'mid' | 'low';
export type JogMode = 'scratch' | 'nudge';

export interface HotCue {
  posSec: number | null;
  label: string;
}

export interface DeckState {
  id: DeckId;
  trackId: string | null;
  title: string;
  artist: string;
  key: string;
  bpm: number;
  elapsedSec: number;
  durationSec: number;
  peaks: number[] | null;
  playing: boolean;
  sync: boolean;
  loop: { on: boolean; beats: number };
  pitchPct: number;
  filter: number;
  eq: Record<Band, number>;
  fader: number;
  active: boolean;
  keyLock: boolean;
  jog: { touching: boolean; half: 'left' | 'right'; mode: JogMode; rotDeg: number };
  hotCues: HotCue[];
}

export interface LibraryTrack {
  id: string;
  title: string;
  artist: string;
  durationSec: number;
  peaks: number[];
}

export interface MixerState {
  crossfader: number;
  masterGain: number;
}

export interface SettingsState {
  haptics: boolean;
  lightbar: boolean;
}

export interface TouchPointState {
  x: number;
  y: number;
  active: boolean;
}

export interface ControllerState {
  connected: boolean;
  transport: 'usb' | 'bt';
  reportHz: number;
  latencyMs: number;
  profile: string;
  gyro: { pitchDeg: number; rollDeg: number; active: boolean };
  touch: { f1: TouchPointState; f2: TouchPointState };
  lightbar: { color: string; pulsing: boolean };
  haptics: { downbeatPulse: boolean; triggerStiff: boolean };
}
