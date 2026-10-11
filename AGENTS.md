## Agent skills

### Issue tracker

GitHub Issues (`maeklund86/wme_turku_traffic_signs`). See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Skills

Repo skills live in `.agents/skills/<name>/SKILL.md` and are **not** registered with the harness — read the file directly instead of reaching for the Skill tool (which only sees the user's globally installed skills). Consult before long workflows: `wayfinder`, `research`, `prototype`, `grilling`, `domain-modeling`, `tdd`, `triage`.

`glob` skips dot-directories: pass `hidden: true` for anything under `.agents/`, or the search returns nothing.

### Domain docs

Single-context (`GLOSSARY.md` + `docs/adr/` at the repo root). See `docs/agents/domain.md`.
