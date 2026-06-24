# Security, Privacy, and Abuse Controls

## Threat model summary

Attackers may:

- Forge protocol messages
- Guess friend or room codes
- Flood room creation
- Flood WebSocket messages
- Open multiple tabs
- Modify client code
- Replay invitations
- Enumerate nearby users
- Abuse generated identities
- Attempt XSS through display fields
- Exploit stale PWA versions
- Exhaust Durable Object resources

## Trust boundaries

Untrusted:

- Browser code
- Client timestamps
- Client role claims
- Client scores
- User-Agent strings
- Friend-code search input
- Room codes
- Invitation URLs
- WebSocket payloads
- Client state hashes

Trusted after validation:

- Server-generated session
- Durable Object sequence
- Server clock
- Server-side game reducers
- Bound secret values

## Required controls

### HTTP and WebSocket

- HTTPS only
- Strict Origin allowlist
- HSTS
- Content Security Policy
- `frame-ancestors 'none'` unless embedding is explicitly required
- `X-Content-Type-Options: nosniff`
- Referrer policy
- Permissions policy
- Runtime schema validation
- Body and message size limits
- Rate limits
- Structured error responses
- No internal stack traces

### Content Security Policy

Target a no-third-party-script architecture.

Example direction:

```text
default-src 'self';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self' wss:;
worker-src 'self' blob:;
manifest-src 'self';
object-src 'none';
base-uri 'none';
frame-ancestors 'none';
```

Adjust for Cloudflare preview domains and development only through environment-specific configuration.

### Rate limits

Initial values are conservative starting points and must be load-tested.

| Action                    |                             Starting limit |
| ------------------------- | -----------------------------------------: |
| Friend-code lookup        |            10/minute/session and IP bucket |
| Room create               |                           3/minute/session |
| Invitation send           |                            5/minute/target |
| Identity challenge        |                        20/minute/IP bucket |
| Nearby enable             |                             6/hour/session |
| Invalid WebSocket schema  |                         Disconnect after 3 |
| Oversized WebSocket frame |                           Immediate reject |
| Bubble spawn              | Enforced by 120 ms cooldown plus burst cap |
| Bubble pop                |                     30/second hard ceiling |

Use Cloudflare rate-limit bindings or edge rules, plus game-specific checks inside Durable Objects.

### Bot challenge

Do not show a CAPTCHA to ordinary users.

Use Turnstile only after suspicious thresholds:

- Repeated code enumeration
- Excess room creation
- High invalid-command ratio
- Automated request pattern

### Invitation security

- High-entropy internal token
- Short user-facing alias
- 10–30 minute expiry
- Room-close revocation
- Maximum-use policy
- Do not log full token
- Bind acceptance to current identity session
- Rotate resume tokens after use

## Privacy data inventory

### Browser-local

- Private key
- Public identity
- Friend list
- Block list
- Settings
- Local history
- Recovery metadata

### Server ephemeral

- Current online session
- Nearby discoverability
- Room membership
- Current match state
- Temporary invitation
- Network bucket
- Connection quality bucket

### Server longer-lived

- Friend-code mapping
- Code rotation and revocation metadata
- Minimal abuse counters
- Operational aggregate metrics

### Prohibited

- Raw IP persistence
- Advertising identifiers
- Browser fingerprint
- Precise geolocation
- Contact list
- Email
- Phone number
- User-uploaded profile photo
- Public chat history

## Retention

Suggested initial policy:

| Data                         | Retention                                 |
| ---------------------------- | ----------------------------------------- |
| Presence record              | ≤ 60 seconds after heartbeat loss         |
| Nearby visibility            | Maximum 10 minutes per enable action      |
| Invitation                   | 10–30 minutes or room close               |
| Empty lobby                  | 10 minutes                                |
| Disconnected active room     | 5 minutes                                 |
| Completed match server state | Deliver result, then short cleanup window |
| Friend-code directory        | Until identity reset/rotation             |
| Abuse counters               | Minimal period required for protection    |
| Application logs             | Short, documented, scrubbed               |

## Children and Korean privacy review

The service is likely to be used by families and children.

Even without a conventional account, device identifiers, network metadata, and friend relationships can create privacy obligations. Treat them conservatively.

Before public launch in Korea:

- Publish a clear privacy policy.
- Document purpose, fields, retention, deletion, processors, and contact.
- Confirm whether the intended audience or marketing triggers requirements for users under 14.
- Avoid age collection unless there is a legal and product need.
- Avoid profiling, marketing, chat, and uploads.
- Obtain Korean privacy/legal review rather than assuming “anonymous” means the law does not apply.

This design bundle is an engineering design, not legal advice.

## User controls

- Reset anonymous profile
- Rotate friend code
- Clear local friends
- Disable nearby visibility
- Block a profile
- Clear local history
- Export diagnostics manually
- View privacy notice
- Contact operator
