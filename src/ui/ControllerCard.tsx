import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { getDualSense } from '../controllers/dualsense';
import { useAppStore } from '../state/store';

export function useGamepadName(): string | null {
  const [name, setName] = useState<string | null>(null);

  useEffect(() => {
    const refresh = () => {
      const pads = navigator.getGamepads();
      let found: string | null = null;
      for (const pad of pads) {
        if (pad) {
          found = pad.id;
          break;
        }
      }
      setName(found);
    };
    refresh();
    window.addEventListener('gamepadconnected', refresh);
    window.addEventListener('gamepaddisconnected', refresh);
    return () => {
      window.removeEventListener('gamepadconnected', refresh);
      window.removeEventListener('gamepaddisconnected', refresh);
    };
  }, []);

  return name;
}

function firstPad(): Gamepad | null {
  const pads = navigator.getGamepads();
  for (const pad of pads) if (pad) return pad;
  return null;
}

interface PadDef {
  label: string;
  btn: number;
  pos: { left: number; top: number };
  round: boolean;
  accent: string | null;
}

const DPAD: PadDef[] = [
  { label: '↑', btn: 12, pos: { left: 22, top: 0 }, round: false, accent: null },
  { label: '←', btn: 14, pos: { left: 0, top: 22 }, round: false, accent: null },
  { label: '→', btn: 15, pos: { left: 44, top: 22 }, round: false, accent: null },
  { label: '↓', btn: 13, pos: { left: 22, top: 44 }, round: false, accent: '#4da3ff' },
];

const FACE: PadDef[] = [
  { label: '△', btn: 3, pos: { left: 22, top: 0 }, round: true, accent: null },
  { label: '□', btn: 2, pos: { left: 0, top: 22 }, round: true, accent: null },
  { label: '○', btn: 1, pos: { left: 44, top: 22 }, round: true, accent: null },
  { label: '✕', btn: 0, pos: { left: 22, top: 44 }, round: true, accent: '#ff6b57' },
];

function PadButton({ def }: { def: PadDef }) {
  const style: CSSProperties = {
    left: def.pos.left,
    top: def.pos.top,
    borderRadius: def.round ? '50%' : 4,
    background: def.accent ?? 'var(--line)',
    color: def.accent ? '#0e1014' : 'var(--muted)',
  };
  return (
    <span className="pad-btn" data-pad-btn={def.btn} style={style}>
      {def.label}
    </span>
  );
}

