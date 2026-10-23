import type { LocalSong } from "@/types/videoke";
import { uniqueId } from "./session";

export const LIBRARY_DB = "karaokz-local-library";
let opening: Promise<IDBDatabase> | undefined;

function request<T>(operation: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    operation.onsuccess = () => resolve(operation.result);
    operation.onerror = () => reject(operation.error);
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Library transaction cancelled."));
    transaction.onerror = () => reject(transaction.error);
  });
}

export function openLibrary(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(
        new Error(
          "Local media storage is unavailable. Open this app in a regular Edge, Chrome, or Firefox window.",
        ),
      );
      return;
    }
    const operation = indexedDB.open(LIBRARY_DB, 1);
    operation.onupgradeneeded = () => {
      const db = operation.result;
      const songs = db.createObjectStore("songs", { keyPath: "id" });
      songs.createIndex("code", "code", { unique: true });
      songs.createIndex("fingerprint", "fingerprint", { unique: true });
      songs.createIndex("category", "category");
      db.createObjectStore("media");
      db.createObjectStore("settings");
    };
    operation.onsuccess = () => {
      const db = operation.result;
      db.onversionchange = () => {
        db.close();
        opening = undefined;
      };
      resolve(db);
    };
    operation.onerror = () => reject(operation.error);
    operation.onblocked = () =>
      reject(
        new Error(
          "Another tab is blocking the library update. Close other videoke tabs and reload.",
        ),
      );
  }).catch((error) => {
    opening = undefined;
    throw error;
  });
  return opening;
}

export async function listSongs(): Promise<LocalSong[]> {
  const db = await openLibrary();
  const transaction = db.transaction("songs");
  const done = completed(transaction);
  const songs = await request<LocalSong[]>(
    transaction.objectStore("songs").getAll(),
  );
  await done;
  return songs.sort((a, b) => a.code.localeCompare(b.code));
}

export function metadataFromFile(
  file: File,
  category: string,
): Pick<LocalSong, "title" | "artist" | "category"> {
  const base = file.name.replace(/\.(mp4|webm)$/i, "").replace(/_/g, " ");
  const parts = base.split(/\s+-\s+/);
  return {
    artist:
      parts.length > 1 ? parts.shift()!.trim().slice(0, 150) : "Unknown artist",
    title: parts.join(" - ").trim().slice(0, 200) || "Untitled",
    category: category.trim().slice(0, 60) || "Custom",
  };
}

export async function importSong(
  file: File,
  category: string,
): Promise<{ song: LocalSong; duplicate: boolean }> {
  if (!/\.(mp4|webm)$/i.test(file.name) || !file.size)
    throw new Error("Choose a non-empty MP4 or WebM file.");
  const db = await openLibrary();
  // Media, metadata and code allocation commit together; quota failure rolls back all three.
  const transaction = db.transaction(
    ["songs", "media", "settings"],
    "readwrite",
  );
  const done = completed(transaction);
  const songs = transaction.objectStore("songs");
  const fingerprint = `${file.name}|${file.size}|${file.lastModified}`;
  try {
    const existing = await request<LocalSong | undefined>(
      songs.index("fingerprint").get(fingerprint),
    );
    if (existing) {
      await done;
      return { song: existing, duplicate: true };
    }
    const settings = transaction.objectStore("settings");
    let next =
      (await request<number | undefined>(settings.get("next-code"))) ?? 1;
    while (
      next <= 99999 &&
      (await request(songs.index("code").getKey(String(next).padStart(5, "0"))))
    )
      next++;
    if (next > 99999)
      throw new Error("All five-digit song numbers have been assigned.");
    const mimeType = /\.webm$/i.test(file.name) ? "video/webm" : "video/mp4";
    const song: LocalSong = {
      id: uniqueId(),
      code: String(next).padStart(5, "0"),
      ...metadataFromFile(file, category),
      fileName: file.name,
      fileSize: file.size,
      mimeType,
      fingerprint,
      importedAt: Date.now(),
    };
    // Copy the selected file into browser storage. No file path or video enters localStorage.
    transaction
      .objectStore("media")
      .put(file.slice(0, file.size, mimeType), song.id);
    songs.add(song);
    settings.put(next + 1, "next-code");
    await done;
    return { song, duplicate: false };
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* Already completed/aborted. */
    }
    await done.catch(() => {});
    throw error;
  }
}

export async function getMedia(id: string): Promise<Blob> {
  const db = await openLibrary();
  const transaction = db.transaction("media");
  const done = completed(transaction);
  const media = await request<Blob | undefined>(
    transaction.objectStore("media").get(id),
  );
  await done;
  if (!media || typeof media.size !== "number")
    throw new Error(
      "This video is missing from browser storage. Import the original file again.",
    );
  return media;
}

export async function updateSong(
  id: string,
  changes: Pick<LocalSong, "code" | "title" | "artist" | "category">,
): Promise<void> {
  if (!/^[0-9]{1,5}$/.test(changes.code) || Number(changes.code) === 0)
    throw new Error("Song number must be 1–99999.");
  if (
    !changes.title.trim() ||
    !changes.artist.trim() ||
    !changes.category.trim()
  )
    throw new Error("Enter a title, artist and category.");
  const db = await openLibrary();
  const transaction = db.transaction("songs", "readwrite");
  const done = completed(transaction);
  try {
    const store = transaction.objectStore("songs");
    const song = await request<LocalSong | undefined>(store.get(id));
    if (!song) throw new Error("Song no longer exists.");
    store.put({
      ...song,
      code: changes.code.padStart(5, "0"),
      title: changes.title.trim().slice(0, 200),
      artist: changes.artist.trim().slice(0, 150),
      category: changes.category.trim().slice(0, 60),
    });
    await done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {
      /* Already completed/aborted. */
    }
    await done.catch(() => {});
    throw error;
  }
}

export async function deleteSong(id: string): Promise<void> {
  const db = await openLibrary();
  const transaction = db.transaction(["songs", "media"], "readwrite");
  const done = completed(transaction);
  transaction.objectStore("songs").delete(id);
  transaction.objectStore("media").delete(id);
  await done;
}

export function libraryError(error: unknown): string {
  if (error instanceof Error && error.name === "QuotaExceededError")
    return "Browser storage is full. Remove a copied video or free disk space, then retry. Your original files are unchanged.";
  if (error instanceof Error && error.name === "ConstraintError")
    return "That song number is already assigned. Choose another number.";
  return error instanceof Error
    ? error.message
    : "Local library operation failed. Check browser storage permissions and free disk space.";
}
