# Product Brief

## Vision

Create a free web-based game table that works immediately across laptops, tablets, and phones.

The product should feel like this:

1. Open a link.
2. Receive an anonymous identity automatically.
3. Find someone nearby, find an online friend by code, or scan a QR invitation.
4. Choose a game.
5. Start within seconds.
6. Optionally install the site as a PWA for faster future access.

## Primary audiences

- Family members in the same home
- Friends in a cafe, church, school, office, or gathering
- Parents and children sharing tablets and phones
- Remote friends who do not want to create accounts
- Users who prefer free, lightweight browser games

## Core value propositions

- No account
- No installation required
- PWA installation available
- Cross-device
- Short session time
- Private invitation-oriented multiplayer
- No advertising or tracking
- Local same-device mode when offline

## Product principles

### Instant

The user must be able to enter a game without registration, email verification, profile creation, or app-store installation.

### Private by default

The initial release has no public lobby, public chat, user-uploaded images, or global random matchmaking.

### Honest nearby discovery

The service can estimate that users share an Internet egress address. It cannot prove physical proximity or the same router. The UI must not overstate the result.

### Casual first

Real-time browser input and anonymous identities are not suitable for high-stakes ranked competition without significantly stronger anti-cheat and fairness systems. Initial matches are friendly matches.

### Progressive enhancement

- Normal browser: full supported experience
- Installed PWA: preferred experience
- In-app browser: landing and invitation preview only, then external-browser handoff
- Offline: app shell, same-device games, practice, local history
- WebRTC: later optimization, never the only multiplayer path

## Initial release scope

### Included

- Responsive web app
- PWA install support
- Anonymous browser identity
- Generated display name
- Friend code
- Online presence
- Nearby-presence estimate
- Invitation link, QR code, and room code
- Server-authoritative WebSocket rooms
- Reconnection
- Multi-tab ownership lock
- PWA update deferral during matches
- Bubble Siege
- Bingo
- Gomoku
- Same-device local mode
- Privacy notice and reset/export controls
- Abuse rate limits and blocking

### Excluded

- User accounts
- Passwords
- Email or phone collection
- Public free-text chat
- Profile image uploads
- Global random matchmaking
- Ranked leaderboard
- Monetary rewards
- In-game purchases
- Advertising
- Third-party analytics
- Voice or video
- Permanent server-side match history
- Guaranteed offline cross-device multiplayer

## Success metrics without invasive analytics

Do not add behavioral tracking.

Operationally useful, privacy-minimized counters may be collected in aggregate if documented:

- Rooms created per day
- Successful and failed connection counts
- Protocol error counts
- Match completion counts by game ID
- Approximate latency buckets
- Worker exceptions
- Room cleanup failures

Do not attach these counters to device IDs, friend codes, IP addresses, or long-lived profiles.

## Product wording

Recommended:

- “Play nearby”
- “Find people using the same Internet connection”
- “No account required”
- “Install for faster access”
- “Open in your browser to play”
- “Friendly match”

Avoid:

- “Guaranteed same router”
- “Exact nearby users”
- “Completely anonymous” when device identifiers and network metadata are processed
- “Offline multiplayer” unless the specific connection path is proven
- “Cheat-proof”
