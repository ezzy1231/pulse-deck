import { bus } from './actions/bus';
import { fileToTrackId, TEMPO_LIMIT_PCT } from './audio/deck';
import { AudioEngine, getEngine, setEngine } from './audio/engine';
import { getDualSense } from './controllers/dualsense';
import { startFeedback } from './controllers/feedback';
import { startGamepad } from './controllers/gamepad';
import { startSensors } from './controllers/sensors';
import { useAppStore } from './state/store';

const filePool = new Map<string, File>();
const cueHold: Record<'A' | 'B', boolean> = { A: false, B: false };
const cueMark: Record<'A' | 'B', number> = { A: -1, B: -1 };
const syncK: Record<'A' | 'B', number> = { A: 1, B: 1 };
const lastBeat: Record<'A' | 'B', number> = { A: -1, B: -1 };
const endingSent: Record<'A' | 'B', boolean> = { A: false, B: false };
let lastClipAt = 0;

function startTicker(): void {
  window.setInterval(() => {
    const active = getEngine();
    if (!active) return;
    const state = useAppStore.getState();
    (['A', 'B'] as const).forEach((id) => {
      const position = active.decks[id].getPosition();
      if (Math.abs(position - state.decks[id].elapsedSec) > 0.2) {
        state.setDeck(id, { elapsedSec: position });
      }
    });
  }, 250);
}

function startSyncLoop(): void {
  window.setInterval(() => {
    const active = getEngine();
    if (!active) return;
    const state = useAppStore.getState();
    (['A', 'B'] as const).forEach((deck) => {
      if (!state.decks[deck].sync) return;
      const other = deck === 'A' ? 'B' : 'A';
      const self = active.decks[deck];
      const target = active.decks[other];
      const selfBpm = self.getBpm();
      const targetBpm = target.getBpm();
      if (selfBpm <= 0 || targetBpm <= 0) return;
      const selfBeat = 60 / selfBpm;
      const targetPeriod = 60 / targetBpm / syncK[deck];
      const selfPhase = (self.getPosition() % selfBeat) / selfBeat;
      const targetPhase = (target.getPosition() % targetPeriod) / targetPeriod;
      let error = selfPhase - targetPhase;
      if (error > 0.5) error -= 1;
      if (error < -0.5) error += 1;
      self.setSyncBend(Math.max(-1, Math.min(1, (-error * selfBeat) / 0.054)));
    });
  }, 50);
}

function startFeedbackLoop(): void {
  window.setInterval(() => {
    const active = getEngine();
    if (!active) return;
    const state = useAppStore.getState();
    (['A', 'B'] as const).forEach((deck) => {
      const d = state.decks[deck];
      if (d.playing && d.bpm > 0) {
        const index = Math.floor(active.decks[deck].getPosition() / (60 / d.bpm));
        if (index !== lastBeat[deck]) {
          lastBeat[deck] = index;
          bus.emit('feedback.beat', { deck, isBar: index % 4 === 0 });
        }
      } else {
        lastBeat[deck] = -1;
      }
      const endingNow = d.playing && d.durationSec > 0 && d.durationSec - d.elapsedSec < 30;
      if (endingNow && !endingSent[deck]) {
        endingSent[deck] = true;
        bus.emit('feedback.trackEnding', { deck });
      } else if (!endingNow && endingSent[deck]) {
        endingSent[deck] = false;
      }
    });
    const db = active.readMasterDb();
    bus.emit('feedback.meter', {
      level: db > -60 ? Math.min(1, Math.pow(10, db / 20)) : 0,
    });
    const now = performance.now();
    if (db > -0.3 && now - lastClipAt > 600) {
      lastClipAt = now;
      bus.emit('feedback.clipping', {});
    }
  }, 50);
}

