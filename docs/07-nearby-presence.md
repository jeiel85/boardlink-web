# Nearby Presence

## Product meaning

“Nearby” means the service estimates that multiple users share the same Internet egress network.

It does not prove:

- Same room
- Same building
- Same router
- Physical proximity
- Trusted relationship

## User experience

The user explicitly enables visibility:

```text
Show me to nearby players
[Enable for 10 minutes]
```

The UI displays an expiry countdown and a disable control.

Only discoverable users appear.

## Server-side network bucket

Application code receives the Cloudflare-provided connecting address for the current request.

Normalization:

- IPv4: use the complete public address for grouping.
- IPv6: use a documented network prefix policy, initially `/64`, then verify behavior in production.
- Never send the normalized address to the browser.
- Never persist the raw address.

Bucket derivation:

```text
bucket = HMAC_SHA256(
  NETWORK_BUCKET_SECRET,
  normalizedAddress + "|" + UTC date
)
```

The daily rotation limits long-term linkability while keeping a stable bucket during a typical session.

Near midnight, the service may check current and previous-day buckets for a brief overlap to avoid abrupt disappearance.

## Presence record

```ts
interface NearbyPresence {
  sessionId: string;
  publicId: string;
  displayName: string;
  supportedGames: string[];
  status: 'available' | 'busy';
  expiresAtServerMs: number;
}
```

Do not expose public ID if a shorter session-scoped ID is sufficient for list rendering.

## Expiry

- Visibility duration: 10 minutes
- Heartbeat: every 20 seconds while visible and foregrounded
- Missing heartbeat removal: 60 seconds
- Page hidden: pause or shorten visibility
- Explicit disable: immediate removal
- Durable Object alarm: cleanup stale records

## False-positive protection

After a nearby invitation is accepted, both users see a short confirmation code derived from the invitation session.

```text
Both screens: 482 193
```

Players verbally confirm the same code before joining.

This protects against unrelated users who happen to share a public IP.

## Privacy constraints

- Opt-in only
- Default off
- Automatic expiry
- No background discoverability after page close
- No raw IP storage
- No network bucket sent to clients
- No precise location
- No SSID access
- No local subnet scanning
- No browser fingerprinting

## Degraded cases

| Environment                         | Expected result                                              |
| ----------------------------------- | ------------------------------------------------------------ |
| Same Wi-Fi, same public IPv4        | Usually grouped                                              |
| Same Wi-Fi, separate IPv6 addresses | Grouping depends on prefix policy                            |
| Corporate or carrier NAT            | False positives possible                                     |
| VPN                                 | Users may be grouped with VPN egress users                   |
| Guest Wi-Fi isolation               | Presence may work through server even if local P2P would not |
| No Internet                         | Automatic web discovery unavailable                          |

## Language

Recommended Korean label:

- `근처에서 플레이`
- `같은 인터넷 연결을 사용 중인 것으로 추정되는 사용자입니다.`

Do not use:

- `같은 공유기 사용자 확정`
- `현재 위치의 사용자`
