'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Mic, Play, SkipForward } from 'lucide-react';

interface YouTubePlayerProps {
  videoId: string | null;
  playbackKey?: string | null;
  onVideoEnd: () => void;
}

interface IFramePlayer { destroy(): void; }
interface IFrameApi {
  Player: new (element: HTMLElement, options: {
    height: string; width: string; videoId: string;
    playerVars: Record<string, number | string>;
    events: { onStateChange(event: { data: number }): void; onError(event: { data: number }): void; onAutoplayBlocked(): void };
  }) => IFramePlayer;
  PlayerState: { ENDED: number; PLAYING: number };
}

declare global {
  interface Window {
    YT?: IFrameApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiRequest: Promise<IFrameApi> | undefined;
function loadYouTubeApi(): Promise<IFrameApi> {
  if (window.YT?.Player) return Promise.resolve(window.YT);
  apiRequest ??= new Promise<IFrameApi>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YouTube did not load. Check your connection and whether YouTube is accessible.')), 15000);
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      clearTimeout(timeout);
      if (window.YT) resolve(window.YT);
    };
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('YouTube is unavailable. Check your connection or content blocker.'));
    };
    document.head.appendChild(script);
  });
  return apiRequest;
}

/**
 * Audio Visualizer Bars Component
 */
function AudioVisualizer({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((bar) => (
        <motion.div
          key={bar}
          className="w-1 bg-primary rounded-sm"
          animate={isPlaying ? {
            height: ['8px', '16px', '8px', '12px', '8px'],
          } : {
            height: '8px',
          }}
          transition={isPlaying ? {
            duration: 0.8,
            repeat: Infinity,
            delay: bar * 0.1,
            ease: 'easeInOut',
          } : {}}
        />
      ))}
    </div>
  );
}

/**
 * YouTube Player Component
 * Uses YouTube IFrame Player API for better control over playback
 */
export default function YouTubePlayer({ videoId, playbackKey, onVideoEnd }: YouTubePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState('Ready to play');
  const [isPlaying, setIsPlaying] = useState(false);
  const onVideoEndRef = useRef(onVideoEnd);

  // Keep onVideoEnd ref updated
  useEffect(() => {
    onVideoEndRef.current = onVideoEnd;
  }, [onVideoEnd]);

  // The wrapper always exists. YouTube owns only its child, which it replaces
  // with an iframe. Cancel pending initialization on navigation/Strict Mode cleanup.
  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;
    let player: IFramePlayer | undefined;
    const container = containerRef.current;
    loadYouTubeApi().then(api => {
      if (cancelled || !container) return;
      setStatus('Press play if autoplay is blocked');
      setIsPlaying(false);
      const target = document.createElement('div');
      container.replaceChildren(target);
      player = new api.Player(target, {
        height: '100%', width: '100%', videoId,
        playerVars: { autoplay: 1, controls: 1, rel: 0, fs: 1, origin: window.location.origin },
        events: {
          onStateChange: event => {
            if (cancelled) return;
            setIsPlaying(event.data === api.PlayerState.PLAYING);
            setStatus(event.data === api.PlayerState.PLAYING ? 'Now playing' : 'Playback paused or loading');
            if (event.data === api.PlayerState.ENDED) onVideoEndRef.current();
          },
          onError: event => {
            if (cancelled) return;
            setIsPlaying(false);
            setStatus(`YouTube playback unavailable (error ${event.data}). The video may be private, restricted, or disallow embedding. Try another video.`);
          },
          onAutoplayBlocked: () => { if (!cancelled) setStatus('Autoplay blocked. Press play in the YouTube player.'); },
        },
      });
    }).catch(error => { if (!cancelled) { setIsPlaying(false); setStatus(error.message); } });
    return () => {
      cancelled = true;
      player?.destroy();
      container?.replaceChildren();
    };
  }, [videoId, playbackKey]);

  return (
    <div className="glass rounded-lg w-full h-full overflow-hidden flex flex-col">
      <div ref={containerRef} hidden={!videoId} className="w-full flex-1 min-h-0" />
      {videoId ? (
        <>
          {/* Status Bar */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-t border-border/50 flex items-center justify-between">
            <span role="status" className="text-[10px] sm:text-xs text-muted-foreground font-mono">{status}</span>
            <button onClick={onVideoEnd} aria-label="Next song" className="shrink-0 p-1 text-primary"><SkipForward size={18} /></button>
            <AudioVisualizer isPlaying={isPlaying} />
          </div>
        </>
      ) : (
        <>
          <div className="w-full flex-1 flex items-center justify-center p-4">
            <div className="text-center space-y-3 sm:space-y-6">
              {/* Microphone Icon */}
              <div className="w-12 h-12 sm:w-16 sm:h-16 md:w-20 md:h-20 rounded-full bg-muted/60 mx-auto flex items-center justify-center">
                <Mic className="h-6 w-6 sm:h-8 sm:w-8 md:h-10 md:w-10 text-muted-foreground" />
              </div>
              
              {/* Text */}
              <div className="space-y-1 sm:space-y-2">
                <h3 className="text-base sm:text-lg md:text-xl font-bold text-foreground font-mono">
                  No Song Playing
                </h3>
                <p className="text-xs sm:text-sm text-muted-foreground max-w-[200px] sm:max-w-xs mx-auto">
                  Search for a song and add it to the queue to get the party started!
                </p>
              </div>
              
              {/* CTA Button */}
              <button onClick={() => document.querySelector<HTMLInputElement>('input')?.focus()} className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-md bg-primary text-primary-foreground font-mono text-xs sm:text-sm font-semibold hover:opacity-90 transition-opacity glow-primary">
                <Play size={14} className="sm:hidden" />
                <Play size={16} className="hidden sm:block" />
                Pick a Song
              </button>
            </div>
          </div>
          
          {/* Status Bar */}
          <div className="px-2 sm:px-4 py-2 sm:py-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-[10px] sm:text-xs text-muted-foreground font-mono">Ready to play</span>
            <AudioVisualizer isPlaying={false} />
          </div>
        </>
      )}
    </div>
  );
}
