"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleHelp,
  Delete,
  FolderInput,
  Keyboard,
  ListMusic,
  Mic2,
  Play,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import LocalPlayer, { type PlayerHandle } from "./LocalPlayer";
import Songbook from "./Songbook";
import {
  deleteSong,
  importSong,
  libraryError,
  listSongs,
} from "@/lib/videoke/library";
import {
  emptySession,
  restoreSession,
  sessionReducer,
  SESSION_KEY,
  uniqueId,
} from "@/lib/videoke/session";
import type { LocalSong } from "@/types/videoke";

export default function VideokeConsole() {
  const [songs, setSongs] = useState<LocalSong[]>([]);
  const [session, dispatch] = useReducer(sessionReducer, emptySession);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [singer, setSinger] = useState("");
  const [code, setCode] = useState("");
  const [importCategory, setImportCategory] = useState("OPM");
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState("");
  const [autoPlay, setAutoPlay] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  const [storageInfo, setStorageInfo] = useState("Local browser storage");
  const inputRef = useRef<HTMLInputElement>(null);
  const player = useRef<PlayerHandle>(null);
  const songMap = useMemo(
    () => new Map(songs.map((song) => [song.id, song])),
    [songs],
  );
  const currentSong = session.current
    ? songMap.get(session.current.songId)
    : undefined;
  const selectedSong = code
    ? songs.find((song) => song.code === code.padStart(5, "0"))
    : undefined;

  const refresh = useCallback(async () => {
    setSongs(await listSongs());
  }, []);
  const storageEstimate = useCallback(async () => {
    try {
      const estimate = await navigator.storage?.estimate?.();
      if (estimate?.quota)
        setStorageInfo(
          `${((estimate.usage ?? 0) / 1024 ** 3).toFixed(2)} GB used / ${(estimate.quota / 1024 ** 3).toFixed(1)} GB browser limit`,
        );
    } catch {
      /* Estimates are optional. */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listSongs()
      .then((library) => {
        if (cancelled) return;
        let saved = null;
        try {
          saved = localStorage.getItem(SESSION_KEY);
        } catch {
          setError(
            "Queue persistence is unavailable in this browser window. Your imported videos still use IndexedDB.",
          );
        }
        setSongs(library);
        dispatch({ type: "restore", session: restoreSession(saved, library) });
        setReady(true);
        void storageEstimate();
      })
      .catch((error) => {
        if (!cancelled) setError(libraryError(error));
      });
    return () => {
      cancelled = true;
    };
  }, [storageEstimate]);

  useEffect(() => {
    if (!ready) return;
    let frame: number | undefined;
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } catch {
      frame = requestAnimationFrame(() =>
        setError(
          "The queue could not be saved. Keep this tab open; browser storage may be blocked or full.",
        ),
      );
    }
    return () => {
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [session, ready]);

  const next = useCallback(() => {
    setScore(null);
    setAutoPlay(true);
    dispatch({ type: "next" });
  }, []);
  const previous = useCallback(() => {
    setScore(null);
    setAutoPlay(true);
    if (session.history.length) dispatch({ type: "previous" });
    else player.current?.restart();
  }, [session.history.length]);
  const reserve = useCallback(
    (song: LocalSong) => {
      if (session.queue.length >= 500) {
        setError(
          "The reservation list is full (500 songs). Remove a reservation first.",
        );
        return;
      }
      dispatch({
        type: "reserve",
        reservation: {
          id: uniqueId(),
          songId: song.id,
          singer: singer.trim().slice(0, 80) || "Guest singer",
        },
      });
      setAutoPlay(true);
      setMessage(
        `${song.code} · ${song.title} reserved for ${singer.trim() || "Guest singer"}.`,
      );
      setCode("");
    },
    [singer, session.queue.length],
  );
  const reserveCode = useCallback(() => {
    if (selectedSong) reserve(selectedSong);
    else
      setError(
        code
          ? `Song ${code.padStart(5, "0")} is not in your local songbook.`
          : "Enter a song number first.",
      );
  }, [selectedSong, reserve, code]);

  useEffect(() => {
    if (score === null) return;
    const timer = setTimeout(next, 5000);
    return () => clearTimeout(timer);
  }, [score, next]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (
        target.closest(
          'input, textarea, select, dialog, [contenteditable="true"]',
        ) ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.repeat
      )
        return;
      const key = event.key.toLowerCase();
      if (/^[0-9]$/.test(key)) {
        event.preventDefault();
        setCode((value) => (value + key).slice(0, 5));
      } else if (key === "backspace") {
        event.preventDefault();
        setCode((value) => value.slice(0, -1));
      } else if (key === "enter" && target.tagName !== "BUTTON" && code) {
        event.preventDefault();
        reserveCode();
      } else if (
        key === " " &&
        target.tagName !== "BUTTON" &&
        target.tagName !== "A"
      ) {
        event.preventDefault();
        player.current?.toggle();
      } else if (key === "f") {
        event.preventDefault();
        player.current?.fullscreen();
      } else if (key === "n") {
        event.preventDefault();
        next();
      } else if (key === "b") {
        event.preventDefault();
        previous();
      } else if (key === "r") {
        event.preventDefault();
        dispatch({ type: "settings", settings: { repeat: !session.repeat } });
      } else if (key === "m") {
        event.preventDefault();
        dispatch({
          type: "settings",
          settings: { volume: session.volume ? 0 : 0.8 },
        });
      } else if (key === "+" || key === "=") {
        event.preventDefault();
        dispatch({
          type: "settings",
          settings: { volume: Math.min(1, session.volume + 0.05) },
        });
      } else if (key === "-") {
        event.preventDefault();
        dispatch({
          type: "settings",
          settings: { volume: Math.max(0, session.volume - 0.05) },
        });
      } else if (key === "/" || key === "s") {
        event.preventDefault();
        document.getElementById("songbook-search")?.focus();
      } else if (key === "escape") {
        setCode("");
        setHelp(false);
      }
    }
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [code, reserveCode, next, previous, session.repeat, session.volume]);

  async function importFiles(files: File[]) {
    if (!files.length || importing) return;
    setImporting(true);
    setError("");
    setMessage("");
    let added = 0,
      duplicates = 0;
    const failures: string[] = [];
    for (let index = 0; index < files.length; index++) {
      setProgress(
        `Copying ${index + 1} / ${files.length} · ${files[index].name}`,
      );
      try {
        const result = await importSong(files[index], importCategory);
        if (result.duplicate) duplicates++;
        else added++;
      } catch (error) {
        failures.push(`${files[index].name}: ${libraryError(error)}`);
      }
    }
    try {
      await refresh();
      await storageEstimate();
    } catch (error) {
      failures.push(libraryError(error));
    }
    setImporting(false);
    setProgress("");
    setMessage(
      `${added} ${added === 1 ? "song" : "songs"} imported${duplicates ? ` · ${duplicates} already in library` : ""}${failures.length ? ` · ${failures.length} failed` : ""}.`,
    );
    if (failures.length) setError(failures.slice(0, 3).join(" / "));
  }

  async function removeSong(song: LocalSong) {
    if (
      !confirm(
        `Remove the browser copy of “${song.title}” and its reservations? The original file on your computer will not be changed.`,
      )
    )
      throw new Error("Removal cancelled.");
    await deleteSong(song.id);
    dispatch({ type: "forget-song", songId: song.id });
    setScore(null);
    await refresh();
    await storageEstimate();
    setMessage(`${song.title} removed from this browser's library.`);
  }

  const upcoming = session.queue
    .map((item) => ({ item, song: songMap.get(item.songId) }))
    .filter((entry) => entry.song);
  return (
    <div className="videoke-app">
      <header className="videoke-header">
        <Link
          href="/"
          className="videoke-brand"
          aria-label="KaraOkz Videoke home"
        >
          <span className="brand-mark">
            <Mic2 size={24} />
          </span>
          <span>
            KaraOkz<span className="brand-sub">HOME VIDEOKE</span>
          </span>
        </Link>
        <div className="header-session">
          <span className="signal-dot active" /> BAHAY SESSION{" "}
          <span className="header-separator">/</span>{" "}
          <span>OFFLINE PLAYER</span>
        </div>
        <div className="header-actions">
          <Link href="/online" className="online-link">
            Online / rooms <ChevronRight size={14} />
          </Link>
          <button
            className="vk-icon"
            aria-label="Keyboard shortcuts and help"
            aria-expanded={help}
            onClick={() => setHelp(!help)}
          >
            <CircleHelp size={21} />
          </button>
        </div>
      </header>
      <main className="videoke-main">
        <div className="session-intro">
          <div>
            <span className="eyebrow">WALANG BITIN. WALANG PATID.</span>
            <p>
              A little louder. A little later. <span>One more song.</span>
            </p>
          </div>
          <span className="machine-label">
            <span /> PERSONAL VIDEOKE SYSTEM
          </span>
        </div>
        {(error || message || progress) && (
          <div
            className={`console-notice ${error ? "has-error" : ""}`}
            role={error ? "alert" : "status"}
          >
            <span>{progress || error || message}</span>
            {!progress && (
              <button
                className="vk-icon"
                aria-label="Dismiss message"
                onClick={() => {
                  setError("");
                  setMessage("");
                }}
              >
                <X size={17} />
              </button>
            )}
          </div>
        )}
        {help && (
          <section className="help-panel">
            <div className="panel-title">
              <h2>
                <Keyboard size={19} /> A remote you already know
              </h2>
              <button
                className="vk-icon"
                aria-label="Close help"
                onClick={() => setHelp(false)}
              >
                <X size={18} />
              </button>
            </div>
            <p>
              <kbd>0–9</kbd> song number · <kbd>Enter</kbd> reserve ·{" "}
              <kbd>Space</kbd> play/pause · <kbd>N</kbd> next · <kbd>B</kbd>{" "}
              previous · <kbd>R</kbd> repeat · <kbd>F</kbd> TV fullscreen ·{" "}
              <kbd>M</kbd> mute · <kbd>+ / −</kbd> volume · <kbd>/</kbd> search
              · <kbd>Tab</kbd> navigate · <kbd>Esc</kbd> leave TV view
            </p>
            <p>
              Lyrics are part of your video. Tempo preserves pitch when the
              browser supports it; otherwise it stays at 1×. Independent pitch
              shifting is unavailable. No microphone or voice analysis is used.
              Local songs and reservations are separate from optional online
              rooms.
            </p>
          </section>
        )}
        <div className="videoke-desk">
          <LocalPlayer
            ref={player}
            song={currentSong}
            reservation={session.current}
            upcoming={upcoming
              .slice(0, 3)
              .map((entry) => ({
                title: entry.song!.title,
                singer: entry.item.singer,
                code: entry.song!.code,
              }))}
            autoPlay={autoPlay}
            resumePosition={session.position}
            volume={session.volume}
            tempo={session.tempo}
            repeat={session.repeat}
            canPrevious={session.history.length > 0}
            score={score}
            selection={code}
            selectionTitle={selectedSong?.title}
            onEnded={() => {
              if (session.repeat) player.current?.restart();
              else if (session.scoring)
                setScore(80 + Math.floor(Math.random() * 21));
              else next();
            }}
            onNext={next}
            onPrevious={previous}
            onRepeat={() =>
              dispatch({
                type: "settings",
                settings: { repeat: !session.repeat },
              })
            }
            onVolume={(volume) =>
              dispatch({ type: "settings", settings: { volume } })
            }
            onTempo={(tempo) =>
              dispatch({ type: "settings", settings: { tempo } })
            }
            onPosition={(seconds) => dispatch({ type: "position", seconds })}
            onBrowse={() => {
              document
                .getElementById("songbook")
                ?.scrollIntoView({ behavior: "smooth" });
              document
                .getElementById("songbook-search")
                ?.focus({ preventScroll: true });
            }}
            onImport={() => inputRef.current?.click()}
          />
          <aside
            className="videoke-remote"
            aria-label="Videoke remote and reservations"
          >
            <div className="remote-top">
              <span className="eyebrow">PILI NA. KANTA NA.</span>
              <h2>Make a reservation</h2>
              <p>Your song. Your turn in the spotlight.</p>
            </div>
            <label className="singer-field">
              <Mic2 size={16} />
              <span className="sr-only">Singer name</span>
              <input
                maxLength={80}
                value={singer}
                onChange={(event) => setSinger(event.target.value)}
                placeholder="Singer name"
              />
            </label>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                reserveCode();
              }}
            >
              <label className="code-display">
                <span>SONG NUMBER</span>
                <input
                  aria-label="Song number"
                  inputMode="numeric"
                  maxLength={5}
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, "").slice(0, 5))
                  }
                  placeholder="— — — — —"
                />
              </label>
              <p className="code-preview">
                {selectedSong
                  ? selectedSong.title
                  : code
                    ? "Enter a number from your songbook"
                    : "Find your number in the songbook"}
              </p>
              <div className="numeric-keypad">
                {[
                  "1",
                  "2",
                  "3",
                  "4",
                  "5",
                  "6",
                  "7",
                  "8",
                  "9",
                  "clear",
                  "0",
                  "back",
                ].map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-label={
                      key === "clear"
                        ? "Clear song number"
                        : key === "back"
                          ? "Delete last digit"
                          : `Digit ${key}`
                    }
                    className={key.length > 1 ? "key-utility" : ""}
                    onClick={() =>
                      setCode((value) =>
                        key === "clear"
                          ? ""
                          : key === "back"
                            ? value.slice(0, -1)
                            : (value + key).slice(0, 5),
                      )
                    }
                  >
                    {key === "clear" ? (
                      "CLR"
                    ) : key === "back" ? (
                      <Delete size={19} />
                    ) : (
                      key
                    )}
                  </button>
                ))}
              </div>
              <button
                type="submit"
                className="vk-button primary reserve-code"
                disabled={!ready || !code}
              >
                <PlusIcon /> Reserve song <span>↵</span>
              </button>
            </form>
            <div className="reservations">
              <div className="panel-title">
                <h2>
                  <ListMusic size={17} /> Up next{" "}
                  <span>
                    {session.queue.length.toString().padStart(2, "0")}
                  </span>
                </h2>
                <span className="queue-label">RESERVED</span>
              </div>
              {upcoming.length ? (
                <ol>
                  {upcoming.map(({ item, song }, index) => (
                    <li key={item.id}>
                      <span className="queue-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div className="reservation-info">
                        <strong>{song!.title}</strong>
                        <span>
                          {item.singer} <i>· {song!.code}</i>
                        </span>
                      </div>
                      <div className="queue-actions">
                        <button
                          className="vk-icon"
                          aria-label={`Play reservation ${song!.title}`}
                          onClick={() => {
                            setScore(null);
                            setAutoPlay(true);
                            dispatch({ type: "play", id: item.id });
                          }}
                        >
                          <Play size={13} />
                        </button>
                        <button
                          className="vk-icon"
                          aria-label={`Move ${song!.title} up`}
                          disabled={!index}
                          onClick={() =>
                            dispatch({
                              type: "move",
                              id: item.id,
                              direction: -1,
                            })
                          }
                        >
                          <ArrowUp size={13} />
                        </button>
                        <button
                          className="vk-icon"
                          aria-label={`Move ${song!.title} down`}
                          disabled={index === upcoming.length - 1}
                          onClick={() =>
                            dispatch({
                              type: "move",
                              id: item.id,
                              direction: 1,
                            })
                          }
                        >
                          <ArrowDown size={13} />
                        </button>
                        <button
                          className="vk-icon danger-icon"
                          aria-label={`Remove reservation ${song!.title}`}
                          onClick={() =>
                            dispatch({ type: "remove", id: item.id })
                          }
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <div className="queue-empty">
                  <ListMusic size={23} />
                  <p>The next mic is up for grabs.</p>
                  <span>Reserve a song and join the lineup.</span>
                </div>
              )}
            </div>
            <label className="party-switch">
              <input
                type="checkbox"
                checked={session.scoring}
                onChange={(event) =>
                  dispatch({
                    type: "settings",
                    settings: { scoring: event.target.checked },
                  })
                }
              />
              <span>
                Party scores <small>Simulated · just for fun</small>
              </span>
              <span className="toggle-track" />
            </label>
          </aside>
        </div>
        <div className="library-toolbar">
          <div>
            <FolderInput size={19} />
            <span>
              <strong>Your files. Your collection.</strong>
              <small>
                Videos are copied to this browser. Keep the originals as your
                backup.
              </small>
            </span>
          </div>
          <div className="import-options">
            <label>
              Import as
              <select
                aria-label="Import category"
                value={importCategory}
                onChange={(event) => setImportCategory(event.target.value)}
              >
                <option>OPM</option>
                <option>English</option>
                <option>Custom</option>
              </select>
            </label>
            <button
              className="vk-button outline"
              disabled={!ready || importing}
              onClick={() => inputRef.current?.click()}
            >
              <FolderInput size={17} />
              {importing ? "Importing…" : "Import videos"}
            </button>
          </div>
          <input
            ref={inputRef}
            data-testid="video-import"
            className="sr-only"
            type="file"
            multiple
            accept=".mp4,.webm,video/mp4,video/webm"
            disabled={!ready || importing}
            aria-label="Import local karaoke videos"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              event.target.value = "";
              void importFiles(files);
            }}
          />
        </div>
        <Songbook
          songs={songs}
          ready={ready && !importing}
          onReserve={reserve}
          onImport={() => inputRef.current?.click()}
          onRefresh={refresh}
          onDelete={removeSong}
        />
        <footer className="videoke-footer">
          <div>
            <ShieldCheck size={15} />
            <span>
              {ready ? storageInfo : "Opening local library…"} · Same browser &
              address to keep your collection
            </span>
          </div>
          <button
            onClick={async () => {
              try {
                const granted = await navigator.storage?.persist?.();
                setMessage(
                  granted
                    ? "Persistent storage granted. Keep your original videos as backups."
                    : "Persistent storage was not granted. Keep originals and avoid clearing this site’s browser data.",
                );
              } catch {
                setMessage(
                  "Persistent storage is unavailable. Keep your original videos as backups.",
                );
              }
            }}
          >
            <Check size={14} /> Request persistent storage
          </button>
          <span>KARAOKZ · GOOD COMPANY, GREAT VIDEOKE</span>
        </footer>
      </main>
      <datalist id="videoke-categories">
        <option value="OPM" />
        <option value="English" />
        <option value="Custom" />
        {[...new Set(songs.map((song) => song.category))].map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>
    </div>
  );
}

function PlusIcon() {
  return (
    <span aria-hidden="true" className="reserve-plus">
      +
    </span>
  );
}
