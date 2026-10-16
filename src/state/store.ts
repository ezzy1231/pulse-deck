import { create } from 'zustand';
import type {
  ControllerState,
  DeckId,
  DeckState,
  LibraryTrack,
  MixerState,
  SettingsState,
} from '../types';

export const HOT_CUE_LABELS = ['1 Intro', '2 Drop', '3 Break', '4 Outro'];

function createDeck(id: DeckId): DeckState {
  return {
    id,
    trackId: null,
    title: '',
    artist: '',
    key: '',
    bpm: 0,
    elapsedSec: 0,
    durationSec: 0,
    peaks: null,
    playing: false,
    sync: false,
    loop: { on: false, beats: 4 },
    pitchPct: 0,
    filter: 50,
    eq: { hi: 0, mid: 0, low: 0 },
    fader: 1,
    active: false,
    keyLock: false,
    jog: { touching: false, half: id === 'A' ? 'left' : 'right', mode: 'scratch', rotDeg: 0 },
    hotCues: HOT_CUE_LABELS.map((label) => ({ posSec: null, label })),
  };
}

export interface AppState {
  audioStarted: boolean;
  activeDeck: DeckId;
  libraryTracks: LibraryTrack[];
  libraryQuery: string;
  browserActive: boolean;
  browserIndex: number;
  settingsOpen: boolean;
  settings: SettingsState;
  decks: Record<DeckId, DeckState>;
  mixer: MixerState;
  controller: ControllerState;
  startAudio: () => void;
  toggleBrowser: () => void;
  moveBrowser: (delta: number) => void;
  setLibraryQuery: (query: string) => void;
  setActiveDeck: (id: DeckId) => void;
  toggleSettings: () => void;
  setSettings: (patch: Partial<SettingsState>) => void;
  setDeck: (id: DeckId, patch: Partial<DeckState>) => void;
  registerTrackLoad: (id: DeckId, track: LibraryTrack) => void;
  setMixer: (patch: Partial<MixerState>) => void;
  setController: (patch: Partial<ControllerState>) => void;
}

export function filterTracks(tracks: LibraryTrack[], query: string): LibraryTrack[] {
  const q = query.trim().toLowerCase();
  if (!q) return tracks;
  return tracks.filter((track) =>
    `${track.title} ${track.artist}`.toLowerCase().includes(q),
  );
}

export function selectFilteredTracks(state: AppState): LibraryTrack[] {
  return filterTracks(state.libraryTracks, state.libraryQuery);
}

export const useAppStore = create<AppState>((set) => ({
  audioStarted: false,
  activeDeck: 'A',
  libraryTracks: [],
  libraryQuery: '',
  browserActive: false,
  browserIndex: 0,
  settingsOpen: false,
  settings: { haptics: true, lightbar: true },
  decks: { A: createDeck('A'), B: createDeck('B') },
  mixer: { crossfader: 0.5, masterGain: 0.8 },
  controller: {
    connected: false,
    transport: 'usb',
    reportHz: 0,
    latencyMs: 0,
    profile: 'default',
    gyro: { pitchDeg: 0, rollDeg: 0, active: false },
    touch: {
      f1: { x: 0, y: 0, active: false },
      f2: { x: 0, y: 0, active: false },
    },
    lightbar: { color: '#161a21', pulsing: false },
    haptics: { downbeatPulse: true, triggerStiff: false },
  },
  startAudio: () => set({ audioStarted: true }),
  toggleBrowser: () =>
    set((state) => ({
      browserActive: !state.browserActive,
      browserIndex: state.browserActive ? state.browserIndex : 0,
    })),
  moveBrowser: (delta) =>
    set((state) => ({
      browserIndex: Math.min(
        Math.max(state.browserIndex + delta, 0),
        Math.max(0, selectFilteredTracks(state).length - 1),
      ),
    })),
  setLibraryQuery: (query) => set({ libraryQuery: query, browserIndex: 0 }),
  setActiveDeck: (id) =>
    set((state) => ({
      activeDeck: id,
      decks: {
        A: { ...state.decks.A, active: id === 'A' },
        B: { ...state.decks.B, active: id === 'B' },
      },
    })),
  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setSettings: (patch) => set((state) => ({ settings: { ...state.settings, ...patch } })),
  setDeck: (id, patch) =>
    set((state) => ({
      decks: { ...state.decks, [id]: { ...state.decks[id], ...patch } },
    })),
  registerTrackLoad: (id, track) =>
    set((state) => ({
      activeDeck: id,
      decks: {
        ...state.decks,
        [id]: {
          ...state.decks[id],
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          durationSec: track.durationSec,
          peaks: track.peaks,
          elapsedSec: 0,
          hotCues: HOT_CUE_LABELS.map((label) => ({ posSec: null, label })),
        },
      },
      libraryTracks: state.libraryTracks.some((t) => t.id === track.id)
        ? state.libraryTracks
        : [...state.libraryTracks, track],
    })),
  setMixer: (patch) => set((state) => ({ mixer: { ...state.mixer, ...patch } })),
  setController: (patch) =>
    set((state) => ({ controller: { ...state.controller, ...patch } })),
}));
