> **Historical setup audit.** This report records the application before the local-videoke migration. Current behavior, file inventory and verification results are documented in [VIDEOKE_MIGRATION.md](VIDEOKE_MIGRATION.md).
# Development audit — 2026-10-21

## Outcome and root causes

The application now renders without environment credentials. It enters a clearly labeled local demo, preserves the standalone browser queue, and explains why shared rooms and search are unavailable.

The original startup failure came from createClient(undefined, undefined) running at module import. Non-null TypeScript assertions did not validate the runtime environment. The homepage imported room dialogs, which imported that client even when no room was used.

Other confirmed issues were stale/forward callback references in the local queue, duplicate videos sharing the playing highlight, an iframe being initialized before its DOM target existed, player cleanup on video changes, unhandled/silently ignored database errors, optimistic success before database confirmation, concurrent non-atomic queue positioning/reordering, unrestricted anonymous RLS, guessable room codes, ignored documentation/SQL/env template, Google Fonts downloads blocking builds, and lint errors.

The existing search form is syntactically valid. No JSX parser repair was required. The initial combined inspection output omitted part of the form; direct inspection and lint confirmed it was intact.

## Current services

| Service | Current state |
| --- | --- |
| Local homepage/queue | Works without service credentials; labeled demo when Supabase is unavailable |
| Supabase client | Preserved, lazy, validated; missing/invalid config gives setup guidance |
| Supabase rooms | Code and secure fresh-project schema prepared; live project credentials not configured or tested |
| Supabase Auth | Anonymous Sign-Ins required for session identities; not exercised against a live project |
| Realtime | Real subscriptions retained; five-second reconciliation handles missed changes; live delivery not verified |
| YouTube search | Data API integration preserved; real key and reachable Google APIs required; live search unverified |
| YouTube URL/ID | Keyless mode creates explicitly unverified metadata and supports local queue tests |
| YouTube playback | IFrame lifecycle fixed and error handling added; transport mocked in DOM tests, actual video/audio unverified |
| Responsive layout | Existing breakpoints retained; mobile content can scroll; real viewport/visual checks unverified |

No database connection, destructive SQL, migration, deployment, commit, or push was performed. No credentials were invented or installed. Empty .env.example entries document configuration.

## Manual configuration

For immediate use, run npm.cmd run dev and open http://localhost:3000. Use the URL tab to test the queue. No .env.local is required. If a server for this directory is already running, use it or stop it yourself before restarting.

To enable services, follow SETUP.md:

1. Copy .env.example to .env.local only if that local file does not already exist.
2. For shared rooms, add the Supabase project URL and public publishable/legacy anon key, enable Anonymous Sign-Ins, and manually run supabase/bootstrap.sql on a fresh development project.
3. For search/verified metadata, enable YouTube Data API v3 and add a key restricted to that API and your actual HTTP referrers.
4. Restart development after environment/dependency changes; rebuild production after NEXT_PUBLIC_ changes.

The old plan.sql remains as a commented historical reference. Its unrestricted policies must not be restored. The bootstrap refuses an existing schema rather than guessing ownership or rewriting policies/data. Existing databases need a separately reviewed migration; a fresh development project is the supported setup now.

Anonymous sign-in provides an authenticated session identity, not a permanent account. Clearing browser storage loses host ownership. Room membership is granted by possession of a random 32-character join code; members may collaboratively add/remove/reorder. Only the host may end or touch the room. There is no synchronized playback-position protocol. Public deployment still needs Auth abuse controls and live RLS/Realtime verification.

## Validation results

| Check | Result and boundary |
| --- | --- |
| npm.cmd test | PASS: 7 tests, including isolated PostgreSQL and DOM workflows |
| npm.cmd run lint | PASS: zero errors; seven existing next/no-img-element optimization warnings |
| npm.cmd run build | PASS with Next.js 16.4.2 and no API credentials; fonts bundled locally |
| TypeScript | PASS as part of the production build |
| Development server | Existing localhost:3000 server returns HTTP 200 for /, /room/TEST, /room/TEST/add |
| Missing-service HTTP behavior | Homepage contains Local demo mode; both room routes contain Shared room unavailable; no supabaseUrl is required crash |
| Fresh server command | Sandbox initially denied port binding; elevated launch reached Ready, then correctly detected another server for this checkout. The existing server was used and not terminated |
| Git ignore checks | .env.local, .env.production and .verification output ignored; .env.example, docs and bootstrap SQL visible to Git |
| Live browser automation | No browser surface was available; no screenshot, actual video/audio, or device-size verification claimed |

Configuration tests cover import without client construction, malformed URLs, rejecting server credentials, demo override, YouTube URL host validation, durations, keyless metadata, and missing-search-key errors.

The DOM test exercises the actual homepage/search/queue/player React logic with animation and YouTube transport stubs: URL additions, duplicate item IDs/highlights, an ENDED callback, Next song, remount persistence, removal, empty player cleanup, and disabled shared-room setup. This verifies application event handling, not successful YouTube playback.

The database test executes the bootstrap in a fresh in-memory PostgreSQL engine with a test auth.uid() and roles. It verifies host creation, immutable codes/ownership, no outsider listing/inserts/deletes, no forged membership, code joins, member enqueue/reorder/delete, host-only actions, ended-room denial, anon-role denial, admin-only cleanup, and rollback/refusal on a repeated bootstrap. Supabase hosted Auth, publication delivery, and real concurrent multi-client timing require live integration tests.

