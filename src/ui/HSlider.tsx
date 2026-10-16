import { useRef } from 'react';

interface HSliderProps {
  variant: 'filter' | 'cross';
  value: number;
  accent?: string;
  onChange: (value: number) => void;
}

export function HSlider({ variant, value, accent, onChange }: HSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  const valueFromClientX = (clientX: number): number => {
    const el = trackRef.current;
    if (!el) return value;
    const rect = el.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  };

  return (
    <div
      className={`hslider hslider-${variant}`}
      ref={trackRef}
      role="slider"
      aria-label={variant === 'filter' ? 'Filter' : 'Crossfader'}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      tabIndex={0}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        onChange(valueFromClientX(event.clientX));
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          onChange(valueFromClientX(event.clientX));
        }
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          onChange(Math.min(1, value + 0.02));
          event.preventDefault();
        }
        if (event.key === 'ArrowLeft') {
          onChange(Math.max(0, value - 0.02));
          event.preventDefault();
        }
      }}
      onDoubleClick={() => onChange(0.5)}
    >
      <div className="hslider-tick" />
      <div
        className="hslider-cap"
        style={variant === 'filter' ? { background: accent } : undefined}
      />
    </div>
  );
}
