# NOVA Connect

NOVA Connect is a private, bilingual communication platform for close friends. The MVP ships as an installable React PWA with realtime private messaging, a friend network, presence, web notifications, and peer-to-peer voice/video rooms for up to eight participants.

## What is included

- Email registration, enforced verification, resend flow, login, interruption-safe refresh-token rotation, and logout
- Friend search, requests, accept/reject, removal, and friend-only messaging
- Socket.IO messaging, typing indicators, seen receipts, online presence, call invitations, and WebRTC signaling
- One-to-one voice/video calls and small-group mesh rooms (maximum 8)
- Profile-photo upload with server-side image validation, metadata removal, resizing, and WebP conversion
- Call history and persistent in-app notifications
- English and Arabic UI with live LTR/RTL switching
- Responsive premium dark UI, PWA manifest, offline shell, and install prompt
- Supabase PostgreSQL migration with RLS enabled and a service-role-only data boundary
- Rate limiting, Helmet security headers, Zod validation, bcrypt password hashing, short-lived JWTs, and HttpOnly refresh cookies
- Same-origin Render Blueprint that serves the PWA, API, and Socket.IO from one HTTPS service

The landing page includes an **Explore the experience** action. It enters a local, non-persistent product tour with realistic sample data; live accounts always use the API and Supabase.

## Architecture

```text
nova-connect/
├── apps/
│   ├── web/                 React + Vite + TypeScript + Tailwind PWA
│   │   └── src/
│   │       ├── components/  Shared presentation and shell components
│   │       ├── features/    Feature-level UI (chat/calls)
│   │       ├── hooks/       WebRTC room orchestration
│   │       ├── lib/         API, i18n, Socket.IO, and demo fixtures
│   │       ├── pages/       Route surfaces
│   │       └── stores/      Zustand auth and realtime application state
│   └── api/                 Express + TypeScript + Socket.IO
│       └── src/
│           ├── controllers/
│           ├── services/
│           ├── routes/
│           ├── middlewares/
│           ├── database/
│           └── socket/
├── packages/shared/         Shared domain contracts for web and API
├── supabase/migrations/     PostgreSQL schema
└── render.yaml              Same-origin Render Blueprint
```

The shared package keeps transport contracts reusable for a future React Native client. The API is the only trusted database client; browser code never receives the Supabase service-role key.

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- A Supabase project
- A modern browser with WebRTC support

## Local installation

1. Install all workspace dependencies:

   ```bash
   npm install
   ```

2. Copy the root environment template and fill in real values:

   ```bash
   cp .env.example .env
   ```

   On Windows PowerShell:

   ```powershell
   Copy-Item .env.example .env
   ```

3. Optionally create `apps/web/.env.local` for browser-only development flags:

   ```env
   VITE_GOOGLE_AUTH_ENABLED=false
   VITE_PUBLIC_HTTPS_URL=
   ```

4. Start both applications:

   ```bash
   npm run dev
   ```

The web app is served at `http://localhost:5173`; the API and Socket.IO server use `http://localhost:4000`.

For a fully functional local evaluation without Supabase, set `LOCAL_DEVELOPMENT_MODE=true` in `apps/api/.env`. Accounts, friendships, messages, calls, and notifications are then persisted to the ignored `.local/nova.json` file. This mode is automatically disabled when `NODE_ENV=production` and must never replace Supabase in a deployed environment.

### Testing from an iPhone or another phone

Opening `http://<laptop-ip>:5173` is sufficient for layout testing, but iOS and other mobile browsers block camera and microphone access on insecure HTTP origins. For working voice/video calls, expose only the Vite port through a temporary HTTPS tunnel:

```bash
cloudflared tunnel --url http://127.0.0.1:5173 --no-autoupdate
```

Open the generated `https://*.trycloudflare.com` address on both devices. Vite proxies `/api` and `/socket.io` to the local API, so authentication cookies, REST requests, and WebSocket signaling all remain on one browser origin. The quick-tunnel URL is temporary and should be stopped after testing.

For isolated test environments, the proxy target can be changed without editing source:

```bash
VITE_DEV_API_TARGET=http://127.0.0.1:4100 npm run dev -w @nova/web
```

## Supabase database setup

Open the Supabase SQL editor and run these migrations in order:

1. [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql)
2. [`supabase/migrations/0002_avatar_storage.sql`](supabase/migrations/0002_avatar_storage.sql)
3. [`supabase/migrations/0003_call_room_hardening.sql`](supabase/migrations/0003_call_room_hardening.sql)
4. [`supabase/migrations/0004_push_subscriptions.sql`](supabase/migrations/0004_push_subscriptions.sql)
5. [`supabase/migrations/0005_rich_messages.sql`](supabase/migrations/0005_rich_messages.sql)
6. [`supabase/migrations/0006_groups.sql`](supabase/migrations/0006_groups.sql)
7. [`supabase/migrations/0007_security_privacy.sql`](supabase/migrations/0007_security_privacy.sql)
8. [`supabase/migrations/0008_account_controls.sql`](supabase/migrations/0008_account_controls.sql)
9. [`supabase/migrations/0009_admin_monitoring.sql`](supabase/migrations/0009_admin_monitoring.sql)
10. [`supabase/migrations/0010_password_recovery.sql`](supabase/migrations/0010_password_recovery.sql)

