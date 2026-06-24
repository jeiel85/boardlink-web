# UI and UX Flows

## Main screen

```text
BoardLink
[Generated name]  [Friend code]

[Play nearby]
Find people estimated to use the same Internet connection

[Online friends]
Invite a saved friend or search a friend code

[Quick join]
Room code / QR / invitation link

[Same-device play]
Works offline

Game cards:
Bubble Siege / Bingo / Gomoku
```

PWA install banner appears without blocking the main actions.

## First visit

1. Render app shell.
2. Detect browser context.
3. If in-app browser, show supported landing and external-browser gate before real-time action.
4. Generate local identity.
5. Show generated name.
6. Do not ask for profile information.
7. Let the user play.

## Nearby flow

1. User taps Play nearby.
2. Explain approximate discovery and 10-minute visibility.
3. User enables.
4. Show countdown.
5. Show discoverable profiles.
6. Send invitation.
7. Target accepts.
8. Both compare confirmation code.
9. Create room.
10. Join lobby.

## Online friend flow

1. Show local friends.
2. Search code.
3. Validate rate limit and code.
4. Show minimal profile.
5. Send friend request or game invitation.
6. If accepted, save locally.
7. Create/join room.

## Quick join

- QR scanner when available
- Camera permission only after user action
- Manual code entry always available
- Clipboard paste
- Invitation preview
- Browser handoff preserves route

## Lobby

- Game title
- Participant list
- Connection status
- Seat/role
- Game settings
- Ready state
- Leave
- Start

Only owner may change lobby configuration, but server validates.

## Connection states

Visible labels:

- Connecting
- Connected
- Reconnecting
- Connection unstable
- Opponent disconnected
- Room expired
- Update required

Avoid indefinite spinners.

## PWA install

### Banner

- Install
- Later

### Post-match

- Install for faster access
- Not now

### iOS guide

- Share button
- Add to Home Screen
- Add

## In-app browser gate

```text
Open in your browser

This embedded browser may limit real-time connections and app installation.

[Open in default browser]
[Copy link]
[How to open]
```

Do not erase invitation context.

## Error recovery

Every recoverable error provides one primary action:

- Retry
- Reconnect
- Update
- Open browser
- Return to lobby
- Copy invitation
- Reset local profile

## Localization

Initial languages:

- Korean
- English

All strings use localization keys from the beginning.

Generated names use language-specific curated dictionaries but retain a stable underlying avatar seed.
