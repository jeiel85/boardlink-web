# Goal 01 — PWA Shell and Browser Context

## Mission

Implement the installable PWA shell, explicit update lifecycle, in-app browser gate, external-browser handoff, multi-tab ownership, page lifecycle, and offline local shell.

## Required outcomes

- Web manifest
- versioned service worker
- offline app shell
- install banner
- post-match install CTA placeholder
- iOS installation guide
- installed-mode detection
- suspected in-app browser detection
- real-time route gate
- Android intent attempt with fallback
- iOS manual handoff
- Copy Link
- deep-link preservation
- Web Locks/BroadcastChannel active-tab ownership
- update deferral lock
- visibility and Wake Lock adapters

## Constraints

- Landing and invitation preview must render in in-app browsers.
- Real-time routes must not start there.
- Do not rely only on User-Agent.
- Do not force an automatic redirect on page load.
- Do not activate a waiting service worker while `matchActivityLock` exists.
- Do not cache mutable APIs.
- Preserve complete path and query during handoff.

## Tests

- installed mode hides banner
- dismissal hides banner for configured period
- Chromium install event stored and triggered only on click
- iOS guide displays instead of fake install prompt
- in-app route gate preserves invitation token
- Android fallback works when intent fails
- normal browser is not falsely blocked by one missing optional API
- multi-tab leader election
- takeover invalidates previous leader
- service-worker update waits during simulated match
- offline shell loads
- invitation endpoint is not served from cache

## Completion criteria

- Supported browsers can use the app shell.
- Unsupported/in-app contexts receive a clear recovery path.
- PWA update behavior is covered by E2E tests.