## Dependency security

The initial npm audit reproduced **20 findings: 1 critical, 15 high, 3 moderate, 1 low**.

Next.js and eslint-config-next were updated from 16.1.1 to 16.4.2, keeping the framework on major 16. Compatible transitive fixes were applied using npm audit fix without --force. Existing React 19.2.3 versions were preserved.

The initial affected packages were @babel/core, @humanfs/node, @next/eslint-plugin-next, ajv, baseline-browser-mapping, brace-expansion, braces, browserslist, eslint-config-next, fast-glob, flatted, js-yaml, micromatch, minimatch, nanoid, next, picomatch, postcss, sharp, and source-map-js.

Final full audit: **5 high, 0 critical, 0 moderate, 0 low**.
Final production-only audit (npm audit --omit=dev): **0 vulnerabilities reported**.

The remaining five package findings describe one unpatched development-tool chain:

eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces

[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) reports stack exhaustion from deeply nested patterns and lists no patched braces release. npm proposes a breaking downgrade to eslint-config-next 14.2.35. That downgrade was not applied because this project uses Next.js 16 and its ESLint configuration. No audit --force, fabricated override, audit suppression, or dependency removal was used. Recheck when upstream releases a fix. Treat untrusted glob patterns cautiously in local tooling.

Zero reported production vulnerabilities is an audit result for this lockfile/date, not a security guarantee.

Fontsource packages bundle the existing fonts; PGlite and jsdom are development-only regression-test dependencies. Node support is documented as ^22.13.0 or >=24.0.0 (verified with Node 22.16.0). npm.cmd avoids the machine's npm.ps1 execution-policy error without changing that policy.

## Complete changed-file inventory

All paths below are relative to the project root. Existing source files were already untracked at the beginning of this session (git ls-files returned no tracked paths); Git status alone therefore cannot distinguish these edits from the user's initial checkout. No Git metadata was deliberately edited.

| File | Change |
| --- | --- |
| .env.example | New empty configuration template and public/secret guidance |
| .gitignore | Allow template/docs/SQL; ignore local env, keys, verification and Supabase local artifacts/backups |
| README.md | Current quick start, architecture, limits and validation pointers |
| SETUP.md | Complete demo, Supabase, database and YouTube instructions |
| DEVELOPMENT_AUDIT.md | This report, verified results and complete inventory |
| plan.sql | Preserve original SQL inside a non-executable historical comment with safety/setup pointer |
| package.json | Next/ESLint update, local fonts, test tools/script and Node requirement |
| package-lock.json | Reproducible compatible updates and new package metadata |
| eslint.config.mjs | Ignore local verification output/cache |
| app/layout.tsx | Use bundled local fonts |
| app/globals.css | Wire existing typography to local font variables |
| app/page.tsx | Demo notices, robust hydration, unique queue identity, callback fixes, local Next and mobile scrolling |
| app/room/[code]/page.tsx | Setup/error states, host check, reconciled real subscriptions, confirmed mutations and player identity |
| app/room/[code]/add/page.tsx | Setup/error states, real subscription reconciliation, confirmed queue changes and optional storage |
| components/CreateRoomDialog.tsx | Configuration guidance, disabled demo creation, host-name length and error feedback |
| components/JoinRoomDialog.tsx | Demo guidance, high-entropy codes, validated code/link routing and QR compatibility |
| components/RoomUnavailable.tsx | New shared setup/error state with local-home link |
| components/Queue.tsx | Highlight duplicates by queue identity; accessible action names |
| components/QuotaDisplay.tsx | Subscribe to storage changes without effect-triggered state errors; accurate estimate wording |
| components/YouTubePlayer.tsx | Typed API, stable wrapper/lifecycle, duplicate replay, errors/autoplay feedback, next and pick actions |
| components/YouTubeSearch.tsx | Accurate keyless URL/metadata guidance |
| components/theme-provider.tsx | Hydration-safe theme restore and storage failure handling |
| lib/config.ts | New safe public environment validation and explicit demo state |
| lib/supabase.ts | Lazy client, shared anonymous session initialization and user-facing room errors |
| lib/rooms.ts | Authenticated membership RPCs, checked query errors and atomic queue calls |
| lib/youtube.ts | Keyless direct-video metadata, strict supported URLs, duration matching by ID and setup/quota messages |
| lib/quota.ts | Pacific reset boundary and validation of stored estimate |
| types/room.ts | Host session ownership field |
| types/youtube.ts | Video details ID for correct duration matching |
| supabase/bootstrap.sql | New transactional fresh-project schema with member RLS and restricted RPCs |
| tests/config.test.mjs | Configuration and keyless YouTube regressions |
| tests/database.test.mjs | Isolated schema/authorization regression suite |
| tests/local-queue.test.mjs | DOM queue/persistence/player event regression |

Ignored .verification/ contains temporary tooling scripts, npm cache and audit JSON reports used during validation. node_modules/, .next/, next-env.d.ts and TypeScript cache artifacts were regenerated by normal install/build/dev commands. Other legacy documentation and source files were retained.

