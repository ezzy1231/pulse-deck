import type { Band, DeckId } from '../types';

export interface EventMap {
  'deck.play': { deck: DeckId };
  'deck.pause': { deck: DeckId };
  'deck.cue.down': { deck: DeckId };
  'deck.cue.up': { deck: DeckId };
  'deck.seek': { deck: DeckId; sec: number };
  'deck.load': { deck: DeckId; file: File };
  'deck.volume.set': { deck: DeckId; value: number };
  'deck.eq.set': { deck: DeckId; band: Band; value: number };
  'deck.filter.set': { deck: DeckId; value: number };
  'deck.hotcue.set': { deck: DeckId; index: number };
  'deck.hotcue.jump': { deck: DeckId; index: number };
  'deck.hotcue.clear': { deck: DeckId; index: number };
  'deck.sync': { deck: DeckId };
  'deck.loop.toggle': { deck: DeckId };
  'deck.pitch.set': { deck: DeckId; value: number };
  'deck.pitch.bend': { deck: DeckId; value: number };
  'deck.pitch.reset': { deck: DeckId };
  'deck.activate': { deck: DeckId };
  'deck.jog.begin': { deck: DeckId };
  'deck.jog.velocity': { deck: DeckId; value: number; dt: number };
  'deck.jog.end': { deck: DeckId };
  'deck.jog.mode.toggle': { deck: DeckId };
  'deck.fx.echo.set': { deck: DeckId; value: number };
  'deck.fx.reverb.set': { deck: DeckId; value: number };
  'library.load': { deck: DeckId; trackId: string };
  'crossfader.set': { value: number };
  'master.set': { value: number };
  'feedback.beat': { deck: DeckId; isBar: boolean };
  'feedback.cueshort': { deck: DeckId };
  'feedback.clipping': Record<string, never>;
  'feedback.trackEnding': { deck: DeckId };
  'feedback.meter': { level: number };
  'panic': Record<string, never>;
  'settings.open': Record<string, never>;
  'deck.keylock.toggle': { deck: DeckId };
}

type Handler<K extends keyof EventMap> = (payload: EventMap[K]) => void;

class Bus {
  private handlers = new Map<keyof EventMap, Set<(payload: never) => void>>();

  on<K extends keyof EventMap>(event: K, handler: Handler<K>): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set<(payload: never) => void>();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => {
      set.delete(handler);
    };
  }

  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const handler of set) {
      (handler as Handler<K>)(payload);
    }
  }
}

export const bus = new Bus();
