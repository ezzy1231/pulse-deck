export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
  const total = Math.floor(safe);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatPitch(pct: number): string {
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '+';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}

export function formatDb(db: number): string {
  if (!Number.isFinite(db)) return '−∞ dB';
  return `${db < 0 ? '−' : '+'}${Math.abs(db).toFixed(1)} dB`;
}

export function filterLabel(value: number): string {
  if (value < 49) return `LOW-PASS ${Math.round(((50 - value) / 50) * 100)}%`;
  if (value > 51) return `HIGH-PASS ${Math.round(((value - 50) / 50) * 100)}%`;
  return 'OFF';
}
