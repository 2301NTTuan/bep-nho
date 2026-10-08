# Bếp Nhớ MVP review

Date: 2026-10-08

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

- First-party email/password sign-in, revocable cookie sessions, `/v1/me`, and object-level ownership checks are now implemented. Account lifecycle remains incomplete: email verification, password reset, MFA, device/session management, and account deletion are not yet available.
- The internal alpha now has 13 structured Vietnamese home recipes, but they remain explicitly experimental and still need human culinary/editorial review plus production media/workflow.
- Serving selection supports deterministic ingredient-aware scaling for 1–8 portions, with conservative/fixed modes and practical rounding. Broader culinary calibration still needs editorial testing.
- Cook Mode now resumes from an immutable server snapshot, persists real timer/progress events, and queues progress briefly offline. Browser E2E, timer pause, multi-device conflict UX, and offline feedback/completion remain open.
- Users can now explicitly accept, reject, or bounded-edit adjusted ingredients, and can pin one immutable “My Best Version” per recipe. Broader version-library comparison and bulk review remain future UX work.
- Taste DNA now has a private history/control screen with deterministic explanations, manual overrides, and per-dimension reset. Cross-device live refresh and export are not included.
- The web now has real login/register/logout flows and keeps public recipe browsing available while signed out. Deployment still needs verified same-site cookie/origin configuration and abuse controls.

## Architectural debt and operational gaps

- API contracts are shared TypeScript definitions, not generated from an OpenAPI source of truth.
- Scaling, cook progress, timer restoration, sequencing, queue reconciliation, Taste replay, and effective override semantics now have pure domain utilities. HTTP orchestration and deterministic explanation copy remain in NestJS services.
- User-owned APIs now have session guards, 404 ownership semantics, Origin checks, and focused security tests. Retry idempotency beyond the hardened cooking paths, login throttling/rate limits, and broader audit controls remain open.
- The integration suite covers concurrency, provenance, and the domain loop; focused HTTP tests cover standardized conflicts and development-route isolation. Browser accessibility/responsive automation is still missing.
- There is no production observability baseline (structured logs, metrics, traces, error reporting) or CI workflow enforcing all gates.
- Admin is only a skeleton; content publication currently depends on database seeds.

## Recommended next phases

### Phase 6 — Auth and ownership boundary

Completed 2026-10-08: first-party scrypt credentials, hashed opaque sessions, `/v1/me`, secure httpOnly cookies, exact-Origin CSRF protection, object ownership guards, removal of caller-selected user IDs, web auth UI, and two-user authorization tests.

### Phase 7 — Alpha content and cooking reliability

Completed 2026-10-08: 13 explicitly experimental Vietnamese home recipes, immutable/version-safe seed content, ingredient-aware 1–8 serving scaling, exact CookSession snapshots, owner-scoped resume, timestamp timers, robust event sequencing, and a user-scoped IndexedDB progress queue. Human culinary review remains outstanding; no verification claim is made.

### Phase 8 — User control over learning

Completed 2026-10-08: private Taste DNA history/explanations, append-only manual override/reset controls, deterministic post-reset replay, bounded adjustment accept/reject/edit decisions, explicit engine/user version provenance, and stable “My Best Version” pinning.

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

## Phase 6 authentication completed

- Authentication uses normalized email plus versioned scrypt hashes; raw passwords and raw session tokens are not persisted.
- Opaque cookie sessions enforce expiry, revocation, and active-user status; production cookies are HttpOnly, SameSite=Lax, Path=/, and Secure.
- All cook, feedback, Taste DNA, and personalization ownership is derived from the authenticated session. Foreign resources return 404, and legacy user-ID routes are gone.
- Stateful browser requests enforce configured origins, while credentialed CORS never emits a wildcard origin.
- Remaining production blockers are account recovery/verification, abuse protection, deployment/operations hardening, human culinary review/editorial workflow, user control over learning, and browser accessibility/E2E coverage.

## Phase 7 cooking reliability completed

- Alpha recipes are maintained as validated manifests, and seeding refuses to rewrite an existing canonical version with different content.
- Scaling is deterministic and shared across API/web: serving scaling precedes Taste factor application and a single practical rounding operation.
- Every new CookSession stores the exact scaled recipe snapshot atomically. Legacy null snapshots have a non-mutating exact-version compatibility path.
- Multiple active sessions are intentionally allowed; `/v1/me/cook-sessions/active` resumes only the latest session owned by the authenticated user.
- Timer and step progress derive from persisted/queued timestamped events. Sequence numbers use the maximum of server and local state.
- IndexedDB retains failed progress events, acknowledges idempotent duplicates, prevents cross-user replay, contains no credentials, and is cleared for the logging-out user.
- Feedback begins only after server-confirmed completion. Phase 5.5 integrity and Phase 6 auth/Origin/404 ownership behavior remain covered.

## Phase 8 user control completed

- `/taste` exposes every supported dimension with learned score, confidence, effective weight/sample count, manual override, effective values, deterministic explanation, and owner-only signal/control history.
- Override `0` is distinct from no override. Any manual override is authoritative at confidence 1 while recipe-rule min/max bounds remain enforced. Clearing and resetting are append-only control events.
- Reset affects only one learned dimension, preserves raw TasteSignal/CookFeedback history and profile/global counters, and uses the same TasteProfile advisory lock as feedback. Subsequent state is replayed only from valid signals after the latest reset.
- Personalized suggestions now use `personalize-v3`, because zero-confidence override semantics materially change effective output. Prior immutable versions remain valid and retain their stored algorithm version.
- ACCEPT records a decision without minting content; REJECT and bounded EDIT create or reuse immutable effective-content snapshots. Source versions never change, and user-derived versions retain canonical/taste provenance plus explicit parent/origin metadata.
- Latest engine suggestion, latest version of any origin, and “My Best Version” are separate concepts. Pin/unpin never creates a version, a later suggestion never moves the pin, and CookSession stores the exact selected version snapshot.
- Current-user guards, exact-Origin mutation protection, foreign-object 404 behavior, append-only decision/control logs, concurrency locks, and effective-content hash reuse are covered by PostgreSQL and HTTP regressions.
