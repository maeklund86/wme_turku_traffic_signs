## Agent skills

### Issue tracker

GitHub Issues (`maeklund86/wme_turku_traffic_signs`). See `docs/agents/issue-tracker.md`.

### Triage labels

Issue-triage roles and their transitions. See `docs/agents/triage-labels.md`.

### Skills

Repo skills live in `.agents/skills/<name>/SKILL.md` and are **not** registered with the harness — read the file directly instead of reaching for the Skill tool (which only sees the user's globally installed skills). Consult before long workflows: `wayfinder`, `research`, `prototype`, `grilling`, `domain-modeling`, `tdd`, `triage`.

`glob` skips dot-directories: pass `hidden: true` for anything under `.agents/`, or the search returns nothing.

### Domain docs

Single-context (`GLOSSARY.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.

### Research archives

Answered design questions live on `research/*` branches (`git branch -a`), never merged — read one by SHA: `git show research/<name>:docs/research/<name>.md`. Listed in `docs/spec/mvp-specification.md` §7.

### Rendering reference

WME SDK + OL2 rendering facts the Visual Overlay depends on — graphic anchoring, offset direction, opacity fallback, cursor, and the typings traps. See `docs/reference/wme-overlay-rendering.md`.

### Guardrails

No CI. Checks live in `scripts/pre-commit` (typecheck + vitest + build), wired via **local** git config — run once per clone: `git config core.hooksPath scripts`. Not wired? Run `npm run check` before committing.
