import { bus } from '../actions/bus';
import { useAppStore } from '../state/store';
import type { DeckId, TouchPointState } from '../types';
import { getDualSense } from './dualsense';

const PAD_CX = 960;
const PAD_CY = 540;
const SCRATCH_DEG_PER_SEC = 200;
const MAX_VELOCITY = 3;

interface DeckTouch {
  active: boolean;
  angle: number;
  time: number;
  velocity: number;
}

const touchState: Record<DeckId, DeckTouch> = {
  A: { active: false, angle: 0, time: 0, velocity: 0 },
  B: { active: false, angle: 0, time: 0, velocity: 0 },
};
const rotAccum: Record<DeckId, number> = { A: 0, B: 0 };
const prevFx: Record<DeckId, { echo: number; reverb: number }> = {
  A: { echo: 0, reverb: 0 },
  B: { echo: 0, reverb: 0 },
};

let prevPadClick = false;
let wasConnected = false;
let lastStoreAt = 0;
let raf = 0;

export function getJogRotation(deck: DeckId): number {
  return rotAccum[deck];
}

function wrapAngle(delta: number): number {
  let value = delta;
  while (value > Math.PI) value -= Math.PI * 2;
  while (value < -Math.PI) value += Math.PI * 2;
  return value;
}

function deckForPoint(point: TouchPointState): DeckId {
  return point.x < PAD_CX ? 'A' : 'B';
}

function applyFx(deck: DeckId, echo: number, reverb: number): void {
  const prev = prevFx[deck];
  if (Math.abs(echo - prev.echo) >= 0.01) {
    bus.emit('deck.fx.echo.set', { deck, value: echo });
    prev.echo = echo;
  }
  if (Math.abs(reverb - prev.reverb) >= 0.01) {
    bus.emit('deck.fx.reverb.set', { deck, value: reverb });
    prev.reverb = reverb;
  }
}

function endTouch(deck: DeckId): void {
  const state = useAppStore.getState();
  touchState[deck].active = false;
  touchState[deck].velocity = 0;
  state.setDeck(deck, { jog: { ...state.decks[deck].jog, touching: false } });
  bus.emit('deck.jog.end', { deck });
}

function poll(): void {
  const hid = getDualSense();
  const snapshot = hid.snapshot;
  const state = useAppStore.getState();
  const now = performance.now();

  if (!snapshot.connected) {
    if (wasConnected) {
      wasConnected = false;
      prevPadClick = false;
      (['A', 'B'] as const).forEach((deck) => {
        if (touchState[deck].active) endTouch(deck);
        applyFx(deck, 0, 0);
      });
      state.setController({
        connected: false,
        reportHz: 0,
        latencyMs: 0,
        gyro: { pitchDeg: 0, rollDeg: 0, active: false },
      });
    }
    return;
  }

  wasConnected = true;

  if (snapshot.touchpad && !prevPadClick) {
    bus.emit('deck.jog.mode.toggle', { deck: 'A' });
    bus.emit('deck.jog.mode.toggle', { deck: 'B' });
  }
  prevPadClick = snapshot.touchpad;

  const assigned: Record<DeckId, TouchPointState | null> = { A: null, B: null };
  if (snapshot.touch.f1.active) {
    const deck = deckForPoint(snapshot.touch.f1);
    assigned[deck] = snapshot.touch.f1;
  }
  if (snapshot.touch.f2.active) {
    const deck = deckForPoint(snapshot.touch.f2);
    if (!assigned[deck]) assigned[deck] = snapshot.touch.f2;
  }

  (['A', 'B'] as const).forEach((deck) => {
    const point = assigned[deck];
    const jog = touchState[deck];
    if (point) {
      const angle = Math.atan2(point.y - PAD_CY, point.x - PAD_CX);
      if (!jog.active) {
        jog.active = true;
        jog.angle = angle;
        jog.time = now;
        jog.velocity = 0;
        state.setDeck(deck, {
          jog: { ...state.decks[deck].jog, touching: true },
        });
        bus.emit('deck.jog.begin', { deck });
        return;
      }
      const dt = Math.min(0.05, Math.max(0.004, (now - jog.time) / 1000));
      const delta = wrapAngle(angle - jog.angle);
      jog.angle = angle;
      jog.time = now;
      const deltaDeg = (delta * 180) / Math.PI;
      rotAccum[deck] += deltaDeg;
      const raw = deltaDeg / dt / SCRATCH_DEG_PER_SEC;
      jog.velocity += (raw - jog.velocity) * 0.4;
      const value = Math.max(-MAX_VELOCITY, Math.min(MAX_VELOCITY, jog.velocity));
      bus.emit('deck.jog.velocity', { deck, value, dt });
    } else if (jog.active) {
      endTouch(deck);
    }
  });

  const echo = Math.min(1, Math.max(0, snapshot.gyro.pitchDeg / 35));
  const reverb = Math.min(1, Math.max(0, Math.abs(snapshot.gyro.rollDeg) / 20));
  applyFx('A', snapshot.l3 ? echo : 0, snapshot.l3 ? reverb : 0);
  applyFx('B', snapshot.r3 ? echo : 0, snapshot.r3 ? reverb : 0);

  if (now - lastStoreAt > 100) {
    lastStoreAt = now;
    state.setController({
      connected: true,
      transport: snapshot.transport,
      reportHz: snapshot.reportHz,
      latencyMs: snapshot.reportHz > 0 ? Math.round(1000 / snapshot.reportHz) : 0,
      gyro: {
        pitchDeg: snapshot.gyro.pitchDeg,
        rollDeg: snapshot.gyro.rollDeg,
        active: snapshot.gyro.active,
      },
      touch: { f1: { ...snapshot.touch.f1 }, f2: { ...snapshot.touch.f2 } },
    });
  }
}

export function startSensors(): void {
  if (raf) return;
  const frame = () => {
    poll();
    raf = window.requestAnimationFrame(frame);
  };
  raf = window.requestAnimationFrame(frame);
}
