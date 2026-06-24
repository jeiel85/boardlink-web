# PWA and Browser Experience

## Supported contexts

```ts
type BrowserContext =
  | 'installed-pwa'
  | 'supported-browser'
  | 'suspected-in-app-browser'
  | 'unsupported-browser'
  | 'unknown';
```

## Context detection

Use layered detection:

1. Installed display mode checks
2. Known in-app User-Agent patterns
3. Capability checks
4. Runtime connection checks
5. Conservative fallback

User-Agent matching is heuristic only.

## PWA installation UX

### Normal browser

Show a non-blocking banner on the main screen when installation is relevant.

Policy:

- First visit: small banner
- Dismissal: hide for 7 days
- First completed match: show result-screen install call-to-action
- Installed mode: never show
- In-app browser: show external-browser gate instead
- iOS Safari: show manual Add to Home Screen guide
- Chromium with install event: call prompt only after user clicks

### Manifest

Include:

- stable `id`
- name and short name
- description
- start URL
- standalone display mode
- theme and background colors
- maskable and standard icons
- screenshots for richer supported install UI
- shortcuts only after routes are stable

### Service worker

Cache:

- versioned static assets
- app shell
- game visual assets
- local rule help

Do not cache:

- WebSocket traffic
- invitation validation
- active presence responses
- room state APIs
- identity challenges
- mutable directory lookups

Use an explicit update prompt.

```text
New version ready.
It will update after the current game.
```

If no game is active, allow user-triggered reload.

## Match-safe update policy

- Track `matchActivityLock`.
- A waiting service worker may not activate while the lock exists.
- After match completion, snapshot local history, release lock, then offer update.
- Do not automatically reload a room.
- New protocol-incompatible clients must update before joining.

## In-app browser policy

### Allowed

- Landing page
- Game descriptions
- Invitation preview
- Browser-opening instructions
- Copy link

### Blocked until external browser

- Nearby discovery
- Friend presence
- Room creation
- Room join
- WebSocket match
- PWA install
- Identity recovery import

## External-browser handoff

### Android

On explicit user click:

1. Attempt a generic Android intent preserving full path and query.
2. Do not hard-code Chrome as the only browser.
3. Include browser fallback URL.
4. Guard against redirect loops.
5. If it fails, show manual instructions and Copy Link.

### iOS/iPadOS

A normal web page cannot reliably force Safari or the default browser to open.

Provide:

- Platform-specific menu instructions
- Copy Link
- Share action when available
- Preserve the complete invitation URL
- Do not claim automatic browser opening is guaranteed

## Deep-link preservation

The external browser must return to the same route:

```text
/join/{invitationToken}
```

Do not redirect to the home page.

Do not depend on in-app browser cookies or IndexedDB being shared with the external browser.

## Multi-tab ownership

Use BroadcastChannel and Web Locks where supported.

- One tab owns presence and WebSocket session.
- Other tabs show “BoardLink is active in another window.”
- Provide a user action to take over.
- A takeover invalidates the old connection.
- Fallback to IndexedDB heartbeat when Web Locks is unavailable.

## Page lifecycle

During a real-time match:

- Request Wake Lock when supported.
- Re-request after visibility returns.
- Detect hidden page.
- Bubble Siege: pause/abort current round according to game policy.
- Turn-based games: remain connected or reconnect.
- Screen orientation change during Bubble Siege: abort and replay the round.

## Offline mode

Available:

- App shell
- Same-device play
- Practice
- Local history
- Rules

Unavailable:

- Nearby discovery
- Online friends
- Room join
- Server-authoritative multiplayer

The UI must clearly distinguish offline local mode from network multiplayer.
