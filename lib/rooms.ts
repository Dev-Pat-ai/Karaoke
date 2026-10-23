import { ensureRoomSession } from './supabase';
import { Room, RoomQueueItem } from '@/types/room';
import { YouTubeVideo } from '@/types/youtube';

export async function createRoom(hostName: string): Promise<{ id: string; code: string }> {
  const supabase = await ensureRoomSession();
  const { data: code, error: codeError } = await supabase.rpc('generate_room_code');
  if (codeError) throw codeError;

  const { data, error } = await supabase
    .from('rooms')
    .insert({ code, host_name: hostName })
    .select('id, code')
    .single();

  if (error) throw error;
  return data as { id: string; code: string };
}

export async function getRoomByCode(code: string): Promise<Room | null> {
  const supabase = await ensureRoomSession();
  const { data, error } = await supabase.rpc('join_room', { p_code: code.trim().toUpperCase() });
  if (error) throw error;
  return (data?.[0] as Room) ?? null;
}

export async function getQueueItems(roomId: string): Promise<RoomQueueItem[]> {
  const supabase = await ensureRoomSession();
  const { data, error } = await supabase
    .from('queue_items')
    .select('*')
    .eq('room_id', roomId)
    .eq('is_played', false)
    .order('position', { ascending: true });

  if (error) throw error;
  return data as RoomQueueItem[];
}

export async function addQueueItem(
  roomId: string,
  video: YouTubeVideo,
  singerName: string | null,
  addedFrom: 'pc' | 'phone' | 'manual'
): Promise<void> {
  const supabase = await ensureRoomSession();
  const { error } = await supabase.rpc('enqueue_song', {
    p_room_id: roomId, p_video_id: video.id, p_title: video.title,
    p_channel_name: video.channelName, p_thumbnail: video.thumbnail,
    p_duration: video.duration, p_singer_name: singerName, p_added_from: addedFrom,
  });
  if (error) throw error;
}

export async function removeQueueItem(itemId: string): Promise<void> {
  const supabase = await ensureRoomSession();
  const { data, error } = await supabase.from('queue_items').delete().eq('id', itemId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Song was already removed or room access has ended.');
}

// The RPC swaps both positions atomically using the current database order.
export async function moveQueueItem(
  itemId: string,
  direction: 'up' | 'down'
): Promise<void> {
  const supabase = await ensureRoomSession();
  const { error } = await supabase.rpc('move_queue_item', { p_item_id: itemId, p_direction: direction });
  if (error) throw error;
}

export async function touchRoom(roomId: string): Promise<void> {
  const supabase = await ensureRoomSession();
  const { error } = await supabase.rpc('touch_room', { p_room_id: roomId });
  if (error) throw error;
}

export async function endRoom(roomId: string): Promise<void> {
  const supabase = await ensureRoomSession();
  const { data, error } = await supabase.from('rooms').update({ is_active: false }).eq('id', roomId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('Only this room’s host can end the session.');
}
