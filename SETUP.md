> **Local videoke is now the homepage.** For MP4/WebM import, local playback, song numbers, singer reservations and TV controls, use [VIDEOKE_MIGRATION.md](VIDEOKE_MIGRATION.md). No API credentials are needed. The older standalone YouTube interface described below is preserved at **/online**; its Supabase and YouTube configuration is optional and independent of the local library.
# Setup

## 1. Run locally without accounts

Use Node.js 22.13+ on the 22.x line, or Node.js 24+. The verified environment uses Node 22.16.0.

~~~powershell
npm.cmd ci
npm.cmd run dev
~~~

Open http://localhost:3000. If the terminal says another server for this directory is already running, use that server. Stop your existing server with Ctrl+C before restarting after dependency/environment changes. Do not start multiple development servers for this checkout.

No .env.local is required for demo mode. The **URL** tab accepts YouTube watch links, short links, embeds, Shorts/live links, or 11-character IDs. Fetch creates an explicitly unverified local item when no YouTube API key is configured; it does not verify that the video exists. Add it to test the queue. Direct playback still connects to YouTube.

Missing/invalid Supabase settings show a demo banner and disable room creation/joining. Direct room URLs show a configuration message with a link home. NEXT_PUBLIC_DEMO_MODE=true explicitly forces this behavior even if Supabase credentials exist.

## 2. Configure environment variables when needed

~~~powershell
Copy-Item .env.example .env.local
~~~

Do not overwrite an existing .env.local. Fill in only your own real values in that ignored file. The example deliberately contains no sample credentials.

| Variable | Required for |
| --- | --- |
| NEXT_PUBLIC_DEMO_MODE | Optional: true forces demo; false or empty permits configured Supabase |
| NEXT_PUBLIC_SUPABASE_URL | Shared rooms: project HTTPS URL; HTTP permitted for localhost |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Shared rooms: public publishable key |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | Alternative to publishable key: legacy JWT with role anon |
| NEXT_PUBLIC_YOUTUBE_API_KEY | Search and verified video metadata; optional for direct-link local use |

The publishable key takes precedence if both Supabase keys are set. All NEXT_PUBLIC_ values are included in browser code; they are public configuration. Use RLS and key restrictions to protect services. Never use a service_role JWT, sb_secret_ key, database password, or private credential here. Validation catches missing/malformed configuration; it does not prove that credentials are authorized or the network is reachable.

Restart the development server after changing environment values. Production deployments must be rebuilt after NEXT_PUBLIC_ changes.

## 3. Enable real shared rooms on a fresh Supabase project

1. Create a separate development project in Supabase.
2. Find its project URL and public publishable key (legacy anon also supported). Add them to .env.local.
3. Enable **Anonymous Sign-Ins** in Supabase Auth. The app creates a session when a room action first needs one, preserving the no-password room flow. Anonymous users have the authenticated database role, unlike unauthenticated requests using the anon role.
4. On a **fresh project only**, run the complete supabase/bootstrap.sql file manually in SQL Editor as the project database administrator. It creates rooms, room_members, queue_items, policies, RPCs, indexes, and Realtime publication entries inside a transaction.
5. Leave NEXT_PUBLIC_DEMO_MODE empty or false; restart the server.
6. Create a room from the homepage in the host browser. Share the full QR/join URL; room codes now contain 32 hexadecimal characters rather than the guessable legacy word-number codes.
7. Test with a second browser/device: add, reorder, and remove songs; verify the host updates. Only the original host session may control the host screen or end the room.

The app subscribes to rooms and queue_items changes and refreshes every five seconds to reconcile missed changes, DELETE events, disconnections, and ended sessions. Playback position is local to the host; is_playing/is_played are retained schema fields, not a synchronized playback protocol.

### Existing databases

Do not run the old plan.sql policies. That file is now commented as a historical reference. The new bootstrap deliberately refuses existing application tables and does not migrate, delete, or reset data.

If you previously ran the old schema, use a separate fresh development project to test this version. A production migration needs a backup and a reviewed plan to assign ownership, introduce memberships, rotate legacy room codes, replace permissive policies, and install the new RPCs. Existing rooms have no trustworthy host identity to backfill automatically. No such migration was executed.

### Database access

- Unauthenticated anon requests cannot access application tables or RPCs.
- Signed-in sessions can create their own rooms.
- Joining requires possession of the room code; joined members can see that room and collaboratively manage its queue.
- Only the host can end a room or update its activity. Clients cannot overwrite ownership or codes.
- Queue inserts/position swaps run in atomic RPCs and lock per room.
- cleanup_inactive_rooms() is admin-only. Optionally schedule it hourly with Supabase Cron to mark rooms inactive after 24 hours without host activity; nothing is scheduled automatically.
- Before public deployment, configure Auth abuse controls/CAPTCHA and test the live Realtime/RLS behavior. CAPTCHA is not integrated into this local setup.

The schema has been executed and authorization-tested against an isolated in-memory PostgreSQL engine. Supabase Auth and live Realtime still require end-to-end testing in your project.

Reference: [Supabase Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous), [RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

## 4. Enable YouTube search

1. In Google Cloud Console, create/select a project and enable YouTube Data API v3.
2. Create a browser API key. Restrict its API scope to YouTube Data API v3.
3. Restrict HTTP referrers to the origins you use, for example http://localhost:3000/* and http://127.0.0.1:3000/*. Add your actual LAN/production origin when needed.
4. Set NEXT_PUBLIC_YOUTUBE_API_KEY in .env.local and restart.
5. Search for a song/artist, add a result, and confirm playback.

Search uses search.list plus videos.list. URL metadata fetches use videos.list when a key is configured, so they also require available quota. A quota error is reported rather than presented as a working bypass. The displayed quota is only a per-browser estimate; Google Cloud is authoritative. The estimate resets on the Pacific-time date boundary.

Reference: [YouTube Data API setup](https://developers.google.com/youtube/data/getting-started), [IFrame API](https://developers.google.com/youtube/iframe_api_reference).

## 5. Network, phone, and playback notes

- Search needs www.googleapis.com; playback needs YouTube; thumbnails need i.ytimg.com. These services must be reachable from your network.
- Playback has no Data API key requirement. Videos may be unavailable, private, regional/age-restricted, or blocked from embedding. The player shows errors; choose another video.
- Press Play in the iframe if the browser blocks autoplay. The Next song button also advances the queue manually.
- For a phone, use the host computer's LAN address instead of localhost, bind the dev server to your LAN if necessary, and use a trusted network. Referrer restrictions must include that origin. QR camera access and clipboard APIs generally require HTTPS or localhost.
- Settings remains a pre-existing placeholder; theme components are present but not wired into the current page. No redesign was performed.

## 6. Validate

~~~powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd audit
npm.cmd audit --omit=dev
~~~

npm.cmd works around PowerShell's npm.ps1 execution-policy restriction without changing system security settings. Full audit currently reports five high development-tool findings in one unpatched braces dependency chain; production audit reports zero. See DEVELOPMENT_AUDIT.md.

