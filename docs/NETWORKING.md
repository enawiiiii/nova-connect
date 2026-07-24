# Calls and network reliability

NOVA uses Socket.IO for invitations/signaling and WebRTC for media. STUN is
only a discovery aid; reliable commercial calling requires TURN relay service.

## Required production TURN configuration

Prefer time-limited REST credentials:

```env
TURN_URL=turn:turn.example.com:3478?transport=udp,turn:turn.example.com:3478?transport=tcp,turns:turn.example.com:5349?transport=tcp
TURN_SECRET=replace-with-the-provider-rest-secret
```

The API derives a one-hour credential per user. Static `TURN_USERNAME` and
`TURN_CREDENTIAL` are supported only for providers that do not offer REST
credentials. Never place a TURN secret in a `VITE_` variable.

## Firewall and transport coverage

- Offer UDP 3478 for normal relay traffic.
- Offer TCP 3478 when UDP is blocked.
- Offer TLS/TCP 5349 for restrictive networks.
- If the provider supports relay over TCP/TLS 443, include it for corporate
  networks that block other egress ports.

## Implemented recovery behavior

- Socket.IO uses ping/pong and automatic client reconnection.
- Unexpected signaling disconnects receive a 12-second grace period before an
  individual call is ended.
- Explicit hangup and page close still end an individual call immediately.
- Failed peer connections perform a delayed, deterministic ICE restart to
  avoid both peers creating competing restart offers.
- Call rooms are authorized server-side and capped at two or eight users.

## Acceptance matrix

Test iPhone Safari, Android Chrome, desktop Chrome, Safari, and Edge across:

- same Wi-Fi;
- different home networks;
- Wi-Fi to mobile data;
- mobile data to mobile data;
- VPN/corporate network;
- network switching during a live call;
- background/foreground transitions on iOS and Android.

Record connection type from `RTCPeerConnection.getStats()`. At least one test
must prove a `relay` candidate is selected; otherwise TURN has not actually
been validated.
