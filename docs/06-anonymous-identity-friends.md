# Anonymous Identity and Friends

## Goal

Provide recognizable, reusable device identities without requiring an account.

## Identity creation

On first supported-browser visit:

1. Generate an ECDSA P-256 key pair with Web Crypto.
2. Export the public key.
3. Derive `publicId = base32(SHA-256(canonicalPublicKey))[0..25]`.
4. Generate a friendly display name from curated local word lists.
5. Request a friend code from the server after proving key possession.
6. Store identity material in IndexedDB.
7. Request persistent storage when appropriate, not during the first paint.

## Why a key pair

A random string alone can be copied. A challenge-signature flow allows the server to verify that a browser controls the private key corresponding to a public identity.

This does not make the user legally verified. It only proves control of the stored device key.

## Challenge flow

```text
Client → public ID and public key
Server → nonce + expiry
Client → signature(nonce, context)
Server → verifies signature
Server → short-lived session token
```

Challenge context includes:

- nonce
- origin
- protocol version
- issued time
- expiry
- intended action

## Friend code

Friend codes are:

- Random
- Rotatable
- Case-insensitive
- Not the public ID
- Protected by lookup rate limits
- Mapped in D1

Suggested format:

```text
M7KD-4Q2P
```

## Friend relationship model

Version 1 stores the friend list locally.

Flow:

1. Search friend code.
2. Receive a minimal public profile.
3. Send a friend request if target is online.
4. Target accepts or declines.
5. Both clients store the other's public profile locally.
6. Server retains no permanent social graph.

If the target is offline, version 1 may show “currently offline” and allow sharing an invitation link instead. Do not add offline pending requests until retention and abuse policies are designed.

## Online state

`UserSessionDO(publicId)` exposes only:

- online
- busy
- available
- last heartbeat expiry
- supported games

Do not expose precise last-active timestamps.

## Display names

Initial release uses generated names.

Examples:

- Blue Fox 4821
- Quiet Whale 1937
- Red Penguin 8210

Korean localization can use curated adjective/animal dictionaries.

Benefits:

- Avoids moderation burden
- Prevents impersonation through arbitrary names
- Reduces child-safety risk
- Eliminates HTML injection from names

Allow regeneration with a cooldown.

## Blocking

Local block list:

- Prevent invitations
- Hide from friend list
- Hide from nearby results
- Reject WebSocket invite events

Server receives a hashed or public-ID block rule only when needed for enforcement. Avoid centralizing a long-term block graph unless necessary.

## Profile reset

User can:

- Rotate friend code
- Regenerate display name
- Clear friend list
- Reset complete anonymous identity
- Export recovery package
- Import recovery package

Explain that reset creates a new identity and old friends cannot automatically find it.

## Recovery export

Create an encrypted package:

```text
version
public profile
private key material
friend list
settings
created time
integrity metadata
```

Encrypt with a user-entered passphrase using a memory-hard KDF supported by the selected audited library, or use a one-time device-to-device transfer flow.

Do not invent custom cryptography.

For the first public release, a device-to-device QR transfer may be safer than a long QR containing private key material:

1. Old device creates a short-lived transfer room.
2. New device scans QR.
3. Both display a confirmation code.
4. Encrypted payload transfers through the server.
5. Payload expires immediately.
6. User confirms successful import.
