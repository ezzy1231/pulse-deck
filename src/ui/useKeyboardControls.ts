import { useEffect } from 'react';
import { bus } from '../actions/bus';
import { filterTracks, useAppStore } from '../state/store';

export function useKeyboardControls(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    const togglePlay = (deck: 'A' | 'B') => {
      const state = useAppStore.getState();
      bus.emit(state.decks[deck].playing ? 'deck.pause' : 'deck.play', { deck });
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.target instanceof HTMLInputElement) return;
      const state = useAppStore.getState();
      if (state.settingsOpen) return;
      if (state.browserActive) {
        switch (event.key) {
          case 'ArrowUp':
            event.preventDefault();
            state.moveBrowser(-1);
            return;
          case 'ArrowDown':
            event.preventDefault();
            state.moveBrowser(1);
            return;
          case 'ArrowLeft':
            event.preventDefault();
            state.setActiveDeck('A');
            return;
          case 'ArrowRight':
            event.preventDefault();
            state.setActiveDeck('B');
            return;
          case 'Enter': {
            event.preventDefault();
            const track = filterTracks(state.libraryTracks, state.libraryQuery)[
              state.browserIndex
            ];
            if (track) bus.emit('library.load', { deck: state.activeDeck, trackId: track.id });
            return;
          }
          case 'Escape':
            event.preventDefault();
            state.toggleBrowser();
            return;
        }
      }
      switch (event.key.toLowerCase()) {
        case 'q':
          bus.emit('deck.cue.down', { deck: 'A' });
          break;
        case 'w':
          togglePlay('A');
          break;
        case 'o':
          bus.emit('deck.cue.down', { deck: 'B' });
          break;
        case 'p':
          togglePlay('B');
          break;
        case 'b':
          useAppStore.getState().toggleBrowser();
          break;
        case 's': {
          const current = useAppStore.getState();
          current.toggleSettings();
          if (!current.settingsOpen) bus.emit('settings.open', {});
          break;
        }
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      switch (event.key.toLowerCase()) {
        case 'q':
          bus.emit('deck.cue.up', { deck: 'A' });
          break;
        case 'o':
          bus.emit('deck.cue.up', { deck: 'B' });
          break;
      }
    };

    const releaseAll = () => {
      bus.emit('deck.cue.up', { deck: 'A' });
      bus.emit('deck.cue.up', { deck: 'B' });
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAll);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAll);
    };
  }, [enabled]);
}
