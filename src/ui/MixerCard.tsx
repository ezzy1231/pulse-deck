import { useCallback, useEffect, useRef } from 'react';
import { bus } from '../actions/bus';
import { getEngine } from '../audio/engine';
import { useAppStore } from '../state/store';
import type { Band, DeckId } from '../types';
import { formatDb } from './format';
import { HSlider } from './HSlider';
import { Knob } from './Knob';
import { MeterColumn } from './MeterColumn';
import { VerticalFader } from './VerticalFader';

const EQ_LAYOUT: Array<{ deck: DeckId; band: Band; label: string }> = [
  { deck: 'A', band: 'hi', label: 'A · HI' },
  { deck: 'B', band: 'hi', label: 'B · HI' },
  { deck: 'A', band: 'mid', label: 'A · MID' },
  { deck: 'B', band: 'mid', label: 'B · MID' },
  { deck: 'A', band: 'low', label: 'A · LOW' },
  { deck: 'B', band: 'low', label: 'B · LOW' },
];

function MasterReadout() {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = '';
    const draw = () => {
      const db = getEngine()?.readMasterDb() ?? -Infinity;
      const text = formatDb(db);
      if (text !== last && ref.current) {
        ref.current.textContent = text;
        last = text;
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return <span ref={ref} className="master-db">−∞ dB</span>;
}

export function MixerCard() {
  const mixer = useAppStore((state) => state.mixer);
  const deckA = useAppStore((state) => state.decks.A);
  const deckB = useAppStore((state) => state.decks.B);
  const readLevelA = useCallback(() => getEngine()?.decks.A.readLevel() ?? 0, []);
  const readLevelB = useCallback(() => getEngine()?.decks.B.readLevel() ?? 0, []);

  return (
    <section className="card mixer" aria-label="Mixer">
      <div className="mixer-title">MIXER</div>

      <div className="eq-grid">
        {EQ_LAYOUT.map(({ deck, band, label }) => {
          const deckState = deck === 'A' ? deckA : deckB;
          const color = deck === 'A' ? '#4da3ff' : '#ff6b57';
          return (
            <Knob
              key={label}
              label={label}
              color={color}
              value={deckState.eq[band]}
              onChange={(value) => bus.emit('deck.eq.set', { deck, band, value })}
            />
          );
        })}
      </div>

      <div className="fader-row">
        <VerticalFader
          value={deckA.fader}
          accent="#4da3ff"
          hint="L2 · A"
          onChange={(value) => bus.emit('deck.volume.set', { deck: 'A', value })}
        />
        <div className="meter-pair">
          <MeterColumn read={readLevelA} />
          <MeterColumn read={readLevelB} />
        </div>
        <VerticalFader
          value={deckB.fader}
          accent="#ff6b57"
          hint="R2 · B"
          onChange={(value) => bus.emit('deck.volume.set', { deck: 'B', value })}
        />
      </div>

      <div className="xfade-block">
        <div className="xfade-row">
          <b style={{ color: '#4da3ff' }}>A</b>
          <span className="xfade-title">CROSSFADER</span>
          <b style={{ color: '#ff6b57' }}>B</b>
        </div>
        <HSlider
          variant="cross"
          value={mixer.crossfader}
          onChange={(value) => bus.emit('crossfader.set', { value })}
        />
        <div className="xfade-hint">Create + left stick X</div>
      </div>

      <div className="master-row">
        <span className="master-label">MASTER</span>
        <MasterReadout />
      </div>
    </section>
  );
}
