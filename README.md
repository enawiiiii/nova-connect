# NOVA Connect

NOVA Connect is a private, bilingual communication platform for close friends. The MVP ships as an installable React PWA with realtime private messaging, a friend network, presence, web notifications, and peer-to-peer voice/video rooms for up to eight participants.

## Commercial handoff

This repository is prepared for sale as one complete product, not as a
multi-tenant subscription service. Start with
[`docs/SALE_HANDOFF.md`](docs/SALE_HANDOFF.md), then complete the
[deployment](docs/DEPLOYMENT.md), [networking](docs/NETWORKING.md), and
[legal](docs/LEGAL_CHECKLIST.md) checklists. Rebranding, backup/restore, and
formal acceptance are covered by
[`docs/REBRANDING.md`](docs/REBRANDING.md),
[`docs/BACKUP_RESTORE.md`](docs/BACKUP_RESTORE.md), and
[`docs/BUYER_ACCEPTANCE.md`](docs/BUYER_ACCEPTANCE.md). The in-app brand and
legal identity are configurable through `PRODUCT_NAME`, `VITE_PRODUCT_*`, and
`VITE_LEGAL_*` values.

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

- Node.js 22 through 24
- npm 10 or newer
- A Supabase project
- A modern browser with WebRTC support

## Local installation

1. Install the exact locked workspace dependencies:

   ```bash
   npm ci
   ```

2. Create local API and web configuration. Existing files are never
   overwritten, and signing secrets are generated locally:

   ```bash
   npm run setup
   ```

