import { useEffect, useState } from 'react';
import { bus } from '../actions/bus';
import { getEngine } from '../audio/engine';
import { getProfile, subscribeProfile } from '../controllers/profile';
import { useAppStore } from '../state/store';
import { ControllerCard, useGamepadName } from './ControllerCard';
import { DeckCard } from './DeckCard';
import { LibraryCard } from './LibraryCard';
import { MixerCard } from './MixerCard';
import { SettingsModal } from './SettingsModal';
import { StartScreen } from './StartScreen';
import { WaveformCard } from './WaveformCard';
import { useKeyboardControls } from './useKeyboardControls';

function ControllerPill() {
  const name = useGamepadName();
  return (
    <span className="pill">
      <span className="dot" style={{ background: name ? 'var(--good)' : 'var(--muted)' }} />
      {name ? name.split('(')[0].trim() : 'No controller · Gamepad link in M2'}
    </span>
  );
}

function LatencyPill() {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const update = () => setMs(getEngine()?.getLatencyMs() ?? 0);
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <span className="pill">Latency {ms} ms</span>;
}

function ProfilePill() {
  const [, force] = useState(0);
  const open = useAppStore((state) => state.settingsOpen);
  useEffect(() => subscribeProfile(() => force((value) => value + 1)), []);
  return (
    <button
      className={`btn-pill${open ? ' on' : ''}`}
      title="Open settings & controller mapping editor · S key"
      onClick={() => {
        const state = useAppStore.getState();
        state.toggleSettings();
        if (!state.settingsOpen) bus.emit('settings.open', {});
      }}
    >
      Profile: {getProfile().name}
    </button>
  );
}

export default function App() {
  const audioStarted = useAppStore((state) => state.audioStarted);
  useKeyboardControls(audioStarted);

  if (!audioStarted) {
    return <StartScreen />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand-wrap">
          <span className="brand">PULSE DECK</span>
          <span className="brand-sub">audio core M1</span>
        </div>
        <div className="header-pills">
          <ControllerPill />
          <LatencyPill />
          <ProfilePill />
        </div>
      </header>

      <section aria-label="Waveforms" className="wave-stack">
        <WaveformCard deckId="A" />
        <WaveformCard deckId="B" />
      </section>

      <main className="main-row">
        <DeckCard deckId="A" />
        <MixerCard />
        <DeckCard deckId="B" />
      </main>

      <div className="bottom-row">
        <LibraryCard />
        <ControllerCard />
      </div>

      <footer className="footnote">
        Keyboard: Q cue A · W play A · O cue B · P play B · B browse (↑/↓ move · ←/→ target ·
        Enter load · Esc close) · S settings — Controller: ↓/✕ play · ←/○ cue · L1/R1 + pad hot
        cues · L2/R2 faders · sticks filter · Create + LX crossfader · Options library · PS panic —
        waveform click scrubs · sliders double-click to recenter
      </footer>

      <SettingsModal />
    </div>
  );
}
