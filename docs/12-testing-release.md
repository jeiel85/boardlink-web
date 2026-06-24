# Testing and Release Quality

## Test layers

### Pure domain tests

Vitest in Node or browser-compatible environment:

- Game reducers
- Protocol canonicalization
- State machines
- Identity formatting
- Validation schemas
- Replay determinism

### Workers runtime tests

Use `@cloudflare/vitest-pool-workers`.

Test:

- Worker routing
- Durable Object storage
- Room serialization
- WebSocket lifecycle where supported
- Alarms
- D1 bindings
- Rate-limit adapter behavior
- Origin checks
- Identity challenge

### End-to-end tests

Use Playwright across:

- Chromium
- Firefox
- WebKit

Test service workers separately rather than disabling them for every PWA scenario.

### Real-device tests

Automated desktop browsers are insufficient for:

- PWA installation
- iOS standalone storage behavior
- In-app browsers
- Wake Lock
- background suspension
- touch latency
- orientation changes
- Android intents
- network switching

## Required browser matrix

| Platform | Browser/context                             |
| -------- | ------------------------------------------- |
| Android  | Chrome                                      |
| Android  | Samsung Internet                            |
| Android  | Installed PWA                               |
| iPhone   | Safari                                      |
| iPhone   | Home-screen PWA                             |
| iPad     | Safari and PWA                              |
| Windows  | Chrome                                      |
| Windows  | Edge                                        |
| Windows  | Firefox                                     |
| macOS    | Safari                                      |
| macOS    | Chrome                                      |
| In-app   | KakaoTalk                                   |
| In-app   | Naver                                       |
| In-app   | Instagram or another major embedded browser |

Document exact tested OS and browser versions for each release.

## Network matrix

- Same Wi-Fi
- Different Wi-Fi
- Wi-Fi versus LTE/5G
- Corporate or guest Wi-Fi
- VPN
- IPv6-enabled network
- Network switch during lobby
- Network switch during match
- Artificial 100/250/500 ms latency
- Packet loss
- WebSocket reconnect

## Bubble Siege acceptance tests

- Stable logical arena on all aspect ratios
- One-pointer enforcement
- Spawn cooldown
- Ball-cap restoration after pop
- Correct final count
- Role switch
- Draw result
- abort/replay on background
- no score divergence after replay
- degraded-latency warning
- reconnect behavior

## Property and fuzz tests

Generate command streams:

- Legal
- Duplicate
- Out-of-order
- Missing
- Invalid actor
- After match end
- At exact boundary
- Oversized payload
- Unknown event type

Assertions:

- No crash
- No impossible phase
- No negative count
- No active count beyond cap
- Event sequence monotonic
- Replay final hash matches live final hash

## Accessibility

- Keyboard navigation outside the real-time arena
- Focus-visible
- Screen reader labels for lobby and results
- Touch targets
- Contrast
- Reduced motion
- Sound toggle
- No color-only information
- Orientation and zoom behavior documented

## Performance budgets

Initial targets:

- Compressed initial JS: keep as low as practical; establish a CI budget after Goal 01
- First interactive view on mid-range mobile: test on real hardware
- Lobby input response: immediate local feedback
- Game render: 60 FPS target, graceful lower refresh
- WebSocket command processing: no unbounded queues
- Room snapshot: under 64 KiB for initial games

## Release checklist

- Dependency audit reviewed
- Lockfile committed
- Protocol fixtures unchanged or migration documented
- D1 migration tested
- Durable Object migration tested
- Preview environment tested
- Production secrets verified
- CSP verified
- No third-party script detected
- Privacy policy version published
- Rollback version known
- Room cleanup alarm verified
- Cost dashboard checked
- Browser matrix signed off
