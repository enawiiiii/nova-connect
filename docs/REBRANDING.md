# Rebranding checklist

NOVA Connect can be sold with its existing identity or rebranded without
changing application logic.

## Configuration

Set the server-side `PRODUCT_NAME` and these build-time web values:

```env
VITE_PRODUCT_NAME=Buyer Product
VITE_PRODUCT_SHORT_NAME=Buyer
VITE_PRODUCT_MARK=B
VITE_PRODUCT_TAGLINE=Stay connected
VITE_PRODUCT_DESCRIPTION=A private place for messages and calls.
VITE_LEGAL_NAME=Buyer Legal Entity
VITE_LEGAL_EMAIL=legal@buyer.example
VITE_SUPPORT_EMAIL=support@buyer.example
VITE_STATUS_URL=https://status.buyer.example
VITE_TERMS_EFFECTIVE_DATE=2026-07-24
```

`VITE_` values are embedded during the web build. Changing them requires a new
deployment, not only a service restart.

## Visual assets

Replace and verify:

- `apps/web/public/favicon.svg`;
- `apps/web/public/pwa-192.png`;
- `apps/web/public/pwa-512.png`;
- `apps/web/public/og.png`;
- the default colors and font declarations in `apps/web/src/styles.css`;
- screenshots, marketplace graphics, and sales materials outside the repo.

Keep the PWA icons square and test their maskable safe area on Android. Keep the
social image at 1200 x 630 pixels and below the target platform's size limit.

## Provider identity

Create buyer-owned credentials and sender identities for:

- the production domain and Render service;
- Supabase;
- Google Identity Services;
- transactional email;
- TURN;
- Web Push VAPID;
- monitoring and backups.

Do not reuse the seller's OAuth, email, push, TURN, or database credentials.
Update Google Authorized JavaScript origins and every email sender/domain
record after the final domain is chosen.

## Acceptance

Build once with an obviously different test name and mark. Confirm the page
title, PWA manifest, login screen, app shell, emails, TOTP issuer, push
notifications, moderation messages, legal pages, exported-data filename, and
mobile install label all use the new identity.
