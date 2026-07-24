# Full-product sale handoff

This checklist is for transferring the complete NOVA Connect product to one
buyer. It is not a substitute for a signed asset-purchase agreement.

## Before signing

- Confirm the seller owns the custom code, design assets, domain, and brand.
- Export an SPDX SBOM from GitHub and review all third-party licenses.
- Agree whether the domain, repository history, cloud accounts, user data,
  support obligations, and future fixes are included.
- State the exact version and commit being sold.
- State whether the transfer is exclusive and whether the seller may retain a
  backup or portfolio screenshots.
- Have a qualified lawyer review the assignment, warranties, liability,
  governing law, taxes, and personal-data transfer.

## Technical transfer

1. Create buyer-owned Render, Supabase, email, TURN, Google, and monitoring
   accounts. Do not hand over personal provider accounts.
2. Deploy a clean staging environment and apply every migration.
3. Import only data explicitly included in the agreement.
4. Configure the `VITE_PRODUCT_*`, legal, support, origin, and email values.
5. Test password and Google registration, recovery, private/group chat,
   uploads, reports, push, one-to-one calls, and group calls on the acceptance
   matrix.
6. Transfer the repository and protect `main` with required CI checks.
7. Rotate every secret after the buyer confirms access.
8. Produce and test a database backup and restore.
9. Record final provider ownership, billing owner, region, and renewal dates.
10. Sign an acceptance record that names the deployed URL and release commit.

## Never transfer through chat

Do not send database service-role keys, OAuth client secrets, refresh tokens,
JWT secrets, TURN secrets, VAPID private keys, backup archives, or user exports
through chat messages or screenshots.
