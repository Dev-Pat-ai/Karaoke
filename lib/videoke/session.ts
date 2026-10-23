import type { LocalSong, Reservation, VideokeSession } from "@/types/videoke";

export const SESSION_KEY = "karaokz-videoke-session-v1";
export const emptySession: VideokeSession = {
  version: 1,
  current: null,
  queue: [],
  history: [],
  position: 0,
  repeat: false,
  scoring: false,
  volume: 0.8,
  tempo: 1,
};

export type SessionAction =
  | { type: "restore"; session: VideokeSession }
  | { type: "reserve"; reservation: Reservation }
  | { type: "next" }
  | { type: "previous" }
  | { type: "play"; id: string }
  | { type: "remove"; id: string }
  | { type: "move"; id: string; direction: -1 | 1 }
  | { type: "forget-song"; songId: string }
  | {
      type: "settings";
      settings: Partial<
        Pick<VideokeSession, "repeat" | "scoring" | "volume" | "tempo">
      >;
    }
  | { type: "position"; seconds: number };

export function sessionReducer(
  state: VideokeSession,
  action: SessionAction,
): VideokeSession {
  switch (action.type) {
    case "restore":
      return action.session;
    case "reserve":
      return state.current
        ? { ...state, queue: [...state.queue, action.reservation] }
        : { ...state, current: action.reservation, position: 0 };
    case "next":
      return {
        ...state,
        current: state.queue[0] ?? null,
        queue: state.queue.slice(1),
        position: 0,
        history: state.current
          ? [...state.history, state.current].slice(-30)
          : state.history,
      };
    case "previous": {
      const previous = state.history.at(-1);
      if (!previous) return { ...state, position: 0 };
      return {
        ...state,
        current: previous,
        position: 0,
        history: state.history.slice(0, -1),
        queue: state.current ? [state.current, ...state.queue] : state.queue,
      };
    }
    case "play": {
      const item = state.queue.find((entry) => entry.id === action.id);
      if (!item) return state;
      return {
        ...state,
        current: item,
        position: 0,
        queue: state.queue.filter((entry) => entry.id !== item.id),
        history: state.current
          ? [...state.history, state.current].slice(-30)
          : state.history,
      };
    }
    case "remove":
      return {
        ...state,
        queue: state.queue.filter((entry) => entry.id !== action.id),
      };
    case "move": {
      const queue = [...state.queue];
      const index = queue.findIndex((entry) => entry.id === action.id);
      const target = index + action.direction;
      if (index < 0 || target < 0 || target >= queue.length) return state;
      [queue[index], queue[target]] = [queue[target], queue[index]];
      return { ...state, queue };
    }
    case "forget-song": {
      const queue = state.queue.filter(
        (entry) => entry.songId !== action.songId,
      );
      return {
        ...state,
        queue: state.current?.songId === action.songId ? queue.slice(1) : queue,
        current:
          state.current?.songId === action.songId
            ? (queue[0] ?? null)
            : state.current,
        position: state.current?.songId === action.songId ? 0 : state.position,
        history: state.history.filter(
          (entry) => entry.songId !== action.songId,
        ),
      };
    }
    case "settings":
      return { ...state, ...action.settings };
    case "position":
      return {
        ...state,
        position: Number.isFinite(action.seconds)
          ? Math.max(0, action.seconds)
          : 0,
      };
  }
}

export function restoreSession(
  raw: string | null,
  songs: LocalSong[],
): VideokeSession {
  if (!raw) return { ...emptySession };
  try {
    const saved = JSON.parse(raw);
    if (saved.version !== 1) return { ...emptySession };
    const known = new Set(songs.map((song) => song.id));
    const seen = new Set<string>();
    const reservation = (value: unknown): value is Reservation => {
      if (!value || typeof value !== "object") return false;
      const item = value as Reservation;
      if (
        typeof item.id !== "string" ||
        typeof item.singer !== "string" ||
        !known.has(item.songId) ||
        seen.has(item.id)
      )
        return false;
      seen.add(item.id);
      return true;
    };
    const current = reservation(saved.current) ? saved.current : null;
    const queue = Array.isArray(saved.queue)
      ? saved.queue.slice(0, 500).filter(reservation)
      : [];
    const history = Array.isArray(saved.history)
      ? saved.history.slice(-30).filter(reservation)
      : [];
    return {
      ...emptySession,
      current,
      queue,
      history,
      position:
        current && Number.isFinite(saved.position)
          ? Math.max(0, saved.position)
          : 0,
      repeat: saved.repeat === true,
      scoring: saved.scoring === true,
      volume: Number.isFinite(saved.volume)
        ? Math.min(1, Math.max(0, saved.volume))
        : 0.8,
      tempo: [0.75, 0.9, 1, 1.1, 1.25].includes(saved.tempo) ? saved.tempo : 1,
    };
  } catch {
    return { ...emptySession };
  }
}

export function searchSongs(
  songs: LocalSong[],
  query: string,
  category: string,
): LocalSong[] {
  const term = query.trim().toLocaleLowerCase();
  const code = /^\d{1,5}$/.test(term) ? term.padStart(5, "0") : null;
  return songs.filter(
    (song) =>
      (category === "All" || song.category === category) &&
      (!term ||
        song.code === code ||
        `${song.title} ${song.artist} ${song.code}`
          .toLocaleLowerCase()
          .includes(term)),
  );
}

export function uniqueId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
