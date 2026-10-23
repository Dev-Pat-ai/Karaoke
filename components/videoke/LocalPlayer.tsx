"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Disc3,
  FolderOpen,
  Maximize,
  Mic2,
  Pause,
  Play,
  Repeat2,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from "lucide-react";
import type { LocalSong, Reservation } from "@/types/videoke";
import { getMedia, libraryError } from "@/lib/videoke/library";

export interface PlayerHandle {
  toggle(): void;
  restart(): void;
  fullscreen(): void;
  seek(seconds: number): void;
}

interface Props {
  song?: LocalSong;
  reservation: Reservation | null;
  upcoming: { title: string; singer: string; code: string }[];
  autoPlay: boolean;
  resumePosition: number;
  volume: number;
  tempo: number;
  repeat: boolean;
  canPrevious: boolean;
  selection: string;
  selectionTitle?: string;
  score: number | null;
  onEnded(): void;
  onNext(): void;
  onPrevious(): void;
  onRepeat(): void;
  onVolume(value: number): void;
  onTempo(value: number): void;
  onPosition(value: number): void;
  onBrowse(): void;
  onImport(): void;
}

export function clock(seconds: number): string {
  if (!Number.isFinite(seconds)) return "0:00";
  const value = Math.max(0, Math.floor(seconds));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
}

