import { useRef } from 'react';
import type { PointerEvent } from 'react';

interface KnobProps {
  label: string;
  color: string;
  value: number;
  onChange: (value: number) => void;
}

export function Knob({ label, color, value, onChange }: KnobProps) {
  const dragRef = useRef<{ startY: number; startValue: number } | null>(null);

  return (
    <div className="knob-cell">
      <div
        className="knob"
        role="slider"
        aria-label={label}
        aria-valuemin={-1}
        aria-valuemax={1}
        aria-valuenow={Number(value.toFixed(2))}
        tabIndex={0}
        onPointerDown={(event: PointerEvent<HTMLDivElement>) => {
          dragRef.current = { startY: event.clientY, startValue: value };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event: PointerEvent<HTMLDivElement>) => {
          const drag = dragRef.current;
          if (!drag || !event.currentTarget.hasPointerCapture(event.pointerId)) return;
          onChange(Math.min(1, Math.max(-1, drag.startValue + (drag.startY - event.clientY) / 200)));
        }}
        onPointerUp={(event: PointerEvent<HTMLDivElement>) => {
          dragRef.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onDoubleClick={() => onChange(0)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            onChange(Math.min(1, value + 0.02));
            event.preventDefault();
          }
          if (event.key === 'ArrowDown') {
            onChange(Math.max(-1, value - 0.02));
            event.preventDefault();
          }
          if (event.key === 'Home') onChange(0);
        }}
      >
        <div
          className="knob-ind"
          style={{ background: color, transform: `rotate(${(value * 135).toFixed(1)}deg)` }}
        />
      </div>
      <span className="knob-label">{label}</span>
    </div>
  );
}