export function ControllerCard() {
  const name = useGamepadName();
  const hidConnected = useAppStore((state) => state.controller.connected);
  const transport = useAppStore((state) => state.controller.transport);
  const reportHz = useAppStore((state) => state.controller.reportHz);
  const lightbar = useAppStore((state) => state.controller.lightbar);
  const haptics = useAppStore((state) => state.controller.haptics);
  const bpmA = useAppStore((state) => state.decks.A.bpm);
  const bpmB = useAppStore((state) => state.decks.B.bpm);
  const playingA = useAppStore((state) => state.decks.A.playing);
  const playingB = useAppStore((state) => state.decks.B.playing);
  const pulseBpm = Math.round(Math.max(playingA ? bpmA : 0, playingB ? bpmB : 0));
  const boxRef = useRef<HTMLDivElement>(null);
  const gyroMainRef = useRef<HTMLSpanElement>(null);
  const gyroSubRef = useRef<HTMLSpanElement>(null);
  const hexRef = useRef<HTMLPreElement>(null);
  const lastHexAt = useRef(0);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      const box = boxRef.current;
      if (box) {
        const pad = firstPad();
        const fills = box.querySelectorAll<HTMLElement>('.trigger-fill');
        if (fills[0]) {
          fills[0].style.height = `${((pad?.buttons[6]?.value ?? 0) * 100).toFixed(0)}%`;
        }
        if (fills[1]) {
          fills[1].style.height = `${((pad?.buttons[7]?.value ?? 0) * 100).toFixed(0)}%`;
        }
        box.querySelectorAll<HTMLElement>('[data-pad-btn]').forEach((el) => {
          const index = Number(el.dataset.padBtn);
          el.classList.toggle('pressed', pad?.buttons[index]?.pressed === true);
        });
        const dots = box.querySelectorAll<HTMLElement>('.stick-dot');
        if (dots[0]) {
          dots[0].style.transform = `translate(${((pad?.axes[0] ?? 0) * 7).toFixed(1)}px, ${((pad?.axes[1] ?? 0) * 7).toFixed(1)}px)`;
        }
        if (dots[1]) {
          dots[1].style.transform = `translate(${((pad?.axes[2] ?? 0) * 7).toFixed(1)}px, ${((pad?.axes[3] ?? 0) * 7).toFixed(1)}px)`;
        }
        const hid = getDualSense();
        const snapshot = hid.snapshot;
        const touchDots = box.querySelectorAll<HTMLElement>('[data-touch]');
        const points = [snapshot.touch.f1, snapshot.touch.f2];
        touchDots.forEach((el, index) => {
          const point = points[index];
          if (point.active) {
            el.style.display = 'block';
            el.style.left = `${((point.x / 1920) * 126).toFixed(1)}px`;
            el.style.top = `${((point.y / 1080) * 50).toFixed(1)}px`;
            el.style.background = point.x < 960 ? '#4da3ff' : '#ff6b57';
          } else {
            el.style.display = 'none';
          }
        });
        if (gyroMainRef.current) {
          gyroMainRef.current.textContent = snapshot.connected
            ? `pitch ${snapshot.gyro.pitchDeg >= 0 ? '+' : ''}${Math.round(snapshot.gyro.pitchDeg)}° · roll ${snapshot.gyro.rollDeg >= 0 ? '+' : ''}${Math.round(snapshot.gyro.rollDeg)}°`
            : '--';
        }
        if (gyroSubRef.current) {
          const echo = Math.min(1, Math.max(0, snapshot.gyro.pitchDeg / 35));
          gyroSubRef.current.textContent = snapshot.gyro.active
            ? `echo ${Math.round(echo * 100)}% · L3→A · R3→B`
            : 'hold L3 (A) / R3 (B)';
        }
        const now = performance.now();
        if (hexRef.current && now - lastHexAt.current > 150) {
          lastHexAt.current = now;
          hexRef.current.textContent = hid.getHexLog();
        }
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  return (
    <section className="card controller" aria-label="Controller">
      <div className="card-head">
        <div className="card-title">CONTROLLER · LIVE</div>
        <div className="controller-head-right">
          {navigator.hid && !hidConnected && (
            <button
              className="btn-ghost"
              title="Close Steam/DS4Windows first · Chrome or Edge · USB cable"
              onClick={() => void getDualSense().requestConnect()}
            >
              CONNECT HID
            </button>
          )}
          <div className="controller-status">
            <span
              className="dot"
              style={{ background: hidConnected || name ? 'var(--good)' : 'var(--muted)' }}
            />
            {hidConnected
              ? `WebHID ${transport.toUpperCase()} · ${reportHz} Hz`
              : name
                ? name.split('(')[0].trim() || 'connected'
                : 'idle'}
          </div>
        </div>
      </div>

      <div className="pads-box" role="img" aria-label="DualSense layout, live">
        <div className="trigger trigger-l">
          <div className="trigger-fill" style={{ background: '#4da3ff' }} />
        </div>
        <div className="trigger trigger-r">
          <div className="trigger-fill" style={{ background: '#ff6b57' }} />
        </div>
        <div className="pad-box">
          <div className="pad-divider" />
          <span
            className="pad-dot"
            data-touch="1"
            style={{ display: 'none', left: 30, top: 30, background: '#4da3ff' }}
          />
          <span
            className="pad-dot"
            data-touch="2"
            style={{ display: 'none', left: 100, top: 20, background: '#ff6b57' }}
          />
        </div>
        <div className="dpad">
          {DPAD.map((def) => (
            <PadButton key={def.label} def={def} />
          ))}
        </div>
        <div className="face">
          {FACE.map((def) => (
            <PadButton key={def.label} def={def} />
          ))}
        </div>
        <div className="stick stick-l">
          <span className="stick-dot" style={{ left: 20, top: 14 }} />
        </div>
        <div className="stick stick-r">
          <span className="stick-dot" style={{ left: 22, top: 18 }} />
        </div>
      </div>

      <div className="telemetry-grid">
        <div className="telemetry">
          <span className="telemetry-label">GYRO (hold L3)</span>
          <span ref={gyroMainRef} className="telemetry-main">
            --
          </span>
          <span ref={gyroSubRef} className="telemetry-sub">
            hold L3 (A) / R3 (B)
          </span>
        </div>
        <div className="telemetry">
          <span className="telemetry-label">LIGHTBAR</span>
          <span className="telemetry-main">
            <span className="dot" style={{ background: lightbar.color }} />
            {lightbar.pulsing ? `pulsing · ${pulseBpm} BPM` : hidConnected ? 'steady' : '--'}
          </span>
          <span className="telemetry-sub">beat pulse · M5</span>
        </div>
        <div className="telemetry">
          <span className="telemetry-label">HAPTICS</span>
          <span className="telemetry-main">
            {hidConnected ? (haptics.triggerStiff ? 'triggers stiff' : 'armed') : '--'}
          </span>
          <span className="telemetry-sub">
            downbeat pulse {haptics.downbeatPulse ? 'on' : 'off'} · M5
          </span>
        </div>
      </div>

      <details className="hid-log">
        <summary>WebHID report log · {hidConnected ? 'live' : 'not connected'}</summary>
        <pre ref={hexRef}>no reports yet</pre>
      </details>
    </section>
  );
}
