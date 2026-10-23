-- FRESH Supabase projects only. Run manually in SQL Editor as postgres.
-- Fails and rolls back if any application table already exists. See SETUP.md.
begin;
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code ~ '^[A-F0-9]{32}$'),
  host_user_id uuid not null default auth.uid() references auth.users(id),
  host_name text not null check (length(host_name) between 1 and 100),
  created_at timestamptz not null default now(),
  last_active_at timestamptz not null default now(),
  is_active boolean not null default true,
  settings jsonb not null default '{}'::jsonb
);
create table public.room_members (
  room_id uuid not null references public.rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (room_id, user_id)
);
create table public.queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  video_id text not null check (video_id ~ '^[a-zA-Z0-9_-]{11}$'),
  title text not null check (length(title) between 1 and 500),
  channel_name text not null default '' check (length(channel_name) <= 500),
  thumbnail text not null default '' check (length(thumbnail) <= 2048),
  duration text not null default 'Unknown' check (length(duration) <= 30),
  singer_name text check (length(singer_name) <= 100),
  position bigint not null default 0,
  is_played boolean not null default false,
  is_playing boolean not null default false,
  added_from text not null default 'pc' check (added_from in ('pc','phone','manual')),
  added_at timestamptz not null default now()
);
create index on public.queue_items(room_id, position);
create index on public.rooms(host_user_id);
create index on public.room_members(user_id, room_id);
alter table public.rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.queue_items enable row level security;

-- Definer helpers use an empty search path and explicit object names.
create function public.is_room_member(p_room_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.rooms r where r.id = p_room_id and r.is_active
    and (r.host_user_id = (select auth.uid()) or exists (
      select 1 from public.room_members m where m.room_id = r.id and m.user_id = (select auth.uid())
    )));
$$;
create policy rooms_read on public.rooms for select to authenticated
  using (host_user_id = (select auth.uid()) or public.is_room_member(id));
create policy rooms_create on public.rooms for insert to authenticated
  with check (host_user_id = (select auth.uid()));
create policy rooms_host_update on public.rooms for update to authenticated
  using (host_user_id = (select auth.uid())) with check (host_user_id = (select auth.uid()));
create policy members_read_self on public.room_members for select to authenticated
  using (user_id = (select auth.uid()));
create policy queue_read on public.queue_items for select to authenticated
  using (public.is_room_member(room_id));
create policy queue_remove on public.queue_items for delete to authenticated
  using (public.is_room_member(room_id));

revoke all on public.rooms, public.room_members, public.queue_items from anon, authenticated;
grant select on public.rooms, public.room_members, public.queue_items to authenticated;
grant insert (code, host_name) on public.rooms to authenticated;
grant update (is_active) on public.rooms to authenticated;
grant delete on public.queue_items to authenticated;

create function public.generate_room_code() returns text
language sql volatile set search_path = '' as $$
  select upper(replace(gen_random_uuid()::text, '-', ''));
$$;
create function public.join_room(p_code text) returns setof public.rooms
language plpgsql security definer set search_path = '' as $$
declare r public.rooms;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into r from public.rooms where code = upper(trim(p_code)) and is_active;
  if not found then return; end if;
  insert into public.room_members(room_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return next r;
end;
$$;

create function public.enqueue_song(
  p_room_id uuid, p_video_id text, p_title text, p_channel_name text,
  p_thumbnail text, p_duration text, p_singer_name text, p_added_from text
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_room_member(p_room_id) then raise exception 'Room access denied' using errcode = '42501'; end if;
  perform 1 from public.rooms where id = p_room_id for update;
  if not public.is_room_member(p_room_id) then raise exception 'Room access denied' using errcode = '42501'; end if;
  insert into public.queue_items(room_id, video_id, title, channel_name, thumbnail, duration, singer_name, added_from, position)
    select p_room_id, p_video_id, p_title, p_channel_name, p_thumbnail, p_duration, p_singer_name, p_added_from,
      coalesce(max(position) + 1, 0) from public.queue_items where room_id = p_room_id;
end;
$$;
create function public.move_queue_item(p_item_id uuid, p_direction text) returns void
language plpgsql security definer set search_path = '' as $$
declare item public.queue_items; other public.queue_items;
begin
  select * into item from public.queue_items where id = p_item_id;
  if not found then raise exception 'Song not found'; end if;
  if not public.is_room_member(item.room_id) then raise exception 'Room access denied' using errcode = '42501'; end if;
  perform 1 from public.rooms where id = item.room_id for update;
  if not public.is_room_member(item.room_id) then raise exception 'Room access denied' using errcode = '42501'; end if;
  select * into item from public.queue_items where id = p_item_id for update;
  if not found then raise exception 'Song not found'; end if;
  if p_direction = 'up' then
    select * into other from public.queue_items where room_id = item.room_id and position < item.position and not is_played order by position desc limit 1 for update;
  elsif p_direction = 'down' then
    select * into other from public.queue_items where room_id = item.room_id and position > item.position and not is_played order by position limit 1 for update;
  else raise exception 'Invalid direction'; end if;
  if other.id is null then return; end if;
  update public.queue_items set position = other.position where id = item.id;
  update public.queue_items set position = item.position where id = other.id;
end;
$$;
create function public.touch_room(p_room_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.rooms set last_active_at = now()
    where id = p_room_id and host_user_id = (select auth.uid()) and is_active;
  if not found then raise exception 'Only the active room host may update activity' using errcode = '42501'; end if;
end;
$$;
create function public.cleanup_inactive_rooms() returns void
language sql security definer set search_path = '' as $$
  update public.rooms set is_active = false where is_active and last_active_at < now() - interval '24 hours';
$$;
revoke all on function public.is_room_member(uuid), public.generate_room_code(), public.join_room(text),
  public.enqueue_song(uuid,text,text,text,text,text,text,text), public.move_queue_item(uuid,text),
  public.touch_room(uuid), public.cleanup_inactive_rooms() from public, anon, authenticated;
grant execute on function public.is_room_member(uuid), public.generate_room_code(), public.join_room(text),
  public.enqueue_song(uuid,text,text,text,text,text,text,text), public.move_queue_item(uuid,text),
  public.touch_room(uuid) to authenticated;
-- Cleanup is admin-only; scheduling is optional and manual.
do $$ begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise exception 'Supabase Realtime publication is missing';
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'rooms') then
    alter publication supabase_realtime add table public.rooms;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'queue_items') then
    alter publication supabase_realtime add table public.queue_items;
  end if;
end $$;
commit;
