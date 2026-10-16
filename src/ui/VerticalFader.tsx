import { useRef } from 'react';
import type { CSSProperties } from 'react';

interface VerticalFaderProps {
  value: number;
  accent: string;
  hint: string;
  onChange: (value: number) => void;
}

export function VerticalFader({ value, accent, hint, onChange }: VerticalFaderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const valueFromClientY = (clientY: number): number => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, 1 - (clientY - rect.top) / rect.height));
  };

  return (
    <div className="fader" style={{ '--accent': accent } as CSSProperties}>
      <div
        ref={trackRef}
        className="fader-track"
        role="slider"
        aria-label={hint}
        aria-valuemin={0}
        aria-valuemax={1}
        aria-valuenow={value}
        tabIndex={0}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          onChange(valueFromClientY(event.clientY));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            onChange(valueFromClientY(event.clientY));
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            onChange(Math.min(1, value + 0.05));
            event.preventDefault();
          }
          if (event.key === 'ArrowDown') {
            onChange(Math.max(0, value - 0.05));
            event.preventDefault();
          }
        }}
      >
        <div className="fader-cap" style={{ bottom: `calc(${value * 100}% - 9px)` }} />
      </div>
      <div className="fader-hint">{hint}</div>
    </div>
  );
}
