# KaraOkz — Home Videoke

A local Filipino home videoke console built on the existing Next.js 16, TypeScript, and Tailwind foundation.

**Your computer is the machine. Your television is the stage.** Import your own legally obtained karaoke videos, choose a song number, reserve under a singer's name, and sing along with lyrics embedded in the video.

## Start

~~~powershell
npm.cmd ci
npm.cmd run dev
~~~

Open http://localhost:3000 in a regular Windows Edge or Chrome window. No Supabase project, YouTube key, account, or internet connection is needed for local playback once dependencies are installed and the local server is running.

1. Click **Import videos** and select MP4/WebM karaoke files.
2. Select an import category: OPM, English, or Custom.
3. Enter a singer name. Search the songbook or enter its five-digit song number.
4. **Reserve song** starts the first song and adds later reservations to the lineup.
5. Press **F** or **TV mode** for fullscreen. Press Play if the browser blocks autoplay.

For a session with fewer development interruptions, run npm.cmd run build, then npm.cmd start after stopping the development server.

## Features

- Native local video playback; the app inserts no ads or streaming requests.
- IndexedDB video copies and indexed songbook metadata, with unique editable song numbers.
- Search by song number, title, or artist; OPM, English, and custom categories.
- Virtual numeric remote and keyboard controls.
- Singer reservations, reordering, skipping, removal, and automatic next-song progression.
- Queue/settings persistence and paused recovery near the last playback position.
- Previous-song history, repeat, seek, volume, and supported browser tempo controls.
- TV fullscreen with a browser-view fallback and uncropped video.
- Optional, explicitly simulated party scores. No microphone or voice analysis.
- Songbook metadata editing, copy deletion, and JSON list export.

No songs, copyrighted recordings, or lyrics are bundled. The tests use synthetic file bytes and media-event mocks, not copyrighted media or validated codec playback.

## Preserved online features

The earlier YouTube screen and its browser queue remain at **/online**, including access to the optional Supabase room routes. Local videos and singer reservations are independent of those online rooms; local files are never uploaded or synchronized.

See [SETUP.md](SETUP.md) for optional online service configuration. The local videoke console ignores NEXT_PUBLIC_DEMO_MODE and does not depend on public API credentials.

## Storage and compatibility

Video files are copied into this browser profile's IndexedDB, never localStorage. Keep the original files on your computer. Use the same browser profile and exact address/port for the same library; localhost and 127.0.0.1 are separate origins.

Browser quotas, private browsing, eviction, or clearing site data can remove the library. **Request persistent storage** is a best-effort browser request, not a backup. **Export list** saves metadata only.

MP4/WebM describe containers; codec support still depends on the browser and operating system. Unsupported files receive a visible error and can be skipped. Independent pitch shifting is not implemented; tempo stays at 1× where pitch preservation is unavailable. A local Node server is required to load/reload the app; this is not an installed desktop app or a service-worker/PWA cache.

## Verification and operator guide

~~~powershell
npm.cmd test
npm.cmd run lint
npm.cmd run build
~~~

Read [VIDEOKE_MIGRATION.md](VIDEOKE_MIGRATION.md) for architecture, shortcuts, storage boundaries, TV setup, changed files, and the exact verification limits. The initial setup report in DEVELOPMENT_AUDIT.md is retained as historical documentation.
