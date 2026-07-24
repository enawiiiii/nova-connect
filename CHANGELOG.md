# Changelog

All notable changes are documented here. Releases use semantic versioning.

## [Unreleased]

## [1.1.0] - 2026-07-24

### Added

- Configurable product identity and legal contact settings.
- Privacy, terms, and acceptable-use pages for buyer customization.
- Commercial handoff, deployment, networking, and legal checklists.
- Container build and continuous-integration validation.
- Reconnection grace for transient call-signaling interruptions.
- Google Identity Services registration and sign-in with server-side ID-token
  verification and NOVA two-factor enforcement.
- Buyer-safe setup, production preflight, Git-history secret audit, and clean
  checksum-protected sale-package generation.
- Rebranding, backup/restore, third-party software, and buyer-acceptance
  documentation.
- Automated CodeQL analysis, dependency updates, and tagged sale artifacts.

### Changed

- Public product claims now describe implemented capabilities rather than
  unverified usage or availability figures.
- ICE restart is delayed and coordinated to reduce reconnection glare.
- Product identity is configurable across web metadata, PWA metadata, emails,
  TOTP, push, moderation, calls, account exports, and application UI.
- Seller-specific provider values were removed from the Render Blueprint.

## [1.0.0] - 2026-07-24

- Initial sale-candidate release with private messaging, friends, individual
  and group voice/video calls, reports, account security, PWA installation,
  Arabic/English layout, and Supabase persistence.
