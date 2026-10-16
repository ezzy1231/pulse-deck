import { useEffect, useMemo, useRef } from 'react';
import { bus } from '../actions/bus';
import { filterTracks, useAppStore } from '../state/store';
import { formatTime } from './format';

export function LibraryCard() {
  const libraryTracks = useAppStore((state) => state.libraryTracks);
  const decks = useAppStore((state) => state.decks);
  const activeDeck = useAppStore((state) => state.activeDeck);
  const browserActive = useAppStore((state) => state.browserActive);
  const browserIndex = useAppStore((state) => state.browserIndex);
  const query = useAppStore((state) => state.libraryQuery);
  const tableRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(
    () => filterTracks(libraryTracks, query),
    [libraryTracks, query],
  );

  useEffect(() => {
    if (!browserActive) return;
    const row = tableRef.current?.querySelector<HTMLElement>(
      `[data-idx="${browserIndex}"]`,
    );
    row?.scrollIntoView({ block: 'nearest' });
  }, [browserActive, browserIndex]);

  const load = (trackId: string) => {
    bus.emit('library.load', { deck: activeDeck, trackId });
  };

  const accent = activeDeck === 'A' ? '#4da3ff' : '#ff6b57';

  return (
    <section className="card library" aria-label="Library">
      <div className="card-head">
        <div className="card-title">LIBRARY</div>
        <button
          className={`library-browse${browserActive ? ' on' : ''}`}
          title="Toggle browsing · Options on controller · B key"
          onClick={() => useAppStore.getState().toggleBrowser()}
        >
          {browserActive ? 'BROWSING' : 'BROWSE'}
        </button>
        <button
          className="library-target"
          style={{ color: accent }}
          title="Switch load target deck (L1/R1 or ←/→)"
          onClick={() => useAppStore.getState().setActiveDeck(activeDeck === 'A' ? 'B' : 'A')}
        >
          TARGET → {activeDeck}
        </button>
        <div className="card-note">
          D-pad or left stick browses · L1/R1 target · L2/R2 or ✕ load · Options/B toggles
        </div>
      </div>
      <input
        className="library-search"
        type="text"
        placeholder={`Search ${libraryTracks.length} tracks`}
        aria-label="Search tracks"
        value={query}
        onChange={(event) => useAppStore.getState().setLibraryQuery(event.target.value)}
      />
      <div className="library-table" ref={tableRef}>
        <div className="library-row library-head-row">
          <span>#</span>
          <span>TRACK</span>
          <span>BPM</span>
          <span>KEY</span>
          <span>TIME</span>
          <span />
        </div>
        {filtered.map((track, index) => {
          const loadedOn = (['A', 'B'] as const).filter(
            (id) => decks[id].trackId === track.id,
          );
          const tag = loadedOn.join('+');
          const tagColor =
            loadedOn.length === 1
              ? loadedOn[0] === 'A'
                ? '#4da3ff'
                : '#ff6b57'
              : loadedOn.length === 2
                ? 'var(--good)'
                : 'var(--muted)';
          const selected = browserActive && index === browserIndex;
          return (
            <button
              key={track.id}
              className={`library-row${selected ? ' browser-selected' : ''}`}
              data-idx={index}
              onClick={() => load(track.id)}
              title={tag ? `Reload onto ${activeDeck}` : `Load onto ${activeDeck}`}
            >
              <span className="cell-muted">{String(index + 1).padStart(2, '0')}</span>
              <span className="cell-title">
                {track.title} <span className="cell-muted">· {track.artist || '—'}</span>
              </span>
              <span>--</span>
              <span>--</span>
              <span>{formatTime(track.durationSec)}</span>
              <span className="cell-tag" style={{ color: selected ? accent : tagColor }}>
                {selected ? `✕ load → ${activeDeck}` : tag || '→'}
              </span>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="library-empty">
            {libraryTracks.length === 0
              ? 'Tracks you load appear here as the session library'
              : 'No match'}
          </div>
        )}
      </div>
    </section>
  );
}
