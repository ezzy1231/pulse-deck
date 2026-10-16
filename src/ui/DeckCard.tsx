import { useEffect, useRef } from 'react';
import type { ChangeEvent, CSSProperties, MouseEvent } from 'react';
import { bus } from '../actions/bus';
import { getEngine } from '../audio/engine';
import { getJogRotation } from '../controllers/sensors';
import { useAppStore } from '../state/store';
import type { DeckId } from '../types';
import { filterLabel, formatPitch, formatTime } from './format';
import { HSlider } from './HSlider';

const CUE_PALETTE = ['#ffb347', '#3ddc97', '#b58cff', '#ff7eb6'];
const TRANSPORT_GLYPHS: Record<DeckId, string[]> = {
  A: ['↓', '←', '→', '↑'],
  B: ['✕', '○', '□', '△'],
};

interface DeckCardProps {
  deckId: DeckId;
}

export function DeckCard({ deckId }: DeckCardProps) {
  const deck = useAppStore((state) => state.decks[deckId]);
  const fileRef = useRef<HTMLInputElement>(null);
  const jogRef = useRef<HTMLDivElement>(null);
  const accent = deckId === 'A' ? 'var(--accent-a)' : 'var(--accent-b)';
  const accentHex = deckId === 'A' ? '#4da3ff' : '#ff6b57';
  const glyphs = TRANSPORT_GLYPHS[deckId];
  const stickHint = deckId === 'A' ? 'left stick X' : 'right stick X';

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const engine = getEngine();
      if (engine && jogRef.current) {
        const state = useAppStore.getState().decks[deckId];
        let rot = getJogRotation(deckId);
        if (state.playing && !state.jog.touching) {
          rot += (engine.decks[deckId].getPosition() * 200) % 360;
        }
        jogRef.current.style.transform = `rotate(${rot}deg)`;
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [deckId]);

  const handleFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) bus.emit('deck.load', { deck: deckId, file });
    event.target.value = '';
  };

  const clickCue = (index: number, event: MouseEvent<HTMLButtonElement>) => {
    if (event.shiftKey) {
      bus.emit('deck.hotcue.clear', { deck: deckId, index });
      return;
    }
    if (deck.hotCues[index].posSec === null) {
      bus.emit('deck.hotcue.set', { deck: deckId, index });
    } else {
      bus.emit('deck.hotcue.jump', { deck: deckId, index });
    }
  };

  return (
    <section
      className={`deck deck-${deckId}${deck.active ? ' active' : ''}`}
      style={{ '--accent': accent } as CSSProperties}
      onClick={() => bus.emit('deck.activate', { deck: deckId })}
      title="Click to make active · library loads here"
    >
      <div className="deck-identity">
        <div className="deck-badge">{deckId}</div>
        <div className="deck-meta">
          <div className="deck-title">{deck.title || 'No track loaded'}</div>
          <div className="deck-artist">{deck.artist || 'Load a local file to begin'}</div>
        </div>
        <div className="key-chip">{deck.key || '--'}</div>
        <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
          LOAD
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden onChange={handleFile} />
      </div>

      <div className="deck-stats">
        <div className="stat">
          <div className="stat-label">BPM</div>
          <div className="stat-bpm">{deck.bpm > 0 ? deck.bpm.toFixed(1) : '--'}</div>
        </div>
        <div className="stat">
          <div className="stat-label">ELAPSED</div>
          <div className="stat-value">{formatTime(deck.elapsedSec)}</div>
        </div>
        <div
          className="stat stat-reset"
          title="Double-click to reset to 0.0%"
          onDoubleClick={() => bus.emit('deck.pitch.reset', { deck: deckId })}
        >
          <div className="stat-label">PITCH</div>
          <div className="stat-value">{formatPitch(deck.pitchPct)}</div>
        </div>
        <button
          className={`stat stat-key${deck.keyLock ? ' on' : ''}`}
          title="Key lock · tempo change without pitch shift (SoundTouch)"
          onClick={() => bus.emit('deck.keylock.toggle', { deck: deckId })}
        >
          <div className="stat-label">KEY LOCK</div>
          <div className="stat-value">{deck.keyLock ? 'ON' : 'OFF'}</div>
        </button>
      </div>

      <div className="deck-mid">
        <div className={`deck-jog${deck.jog.touching ? ' touching' : ''}`}>
          <div className="jog-ring" />
          <div ref={jogRef} className="jog-needle" />
          <div className="jog-info">
            <span className="jog-title">TOUCHPAD</span>
            <span className="jog-line">{deck.jog.half} half</span>
            <span
              className={`jog-line jog-mode${deck.jog.mode === 'scratch' ? ' scratch' : ''}`}
            >
              {deck.jog.mode.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="cue-wrap">
          <div className="cue-grid">
            {deck.hotCues.map((cue, index) => {
              const color = CUE_PALETTE[index];
              const set = cue.posSec !== null;
              return (
                <button
                  key={cue.label}
                  className="btn-cue"
                  style={{
                    background: set ? `${color}26` : '#1d222b',
                    borderColor: set ? `${color}88` : 'var(--line-2)',
                    color: set ? color : 'var(--text)',
                  }}
                  onClick={(event) => clickCue(index, event)}
                >
                  <span className="btn-cue-label">{cue.label}</span>
                  <span className="btn-cue-hint">{deckId === 'A' ? 'L1' : 'R1'} + {glyphs[index]}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="transport-grid">
        <button
          className="btn-transport"
          onPointerDown={() => bus.emit('deck.cue.down', { deck: deckId })}
          onPointerUp={() => bus.emit('deck.cue.up', { deck: deckId })}
          onPointerLeave={() => bus.emit('deck.cue.up', { deck: deckId })}
          onClick={(event) => event.stopPropagation()}
        >
          <span className="btn-transport-label">CUE</span>
          <span className="btn-hint">{glyphs[1]}</span>
        </button>
        <button
          className={`btn-transport${deck.playing ? ' on' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            bus.emit(deck.playing ? 'deck.pause' : 'deck.play', { deck: deckId });
          }}
        >
          <span className="btn-transport-label">PLAY</span>
          <span className="btn-hint">{glyphs[0]}</span>
        </button>
        <button
          className={`btn-transport${deck.sync ? ' on' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            bus.emit('deck.sync', { deck: deckId });
          }}
        >
          <span className="btn-transport-label">SYNC</span>
          <span className="btn-hint">{glyphs[2]}</span>
        </button>
        <button
          className={`btn-transport${deck.loop.on ? ' on' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            bus.emit('deck.loop.toggle', { deck: deckId });
          }}
        >
          <span className="btn-transport-label">
            {deck.loop.on ? `LOOP ${deck.loop.beats}` : 'LOOP'}
          </span>
          <span className="btn-hint">{glyphs[3]}</span>
        </button>
      </div>

      <div className="filter-block">
        <div className="filter-head">
          <span>FILTER · {filterLabel(deck.filter)}</span>
          <span>{stickHint}</span>
        </div>
        <HSlider
          variant="filter"
          value={deck.filter / 100}
          accent={accentHex}
          onChange={(v) =>
            bus.emit('deck.filter.set', { deck: deckId, value: Math.round(v * 100) })
          }
        />
      </div>
    </section>
  );
}
