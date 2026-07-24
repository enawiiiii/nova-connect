# Google sign-in

NOVA uses Google Identity Services only to authenticate a person's basic
identity. It does not request Gmail, Drive, contacts, or other Google API
access. The browser receives a short-lived Google ID token and the API verifies
its signature, audience, issuer, and expiry with Google's official Node client
before creating a normal NOVA session.

This OAuth client is separate from the Gmail API credentials used to send
verification emails.

## Google Cloud setup

1. Open Google Cloud Console and select the buyer-owned project.
2. Configure **Google Auth Platform** branding, audience, and contact email.
3. Create a client with application type **Web application**.
4. Add these **Authorized JavaScript origins**:
   - `http://localhost:5173`
   - the buyer's staging HTTPS origin
   - the buyer's final production HTTPS origin
5. Add one **Authorized redirect URI** for every deployed environment:
   - `https://nova-connect.onrender.com/api/v1/auth/google/redirect`
   - replace the hostname with the buyer's final domain after transfer
6. Copy the client ID ending in `.apps.googleusercontent.com`.

Google's setup guide:
<https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid>

## Database

Run `supabase/migrations/0012_google_auth.sql` in the Supabase SQL editor after
all earlier migrations. It adds a unique Google account subject identifier.
NOVA uses Google's stable `sub` value rather than email as the federated
identity key.

## Render variables

Set these four variables, using the same public client ID in both client-ID
fields:

```text
GOOGLE_AUTH_ENABLED=true
GOOGLE_AUTH_CLIENT_ID=123456789-example.apps.googleusercontent.com
VITE_GOOGLE_AUTH_ENABLED=true
VITE_GOOGLE_CLIENT_ID=123456789-example.apps.googleusercontent.com
```

No Google client secret is required. Production uses Google Identity Services'
full-page redirect flow because it is reliable on iOS and ITP browsers; local
development keeps the popup callback for convenience. The API verifies Google's
double-submit CSRF token before accepting the ID token. Render must perform a
new build after changing the `VITE_` values because Vite embeds them into the
web bundle at build time.

## Account behavior

- A first-time Google user gets a verified NOVA account and a unique username.
- A returning user is located by Google's stable subject identifier.
- A Gmail or Google Workspace identity can safely link to an existing account
  with the same verified email.
- Other third-party email addresses must first sign in with their NOVA password
  before account linking, preventing email-based account takeover.
- If NOVA two-factor authentication is enabled, its six-digit code is still
  required after Google authentication.
- Google-created users can use **Forgot password** to add a NOVA password for
  password-based account controls.

## Acceptance checks

Test redirect sign-in in Chrome, Safari/iPhone, and an incognito window. Confirm
new-account creation, returning login, logout, session refresh, a blocked
account, and a Google account with NOVA two-factor authentication enabled.