They create the relational schema, indexes, RLS boundary, private message-media storage, profile-photo storage, groups, security controls, monitoring, and password recovery.

Grant the owner account administrator access only after it has registered:

```sql
update public.users set is_admin = true where email = 'your-owner-email@example.com';
```

Copy these values from **Project Settings → API** into the API environment:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` as a `VITE_` variable or commit it. RLS blocks direct anonymous access; authorization is enforced in the API.

## Environment reference

| Variable | Required | Purpose |
| --- | --- | --- |
| `CLIENT_URL` | Yes | Allowed browser origin; comma-separate additional origins |
| `SUPABASE_URL` | Yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only database credential |
| `JWT_ACCESS_SECRET` | Yes | Access-token signing key (32+ random characters) |
| `JWT_REFRESH_SECRET` | Reserved | Kept separate for future signed refresh-token support |
| `ACCESS_TOKEN_TTL` | No | Defaults to `15m` |
| `REFRESH_TOKEN_DAYS` | No | Defaults to `30` |
| `BCRYPT_ROUNDS` | No | Defaults to `12` |
| `COOKIE_SECURE` | Production | Set to `true` behind HTTPS |
| `COOKIE_SAME_SITE` | No | Keep `lax` for the recommended same-origin Render deployment |
| `REQUIRE_EMAIL_VERIFICATION` | No | Set to `false` only for temporary testing; defaults to `true` |
| `BREVO_API_KEY` | Recommended on Render Free | Sends verification mail over HTTPS because free Render services block SMTP ports |
| `SMTP_*` | Alternative | SMTP fallback for hosting plans that allow outbound SMTP |
| `TURN_URL` / `TURN_SECRET` | Recommended for production | Comma-separated Coturn URLs and REST secret used to issue time-limited relay credentials |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Alternative to `TURN_SECRET` | Static credentials supplied by a hosted TURN provider |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Recommended | Web Push key pair; the private key stays server-side |
| `VAPID_SUBJECT` | No | Contact URI for Web Push, normally `mailto:owner@example.com` |
| `VITE_API_URL` | Separate-origin only | Override the default same-origin API base |
| `VITE_SOCKET_URL` | Separate-origin only | Override the default same-origin Socket.IO origin |

Generate signing secrets with a password manager or `openssl rand -base64 48`.

## Email and Google sign-in

Email verification is fully wired but can be bypassed temporarily with `REQUIRE_EMAIL_VERIFICATION=false`. On Render Free, add `BREVO_API_KEY` before turning verification back on. On other hosts or paid Render plans, SMTP remains available as a fallback. Without either provider, development prints the verification URL to the API console.

Google OAuth is intentionally feature-flagged off in the web UI. Before enabling it, configure Google as a Supabase Auth provider and add a server-side callback that exchanges the provider identity for a NOVA session. Do not turn on `VITE_GOOGLE_AUTH_ENABLED` until that callback is configured.

## WebRTC and TURN

Calls use a peer-to-peer mesh and Socket.IO only for signaling. STUN defaults work on many home and mobile networks. Production should provide Coturn using `TURN_URL` and a server-only `TURN_SECRET`; NOVA generates one-hour browser credentials instead of embedding a permanent TURN password in the bundle. Mesh rooms are capped at eight participants; if NOVA grows beyond small circles, replace mesh with an open-source SFU while preserving the signaling interface.

HTTPS is required for camera, microphone, screen sharing, service workers, and notifications outside `localhost`.

## Quality commands

```bash
npm run typecheck
npm test
npm run build
npm run lint
```

## Deploying to Render

1. Push the repository to a Git provider supported by Render.
2. Apply every Supabase migration in numeric order before deploying the matching application release.
3. In Render, choose **New → Blueprint** and select the repository. `render.yaml` creates one Node service named `nova-connect`.
4. Enter the requested Supabase, Brevo (or SMTP), and optional TURN secrets.
5. Set both `CLIENT_URL` and `APP_URL` to the service's exact public URL, such as `https://nova-connect.onrender.com`, then deploy.

The API serves the built PWA in production, so REST, cookies, Socket.IO, and WebRTC signaling share one origin. This avoids third-party-cookie failures on Safari and iPhone. Render supplies managed HTTPS and the health check remains `/health`.

## Production checklist

- Replace both JWT secrets and keep them in Render secret storage.
- Set `COOKIE_SECURE=true`.
- Configure Brevo on Render Free (or SMTP on a paid host) and test verification links against the production web origin.
- Add Coturn with a server-side REST secret and test calls between Wi-Fi and mobile data.
- Use a paid Render instance or equivalent for reliable always-on Socket.IO connections.
- Configure external uptime monitoring and automated Supabase backups; the built-in admin page already records client and API errors.
- Keep Helmet's Content Security Policy aligned with any future analytics/error-reporting domains.
- Plan an E2E encryption protocol and key-verification UX before marketing messages as end-to-end encrypted. The current transport is HTTPS/WSS plus WebRTC DTLS-SRTP, and the code is structured to add message encryption later.

## Future mobile client

A React Native app can reuse the domain types in `@nova/shared`, the REST endpoints, JWT session semantics, Socket.IO events, and WebRTC room protocol. Mobile push can be added behind the existing notification service using Firebase Cloud Messaging without changing notification records.
