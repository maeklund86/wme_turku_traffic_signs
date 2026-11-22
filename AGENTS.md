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

### Output files

When a task produces a file for the user to open, print a host-accessible path as well as the WSL path.

In WSL2, derive it with `wslpath -w <path>` and give the Windows form, for example `\\wsl.localhost\Ubuntu\home\<user>\...`. On native Linux, the normal path is enough.

### Agent scratch

Put temporary files, working plans, and working specs in `.agents/`. Git ignores that directory except for the tracked `.agents/skills/`.

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

# Technical Writing

Apply these rules to documentation, UI text, error messages, and instructions for people.

## Writing rules

- Use the project's required language. When writing English, use clear, simple English.
- Prefer short, clear sentences with one main idea. Keep words that readers need for accuracy.
- In procedures, give direct commands. Put each separate instruction in its own step. Combine actions only when they happen at the same time.
- In descriptions, present information in a clear order. Keep related information together, and make each paragraph's topic clear.
- Use project-approved technical terms consistently. Explain unfamiliar terms.
- Make references clear. Name the thing again if a pronoun could have more than one meaning.
- When simplifying or replacing a word, preserve the original meaning. Rewrite the sentence if a direct replacement changes its meaning.
- Use gender-neutral wording when it preserves meaning. For safety text, follow the applicable safety standard and project terminology. State the action or condition and the known risk.

## Scope

These instructions adapt selected ASD-STE100 principles for general project writing. They do not establish formal ASD-STE100 compliance. ASD-STE100 defines a controlled language with writing rules and a controlled dictionary, and it is not intended to stand alone. For work that requires compliance, follow the complete applicable issue and other applicable specifications.

## Basis in ASD-STE100 Issue 9

- Short, clear sentences and keeping necessary words: Part 1, Section 4, Rules 4.1–4.2, pp. 1-4-1–1-4-3.
- Procedures and descriptions: Part 1, Section 5, Rules 5.2–5.3, pp. 1-5-2–1-5-3; Section 6, Rules 6.1 and 6.4–6.6, pp. 1-6-1 and 1-6-5–1-6-7.
- Consistent terms and meaning: Part 1, Section 1, Rules 1.1–1.3 and 1.8–1.11, pp. 1-1-2–1-1-4 and 1-1-11–1-1-12; Section 2, Rule 2.2, p. 1-2-2; Section 9, Rules 9.1 and 9.4, pp. 1-9-1–1-9-4 and 1-9-8. Rule 1.10 limits its restriction on slang, regional terms, and jargon to technical nouns.
- Clear references and inclusive wording: Part 1, Section 9, General Recommendations 3, 4, and 7, pp. 1-9-11 and 1-9-13.
- Safety text: Part 1, Section 7, Rules 7.1–7.3, pp. 1-7-1–1-7-4.

The standard defines STE as a controlled language with writing rules and a controlled dictionary. It says STE is not intended to stand alone. See the General Introduction, pp. i–ii, and “Guide to the writing rules,” p. vii. Issue 9 is dated January 15, 2025. Check the official About STE page for the current issue.

## Official source

- ASD-STE100, *Simplified Technical English*, Issue 9, January 15, 2025: [official PDF](https://www.asd-ste100.org/assets/files/ASD-STE100_ISSUE9.pdf).
- [Official About STE page](https://www.asd-ste100.org/about_STE.html), which identifies Issue 9 as the current issue.
