# Local Videoke Migration — 2026-10-21

## Audit and migration plan

The earlier application was a YouTube IFrame player with browser queue persistence and optional Supabase-hosted room queues. It could render without credentials after the initial setup work, but its audio/video transport still depended on YouTube. It had no local video import, local songbook, numbered remote, or offline media store.

The implemented migration follows this sequence:

1. Preserve the earlier homepage at /online and keep its queue key, components, API integration, and optional room routes.
2. Add an independent local songbook with IndexedDB media copies and metadata; allocate codes atomically with media import.
3. Make / the local TV console, connect a native video element, singer reservations, keyboard/remote controls, and optional simulated score transitions.
4. Test storage/queue/player event paths and retained features, then verify lint, production build, and local HTTP startup.

The [LaSing reference](https://lasing.online/) informed the offline player/songbook/TV direction. No APK, recordings, lyrics, screenshots, or third-party media were copied from it.

## Architecture

| Layer | Implementation |
| --- | --- |
| Homepage | app/page.tsx renders the client VideokeConsole |
| Local orchestration | components/videoke/VideokeConsole.tsx handles library import, session hydration/persistence, keyboard shortcuts and reservations |
| Player | components/videoke/LocalPlayer.tsx reads a local Blob, creates a temporary object URL, and uses the native HTML video API |
| Songbook | components/videoke/Songbook.tsx provides local search, pagination, categories, reserve actions and metadata editing |
| Media/index store | lib/videoke/library.ts uses IndexedDB stores songs, media and settings |
| Queue model | lib/videoke/session.ts provides a pure reducer, safe restoration, local search and unique reservation IDs |
| Types | types/videoke.ts separates metadata, reservation identity and session state |
| Visual presentation | app/videoke.css scopes the TV/remote/songbook styles away from the retained online screen |
| Earlier app | app/online/page.tsx retains the prior YouTube queue and room entry points |

No local media endpoint, cloud storage, Supabase credentials, YouTube request, microphone access, or audio-analysis service is used on the local playback path.

### Storage

- Database: karaokz-local-library, version 1.
- songs: metadata only, keyed by local ID; unique code/fingerprint indexes and a category index.
- media: original selected video copied as a Blob, keyed by the same local ID.
- settings: monotonic next-code counter.
- Import copies media, allocates the code, and creates metadata in one read/write transaction. Quota failures abort all of those changes.
- A duplicate is identified by file name, byte size and last-modified timestamp. This is a fast import heuristic, not a content hash.
- Metadata edits preserve the media Blob. Unique code conflicts produce an actionable error.
- Deleting a library entry deletes the browser copy and prunes its current/pending/history reservations. Original files are untouched.
- LocalStorage key karaokz-videoke-session-v1 contains only queue/current/history IDs, singer names, small settings and playback position.
- The old YouTube queue retains its separate karaoke-state key.
- Object URLs exist only during playback and are revoked when switching songs or unmounting.
- No video bytes, encoded video, object URLs, or filesystem paths enter the persisted queue.
- Use one active local session tab. Shared local reservation editing across tabs/devices is not implemented.

Browser storage is origin- and profile-specific. Keep the same address/port and regular browser profile. Private browsing, site-data clearing, quotas, storage eviction and OS cleanup can remove copies; keep your originals. Persistent-storage requests may be denied and cannot prevent deliberate site-data removal.

Reference: [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API), [browser quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

## Using the machine

### Library and songbook

1. Launch the local server and open http://localhost:3000.
2. Choose OPM, English, or Custom in **Import as**, then **Import videos**.
3. Select one or several MP4/WebM files that you are authorized to use. Imports copy files into browser storage and report progress, duplicates and failures.
4. Codes are assigned from 00001 upward. Short numeric entry, such as 42, also matches 00042. Codes are not automatically renumbered when songs are removed.
5. For filenames like Artist - Title.mp4, the artist and title are inferred. Other names become the title with Unknown artist.
6. Use a row's **Edit** action to correct title, artist, number, or category. A custom category can be any non-empty name up to 60 characters.
7. **Export list** downloads a JSON songbook with code/title/artist/category/original filename. It does not export videos, restore an entire library, or back up session state.
8. **Remove copy** asks for confirmation and removes only the browser copy and its reservations.

The library supports up to 99999 automatically allocated five-digit numbers. Search renders twelve results per page and filters the metadata locally. There is no fabricated starter catalog.

### Reservations and playback

Enter a singer name before reserving. A blank name becomes Guest singer. The first reservation becomes current and attempts playback; later ones join the lineup. The same song can be reserved multiple times under different singers without conflating their reservation IDs.

Use arrows to reorder pending reservations, Play to jump to one, or Remove to cancel it. Next skips the current song. On a normal end event, the next pending reservation starts automatically. The current item is separate from the pending list.

Previous returns through the last 30 played/skipped reservations. With no history, it restarts the current song. It can also recover the last song after the lineup has finished. Repeat loops the current video until disabled or skipped.

Queue/settings are saved after changes. Playback position is sampled about every three seconds and on pause/seek. Refresh restores the queue and video near that position but waits for an explicit Play action. Browser autoplay denial always has a visible Play fallback.

The application does not insert ads or depend on YouTube for local playback. Ads or overlays already embedded in a selected file are part of that file.

### Keyboard remote

Shortcuts do not intercept typing in inputs, selects, text areas, or the song editor.

| Key | Action |
| --- | --- |
| 0–9 | Enter a song number, echoed on the TV screen |
| Enter | Reserve the entered number |
| Backspace | Delete the last entered digit |
| Space | Play / pause |
| N | Next / skip |
| B | Previous / restart |
| R | Repeat on/off |
| F | Toggle TV fullscreen |
| M | Mute / restore standard volume |
| + / - | Raise / lower video volume |
| / or S | Focus songbook search |
| Tab / Shift+Tab | Navigate controls |
| Escape | Leave browser TV-view fallback and clear number/help; browser Escape also exits native fullscreen |

### TV and Windows setup

Use Windows Edge or Chrome as the primary desktop browser target. Connect your computer to the TV using your existing display connection, move the browser to that display, and select the corresponding audio output in Windows if needed.

Press TV mode or F. Native fullscreen keeps the whole video visible with object-fit: contain; it does not crop burned-in lyrics. Song number/title, singer and upcoming reservations remain visible around the video. If native fullscreen is absent or denied, the application provides a fixed TV view and explains the F11/Escape fallback.

Set the singer name before entering TV mode. The numeric keyboard overlay remains available during fullscreen, so another song can be reserved without leaving the stage.

The app controls video audio only. Microphone monitoring/mixing is not implemented; it does not capture or amplify your microphone. Use your existing microphone/mixer setup for amplified singing.

### Tempo, pitch, formats and score limits

- Tempo choices: 0.75×, 0.90×, 1.00×, 1.10× and 1.25×.
- Tempo uses native playbackRate with preservesPitch. If pitch preservation is absent, the control is disabled and playback stays at 1×. The tempo picker appears with the desktop transport controls.
- Independent pitch shifting is unavailable; no placeholder pitch control is presented as working.
- MP4/WebM container extensions do not guarantee codec compatibility. Prefer MP4 with H.264/AAC or a supported WebM codec. Unsupported, corrupt or missing files show an error; automatic skipping of every failed file is not used.
- Embedded lyrics must already exist in the user's video. Separate lyric files, transcription, or lyric synchronization are not implemented.
- Party scores are off by default. When enabled, a completed non-repeated song shows an animated random 80–100 **SIMULATED PARTY SCORE**, with a visible statement that there is no microphone or singing analysis. Continue or the five-second timer advances to the next reservation. Skipping does not manufacture a score.

Reference: [playbackRate](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate), [preservesPitch](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch), [Fullscreen API](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API).

## Offline boundaries and optional rooms

Local playback, search, reservations and media retrieval need no internet connection after setup. The local Next.js server must still be running to load or refresh the page. This build is not a PWA/service-worker cache, desktop installer, or a remote-control phone application.

The preserved /online screen still requires the previously documented YouTube/Supabase configuration for its external services. Local videos are never uploaded or shared into those rooms. No database migrations or destructive external operations were run during this migration.

## Verification

| Check | Result / scope |
| --- | --- |
| npm.cmd test | PASS, ten tests including the original configuration/room/online tests and the new local-media suites |
| Storage integration | PASS with fake-indexeddb: Blob persistence, concurrent unique-code allocation, duplicate detection, edits, conflict handling, quota rollback, deletion |
| Local console integration | PASS with jsdom and emulated native media: import UI, singer reservations, duplicate identities, reorder, next/previous, repeat, volume, tempo, autoplay denial, score timer, fullscreen fallback, codec-error message, edits/deletion, object URL cleanup and refresh recovery |
| Network independence | PASS in the local DOM workflow with network calls forbidden; no local-mode fetch was made |
| npm.cmd run lint | PASS, zero errors; seven retained thumbnail optimization warnings in the online/room components |
| npm.cmd run build | PASS, including TypeScript and static rendering of / and /online |
| Development startup / HTTP | PASS at localhost:3000; /, /online and /room/TEST/add return HTTP 200 with their intended content |
| Security audit | No new findings: five existing high development-tool findings, zero production findings |
| Browser/TV audiovisual checks | Not verified: no browser automation surface was available, and no user media was supplied |

The DOM test emulates HTMLMediaElement play/pause, metadata/end/error events and full-screen/codec fallbacks. Its file fixtures contain synthetic bytes. It verifies application behavior and storage, not real video decoding, speaker output, native fullscreen geometry, or visual sizing at particular TV resolutions.

The temporary development server was stopped after validation. Start your own session with npm.cmd run dev, or use npm.cmd start after a production build.

Before a real session, import two known-good legally obtained videos in your Windows browser and check: sound/lyrics, Play/Pause, end-to-next progression, singer names, keypad reservation, previous/repeat, volume, TV fullscreen, queue persistence after refresh, and playback with internet disconnected while the local server remains running.

## Changed files in this migration

- app/page.tsx — new local-console entry point.
- app/online/page.tsx — preserved former homepage with a return link to local videoke.
- app/layout.tsx — local-videoke title/description and scoped stylesheet import.
- app/videoke.css — responsive TV, remote, songbook, fullscreen and reduced-motion styles.
- components/videoke/VideokeConsole.tsx — session, library, reservations and keyboard orchestration.
- components/videoke/LocalPlayer.tsx — native Blob video player, media controls and party-score presentation.
- components/videoke/Songbook.tsx — songbook, metadata editor, categories and export.
- lib/videoke/library.ts — IndexedDB media/index transactions.
- lib/videoke/session.ts — pure queue model, validation, search and persistence shape.
- types/videoke.ts — local media/session types.
- tests/helpers/load-ts.mjs — TypeScript component/module loader for regression tests.
- tests/videoke-storage.test.mjs — library and session regression tests.
- tests/videoke-console.test.mjs — local console/media-event regression test.
- tests/local-queue.test.mjs — retain the original queue test against /online.
- package.json and package-lock.json — add fake-indexeddb as a development-only test dependency.
- README.md — current local-videoke quick start and boundaries.
- SETUP.md — point local users to the current guide; preserve optional online setup instructions.
- DEVELOPMENT_AUDIT.md — mark the earlier audit as historical.
- VIDEOKE_MIGRATION.md — this operator guide and migration report.
- AGENTS.md — generated automatically by the installed Next.js development server; retained.

All prior application components, Supabase schema, environment example, and Git history were preserved. No commit or push was made. Ignored .verification/ contains local validation output and pre-migration reference copies.
