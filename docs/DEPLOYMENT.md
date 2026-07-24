# Production deployment runbook

## Environments

Use separate provider projects for local development, staging, and production.
Each environment needs unique database, JWT, mail, TURN, VAPID, and OAuth
credentials. Production user data must never be copied to development.

## Release procedure

1. Confirm a clean worktree and a reviewed release commit.
2. Run `npm ci`, `npm run verify:sale`, `npm run audit:history`,
   `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, and
   `npm audit --omit=dev`.
3. Take a database backup and verify its timestamp.
4. Apply new Supabase migrations in numeric order.
5. Deploy the application and wait for `/health` to return HTTP 200.
6. Run `npm run preflight:production` inside the production environment.
7. Run the smoke tests listed below.
8. Record the release in `CHANGELOG.md`.
9. Tag the accepted commit. The tag workflow builds checksum-protected sale
   artifacts.

## Smoke tests

- Register and receive a verification code.
- Sign in, refresh the page, and confirm the session persists.
- Reset a password and revoke another session.
- Send, edit, delete, react to, and attach a file to a message.
- Create and moderate a report.
- Complete one voice and one video call across different networks.
- Complete a group call with at least three devices.
- End a call from each side and verify every participant leaves the room.
- Switch Wi-Fi/mobile data during a call and verify reconnection.

## Rollback

Roll back the application artifact only when the database schema remains
backward compatible. Database migrations should normally be forward-fix
migrations. Document and rehearse any destructive migration separately.

## Containers

Build with `docker build -t nova-connect:<version> .`. Supply secrets at runtime,
never with Docker build arguments or image layers. The container listens on
`PORT` (default `4000`) and includes a `/health` health check.
