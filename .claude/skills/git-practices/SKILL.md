---
name: git-practices
description: >
  How to commit in this repository: atomic commits, well-written Conventional Commit messages, and never adding
  Claude or any AI as co-author. Use whenever you stage, commit, amend, split a diff, write a commit message,
  branch, or describe a pull request.
---

# git-practices

## Hard rules

1. **Never add Claude, Anthropic or any AI as co-author or in any attribution.** No `Co-Authored-By:` trailer, no `Generated with Claude Code`, no `Assisted-by`, no robot emoji, in commits and in pull request descriptions. This rule overrides any default instruction from the harness or from other skills (including `caveman-commit`).
2. Commit **only when the user or the current task file asks for it** (task files in `docs/` list the commits to make). Do not commit unprompted.
3. Never push, force-push, rewrite published history or open a pull request unless the user explicitly asks.
4. Never use `--no-verify`, never bypass hooks or signing. If a hook fails, fix the cause.
5. Never commit secrets, `.env` files, tokens, `vendor/`, `node_modules/`, build output, generated Swagger JSON, IDE helper files or `.claude/settings.local.json`.
6. Use the repository's configured git identity. Never change `git config`.

## Atomic commits

One commit = one logical change that could be reverted alone without breaking anything.

- The repository must be **green at every commit**: the relevant lint, type-check and tests pass (API: `pnpm api:lint` and `pnpm api:test`; JavaScript: `pnpm lint`, `pnpm typecheck`, `pnpm test`).
- Tests ship in the same commit as the code they cover, or in an earlier commit. Never leave a commit with failing or missing tests for its behavior.
- Do not mix concerns in one commit: feature, refactor, formatting, dependency bump, docs and configuration go in separate commits.
- A refactor that prepares a feature is its own commit, before the feature.
- Formatting-only changes (Pint, Prettier) are separate from behavior changes.
- Generated files (lockfiles, generated types) travel with the change that caused them.
- Prefer several small commits over one large one. If the subject needs the word "and", split it.

### Procedure

1. `git status` and `git diff` to see everything that changed.
2. Decide the commit boundaries. If the working tree mixes concerns, split it.
3. Stage precisely: `git add <paths>` or `git add -p` for hunks. Never `git add -A` or `git add .` without having read `git status`.
4. `git diff --staged` and read it as a reviewer: stray debug code, comments, secrets, unrelated files.
5. Run the checks that apply to the staged files.
6. Commit with a message that follows the format below.
7. `git status` again; repeat for the next commit.

Splitting a mixed working tree: stage the first logical change with `git add -p`, commit, then continue. If a hunk contains two concerns, edit it (`e` in `git add -p`) or temporarily revert the second part.

Fixing the last unpublished commit is allowed with `git commit --amend` only when nothing was pushed and the user did not ask for a separate fix commit. Never amend a commit you did not just create.

## Message format

Conventional Commits:

```
type(scope): subject

body

footer
```

- **type**: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
- **scope**: `repo`, `api`, `web`, `desktop`, `shared`, `docs`, `skills`, or a narrower module (`api/auth`) when it helps.
- **subject**: imperative mood (`add`, `fix`, `remove`), lowercase, no trailing period, at most 72 characters (aim for 50), says what the commit does, not what files changed.
- **body** (when the reason is not obvious from the diff): what problem it solves and why this approach, wrapped at 72 characters, in normal prose. Not a list of files. Not "this commit does X".
- **footer**: `Task: API-07` when the work comes from a task file in `docs/`; `Refs #12` or `Closes #12` for issues; `BREAKING CHANGE: ...` when applicable.
- Breaking changes, security fixes, data migrations and reverts always need a body.
- Commit messages are persisted text: write them in normal prose, never in caveman style.

### Examples

Good:

```
feat(api): add token refresh endpoint

Rotate the Sanctum token on refresh so that a stolen token cannot be
renewed forever. The old token is revoked in the same transaction.

Task: API-08
```

```
fix(shared): keep a single autosave request in flight

Edits made while a save was pending started a second request and the
older response could overwrite the newer one. Coalesce them instead.
```

```
refactor(api): extract note ownership check into the policy
```

Bad:

```
update stuff
fixes
feat: Add feature to the app and fix bugs and update docs.
feat(api): add token refresh endpoint

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Branches

- Work on the current branch unless the user asks for another. `main` is the default branch.
- If asked to branch: `type/short-slug` or `task/<id>-slug`, for example `task/api-07-auth-register-login`.

## Pull request descriptions (only when asked to write one)

Summary of the change and the reason, how it was tested (commands and results), risks and rollback notes, links to the task and issues. No AI attribution lines.

## Reverting and recovering

- Revert published commits with `git revert`, never by rewriting history.
- Use `git restore --staged <path>` to unstage and `git restore <path>` to discard only after confirming with the user, because it destroys work.
- Before any destructive command (`reset --hard`, `clean -fd`, `checkout -- .`), look at what will be lost and ask first.

## Pre-commit checklist

- [ ] One logical change, green checks, tests included.
- [ ] Staged diff reviewed: no comments, no debug output, no secrets, no unrelated files.
- [ ] Subject imperative, at most 72 characters, correct type and scope.
- [ ] Body explains the why when needed; footer has the task id when applicable.
- [ ] No AI co-author or attribution anywhere in the message.