3. Review `apps/api/.env` and `apps/web/.env.local`. The generated local setup
   uses the JSON evaluation database and disables email verification. Add
   buyer-owned provider credentials when testing live integrations.

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
11. [`supabase/migrations/0011_security_hardening.sql`](supabase/migrations/0011_security_hardening.sql)
12. [`supabase/migrations/0012_google_auth.sql`](supabase/migrations/0012_google_auth.sql)

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
| `CALL_RECONNECT_GRACE_MS` | No | Grace period for transient call-signaling disconnects; defaults to `12000` |
| `BCRYPT_ROUNDS` | No | Defaults to `12` |
| `COOKIE_SECURE` | Production | Set to `true` behind HTTPS |
| `COOKIE_SAME_SITE` | No | Keep `lax` for the recommended same-origin Render deployment |
| `REQUIRE_EMAIL_VERIFICATION` | No | Set to `false` only for temporary testing; defaults to `true` |
| `MAIL_TRANSPORT` | Recommended | Use `gmail-api` on Render Free, or `smtp` only on hosts that permit outbound SMTP |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER` | Recommended on Render Free | Sends mail from Gmail over HTTPS without blocked SMTP ports |
| `BREVO_API_KEY` | Legacy alternative | Optional Brevo HTTPS transport retained only for migration compatibility |
| `SMTP_*` | Alternative | SMTP fallback for hosting plans that allow outbound SMTP |
| `TURN_URL` / `TURN_SECRET` | Recommended for production | Comma-separated Coturn URLs and REST secret used to issue time-limited relay credentials |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | Alternative to `TURN_SECRET` | Static credentials supplied by a hosted TURN provider |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Recommended | Web Push key pair; the private key stays server-side |
| `VAPID_SUBJECT` | No | Contact URI for Web Push, normally `mailto:owner@example.com` |
| `VITE_API_URL` | Separate-origin only | Override the default same-origin API base |
| `VITE_SOCKET_URL` | Separate-origin only | Override the default same-origin Socket.IO origin |
| `VITE_PRODUCT_*` | Rebranding | Product name, short name, mark, tagline, and social/PWA description |
| `VITE_LEGAL_*`, `VITE_SUPPORT_EMAIL` | Production | Buyer legal identity and monitored contacts |

Generate signing secrets with a password manager or `openssl rand -base64 48`.

## Email and Google sign-in

Email verification is fully wired but can be bypassed temporarily with `REQUIRE_EMAIL_VERIFICATION=false`. On Render Free, set `MAIL_TRANSPORT=gmail-api` and configure the four Gmail OAuth variables before turning verification back on. On other hosts or paid Render plans, SMTP remains available as a fallback. Without a configured provider, development prints the verification code to the API console.

Google Identity Services sign-in is implemented end to end and remains feature-flagged until a buyer-owned Web OAuth client ID is configured. Follow [`docs/GOOGLE_AUTH.md`](docs/GOOGLE_AUTH.md), apply migration `0012`, and set the same public client ID in `GOOGLE_AUTH_CLIENT_ID` and `VITE_GOOGLE_CLIENT_ID`.

## WebRTC and TURN

Calls use a peer-to-peer mesh and Socket.IO only for signaling. STUN defaults work on many home and mobile networks. Production should provide Coturn using `TURN_URL` and a server-only `TURN_SECRET`; NOVA generates one-hour browser credentials instead of embedding a permanent TURN password in the bundle. Mesh rooms are capped at eight participants; if NOVA grows beyond small circles, replace mesh with an open-source SFU while preserving the signaling interface.

HTTPS is required for camera, microphone, screen sharing, service workers, and notifications outside `localhost`.

## Quality commands

```bash
npm run verify:sale
npm run audit:history
npm run typecheck
npm test
npm run build
npm run lint
npm audit --omit=dev
```

Inside a production shell, run `npm run preflight:production` to validate
provider dependencies and secure runtime settings without printing secret
values. After committing the accepted release, `npm run package:sale` creates a
clean source archive without Git history, a CycloneDX SBOM, a dependency
license inventory, checksums, and a release manifest under ignored `outputs/`.

## Deploying to Render

1. Push the repository to a Git provider supported by Render.
2. Apply every Supabase migration in numeric order before deploying the matching application release.
3. In Render, choose **New → Blueprint** and select the repository. `render.yaml` creates one Node service named `nova-connect`.
4. Enter the requested Supabase, Gmail API (or SMTP), and optional TURN secrets.
5. Set both `CLIENT_URL` and `APP_URL` to the service's exact buyer-owned HTTPS
   URL, then deploy.

The API serves the built PWA in production, so REST, cookies, Socket.IO, and WebRTC signaling share one origin. This avoids third-party-cookie failures on Safari and iPhone. Render supplies managed HTTPS and the health check remains `/health`.

## Production checklist

- Replace both JWT secrets and keep them in Render secret storage.
- Set `COOKIE_SECURE=true`.
- Configure Gmail API on Render Free (or SMTP on a paid host) and test verification codes against the production web origin.
- Add Coturn with a server-side REST secret and test calls between Wi-Fi and mobile data.
- Use a paid Render instance or equivalent for reliable always-on Socket.IO connections.
- Configure external uptime monitoring and automated Supabase backups; the built-in admin page already records client and API errors.
- Keep Helmet's Content Security Policy aligned with any future analytics/error-reporting domains.
- Plan an E2E encryption protocol and key-verification UX before marketing messages as end-to-end encrypted. The current transport is HTTPS/WSS plus WebRTC DTLS-SRTP, and the code is structured to add message encryption later.

## Explicit product limits

- This release is a single deployable product, not a multi-tenant SaaS billing
  platform; subscriptions and payment processing are not included.
- Group WebRTC uses peer-to-peer mesh and is capped at eight participants. A
  larger commercial audience requires an SFU and a corresponding privacy/cost
  design.
- Messages are encrypted in transit but are not end-to-end encrypted.
- Render's free plan and consumer Gmail accounts provide no production SLA.
  The buyer chooses and pays for production infrastructure.
- Legal pages are operational templates and require buyer-specific legal
  review.
- Native iOS/Android binaries are not included; the shipped mobile experience
  is an installable responsive PWA.

## Future mobile client

A React Native app can reuse the domain types in `@nova/shared`, the REST endpoints, JWT session semantics, Socket.IO events, and WebRTC room protocol. Mobile push can be added behind the existing notification service using Firebase Cloud Messaging without changing notification records.
