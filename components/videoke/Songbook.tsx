"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { LocalSong } from "@/types/videoke";
import { libraryError, updateSong } from "@/lib/videoke/library";
import { searchSongs } from "@/lib/videoke/session";

interface Props {
  songs: LocalSong[];
  ready: boolean;
  onReserve(song: LocalSong): void;
  onImport(): void;
  onRefresh(): Promise<void>;
  onDelete(song: LocalSong): Promise<void>;
}

function SongEditor({
  song,
  onClose,
  onSaved,
  onDelete,
}: {
  song: LocalSong;
  onClose(): void;
  onSaved(): Promise<void>;
  onDelete(): Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [form, setForm] = useState({
    code: song.code,
    title: song.title,
    artist: song.artist,
    category: song.category,
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // A native modal traps focus and supports Escape.
  useEffect(() => {
    const modal = dialog.current;
    if (!modal) return;
    if (modal.showModal) modal.showModal();
    else modal.setAttribute("open", "");
  }, []);
  return (
    <div
      className="vk-modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <dialog
        ref={dialog}
        className="vk-dialog"
        aria-modal="true"
        aria-labelledby="song-edit-title"
        onCancel={onClose}
        onKeyDown={(event) => {
          if (event.key === "Escape") onClose();
        }}
      >
        <div className="panel-title">
          <h2 id="song-edit-title">Edit song details</h2>
          <button
            className="vk-icon"
            aria-label="Close song editor"
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            setError("");
            try {
              await updateSong(song.id, form);
              await onSaved();
              onClose();
            } catch (error) {
              setError(libraryError(error));
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Song number
            <input
              autoFocus
              inputMode="numeric"
              pattern="[0-9]{1,5}"
              maxLength={5}
              value={form.code}
              onChange={(event) =>
                setForm({ ...form, code: event.target.value })
              }
              required
            />
          </label>
          <label>
            Title
            <input
              maxLength={200}
              value={form.title}
              onChange={(event) =>
                setForm({ ...form, title: event.target.value })
              }
              required
            />
          </label>
          <label>
            Artist
            <input
              maxLength={150}
              value={form.artist}
              onChange={(event) =>
                setForm({ ...form, artist: event.target.value })
              }
              required
            />
          </label>
          <label>
            Category
            <input
              maxLength={60}
              list="videoke-categories"
              value={form.category}
              onChange={(event) =>
                setForm({ ...form, category: event.target.value })
              }
              required
            />
          </label>
          <p className="muted file-detail">
            Original file: {song.fileName}
            <br />
            Only the copied library entry is changed.
          </p>
          {error && (
            <p role="alert" className="vk-error">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <button
              className="vk-button danger"
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onDelete();
                  onClose();
                } catch (error) {
                  setError(libraryError(error));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={16} /> Remove copy
            </button>
            <button className="vk-button primary" disabled={busy} type="submit">
              {busy ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

export default function Songbook({
  songs,
  ready,
  onReserve,
  onImport,
  onRefresh,
  onDelete,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<LocalSong | null>(null);
  const categories = [
    ...new Set(["OPM", "English", ...songs.map((song) => song.category)]),
  ].sort();
  const results = useMemo(
    () => searchSongs(songs, query, category),
    [songs, query, category],
  );
  const pages = Math.max(1, Math.ceil(results.length / 12));
  const currentPage = Math.min(page, pages - 1);
  const visible = results.slice(currentPage * 12, currentPage * 12 + 12);

  function exportBook() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            format: "karaokz-songbook-v1",
            songs: songs.map(({ code, title, artist, category, fileName }) => ({
              code,
              title,
              artist,
              category,
              fileName,
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "karaokz-songbook.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <section
      id="songbook"
      className="songbook-panel"
      aria-labelledby="songbook-heading"
    >
      <div className="songbook-heading">
        <div>
          <span className="eyebrow">THE CLASSICS START HERE</span>
          <h2 id="songbook-heading">
            <BookOpen size={23} /> Your songbook{" "}
            <span>{songs.length} songs</span>
          </h2>
        </div>
        <div className="songbook-actions">
          <button
            className="vk-button ghost"
            onClick={exportBook}
            disabled={!songs.length}
          >
            <Download size={15} /> Export list
          </button>
          <button
            className="vk-button outline"
            onClick={onImport}
            disabled={!ready}
          >
            <Plus size={17} /> Add videos
          </button>
        </div>
      </div>
      <div className="songbook-filters">
        <label className="song-search">
          <Search size={19} />
          <span className="sr-only">Search local songbook</span>
          <input
            id="songbook-search"
            type="search"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            placeholder="Song title, artist, or song number"
          />
          <kbd>/</kbd>
        </label>
        <label className="category-select">
          <span className="sr-only">Filter category</span>
          <select
            aria-label="Filter category"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(0);
            }}
          >
            <option>All</option>
            {categories.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="songbook-columns" aria-hidden="true">
        <span>SONG NO.</span>
        <span>SONG / ARTIST</span>
        <span>CATEGORY</span>
        <span>RESERVE</span>
      </div>
      {visible.length ? (
        <ol className="songbook-list">
          {visible.map((song) => (
            <li key={song.id}>
              <span className="book-code">{song.code}</span>
              <div className="book-title">
                <strong>{song.title}</strong>
                <span>{song.artist}</span>
              </div>
              <span className="book-category">{song.category}</span>
              <div className="book-actions">
                <button
                  className="reserve-song"
                  aria-label={`Reserve ${song.title}`}
                  onClick={() => onReserve(song)}
                >
                  <Plus size={17} />
                  <span>Reserve</span>
                </button>
                <button
                  className="vk-icon edit-song"
                  aria-label={`Edit ${song.title}`}
                  onClick={() => setEditing(song)}
                >
                  <Pencil size={16} />
                </button>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <div className="songbook-empty">
          <FolderOpen size={30} />
          <h3>
            {songs.length
              ? "No matching songs"
              : "Your next favourite is on your computer."}
          </h3>
          <p>
            {songs.length
              ? "Try another title, artist, number, or category."
              : "Import your MP4 or WebM karaoke files. Lyrics stay in the video, just like a videoke machine."}
          </p>
          {!songs.length && (
            <button
              className="vk-button primary"
              onClick={onImport}
              disabled={!ready}
            >
              Import your first songs
            </button>
          )}
        </div>
      )}
      <div className="songbook-bottom">
        <span>
          LOCAL SONGBOOK · {results.length}{" "}
          {results.length === 1 ? "SONG" : "SONGS"}
          {category !== "All" ? ` / ${category}` : ""}
        </span>
        <div>
          <button
            className="vk-icon"
            aria-label="Previous songbook page"
            disabled={!currentPage}
            onClick={() => setPage(currentPage - 1)}
          >
            <ChevronLeft size={18} />
          </button>
          <span>
            {currentPage + 1} / {pages}
          </span>
          <button
            className="vk-icon"
            aria-label="Next songbook page"
            disabled={currentPage >= pages - 1}
            onClick={() => setPage(currentPage + 1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {editing && (
        <SongEditor
          song={editing}
          onClose={() => setEditing(null)}
          onSaved={onRefresh}
          onDelete={() => onDelete(editing)}
        />
      )}
    </section>
  );
}
