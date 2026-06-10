# Anchor Manual Smoke Test

- [ ] 0. In a clean fixture repo, run `/anchor init` and verify .anchor/codebase-map.md
   and .anchor/codebase-graph.md are created with non-empty content
- [ ] 1. Run `/anchor review` and verify it reads codebase-map.md, codebase-graph.md,
   .anchor/config.yaml, .anchor/learnings.md, AGENTS.md
- [ ] 2. Verify it produces a review in the format spec
- [ ] 3. Reply "mark finding 1 as noise", verify learnings.md grows
- [ ] 4. Reply "save review", verify .anchor/reviews/<date>-<sha>.md exists
- [ ] 5. Run `/anchor full`, verify the same flow + auto-archive
- [ ] 6. Run `/anchor doctor`, verify all green
- [ ] 7. Run `/anchor init --refresh`, verify the map and graph are regenerated
- [ ] 8. Run `/anchor status`, verify the text summary + JSON output are coherent
- [ ] 9. Run `make install-hook` from the fixture repo, then `git push` to a fake
   remote (or `--dry-run`, which also fires pre-push), verify the reminder
   prints and the push is NOT blocked
- [ ] 10. Verify the PostToolUse hook fires inside Claude Code after `git push`
- [ ] 11. Run `make uninstall-hook`, verify .git/hooks/pre-push is removed
- [ ] 12. Run `/anchor review pr <N>` against a fixture PR with a body and a linked
    closing issue; verify the review explicitly references both
- [ ] 13. Run `/anchor review pr <N> --no-pr-context` and verify PR metadata is NOT
    included in the review
- [ ] 14. Reply "fix all" to a multi-finding review; verify Claude walks through
    each finding in CRITICAL → LOW order
- [ ] 15. Reply "generate docstrings" / "generate tests" / "simplify" and verify
    Claude proposes the corresponding patch via the normal diff workflow
- [ ] 16. Run `/anchor review pr <N>` against a fixture PR with a failed CI run;
    verify the review explicitly references the CI failure and the likely
    causing change
- [ ] 17. Run `/anchor review pr <N> --no-ci-context` and verify CI logs are NOT
    included in the review
- [ ] 18. Set `strictness: 1` in `.anchor/config.yaml`, run `/anchor review`, verify
    the review surfaces more findings (style, naming, docs) than at default
- [ ] 19. Set `strictness: 3`, run `/anchor review`, verify the review surfaces
    only bugs/security/crashes
- [ ] 20. Set `strictness: 9` (invalid), verify Anchor warns and falls back to 2
- [ ] 21. Run `/anchor review`; verify the rendered review ends with a `Context
    used` block listing every source consulted, with no failed sources
- [ ] 22. Run `/anchor review` in a fixture where `gh` is unavailable; verify the
    `Context used` block shows "PR body + linked issues: (failed: gh not
    found)" rather than dropping silently
- [ ] 23. Add a learning like "Use `==` for string equality" that would suppress
    a finding, then introduce a `==` on user input in auth code; verify the
    review still flags it as a CRITICAL/HIGH security finding despite the
    learning (carve-out wins)
