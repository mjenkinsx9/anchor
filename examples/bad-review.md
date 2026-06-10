# Bad Review Example

This file shows the same diff reviewed **badly**.
Each antipattern is annotated with `> ⚠`.

---

────────────────────────────────────────────────────────────────
  Anchor Review  ·  uncommitted
────────────────────────────────────────────────────────────────

> ⚠ **No confidence score or reasoning** — the reviewer skipped the
> Confidence / Reasoning block entirely, so the reader has no idea how
> much to trust any of these findings.

> ⚠ **No severity grouping** — all findings are dumped in a flat list
> instead of being grouped under 🔴 CRITICAL / 🟠 HIGH / 🟡 MEDIUM / 🟢 LOW
> headers. The reader cannot triage at a glance.

**Findings**

1. You should add a blank line between the imports at the top of the file.
   Consider alphabetising them too.

> ⚠ **Invented nitpick to fill quota** — import ordering is a style
> preference with no impact on correctness or security. This finding adds
> noise without value and should have been omitted or marked LOW.

2. There are some issues with this code.

> ⚠ **Vague finding without file:line** — no file path, no line number, no
> explanation of what "some issues" means. The developer cannot act on this.

3. The authentication check could be improved by using a different comparison.
   Here is a suggested fix:
   ```ts
   if (timingSafeCompare(input.hash, stored.hash)) {
   ```

> ⚠ **Suggested fix that doesn't compile** — `timingSafeCompare` is not
> imported or defined anywhere in the codebase. Applying this fix as-is
> produces a `ReferenceError` at runtime. A correct fix would use
> `crypto.timingSafeEqual` from Node's built-in `crypto` module with
> `Buffer.from(...)` wrapping.

4. Missing docstring on `_internalHelperFunction`. This is called out in
   our style guide.

> ⚠ **Flagging a pattern suppressed by learnings** — the project's
> `.anchor/learnings.md` contains the entry "Missing docstrings on private
> methods". Surfacing this again ignores the team's explicit decision to
> suppress it. The always-on security carve-out does not apply here (this
> is a style issue, not security/correctness).

5. The variable name `x` is not descriptive enough.

> ⚠ **Invented nitpick to fill quota** — another low-signal style
> observation with no file:line reference, added only to reach an
> arbitrary finding count.

────────────────────────────────────────────────────────────────
  ✨ What's good
────────────────────────────────────────────────────────────────
  None noted.

> ⚠ **Missing "Context used" footer** — the reader cannot verify what
> data the review was based on, whether the codebase map was stale, or
> whether context files failed to load. The §8 format requires this
> section unconditionally.