const LocalPlayer = forwardRef<PlayerHandle, Props>(
  function LocalPlayer(props, ref) {
    const { song, reservation, volume, tempo, repeat, onPosition } = props;
    const stageRef = useRef<HTMLDivElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const [source, setSource] = useState<{
      id: string;
      url?: string;
      error?: string;
    } | null>(null);
    const [playing, setPlaying] = useState(false);
    const [notice, setNotice] = useState("");
    const [elapsed, setElapsed] = useState(0);
    const [duration, setDuration] = useState(0);
    const [theater, setTheater] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);
    const [tempoSupported, setTempoSupported] = useState(false);
    const lastSaved = useRef(0);
    const id = reservation?.id;
    const songId = song?.id;

    useEffect(() => {
      if (!id || !songId) return;
      let cancelled = false;
      let url: string | undefined;
      getMedia(songId)
        .then((blob) => {
          if (cancelled) return;
          url = URL.createObjectURL(blob);
          setSource({ id, url });
          setNotice("");
          setPlaying(false);
          setElapsed(0);
          setDuration(0);
          lastSaved.current = 0;
        })
        .catch((error) => {
          if (!cancelled) setSource({ id, error: libraryError(error) });
        });
      return () => {
        cancelled = true;
        if (url) URL.revokeObjectURL(url);
      };
    }, [id, songId]);

    useEffect(() => {
      const video = videoRef.current;
      if (!video) return;
      video.volume = volume;
      // Do not alter pitch as a side-effect on browsers without pitch preservation.
      video.playbackRate = "preservesPitch" in video ? tempo : 1;
      if ("preservesPitch" in video) video.preservesPitch = true;
    }, [volume, tempo, source]);

    useEffect(() => {
      const changed = () =>
        setFullscreen(document.fullscreenElement === stageRef.current);
      const escape = (event: KeyboardEvent) => {
        if (event.key === "Escape") setTheater(false);
      };
      document.addEventListener("fullscreenchange", changed);
      window.addEventListener("keydown", escape);
      return () => {
        document.removeEventListener("fullscreenchange", changed);
        window.removeEventListener("keydown", escape);
      };
    }, []);

    async function play() {
      const video = videoRef.current;
      if (!video) {
        setNotice("Select a local song first.");
        return;
      }
      try {
        await video.play();
        setNotice("");
      } catch (error) {
        setNotice(
          error instanceof Error && error.name === "NotAllowedError"
            ? "Your browser paused autoplay. Press Play to begin."
            : "Playback could not start. Try Play again, or import an MP4 (H.264/AAC) or WebM your browser can decode.",
        );
      }
    }

    async function toggleFullscreen() {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else if (theater) setTheater(false);
        else if (stageRef.current?.requestFullscreen)
          await stageRef.current.requestFullscreen();
        else {
          setTheater(true);
          setNotice(
            "Browser fullscreen is unavailable. TV view is active; press F11 for browser fullscreen, Esc to leave.",
          );
        }
      } catch {
        setTheater(true);
        setNotice(
          "Fullscreen request was blocked. TV view is active; press F11 for browser fullscreen, Esc to leave.",
        );
      }
    }

    function toggle() {
      if (props.score !== null) return;
      const video = videoRef.current;
      if (video && !video.paused) video.pause();
      else void play();
    }
    function restart() {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = 0;
      onPosition(0);
      void play();
    }
    useImperativeHandle(ref, () => ({
      toggle,
      restart,
      fullscreen: () => {
        void toggleFullscreen();
      },
      seek: (seconds) => {
        const video = videoRef.current;
        if (video && Number.isFinite(video.duration))
          video.currentTime = Math.max(
            0,
            Math.min(video.duration, video.currentTime + seconds),
          );
      },
    }));

    const active = source?.id === id ? source : null;
    return (
      <section
        ref={stageRef}
        className={`videoke-stage ${theater ? "tv-theater" : ""}`}
        aria-label="Videoke television"
      >
        <div className="stage-heading">
          <span className="stage-live">
            <span className={playing ? "signal-dot active" : "signal-dot"} />
            {playing ? "NOW SINGING" : "READY TO SING"}
          </span>
          <span className="stage-local">LOCAL VIDEO · NO ADS</span>
        </div>
        <div className="video-plane">
          {song && reservation ? (
            active?.url ? (
              // Lyrics are embedded in the user's video; no separate lyric track is supplied.
              <video
                key={id}
                ref={videoRef}
                src={active.url}
                playsInline
                preload="auto"
                aria-label={`Karaoke video: ${song.title}`}
                loop={repeat}
                onLoadedMetadata={(event) => {
                  const video = event.currentTarget;
                  setTempoSupported("preservesPitch" in video);
                  video.volume = volume;
                  video.playbackRate = "preservesPitch" in video ? tempo : 1;
                  if ("preservesPitch" in video) video.preservesPitch = true;
                  setDuration(video.duration);
                  const resume = Math.min(
                    props.resumePosition,
                    Math.max(0, video.duration - 0.5),
                  );
                  if (resume > 0) video.currentTime = resume;
                  if (props.autoPlay) void play();
                  else
                    setNotice(
                      "Session restored. Press Play when you are ready.",
                    );
                }}
                onPlay={() => setPlaying(true)}
                onPause={() => {
                  setPlaying(false);
                  if (videoRef.current)
                    onPosition(videoRef.current.currentTime);
                }}
                onTimeUpdate={(event) => {
                  const time = event.currentTarget.currentTime;
                  setElapsed(time);
                  if (Math.abs(time - lastSaved.current) >= 3) {
                    lastSaved.current = time;
                    onPosition(time);
                  }
                }}
                onEnded={() => {
                  setPlaying(false);
                  props.onEnded();
                }}
                onError={() => {
                  setPlaying(false);
                  setNotice(
                    "This video cannot be decoded. Use MP4 with H.264/AAC or a supported WebM codec. Your file was not changed. Choose another song or press Next.",
                  );
                }}
                onWaiting={() => setNotice("Reading local video…")}
                onPlaying={() => setNotice("")}
              />
            ) : (
              <div
                className="player-message"
                role={active?.error ? "alert" : "status"}
              >
                <Disc3 className={active?.error ? "" : "loading-disc"} />
                <p>{active?.error ?? "Loading your local video…"}</p>
              </div>
            )
          ) : (
            <div className="stage-idle">
              <div className="idle-orbit" aria-hidden="true">
                <Mic2 strokeWidth={1.2} />
              </div>
              <span className="eyebrow">YOUR LIVING ROOM. YOUR STAGE.</span>
              <h1>Isang kanta pa.</h1>
              <p>
                Good songs. Great company.
                <br />
                Your videoke night starts here.
              </p>
              <div className="idle-actions">
                <button className="vk-button primary" onClick={props.onImport}>
                  <FolderOpen size={17} /> Import karaoke videos
                </button>
                <button className="vk-button ghost" onClick={props.onBrowse}>
                  Open songbook
                </button>
              </div>
              <span className="idle-footnote">
                MP4 / WEBM · USE YOUR OWN LEGALLY OBTAINED FILES
              </span>
            </div>
          )}
          {props.selection && (
            <div className="tv-entry" role="status">
              <span>RESERVE</span>
              <strong>{props.selection.padStart(5, "0")}</strong>
              <p>{props.selectionTitle ?? "Number not in songbook"}</p>
              <small>ENTER TO RESERVE</small>
            </div>
          )}
          {props.score !== null && (
            <div className="party-score" role="status">
              <span className="eyebrow">PALAKPAKAN NAMAN!</span>
              <h2>That deserves an encore.</h2>
              <div className="score-value">
                {props.score}
                <span>/ 100</span>
              </div>
              <strong>SIMULATED PARTY SCORE</strong>
              <p>Just for fun. No microphone or singing analysis.</p>
              <button className="vk-button primary" onClick={props.onNext}>
                Continue to next song <SkipForward size={18} />
              </button>
              <small>Next reservation starts automatically in 5 seconds.</small>
            </div>
          )}
        </div>
        <div className="now-strip">
          <div className="song-number">{song?.code ?? "— — — — —"}</div>
          <div className="now-song">
            <strong>{song?.title ?? "The microphone is yours"}</strong>
            <span>
              {song
                ? `${song.artist} · ${reservation?.singer}`
                : "Import a video, choose a number, and sing."}
            </span>
          </div>
          <span className="local-badge">{song?.category ?? "VIDEOKE"}</span>
        </div>
        <div className="playback-panel">
          <label className="seek-line">
            <span className="sr-only">Playback position</span>
            <input
              type="range"
              min="0"
              max={Number.isFinite(duration) ? duration : 0}
              step="0.1"
              value={elapsed}
              disabled={!active?.url || !duration}
              onChange={(event) => {
                if (videoRef.current) {
                  videoRef.current.currentTime = Number(event.target.value);
                  setElapsed(Number(event.target.value));
                  onPosition(Number(event.target.value));
                }
              }}
            />
            <span>
              {clock(elapsed)} / {clock(duration)}
            </span>
          </label>
          <div className="transport-row">
            <div className="transport-buttons">
              <button
                className="vk-icon"
                aria-label="Previous song"
                title="Previous song (B)"
                onClick={props.onPrevious}
                disabled={!reservation && !props.canPrevious}
              >
                <SkipBack size={21} />
              </button>
              <button
                className="play-button"
                aria-label={playing ? "Pause" : "Play"}
                title="Play / pause (Space)"
                onClick={toggle}
                disabled={!active?.url || props.score !== null}
              >
                {playing ? (
                  <Pause size={23} fill="currentColor" />
                ) : (
                  <Play size={23} fill="currentColor" />
                )}
              </button>
              <button
                className="vk-icon"
                aria-label="Next song"
                title="Next song (N)"
                onClick={props.onNext}
                disabled={!reservation}
              >
                <SkipForward size={21} />
              </button>
              <button
                className={`vk-icon ${repeat ? "selected" : ""}`}
                aria-label="Repeat song"
                aria-pressed={repeat}
                title="Repeat song (R)"
                onClick={props.onRepeat}
              >
                <Repeat2 size={19} />
              </button>
            </div>
            <label className="volume-control">
              {volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              <span className="sr-only">Volume</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={volume}
                onChange={(event) => props.onVolume(Number(event.target.value))}
              />
              <span>{Math.round(volume * 100)}%</span>
            </label>
            <label
              className="tempo-control"
              title={
                tempoSupported
                  ? "Tempo with pitch preserved by the browser. Independent pitch shifting is unavailable."
                  : "Tempo stays at 1× until a video and browser support pitch preservation."
              }
            >
              <span>TEMPO</span>
              <select
                aria-label="Tempo"
                value={tempoSupported ? tempo : 1}
                disabled={!tempoSupported}
                onChange={(event) => props.onTempo(Number(event.target.value))}
              >
                {[0.75, 0.9, 1, 1.1, 1.25].map((speed) => (
                  <option key={speed} value={speed}>
                    {speed.toFixed(2)}×
                  </option>
                ))}
              </select>
            </label>
            <button
              className="vk-icon fullscreen-button"
              aria-label="Toggle TV fullscreen"
              title="TV fullscreen (F)"
              onClick={() => {
                void toggleFullscreen();
              }}
            >
              <Maximize size={21} />
              <span>{fullscreen || theater ? "Exit TV" : "TV mode"}</span>
            </button>
          </div>
          {notice && (
            <p className="player-notice" role="status">
              {notice}
            </p>
          )}
        </div>
        <div className="stage-upcoming">
          <span>UP NEXT</span>
          {props.upcoming.length ? (
            <p>
              {props.upcoming
                .map((item) => `${item.code}  ${item.title} — ${item.singer}`)
                .join("     /     ")}
            </p>
          ) : (
            <p>Make a reservation. Keep the night going.</p>
          )}
        </div>
      </section>
    );
  },
);

export default LocalPlayer;
