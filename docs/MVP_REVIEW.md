# Bếp Nhớ MVP review

Date: 2026-10-07

## Current MVP readiness

The core differentiating loop is implemented and integration-tested:

1. discover and read a published canonical recipe;
2. cook the canonical or an exact personalized version;
3. submit feedback, excluding technically invalid cooks from learning;
4. update an explainable Taste DNA profile;
5. deterministically create or reuse a bounded personalized version;
6. keep every historical cook session bound to the version actually cooked.

The web experience now presents this loop coherently on desktop and mobile. It is suitable for guided development demos and a small internal alpha. It is not ready for public production traffic yet.

## Remaining product gaps

- Real sign-in, session management, ownership checks, and account lifecycle are absent. Current user IDs in mutation URLs/bodies are not a production authorization model.
- Content depth is insufficient: there is one development recipe explicitly awaiting culinary review, with no production media or editorial workflow.
- Arbitrary serving overrides are intentionally disabled until ingredient-aware culinary scaling is implemented in Phase 7; every session now uses the servings from the exact canonical/personalized snapshot cooked.
- Cook Mode is online-only; timers are informational and session resume/offline event queueing are not implemented.
- Users see generated adjustments but cannot explicitly accept, reject, edit, or pin “My Best Version” before future use.
- Taste DNA has no dedicated history/control screen for explanations, overrides, or reset.
- Production web authentication currently fails closed with a configuration message, as intended, but needs a real provider before deployment.

## Architectural debt and operational gaps

- API contracts are shared TypeScript definitions, not generated from an OpenAPI source of truth.
- Domain rules still live mainly in NestJS services. Extract pure deterministic functions before the algorithm grows.
- Public APIs need authorization guards, idempotency keys for retryable mutations, rate limits, and audit/security tests.
- The integration suite covers concurrency, provenance, and the domain loop; focused HTTP tests cover standardized conflicts and development-route isolation. Browser accessibility/responsive automation is still missing.
- There is no production observability baseline (structured logs, metrics, traces, error reporting) or CI workflow enforcing all gates.
- Admin is only a skeleton; content publication currently depends on database seeds.

## Recommended next phases

### Phase 6 — Auth and ownership boundary

Implement a small first-party session boundary (or a narrowly selected identity provider), `/v1/me`, secure httpOnly web sessions, object-level ownership guards, and authorization tests. Remove all client-supplied ownership decisions from mutations.

### Phase 7 — Alpha content and cooking reliability

Add 10–20 culinary-reviewed Vietnamese recipes, ingredient-aware serving scaling, active timers, session resume, and a minimal offline event queue. Keep immutable recipe/version semantics.

### Phase 8 — User control over learning

Add Taste DNA history/explanation, adjustment accept/reject/edit, manual overrides/reset, and “My Best Version.” Preserve raw signals and deterministic replay.

### Phase 9 — Delivery quality and operations

Add OpenAPI generation, HTTP/browser/a11y tests, CI gates, structured observability, rate limiting, backup/restore checks, and an environment/deployment runbook.

Do not begin social, pantry, household, or monetization domains before Phases 6–9 establish safe ownership, reliable Cook Mode, user control, and production operations.

## Phase 5.5 hardening completed

- Taste profiles are unique per user and algorithm version, with concurrency-safe creation.
- Feedback, session completion, and personalized version generation are safe under concurrent retries.
- Taste signals retain durable CookFeedback provenance; technical exclusions preserve all reason codes without changing learned state.
- Personalized content hashes represent effective cooking output rather than volatile Taste DNA evidence.
- Feedback UI learns only dimensions the user explicitly selected, including explicit neutral (`0`).
- Development-only bootstrap has controller-level production denial in addition to conditional module registration.
