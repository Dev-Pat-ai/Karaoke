export interface LocalSong {
  id: string;
  code: string;
  title: string;
  artist: string;
  category: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  fingerprint: string;
  importedAt: number;
}

export interface Reservation {
  id: string;
  songId: string;
  singer: string;
}

export interface VideokeSession {
  version: 1;
  current: Reservation | null;
  queue: Reservation[];
  history: Reservation[];
  position: number;
  repeat: boolean;
  scoring: boolean;
  volume: number;
  tempo: number;
}
