# Security policy

## Reporting

Do not open a public issue for a suspected vulnerability. Send a private
report to the security contact configured for the deployed product. Before a
commercial handoff, replace this paragraph with the buyer's monitored security
email and an expected initial-response time.

Include the affected URL or version, reproduction steps, impact, and any proof
of concept that does not expose real user data.

## Supported versions

Only the latest production release receives security fixes unless a signed
support agreement says otherwise.

## Operational rules

- Never commit `.env` files, database keys, OAuth secrets, TURN secrets, VAPID
  private keys, signing secrets, exports, or production logs.
- Rotate every deployment secret during ownership transfer.
- Keep production and staging in separate provider projects.
- Apply database migrations in numeric order and take a verified backup before
  every production migration.
- Run `npm run verify:sale`, `npm run audit:production`, the full test suite, and a
  production build before creating a release.
- Treat messages as encrypted in transit, not end-to-end encrypted, until a
  reviewed E2EE protocol is implemented.

## Current dependency advisory exception

`GHSA-qwww-vcr4-c8h2` was published on 2026-07-24 for React Router's unstable
RSC APIs. NOVA is a client-rendered `BrowserRouter` application and does not
import or enable those APIs, so this advisory is not reachable in the current
architecture. `npm run audit:production` permits only this advisory and also
fails if RSC markers are introduced. Remove the exception as soon as a patched
stable React Router release is available. Any other production advisory fails
the audit.

## Baseline

Commercial deployments should be reviewed against OWASP ASVS 5.0 Level 1 at
minimum. High-risk or regulated buyers should commission an independent
penetration test and define an incident-response process in the sale contract.
