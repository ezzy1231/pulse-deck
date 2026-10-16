import { useState } from 'react';
import { useAppStore } from '../state/store';
import { initAudioEngine } from '../wire';

export function StartScreen() {
  const startAudio = useAppStore((state) => state.startAudio);
  const [starting, setStarting] = useState(false);

  const handleStart = async () => {
    setStarting(true);
    const engine = initAudioEngine();
    await engine.resume();
    startAudio();
  };

  return (
    <div className="start-screen">
      <div className="start-brand">PULSE DECK</div>
      <p className="start-tag">Two-deck mixing played entirely on a PS5 DualSense</p>
      <button className="start-btn" onClick={handleStart} disabled={starting}>
        START
      </button>
      <p className="start-note">
        Browsers only start audio after a click. Chrome or Edge recommended. Load local mp3,
        wav or flac files.
      </p>
    </div>
  );
}
