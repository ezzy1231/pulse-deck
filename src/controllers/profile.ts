export type ProfileAction =
  | 'a.play'
  | 'a.cue'
  | 'a.sync'
  | 'a.loop'
  | 'b.play'
  | 'b.cue'
  | 'b.sync'
  | 'b.loop'
  | 'shiftA'
  | 'shiftB'
  | 'mixer'
  | 'library'
  | 'panic';

export interface ControllerProfile {
  name: string;
  buttons: Record<ProfileAction, number>;
}

export const ACTION_ORDER: ProfileAction[] = [
  'a.play',
  'a.cue',
  'a.sync',
  'a.loop',
  'b.play',
  'b.cue',
  'b.sync',
  'b.loop',
  'shiftA',
  'shiftB',
  'mixer',
  'library',
  'panic',
];

export const ACTION_LABELS: Record<ProfileAction, string> = {
  'a.play': 'Deck A · Play / Hot Cue 1',
  'a.cue': 'Deck A · Cue / Hot Cue 2',
  'a.sync': 'Deck A · Sync / Hot Cue 3',
  'a.loop': 'Deck A · Loop / Hot Cue 4',
  'b.play': 'Deck B · Play',
  'b.cue': 'Deck B · Cue / Hot Cue 2',
  'b.sync': 'Deck B · Sync / Hot Cue 3',
  'b.loop': 'Deck B · Loop / Hot Cue 4',
  shiftA: 'Shift A (hold + Deck A buttons)',
  shiftB: 'Shift B (hold + Deck B buttons)',
  mixer: 'Mixer layer (hold + sticks)',
  library: 'Library browse toggle',
  panic: 'Panic (fade out master)',
};

export const DEFAULT_PROFILE: ControllerProfile = {
  name: 'Default v1',
  buttons: {
    'a.play': 13,
    'a.cue': 14,
    'a.sync': 15,
    'a.loop': 12,
    'b.play': 0,
    'b.cue': 1,
    'b.sync': 2,
    'b.loop': 3,
    shiftA: 4,
    shiftB: 5,
    mixer: 8,
    library: 9,
    panic: 16,
  },
};

const STORAGE_KEY = 'pulse-deck.profile.v1';

function cloneProfile(profile: ControllerProfile): ControllerProfile {
  return { name: profile.name, buttons: { ...profile.buttons } };
}

function load(): ControllerProfile {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneProfile(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw) as Partial<ControllerProfile>;
    const buttons = {} as Record<ProfileAction, number>;
    for (const action of ACTION_ORDER) {
      const value = parsed.buttons?.[action];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        return cloneProfile(DEFAULT_PROFILE);
      }
      buttons[action] = value;
    }
    return {
      name: typeof parsed.name === 'string' && parsed.name ? parsed.name : 'Custom',
      buttons,
    };
  } catch {
    return cloneProfile(DEFAULT_PROFILE);
  }
}

let active: ControllerProfile = load();
let rebindTarget: ProfileAction | null = null;
const listeners = new Set<() => void>();

function persist(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(active));
  } catch {
    void 0;
  }
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export function getProfile(): ControllerProfile {
  return active;
}

export function subscribeProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRebindTarget(): ProfileAction | null {
  return rebindTarget;
}

export function setRebindTarget(action: ProfileAction | null): void {
  rebindTarget = action;
  notify();
}

export function applyRebind(buttonIndex: number): void {
  if (!rebindTarget) return;
  const target = rebindTarget;
  const previous = active.buttons[target];
  const conflict = ACTION_ORDER.find(
    (action) => action !== target && active.buttons[action] === buttonIndex,
  );
  const buttons: Record<ProfileAction, number> = { ...active.buttons, [target]: buttonIndex };
  if (conflict) buttons[conflict] = previous;
  active = {
    name: active.name === DEFAULT_PROFILE.name ? 'Custom v1' : active.name,
    buttons,
  };
  rebindTarget = null;
  persist();
  notify();
}

export function resetProfile(): void {
  active = cloneProfile(DEFAULT_PROFILE);
  rebindTarget = null;
  persist();
  notify();
}

export function buttonLabel(index: number): string {
  const glyphs: Record<number, string> = {
    0: '✕',
    1: '○',
    2: '□',
    3: '△',
    4: 'L1',
    5: 'R1',
    6: 'L2',
    7: 'R2',
    8: 'Create',
    9: 'Options',
    12: '↑',
    13: '↓',
    14: '←',
    15: '→',
    16: 'PS',
  };
  return glyphs[index] ?? `B${index}`;
}
