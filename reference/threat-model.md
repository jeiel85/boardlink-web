# Threat Model Worksheet

Update this file at every public release.

## Assets

- Device private keys
- Anonymous public identities
- Friend codes
- Invitation tokens
- Resume tokens
- Room state
- Match results
- Network bucket secret
- Presence list
- Operational availability

## Actors

- Normal user
- Curious user with DevTools
- Modified client author
- Code enumerator
- WebSocket flooder
- User sharing a carrier NAT address
- Malicious invitation sender
- Compromised browser extension
- Operator
- Cloud provider

## Entry points

- Landing route
- Friend lookup
- Identity challenge
- Invitation preview
- Nearby enable
- Room creation
- WebSocket upgrade
- Game commands
- PWA update
- Recovery import

## Questions

- Can the client bypass a state transition?
- Can an identifier be enumerated?
- Can a token be replayed?
- Can one tab impersonate another?
- Can a stale client corrupt room state?
- Can logs reveal a secret?
- Can a false nearby match expose a user?
- Can a malformed game event crash every peer?
- Can an attacker create unbounded Durable Objects?
- Can a PWA cache an authenticated response?
