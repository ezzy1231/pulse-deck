import { bus } from '../actions/bus';
import { useAppStore } from '../state/store';
import type { DeckId } from '../types';
import {
  applyRebind,
  getProfile,
  getRebindTarget,
  type ProfileAction,
} from './profile';

const BTN_L2 = 6;
const BTN_R2 = 7;
const BTN_DPAD_UP = 12;
const BTN_DPAD_DOWN = 13;
const BTN_DPAD_LEFT = 14;
const BTN_DPAD_RIGHT = 15;
const DEADZONE = 0.12;

let prevButtons: boolean[] = [];
let analogs = {
  faderA: NaN,
  faderB: NaN,
  filterA: NaN,
  filterB: NaN,
  crossfader: NaN,
  bendA: NaN,
  bendB: NaN,
  tempoA: NaN,
  tempoB: NaN,
  master: NaN,
};
let prevL1 = false;
let prevR1 = false;
let prevL2Load = false;
let prevR2Load = false;
let prevFrozen = false;
let repeatDir = 0;
let repeatAt = 0;
let raf = 0;

function firstPad(): Gamepad | null {
  const pads = navigator.getGamepads();
  for (const pad of pads) if (pad) return pad;
  return null;
}

function resetAnalogs(): void {
  analogs = {
    faderA: NaN,
    faderB: NaN,
    filterA: NaN,
    filterB: NaN,
    crossfader: NaN,
    bendA: NaN,
    bendB: NaN,
    tempoA: NaN,
    tempoB: NaN,
    master: NaN,
  };
  prevL1 = false;
  prevR1 = false;
  prevL2Load = false;
  prevR2Load = false;
  repeatDir = 0;
  repeatAt = 0;
}

function newly(index: number, pressed: boolean[]): boolean {
  return pressed[index] === true && prevButtons[index] !== true;
}

function released(index: number, pressed: boolean[]): boolean {
  return prevButtons[index] === true && pressed[index] !== true;
}

function changed(next: number, prev: number, threshold: number): boolean {
  if (Number.isNaN(prev)) return false;
  return Math.abs(next - prev) >= threshold;
}

function axisWithDeadzone(axis: number): number {
  if (Math.abs(axis) < DEADZONE) return 0;
  return Math.sign(axis) * ((Math.abs(axis) - DEADZONE) / (1 - DEADZONE));
}

function hotcue(deck: DeckId, index: number): void {
  const state = useAppStore.getState();
  if (state.decks[deck].hotCues[index].posSec === null) {
    bus.emit('deck.hotcue.set', { deck, index });
  } else {
    bus.emit('deck.hotcue.jump', { deck, index });
  }
}

function togglePlay(deck: DeckId): void {
  const state = useAppStore.getState();
  bus.emit(state.decks[deck].playing ? 'deck.pause' : 'deck.play', { deck });
}

function loadSelected(deck: DeckId): void {
  const state = useAppStore.getState();
  const q = state.libraryQuery.trim().toLowerCase();
  const tracks = q
    ? state.libraryTracks.filter((track) =>
        `${track.title} ${track.artist}`.toLowerCase().includes(q),
      )
    : state.libraryTracks;
  const track = tracks[state.browserIndex];
  if (track) bus.emit('library.load', { deck, trackId: track.id });
}

