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

<!--VITE PLUS START-->

# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at https://viteplus.dev/guide/.

## Built-in Commands vs Scripts

`vp <name>` runs a built-in command. `vp run <name>` runs a `package.json` script or a `vite.config.ts` task. Scripts cannot overwrite built-ins, so `vp dev` and `vp run dev` may do different things. Check `package.json` and `vite.config.ts` first, and run `vp run <name>` when the project defines a script or task with that name.

## Running Scripts

Run TypeScript and JavaScript files with `vpx <file>`, for example `vpx ./scripts/seed.ts --dry-run`. It handles enums, decorators, JSX, and tsconfig `paths`, so do not add `tsx` or `ts-node` to run scripts. `vpx --watch <file>` reruns the file when a file it uses changes, in place of `tsx watch`. `vp node <file>` runs plain Node.js.

## Tool Versions

Run `vp toolchain` to show versions and relationships in the active Vite+
release. Add a tool name to select part of the graph. For example, run
`vp toolchain vite`. Use `--global` to ignore the local `vite-plus` package. Use
`vp why <package>` to show the package-manager dependency graph.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->
