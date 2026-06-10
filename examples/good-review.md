────────────────────────────────────────────────────────────────
  Anchor Review  ·  uncommitted  ·  a3f8c12
  2026-06-09 14:32:07  ·  2 files changed, +18 / −4
────────────────────────────────────────────────────────────────

  Confidence: 3 / 5
  Reasoning:  The changed functions are small and self-contained, but
              the auth module lacks tests, so reasoning about all callers
              required some inference.

────────────────────────────────────────────────────────────────
  🔴 CRITICAL  (0)
────────────────────────────────────────────────────────────────
  None.

────────────────────────────────────────────────────────────────
  🟠 HIGH  (1)
────────────────────────────────────────────────────────────────
  src/auth/login.ts:42  ·  security
  ────────────────────────────────────────────────────────────
  Timing-attack vulnerability: comparing password hashes with `==` leaks
  information through execution time. An attacker can enumerate valid
  usernames or enumerate hash prefixes by measuring response latency.
  Use `crypto.timingSafeEqual` for all secret comparisons.

  42 |   if (input.hash == stored.hash) {

  Suggested fix:
  42 |   if (crypto.timingSafeEqual(Buffer.from(input.hash), Buffer.from(stored.hash))) {

────────────────────────────────────────────────────────────────
  🟡 MEDIUM  (1)
────────────────────────────────────────────────────────────────
  src/api/users.ts:88  ·  logic
  ────────────────────────────────────────────────────────────
  Unhandled promise rejection: `db.updateLastSeen(userId)` is called
  without `await` and without a `.catch()`. If the database call rejects,
  the error is silently swallowed on Node 18+ (it triggers
  `unhandledRejection` which exits the process in production). Either
  await the call or attach an error handler.

  88 |   db.updateLastSeen(userId);

  Suggested fix:
  88 |   await db.updateLastSeen(userId).catch((err) => logger.warn('updateLastSeen failed', err));

────────────────────────────────────────────────────────────────
  🟢 LOW  (0)
────────────────────────────────────────────────────────────────
  None.

────────────────────────────────────────────────────────────────
  ✨ What's good
────────────────────────────────────────────────────────────────
  • The login function correctly validates the request body with Zod
    before touching the database — all external input is parsed at the
    boundary.
  • Rate-limiting middleware is applied at the route level, not inside
    the handler, which keeps the handler logic clean and testable.

────────────────────────────────────────────────────────────────
  Next steps
────────────────────────────────────────────────────────────────
  Reply with:
    "mark finding N as noise"    to suppress this pattern
    "explain finding N"          for more context
    "fix finding N"              to apply the suggested fix
    "fix all"                    to walk through every finding and patch in turn
    "generate docstrings"        to add docstrings to changed symbols
    "generate tests"             to write unit tests for the changed code
    "simplify"                   to propose a refactor of the changed code
    "save review"                to archive a copy in .anchor/reviews/

────────────────────────────────────────────────────────────────
  Context used
────────────────────────────────────────────────────────────────
  diff: 2 files, +18/−4 (uncommitted)
  context: src/auth/middleware.ts (importer), src/db/index.ts (importee)
  learnings: .anchor/learnings.md (0 patterns)
  codebase map: .anchor/codebase-map.md (34 symbols)
────────────────────────────────────────────────────────────────
