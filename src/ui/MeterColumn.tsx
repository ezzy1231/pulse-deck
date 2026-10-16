import { useEffect, useRef } from 'react';

interface MeterColumnProps {
  read: () => number;
}

const SEGMENTS = 14;

export function MeterColumn({ read }: MeterColumnProps) {
  const columnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    let level = 0;
    const draw = () => {
      const raw = read();
      level = Math.max(raw, level * 0.85);
      const lit = Math.round(Math.min(1, level) * SEGMENTS);
      const column = columnRef.current;
      if (column) {
        for (let s = 0; s < SEGMENTS; s++) {
          const on = s >= SEGMENTS - lit;
          const color = s < 2 ? '#ff5a5a' : s < 5 ? '#ffb347' : '#3ddc97';
          (column.children[s] as HTMLElement).style.background = on ? color : '#222833';
        }
      }
      raf = window.requestAnimationFrame(draw);
    };
    raf = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(raf);
  }, [read]);

  return (
    <div ref={columnRef} className="meter-column" role="img" aria-label="Signal meter">
      {Array.from({ length: SEGMENTS }, (_, i) => (
        <div key={i} className="meter-seg" />
      ))}
    </div>
  );
}
