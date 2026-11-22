# Coding Standards

Use these standards when writing, reviewing, or refactoring code. Use judgment for trivial changes.

## Think before Coding

- State assumptions that affect the solution.
- Ask when the request has multiple plausible meanings or an important detail is unclear.
- Prefer a simpler option when it meets the request. Explain a real tradeoff before choosing between options.
- Define observable success checks before starting multi-step work.

## Keep it Simple

- Implement only what the request needs. Leave speculative features out.
- Avoid abstractions, configuration, and flexibility for one use or an unrequested future need.
- Add error handling for realistic failure cases, not impossible states.
- Rework code that is more complex or longer than the problem requires.

## Make Surgical Changes

- Match the surrounding code's style and structure.
- Change only what the request needs. Leave unrelated refactors and cleanup untouched.
- Remove unused code only when your change made it unused.
- Report unrelated issues without changing them.

## Verify the Result

- Choose checks that prove the requested behavior, such as focused tests, type checks, or lint.
- For a bug fix, add or update a test that reproduces the bug when practical, then confirm it passes.
- Run the relevant checks and report their results. If a check cannot run, state why.
- For multi-step work, track each step against a clear completion check.

## WME SDK contracts

Use the pinned `wme-sdk-typings` as the source of truth for WME SDK method arguments. Derive narrow application and fake-SDK types from those signatures or exported types instead of copying SDK payload shapes. Test the exact payload at the SDK boundary when its shape affects user-visible behavior.
