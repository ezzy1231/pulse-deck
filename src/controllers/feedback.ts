import { bus } from '../actions/bus';
import type { DeckId } from '../types';
import { useAppStore } from '../state/store';
import {
  getDualSense,
  TRIGGER_OFF,
  triggerFeedback,
  triggerVibration,
} from './dualsense';
import type { TriggerEffect } from './dualsense';

const ACCENT: Record<DeckId, [number, number, number]> = {
  A: [77, 163, 255],
  B: [255, 107, 87],
};
const IDLE_COLOR: [number, number, number] = [24, 30, 44];

let raf = 0;
let pulse = 0;
let weak = 0;
let strong = 0;
let redFlash = 0;
let meterLevel = 0;
const ending: Record<DeckId, boolean> = { A: false, B: false };
const lastTrigger: Record<DeckId, string> = { A: 'off', B: 'off' };
let lastLedMask = -1;
let lastColor = '';
let lastPulsing = false;
let lastStiff = false;
let lastLightbarOn = true;
let lastHapticsOn = true;
let lastStoreAt = 0;

function toHex(color: [number, number, number]): string {
  return `#${color
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')}`;
}

function triggerFor(
  deck: DeckId,
  playing: boolean,
): { key: string; effect: TriggerEffect } {
  if (playing && ending[deck]) return { key: 'buzz', effect: triggerVibration(1, 9, 7, 40) };
  if (playing) return { key: 'stiff', effect: triggerFeedback(2, 7, 4) };
  return { key: 'off', effect: TRIGGER_OFF };
}

function tick(): void {
  raf = window.requestAnimationFrame(tick);
  const hid = getDualSense();
  if (!hid.connected) return;
  const state = useAppStore.getState();
  const settings = state.settings;
  const a = state.decks.A.playing;
  const b = state.decks.B.playing;

  pulse *= 0.9;
  weak *= 0.85;
  strong *= 0.85;
  redFlash *= 0.8;

  let color: [number, number, number];
  if (a && b) {
    const w = state.mixer.crossfader;
    color = [
      ACCENT.A[0] * (1 - w) + ACCENT.B[0] * w,
      ACCENT.A[1] * (1 - w) + ACCENT.B[1] * w,
      ACCENT.A[2] * (1 - w) + ACCENT.B[2] * w,
    ];
  } else if (a) {
    color = [...ACCENT.A];
  } else if (b) {
    color = [...ACCENT.B];
  } else {
    color = [...IDLE_COLOR];
  }

  const brightness = 0.35 + 0.65 * pulse;
  let red = color[0] * brightness;
  let green = color[1] * brightness;
  let blue = color[2] * brightness;
  if (redFlash > 0.02) {
    red = red * (1 - redFlash) + 255 * redFlash;
    green = green * (1 - redFlash) + 40 * redFlash;
    blue = blue * (1 - redFlash) + 40 * redFlash;
  }
  if (settings.lightbar) {
    hid.setLightbar(red, green, blue);
  } else if (lastLightbarOn) {
    hid.setLightbar(0, 0, 0);
  }
  lastLightbarOn = settings.lightbar;

  if (settings.haptics) {
    hid.setRumble(strong, weak);
  } else {
    weak = 0;
    strong = 0;
    if (lastHapticsOn) hid.setRumble(0, 0);
  }
  lastHapticsOn = settings.haptics;

  const lit = Math.max(0, Math.min(5, Math.ceil(meterLevel * 5)));
  const mask = (1 << lit) - 1;
  if (mask !== lastLedMask) {
    lastLedMask = mask;
    hid.setPlayerLeds(mask);
  }

  (['A', 'B'] as const).forEach((deck) => {
    const playing = state.decks[deck].playing;
    const remaining = state.decks[deck].durationSec - state.decks[deck].elapsedSec;
    if (!playing || state.decks[deck].durationSec <= 0 || remaining > 30) {
      ending[deck] = false;
    }
    const { key, effect } = settings.haptics
      ? triggerFor(deck, playing)
      : { key: 'off', effect: TRIGGER_OFF };
    if (key !== lastTrigger[deck]) {
      lastTrigger[deck] = key;
      hid.setTrigger(deck === 'A' ? 'L' : 'R', effect);
    }
  });

  const now = performance.now();
  if (now - lastStoreAt > 200) {
    lastStoreAt = now;
    const pulsing = settings.lightbar && (a || b);
    const colorHex = settings.lightbar ? toHex(color) : '#161a21';
    const stiff = settings.haptics && (a || b);
    if (colorHex !== lastColor || pulsing !== lastPulsing || stiff !== lastStiff) {
      lastColor = colorHex;
      lastPulsing = pulsing;
      lastStiff = stiff;
      state.setController({
        lightbar: { color: colorHex, pulsing },
        haptics: { downbeatPulse: settings.haptics, triggerStiff: stiff },
      });
    }
  }
}

export function startFeedback(): void {
  if (raf) return;
  bus.on('feedback.beat', ({ isBar }) => {
    pulse = Math.min(1, pulse + (isBar ? 0.9 : 0.55));
    if (isBar) weak = Math.max(weak, 110);
  });
  bus.on('feedback.cueshort', () => {
    weak = Math.max(weak, 70);
  });
  bus.on('feedback.clipping', () => {
    strong = Math.max(strong, 170);
    weak = Math.max(weak, 140);
    redFlash = 1;
  });
  bus.on('feedback.trackEnding', ({ deck }) => {
    ending[deck] = true;
    weak = Math.max(weak, 120);
    strong = Math.max(strong, 60);
  });
  bus.on('feedback.meter', ({ level }) => {
    meterLevel = level;
  });
  raf = window.requestAnimationFrame(tick);
}
