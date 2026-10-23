'use client';

import { use, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'react-qr-code';
import YouTubePlayer from '@/components/YouTubePlayer';
import YouTubeSearch from '@/components/YouTubeSearch';
import RoomQueue from '@/components/RoomQueue';
import QuotaDisplay from '@/components/QuotaDisplay';
import { getSupabase, getRoomErrorMessage } from '@/lib/supabase';
import { roomConfigurationIssue } from '@/lib/config';
import RoomUnavailable from '@/components/RoomUnavailable';
import { getRoomByCode, getQueueItems, addQueueItem, removeQueueItem, touchRoom, endRoom } from '@/lib/rooms';
import { Room, RoomQueueItem } from '@/types/room';
import { YouTubeVideo } from '@/types/youtube';
import { Music, QrCode, X, Copy, Check, LogOut, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const router = useRouter();

  const [room, setRoom] = useState<Room | null>(null);
  const [queueItems, setQueueItems] = useState<RoomQueueItem[]>([]);
  const [currentVideoId, setCurrentVideoId] = useState<string | null>(null);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [copied, setCopied] = useState(false);

  // Ref so callbacks always see fresh queue without stale closures
  const queueRef = useRef<RoomQueueItem[]>([]);
  useEffect(() => { queueRef.current = queueItems; }, [queueItems]);

  const currentItemIdRef = useRef<string | null>(null);
  useEffect(() => { currentItemIdRef.current = currentItemId; }, [currentItemId]);

  // Reconcile from the database on subscription events and periodically. Polling
  // also covers missed DELETE events, reconnects, and room expiry under RLS.
  useEffect(() => {
    if (roomConfigurationIssue) return;
    let cancelled = false;
    let refreshing = false;
    let channel: ReturnType<ReturnType<typeof getSupabase>['channel']> | undefined;
    async function refresh() {
      if (refreshing) return;
      refreshing = true;
      try {
        const found = await getRoomByCode(code);
        if (cancelled) return;
        if (!found) { setNotFound(true); return; }
        const supabase = getSupabase();
        const { data, error } = await supabase.auth.getUser();
        if (error) throw error;
        if (found.host_user_id !== data.user?.id) {
          setRoomError('Only the original host browser can control playback. Use the guest join link to add songs.');
          return;
        }
        const items = await getQueueItems(found.id);
        if (cancelled) return;
        setRoomError(null);
        setRoom(found);
        setQueueItems(items);
        queueRef.current = items;
        const current = items.find(item => item.id === currentItemIdRef.current) ?? items[0];
        setCurrentVideoId(current?.video_id ?? null);
        setCurrentItemId(current?.id ?? null);
        currentItemIdRef.current = current?.id ?? null;
        if (!channel) {
          channel = supabase.channel('host-' + found.id)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_items', filter: 'room_id=eq.' + found.id }, () => { void refresh(); })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + found.id }, () => { void refresh(); })
            .subscribe(status => {
              if (!cancelled && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) setActionError('Realtime connection unavailable. Refreshing the queue every 5 seconds.');
            });
        }
      } catch (error) { if (!cancelled) setRoomError(getRoomErrorMessage(error)); }
      finally { refreshing = false; if (!cancelled) setLoading(false); }
    }
    void refresh();
    const interval = setInterval(() => { void refresh(); }, 5000);
    return () => { cancelled = true; clearInterval(interval); if (channel) void getSupabase().removeChannel(channel); };
  }, [code]);

  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return;
    const touch = () => { void touchRoom(roomId).catch(error => setActionError(getRoomErrorMessage(error))); };
    touch();
    const interval = setInterval(touch, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [roomId]);

  const handleVideoEnd = useCallback(async () => {
    const itemId = currentItemIdRef.current;
    if (!itemId) return;

    try { await removeQueueItem(itemId); }
    catch (error) { setActionError(getRoomErrorMessage(error)); return; }
    const updated = queueRef.current.filter(item => item.id !== itemId);
    setQueueItems(updated);
    queueRef.current = updated;
    setCurrentVideoId(null);
    setCurrentItemId(null);
    currentItemIdRef.current = null;

    if (updated.length > 0) {
      const next = updated[0];
      setCurrentVideoId(next.video_id);
      setCurrentItemId(next.id);
      currentItemIdRef.current = next.id;
    }
  }, []);

  const handlePlayItem = useCallback((item: RoomQueueItem) => {
    setCurrentVideoId(item.video_id);
    setCurrentItemId(item.id);
    currentItemIdRef.current = item.id;
  }, []);

  const handleRemoveItem = useCallback(async (itemId: string) => {
    try { await removeQueueItem(itemId); }
    catch (error) { setActionError(getRoomErrorMessage(error)); return; }
    const updated = queueRef.current.filter(item => item.id !== itemId);
    setQueueItems(updated);
    queueRef.current = updated;

    if (currentItemIdRef.current === itemId) {
      setCurrentVideoId(null);
      setCurrentItemId(null);
      currentItemIdRef.current = null;
      if (updated.length > 0) {
        setCurrentVideoId(updated[0].video_id);
        setCurrentItemId(updated[0].id);
        currentItemIdRef.current = updated[0].id;
      }
    }

  }, []);

  const handleAddToQueue = useCallback(async (video: YouTubeVideo) => {
    if (!room) return;
    try { await addQueueItem(room.id, video, null, 'pc'); }
    catch (error) { setActionError(getRoomErrorMessage(error)); }
    // INSERT subscription updates queueItems automatically
  }, [room]);

  const joinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/room/${code}/add`
    : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { setActionError('Clipboard unavailable. Copy the displayed join URL manually.'); }
  };

  const handleEndSession = async () => {
    if (!room) return;
    if (!confirm('End this karaoke session? Guests will lose access.')) return;
    try { await endRoom(room.id); router.push('/'); }
    catch (error) { setActionError(getRoomErrorMessage(error)); }
  };

  if (roomConfigurationIssue || roomError) return <RoomUnavailable message={roomConfigurationIssue || roomError!} />;

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Music className="h-8 w-8 text-primary mx-auto animate-pulse" />
          <p className="text-sm text-muted-foreground font-mono">Loading room...</p>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-2xl font-mono font-bold text-foreground">{code.toUpperCase()}</p>
          <p className="text-sm text-muted-foreground font-mono">Room not found or has ended.</p>
          <Button onClick={() => router.push('/')} className="font-mono">
            <ArrowLeft className="h-4 w-4 mr-2" /> Go Home
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <motion.header
        className="glass border-b border-border/50 shrink-0"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-2 sm:py-3">
          <div className="flex items-center justify-between gap-2">
            {/* Left: back + title */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => router.push('/')}
                className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors shrink-0"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-1.5">
                <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-primary/20 flex items-center justify-center shrink-0">
                  <Music className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="text-sm sm:text-base font-bold text-foreground font-mono leading-none">
                      KaraOkz
                    </h1>
                    <span className="text-[10px] sm:text-xs font-mono text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full max-w-24 sm:max-w-48 truncate" title={code.toUpperCase()}>
                      {code.toUpperCase()}
                    </span>
                  </div>
                  {room && (
                    <p className="text-[9px] text-muted-foreground font-mono leading-none mt-0.5 hidden sm:block">
                      Host: {room.host_name}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Right: quota + QR + end */}
            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              <QuotaDisplay />
              <button
                onClick={() => setShowQR(true)}
                className="flex items-center gap-1 px-2 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/20 transition-colors font-mono text-[10px] sm:text-xs"
              >
                <QrCode className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                <span className="hidden sm:inline">Share</span>
              </button>
              <button
                onClick={handleEndSession}
                className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground hover:text-destructive transition-colors"
                title="End session"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </motion.header>

      {actionError && <p role="alert" className="p-3 text-xs text-destructive">{actionError}</p>}
      {/* Main */}
      <main className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden p-2 sm:p-4 md:p-6">
        <div className="max-w-7xl mx-auto h-full">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4 lg:h-full">
            {/* Player */}
            <motion.div
              className="md:col-span-2 lg:col-span-2 h-64 sm:h-72 md:h-80 lg:h-full"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <YouTubePlayer videoId={currentVideoId} playbackKey={currentItemId} onVideoEnd={handleVideoEnd} />
            </motion.div>

            {/* Search + Queue */}
            <motion.div
              className="md:col-span-2 lg:col-span-1 h-auto lg:h-full flex flex-col gap-2 sm:gap-4 overflow-hidden"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <YouTubeSearch onAddToQueue={handleAddToQueue} />
              <div className="flex-1 min-h-40 sm:min-h-48 lg:min-h-0 overflow-hidden">
                <RoomQueue
                  items={queueItems}
                  currentItemId={currentItemId}
                  onPlay={handlePlayItem}
                  onRemove={handleRemoveItem}
                />
              </div>
            </motion.div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <motion.footer
        className="glass border-t border-border/50 shrink-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3, delay: 0.3 }}
      >
        <div className="max-w-7xl mx-auto px-2 sm:px-4 md:px-6 py-2">
          <p className="text-center text-[10px] text-muted-foreground font-mono">
            © {new Date().getFullYear()} Zio Magugat · Built with intention
          </p>
        </div>
      </motion.footer>

      {/* QR Modal */}
      <AnimatePresence>
        {showQR && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowQR(false)}
            />

            <motion.div
              className="relative glass rounded-2xl p-6 w-full max-w-xs border border-border/50 z-10 text-center"
              initial={{ opacity: 0, scale: 0.9, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 12 }}
              transition={{ duration: 0.2 }}
            >
              <button
                onClick={() => setShowQR(false)}
                className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-4 w-4" />
              </button>

              <p className="text-xs text-muted-foreground font-mono mb-1">Scan to join</p>
              <p className="text-sm break-all font-mono font-bold text-primary mb-4 tracking-widest">
                {code.toUpperCase()}
              </p>

              {/* QR Code */}
              <div className="bg-white p-3 rounded-xl inline-block mb-4">
                <QRCode value={joinUrl} size={180} />
              </div>

              <p className="text-[10px] text-muted-foreground font-mono mb-3 break-all px-2">
                {joinUrl}
              </p>

              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 mx-auto text-[11px] font-mono text-primary hover:text-primary/80 transition-colors"
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied ? 'Copied!' : 'Copy link'}
              </button>

              <p className="text-[9px] text-muted-foreground/60 font-mono mt-3">
                On the same network? Use your machine&apos;s local IP instead of localhost.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