function poll(): void {
  const pad = firstPad();
  const pressed: boolean[] = [];
  if (pad) {
    for (let i = 0; i < pad.buttons.length; i++) pressed[i] = pad.buttons[i].pressed;
  }

  if (!pad) {
    if (prevButtons.length > 0) {
      bus.emit('deck.cue.up', { deck: 'A' });
      bus.emit('deck.cue.up', { deck: 'B' });
      prevButtons = [];
      resetAnalogs();
    }
    return;
  }

  const state = useAppStore.getState();
  const P: Record<ProfileAction, number> = getProfile().buttons;
  const rebind = getRebindTarget();
  const frozen = rebind !== null || state.settingsOpen;

  if (frozen && !prevFrozen) {
    bus.emit('deck.cue.up', { deck: 'A' });
    bus.emit('deck.cue.up', { deck: 'B' });
    resetAnalogs();
  }
  prevFrozen = frozen;

  if (rebind) {
    for (let i = 0; i < pressed.length; i++) {
      if (newly(i, pressed)) {
        applyRebind(i);
        break;
      }
    }
    prevButtons = pressed;
    return;
  }

  if (state.settingsOpen) {
    if (newly(P['b.cue'], pressed)) {
      state.toggleSettings();
      if (!state.settingsOpen) bus.emit('settings.open', {});
    }
    prevButtons = pressed;
    return;
  }

  const l1 = pressed[P.shiftA] === true;
  const r1 = pressed[P.shiftB] === true;
  if (l1 && !prevL1) analogs.tempoA = NaN;
  if (r1 && !prevR1) analogs.tempoB = NaN;
  prevL1 = l1;
  prevR1 = r1;
  const browsing = state.browserActive;
  const aPlay = newly(P['a.play'], pressed);
  const aCue = newly(P['a.cue'], pressed);
  const aSync = newly(P['a.sync'], pressed);
  const aLoop = newly(P['a.loop'], pressed);
  const bPlay = newly(P['b.play'], pressed);
  const bCue = newly(P['b.cue'], pressed);
  const bSync = newly(P['b.sync'], pressed);
  const bLoop = newly(P['b.loop'], pressed);
  const dpadLeft = newly(BTN_DPAD_LEFT, pressed);
  const dpadRight = newly(BTN_DPAD_RIGHT, pressed);

  if (browsing) {
    const navY = -axisWithDeadzone(pad.axes[1] ?? 0);
    const navUp = pressed[BTN_DPAD_UP] === true || navY < -0.5;
    const navDown = pressed[BTN_DPAD_DOWN] === true || navY > 0.5;
    const navDir = navUp && !navDown ? -1 : navDown && !navUp ? 1 : 0;
    if (navDir !== 0) {
      if (navDir !== repeatDir) {
        state.moveBrowser(navDir);
        repeatDir = navDir;
        repeatAt = performance.now() + 400;
      } else if (performance.now() >= repeatAt) {
        state.moveBrowser(navDir);
        repeatAt = performance.now() + 110;
      }
    } else {
      repeatDir = 0;
    }
    if (dpadLeft || newly(P.shiftA, pressed)) state.setActiveDeck('A');
    if (dpadRight || newly(P.shiftB, pressed)) state.setActiveDeck('B');
    if (bCue) state.toggleBrowser();
    if (bPlay) loadSelected(state.activeDeck);
  } else {
    repeatDir = 0;
    if (aPlay) {
      if (l1) hotcue('A', 0);
      else togglePlay('A');
    }
    if (aCue) {
      if (l1) hotcue('A', 1);
      else bus.emit('deck.cue.down', { deck: 'A' });
    }
    if (released(P['a.cue'], pressed) && !l1) bus.emit('deck.cue.up', { deck: 'A' });
    if (aSync) {
      if (l1) hotcue('A', 2);
      else bus.emit('deck.sync', { deck: 'A' });
    }
    if (aLoop) {
      if (l1) hotcue('A', 3);
      else bus.emit('deck.loop.toggle', { deck: 'A' });
    }
    if (bPlay) togglePlay('B');
    if (bCue) {
      if (r1) hotcue('B', 1);
      else bus.emit('deck.cue.down', { deck: 'B' });
    }
    if (released(P['b.cue'], pressed) && !r1) bus.emit('deck.cue.up', { deck: 'B' });
    if (bSync) {
      if (r1) hotcue('B', 2);
      else bus.emit('deck.sync', { deck: 'B' });
    }
    if (bLoop) {
      if (r1) hotcue('B', 3);
      else bus.emit('deck.loop.toggle', { deck: 'B' });
    }
  }

  if (newly(P.library, pressed)) state.toggleBrowser();
  if (newly(P.panic, pressed)) bus.emit('panic', {});

  const l2 = pad.buttons[BTN_L2]?.value ?? 0;
  const r2 = pad.buttons[BTN_R2]?.value ?? 0;
  if (browsing) {
    const l2Load = l2 > 0.5;
    const r2Load = r2 > 0.5;
    if (l2Load && !prevL2Load) loadSelected('A');
    if (r2Load && !prevR2Load) loadSelected('B');
    prevL2Load = l2Load;
    prevR2Load = r2Load;
    analogs.faderA = NaN;
    analogs.faderB = NaN;
  } else {
    prevL2Load = false;
    prevR2Load = false;
    if (changed(l2, analogs.faderA, 0.004)) {
      bus.emit('deck.volume.set', { deck: 'A', value: 1 - l2 });
    }
    analogs.faderA = l2;
    if (changed(r2, analogs.faderB, 0.004)) {
      bus.emit('deck.volume.set', { deck: 'B', value: 1 - r2 });
    }
    analogs.faderB = r2;
  }

  const create = pressed[P.mixer] === true;
  const leftX = pad.axes[0] ?? 0;
  const rightX = pad.axes[2] ?? 0;
  const leftY = -axisWithDeadzone(pad.axes[1] ?? 0);
  const rightY = -axisWithDeadzone(pad.axes[3] ?? 0);

  if (create) {
    const crossfader = (leftX + 1) / 2;
    if (changed(crossfader, analogs.crossfader, 0.004)) {
      bus.emit('crossfader.set', { value: crossfader });
    }
    analogs.crossfader = crossfader;
    const master = (1 - axisWithDeadzone(pad.axes[3] ?? 0)) / 2;
    if (changed(master, analogs.master, 0.004)) {
      bus.emit('master.set', { value: master });
    }
    analogs.master = master;
    if (analogs.bendA !== 0) {
      bus.emit('deck.pitch.bend', { deck: 'A', value: 0 });
      analogs.bendA = 0;
    }
    if (analogs.bendB !== 0) {
      bus.emit('deck.pitch.bend', { deck: 'B', value: 0 });
      analogs.bendB = 0;
    }
  } else {
    const filterA = (axisWithDeadzone(leftX) + 1) * 50;
    if (changed(filterA, analogs.filterA, 0.4)) {
      bus.emit('deck.filter.set', { deck: 'A', value: Math.round(filterA) });
    }
    analogs.filterA = filterA;
    const filterB = (axisWithDeadzone(rightX) + 1) * 50;
    if (changed(filterB, analogs.filterB, 0.4)) {
      bus.emit('deck.filter.set', { deck: 'B', value: Math.round(filterB) });
    }
    analogs.filterB = filterB;
    analogs.crossfader = NaN;
    analogs.master = NaN;
    if (l1) {
      if (changed(leftY, analogs.tempoA, 0.02)) {
        bus.emit('deck.pitch.set', { deck: 'A', value: leftY * 8 });
      }
      analogs.tempoA = leftY;
      if (analogs.bendA !== 0) {
        bus.emit('deck.pitch.bend', { deck: 'A', value: 0 });
        analogs.bendA = 0;
      }
    } else if (changed(leftY, analogs.bendA, 0.02)) {
      bus.emit('deck.pitch.bend', { deck: 'A', value: leftY });
      analogs.bendA = leftY;
    }
    if (r1) {
      if (changed(rightY, analogs.tempoB, 0.02)) {
        bus.emit('deck.pitch.set', { deck: 'B', value: rightY * 8 });
      }
      analogs.tempoB = rightY;
      if (analogs.bendB !== 0) {
        bus.emit('deck.pitch.bend', { deck: 'B', value: 0 });
        analogs.bendB = 0;
      }
    } else if (changed(rightY, analogs.bendB, 0.02)) {
      bus.emit('deck.pitch.bend', { deck: 'B', value: rightY });
      analogs.bendB = rightY;
    }
  }

  prevButtons = pressed;
}

export function startGamepad(): void {
  if (raf) return;
  const frame = () => {
    poll();
    raf = window.requestAnimationFrame(frame);
  };
  raf = window.requestAnimationFrame(frame);
}

export function stopGamepad(): void {
  if (raf) window.cancelAnimationFrame(raf);
  raf = 0;
  prevButtons = [];
  resetAnalogs();
}
