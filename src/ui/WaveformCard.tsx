import { useEffect, useMemo, useRef } from 'react';
import { bus } from '../actions/bus';
import { getEngine } from '../audio/engine';
import { useAppStore } from '../state/store';
import type { DeckId } from '../types';
import { formatTime } from './format';

const WAVE_W = 1000;
const WAVE_H = 80;
const WAVE_SPAN = 160;

const CUE_TAB_COLORS = ['#ffb347', '#3ddc97', '#b58cff', '#ff7eb6'];

interface WaveformCardProps {
  deckId: DeckId;
}

export function WaveformCard({ deckId }: WaveformCardProps) {
  const deck = useAppStore((state) => state.decks[deckId]);
  const accent = deckId === 'A' ? '#4da3ff' : '#ff6b57';
  const svgRef = useRef<SVGSVGElement>(null);
  const clipRef = useRef<SVGRectElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const remainRef = useRef<HTMLSpanElement>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const wave = useMemo(() => {
    const peaks = deck.peaks;
    if (!peaks || peaks.length === 0) return '';
    const span = Math.max(1, peaks.length - 1);
    let top = 'M0 40 ';
    let bottom = 'M0 40 ';
    for (let i = 0; i < peaks.length; i++) {
      const x = (i / span) * WAVE_W;
      const amp = Math.max(2, peaks[i] * 34);
      top += `L${x.toFixed(1)} ${(40 - amp).toFixed(1)} `;
      bottom += `L${x.toFixed(1)} ${(40 + amp).toFixed(1)} `;
    }
    top += `L${WAVE_W} 40 Z`;
    bottom += `L${WAVE_W} 40 Z`;
    return `${top} ${bottom}`;
  }, [deck.peaks]);

  const grid = useMemo(() => {
    if (deck.bpm <= 0 || deck.durationSec <= 0) return '';
    const beat = 60 / deck.bpm;
    let path = '';
    for (let t = 0, i = 0; t < deck.durationSec && i < 4000; t += beat, i++) {
      const x = (t / deck.durationSec) * WAVE_W;
      path += `M${x.toFixed(1)} 0 V${WAVE_H} `;
    }
    return path;
  }, [deck.bpm, deck.durationSec]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const engine = getEngine();
      if (engine) {
        const state = useAppStore.getState().decks[deckId];
        const position = engine.decks[deckId].getPosition();
        const fraction =
          state.durationSec > 0 ? Math.min(1, position / state.durationSec) : 0;
        const center = fraction * WAVE_W;
        const originX = center - WAVE_SPAN / 2;
        if (svgRef.current) {
          svgRef.current.setAttribute(
            'viewBox',
            state.durationSec > 0
              ? `${originX.toFixed(1)} 0 ${WAVE_SPAN} ${WAVE_H}`
              : `0 0 ${WAVE_W} ${WAVE_H}`,
          );
        }
        if (clipRef.current) {
          clipRef.current.setAttribute('width', Math.max(0, center).toFixed(1));
        }
        state.hotCues.forEach((cue, index) => {
          const tab = tabRefs.current[index];
          if (!tab) return;
          if (cue.posSec === null || state.durationSec <= 0) {
            tab.style.display = 'none';
            return;
          }
          const cueX = (cue.posSec / state.durationSec) * WAVE_W;
          const percent = ((cueX - originX) / WAVE_SPAN) * 100;
          if (percent < -10 || percent > 110) {
            tab.style.display = 'none';
            return;
          }
          tab.style.display = 'block';
          tab.style.left = `${percent}%`;
        });
        if (remainRef.current) {
          const remain = Math.max(0, state.durationSec - position);
          remainRef.current.textContent = `−${formatTime(remain)}`;
          remainRef.current.style.color = remain > 0 && remain < 30 ? 'var(--meter-amber)' : '';
        }
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [deckId]);

  const handleScrub = (clientX: number) => {
    const rect = zoneRef.current?.getBoundingClientRect();
    if (!rect || deck.durationSec <= 0) return;
    const engine = getEngine();
    const position = engine ? engine.decks[deckId].getPosition() : 0;
    const originX = (position / deck.durationSec) * WAVE_W - WAVE_SPAN / 2;
    const fraction = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const sec = ((originX + fraction * WAVE_SPAN) / WAVE_W) * deck.durationSec;
    bus.emit('deck.seek', {
      deck: deckId,
      sec: Math.min(deck.durationSec, Math.max(0, sec)),
    });
  };

  return (
    <div className="wave-card">
      <div className="wave-top">
        <span>
          <b style={{ color: accent }}>DECK {deckId}</b> · {deck.title || 'no track'} —{' '}
          {deck.artist || '—'}
        </span>
        <span>
          <span ref={remainRef}>−00:00</span> · {deck.bpm > 0 ? `${deck.bpm.toFixed(1)} BPM` : '-- BPM'}
        </span>
      </div>
      <div
        ref={zoneRef}
        className="wave-zone"
        onPointerDown={(event) => handleScrub(event.clientX)}
      >
        <svg
          ref={svgRef}
          className="wave-svg"
          viewBox={`0 0 ${WAVE_W} ${WAVE_H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Waveform of deck ${deckId}`}
        >
          <path
            d={`M0 40 H${WAVE_W}`}
            stroke="#ffffff"
            strokeOpacity="0.08"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            fill="none"
          />
          {grid && (
            <path
              d={grid}
              stroke="#ffffff"
              strokeOpacity="0.16"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
          )}
          {wave ? (
            <>
              <defs>
                <clipPath id={`wave-clip-${deckId}`}>
                  <rect ref={clipRef} x="0" y="0" width="0" height={WAVE_H} />
                </clipPath>
              </defs>
              <path d={wave} fill="#3a4455" />
              <path d={wave} fill={accent} clipPath={`url(#wave-clip-${deckId})`} />
            </>
          ) : (
            <path
              d="M0 40 H1000"
              stroke="#3a4455"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
          )}
        </svg>
        <div className="wave-head" />
        {deck.hotCues.map((cue, index) => (
          <button
            key={cue.label}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            className="wave-cue-tab"
            style={{ display: 'none', background: CUE_TAB_COLORS[index] }}
            onClick={(event) => {
              event.stopPropagation();
              bus.emit('deck.hotcue.jump', { deck: deckId, index });
            }}
          >
            {index + 1}
          </button>
        ))}
      </div>
    </div>
  );
}