export function initAudioEngine(): AudioEngine {
  const existing = getEngine();
  if (existing) return existing;
  const engine = new AudioEngine({
    onPlayingChange: (deckId, playing) =>
      useAppStore.getState().setDeck(deckId, { playing }),
    onTrackLoaded: (deckId, info) =>
      useAppStore.getState().registerTrackLoad(deckId, {
        id: info.id,
        title: info.title,
        artist: info.artist,
        durationSec: info.durationSec,
        peaks: info.peaks,
      }),
    onCuePointChanged: (deckId, sec) => {
      const state = useAppStore.getState();
      state.setDeck(deckId, {
        hotCues: state.decks[deckId].hotCues.map((cue, i) =>
          i === 0 ? { ...cue, posSec: sec } : cue,
        ),
      });
    },
    onBpmDetected: (deckId, bpm) =>
      useAppStore.getState().setDeck(deckId, { bpm }),
  });
  setEngine(engine);

  bus.on('deck.play', ({ deck }) => {
    if (!engine.decks[deck].isPlaying) engine.decks[deck].togglePlay();
  });
  bus.on('deck.pause', ({ deck }) => {
    const target = engine.decks[deck];
    if (!target.isPlaying) return;
    if (target.isCueHeld) {
      target.togglePlay();
      return;
    }
    if (cueHold[deck] || performance.now() - cueMark[deck] < 500) return;
    target.togglePlay();
  });
  bus.on('deck.cue.down', ({ deck }) => {
    engine.decks[deck].cueDown();
    cueHold[deck] = true;
    cueMark[deck] = performance.now();
    bus.emit('feedback.cueshort', { deck });
  });
  bus.on('deck.cue.up', ({ deck }) => {
    engine.decks[deck].cueUp();
    cueHold[deck] = false;
    cueMark[deck] = performance.now();
  });
  bus.on('deck.seek', ({ deck, sec }) => engine.decks[deck].seek(sec));
  bus.on('deck.load', ({ deck, file }) => {
    filePool.set(fileToTrackId(file), file);
    engine.decks[deck]
      .loadFile(file)
      .catch((error) => console.error('Failed to load track:', error));
  });
  bus.on('library.load', ({ deck, trackId }) => {
    const file = filePool.get(trackId);
    if (!file) return;
    engine.decks[deck]
      .loadFile(file)
      .catch((error) => console.error('Failed to load track:', error));
  });
  bus.on('deck.volume.set', ({ deck, value }) => {
    engine.decks[deck].setFader(value);
    useAppStore.getState().setDeck(deck, { fader: value });
  });
  bus.on('deck.eq.set', ({ deck, band, value }) => {
    engine.decks[deck].setEq(band, value);
    const state = useAppStore.getState();
    state.setDeck(deck, { eq: { ...state.decks[deck].eq, [band]: value } });
  });
  bus.on('deck.filter.set', ({ deck, value }) => {
    engine.decks[deck].setFilter(value);
    useAppStore.getState().setDeck(deck, { filter: value });
  });
  bus.on('deck.hotcue.set', ({ deck, index }) => {
    const state = useAppStore.getState();
    if (state.decks[deck].trackId === null) return;
    const position = engine.decks[deck].getPosition();
    state.setDeck(deck, {
      hotCues: state.decks[deck].hotCues.map((cue, i) =>
        i === index ? { ...cue, posSec: position } : cue,
      ),
    });
    if (index === 0) engine.decks[deck].setCuePoint(position);
  });
  bus.on('deck.hotcue.jump', ({ deck, index }) => {
    const posSec = useAppStore.getState().decks[deck].hotCues[index]?.posSec ?? null;
    if (posSec !== null) engine.decks[deck].seek(posSec);
  });
  bus.on('deck.hotcue.clear', ({ deck, index }) => {
    const state = useAppStore.getState();
    state.setDeck(deck, {
      hotCues: state.decks[deck].hotCues.map((cue, i) =>
        i === index ? { posSec: null, label: cue.label } : cue,
      ),
    });
    if (index === 0) engine.decks[deck].setCuePoint(0);
  });
  bus.on('deck.sync', ({ deck }) => {
    const state = useAppStore.getState();
    const selfDeck = engine.decks[deck];
    if (state.decks[deck].sync) {
      selfDeck.setSyncBend(0);
      selfDeck.setTempo(0);
      syncK[deck] = 1;
      state.setDeck(deck, { sync: false, pitchPct: 0 });
      return;
    }
    const other = deck === 'A' ? 'B' : 'A';
    const selfBpm = selfDeck.getBpm();
    const targetBpm = engine.decks[other].getBpm();
    if (selfBpm <= 0 || targetBpm <= 0) return;
    let bestK = 0;
    let bestPct = 0;
    for (const k of [0.5, 1, 2]) {
      const pct = ((targetBpm * k) / selfBpm - 1) * 100;
      if (Math.abs(pct) > TEMPO_LIMIT_PCT) continue;
      if (bestK === 0 || Math.abs(pct) < Math.abs(bestPct)) {
        bestK = k;
        bestPct = pct;
      }
    }
    if (bestK === 0) return;
    syncK[deck] = bestK;
    selfDeck.setTempo(bestPct, true);
    state.setDeck(deck, { sync: true, pitchPct: bestPct });
  });
  bus.on('deck.loop.toggle', ({ deck }) => {
    const state = useAppStore.getState();
    if (state.decks[deck].trackId === null) return;
    const on = !state.decks[deck].loop.on;
    engine.decks[deck].setLoop(on);
    state.setDeck(deck, { loop: { on, beats: 4 } });
  });
  bus.on('deck.pitch.set', ({ deck, value }) => {
    engine.decks[deck].setSyncBend(0);
    engine.decks[deck].setTempo(value);
    useAppStore.getState().setDeck(deck, { pitchPct: value, sync: false });
  });
  bus.on('deck.pitch.bend', ({ deck, value }) => {
    engine.decks[deck].setBend(value);
  });
  bus.on('deck.pitch.reset', ({ deck }) => {
    engine.decks[deck].setSyncBend(0);
    engine.decks[deck].setTempo(0);
    useAppStore.getState().setDeck(deck, { sync: false, pitchPct: 0 });
  });
  bus.on('deck.activate', ({ deck }) => useAppStore.getState().setActiveDeck(deck));
  bus.on('deck.jog.begin', ({ deck }) => {
    if (useAppStore.getState().decks[deck].jog.mode === 'scratch') {
      engine.decks[deck].scratchStart();
    }
  });
  bus.on('deck.jog.velocity', ({ deck, value, dt }) => {
    const mode = useAppStore.getState().decks[deck].jog.mode;
    if (mode === 'scratch') {
      engine.decks[deck].scratchMove(value, dt);
    } else {
      engine.decks[deck].setBend(Math.max(-1, Math.min(1, value)));
    }
  });
  bus.on('deck.jog.end', ({ deck }) => {
    const mode = useAppStore.getState().decks[deck].jog.mode;
    if (mode === 'scratch') {
      engine.decks[deck].scratchEnd();
    } else {
      engine.decks[deck].setBend(0);
    }
  });
  bus.on('deck.jog.mode.toggle', ({ deck }) => {
    const state = useAppStore.getState();
    const jog = state.decks[deck].jog;
    if (jog.touching) return;
    state.setDeck(deck, {
      jog: { ...jog, mode: jog.mode === 'scratch' ? 'nudge' : 'scratch' },
    });
  });
  bus.on('deck.fx.echo.set', ({ deck, value }) => engine.decks[deck].setEcho(value));
  bus.on('deck.fx.reverb.set', ({ deck, value }) => engine.decks[deck].setReverb(value));
  bus.on('crossfader.set', ({ value }) => {
    engine.setCrossfader(value);
    useAppStore.getState().setMixer({ crossfader: value });
  });
  bus.on('master.set', ({ value }) => {
    engine.setMaster(value);
    useAppStore.getState().setMixer({ masterGain: value });
  });
  bus.on('panic', () => {
    engine.panic();
    useAppStore.getState().setMixer({ masterGain: 0 });
  });
  bus.on('deck.keylock.toggle', ({ deck }) => {
    const state = useAppStore.getState();
    const next = !state.decks[deck].keyLock;
    engine.decks[deck].setKeyLock(next);
    state.setDeck(deck, { keyLock: next });
  });
  startGamepad();
  startTicker();
  startSyncLoop();
  startFeedbackLoop();
  startFeedback();
  startSensors();
  void getDualSense().reconnect();
  return engine;
}
