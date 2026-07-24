# Buyer acceptance record

Use this document as the technical schedule to the commercial agreement. Fill
every field and attach evidence; a checkbox without evidence is not acceptance.

## Release identity

| Field | Value |
| --- | --- |
| Product and version | |
| Git commit | |
| Source archive SHA-256 | |
| SBOM SHA-256 | |
| Production URL | |
| Staging URL | |
| Database region | |
| Acceptance date | |

## Ownership

- [ ] Repository and branch protection are buyer-controlled.
- [ ] Domain, DNS, Render, Supabase, Google, mail, TURN, VAPID, monitoring,
  backups, and billing are buyer-controlled.
- [ ] No seller personal account is required for normal operation.
- [ ] Every secret was rotated after buyer access was confirmed.
- [ ] The asset agreement identifies source, brand, domain, data, support, and
  excluded third-party assets.

## Functional matrix

- [ ] Password registration, 15-minute verification code, resend, login, and
  logout work.
- [ ] Google registration and returning login work in Chrome and Safari.
- [ ] Session refresh survives a normal page reload and rejects revoked,
  expired, suspended, and deleted accounts.
- [ ] Password reset, two-factor setup, recovery, session revocation, account
  export, and deletion work.
- [ ] Friend search, request, accept, reject, remove, block, and unblock work.
- [ ] Private chat send/edit/delete/reply/react/seen/typing and attachments
  work.
- [ ] Group creation, membership, messaging, and group voice/video calls work.
- [ ] One-to-one voice and video calls ring, report busy state, flip camera,
  reconnect, and end for both parties.
- [ ] Push and in-app notifications work on desktop and supported mobile
  browsers.
- [ ] Reports arrive in the admin panel and every moderation transition,
  suspension, restore, and audit-history entry behaves once and correctly.

## Device and network matrix

Record evidence for iPhone Safari, Android Chrome, desktop Chrome, Edge, and
Safari where available. Include same Wi-Fi, different networks, mobile data,
VPN/restricted network, and network switching. At least one call must prove a
TURN `relay` candidate was selected.

## Security and operations

- [ ] `npm run verify:sale`, `npm run audit:history`, typecheck, lint, tests,
  production build, and dependency audit pass.
- [ ] Production preflight passes inside the production environment.
- [ ] No secret is present in the source archive, logs, screenshots, or sales
  documents.
- [ ] Rate limits, secure cookies, CSP, CORS origins, uploads, authorization,
  admin controls, and database RLS were reviewed.
- [ ] Legal, privacy, acceptable-use, security-contact, retention, moderation,
  incident, and deletion policies contain buyer-approved details.
- [ ] A backup was restored successfully into an isolated staging project.
- [ ] Monitoring alerts and the rollback procedure were exercised.

## Exceptions

List every accepted limitation, severity, owner, workaround, and due date:

| Limitation | Severity | Owner | Due date | Accepted by |
| --- | --- | --- | --- | --- |
| | | | | |

## Sign-off

| Role | Name | Signature/reference | Date |
| --- | --- | --- | --- |
| Seller | | | |
| Buyer technical owner | | | |
| Buyer business owner | | | |
