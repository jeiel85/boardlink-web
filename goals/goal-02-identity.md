# Goal 02 — Anonymous Device Identity

## Mission

Implement accountless cryptographic device identity, generated profiles, friend-code issuance, local persistence, reset, and transfer-ready recovery boundaries.

## Required outcomes

- ECDSA P-256 key generation
- canonical public-key serialization
- public ID derivation
- IndexedDB identity repository
- generated localized display name
- public profile
- server challenge/signature verification
- short-lived authenticated session
- friend-code D1 schema
- code issue, lookup, rotate, revoke
- identity reset
- persistent-storage request UX
- no raw private-key logging

## Constraints

- No email, phone, password, OAuth, or social login.
- Friend code is not the public ID.
- Public IDs are non-sequential.
- Generated names only.
- Session tokens are short-lived.
- Private key remains browser-local.
- Recovery export may be stubbed behind an interface if audited encryption is not yet selected; do not create custom crypto.

## Tests

- key ownership challenge success/failure
- public ID stable for same public key
- identity survives reload
- reset produces new identity
- code uniqueness
- code rotation invalidates old lookup
- lookup rate limit
- logs redact code/token/private material
- unsupported IndexedDB shows actionable error

## Completion criteria

- Two fresh browser profiles obtain distinct identities and friend codes.
- Identity proof is required before authenticated presence or room actions.
