---
name: plan
description: >
  Turns something the user wants to implement into ordered, self-contained task documents named
  ORDER-NAME.md under docs/ (or docs/<app>/ when the repository has several projects). Each task has context,
  business rules, acceptance criteria, test descriptions, code snippets, commands and commits.
  Use when the user describes a feature, change, refactor or idea and wants it planned or documented,
  or says "plan", "write the task", "document how to implement", "break this down".
---

# plan

Goal: the user describes what they want. You write the documentation that lets a developer (or another Claude session) implement it correctly, in small steps, without asking further questions. You do **not** implement it unless the user also asks.

## 1. Learn the project first

Before writing anything:

1. Read `CLAUDE.md`, `README.md`, `plan.md` (if present), and the index files in `docs/`.
2. Read two or three existing task files to copy their structure, depth and tone exactly.
3. Look at the repository layout (`ls` the root) and the code that the new work will touch. Quote real file paths, class names, commands and env variables. Never invent paths that do not exist; when something does not exist yet, say it will be created.
4. Collect the project rules that apply (stack, action pattern, strict types, no comments, coverage gate, security invariants, commit rules) and make every snippet obey them.

Ask the user a question only when a decision changes the design and cannot be inferred. Otherwise choose the sensible default and record it under "Assumptions".

## 2. Decide where the files go

Mirror the root folder organization:

| Repository layout | Folder for the task files |
| --- | --- |
| Several projects at the root (for example `api/`, `web/`, `desktop/`) | `docs/<project-folder>/` using the **existing** folder names. For an Electron app: `docs/desktop` if the root folder is `desktop`, `docs/electron` if the root folder is `electron` or does not exist yet |
| A single project | `docs/` at that project root |
| Work that spans projects | One file per project in each project's folder, plus a line in the root `docs/README.md` global order |

If `docs/` has a different convention already, follow it. Never mix both layouts.

## 3. File names: `ORDER-NAME.md`

- `ORDER`: two-digit zero-padded sequence per folder (`01`, `02`, ... `10`). Use three digits only if the folder will exceed 99. New files take the **next free number**. Never renumber existing files; if work must be inserted between two tasks, use the next free number and fix the dependency and the order tables.
- `NAME`: lowercase kebab-case, specific, no verbs like "implement" (`notes-list`, `image-upload`, `swagger-setup`).
- Examples: `docs/api/19-note-export.md`, `docs/web/22-export-button.md`.
- Update (or create) `docs/README.md` and the folder `README.md` index tables: id, title, dependencies, link.

## 4. Break the work down

- One task = one concern that can be finished, tested and committed on its own, roughly half a day of work. If a task needs more than five commits or touches more than one layer, split it.
- Order by dependency: data and contracts first, then logic, then interface, then polish and hardening.
- API tasks come before the web and desktop tasks that consume them. Shared package tasks come before the apps that import them.
- Every task states `Depends on:` with task ids.
- Include security, authorization, error and edge-case work inside the task that introduces the feature, not as a later "hardening" task (a final audit task is fine in addition).
- Documentation of the endpoint (Swagger) and tests are part of the task, never separate tasks.

## 5. Task file template

Use exactly these sections, in this order.

````markdown
# <ID> · <Title>

- **Status:** [ ]
- **Depends on:** <ids or none>
- **Plan refs:** <business rule ids, decisions, plan sections>
- **Commits:** <number>

## Goal
One or two sentences. What exists after this task that did not exist before.

## Context
Only what the implementer must know: relevant existing files, classes, endpoints, conventions, constraints. Real paths.

## Business rules
Numbered, testable statements (use `BR-xx` ids from plan.md when they exist, otherwise create new ids and add them to plan.md).

## Implementation
Numbered steps. For each step: which files to create or change, the commands to run (copy-pasteable, in the project's own form such as `pnpm api:artisan ...`), and code snippets that follow the project rules.

## Tests
Describe the tests concretely: file paths, framework, the cases (happy path, validation, authorization, boundaries, failure modes, idempotency, concurrency), the datasets, what is faked or mocked, and what each test asserts. Say what coverage is required.

## Verify
Commands to run and the expected result. Manual checks when something cannot be automated.

## Acceptance criteria
Checkbox list. Each item is observable and binary (a command output, a response status, a visible behavior). No vague wording like "works well".

## Commits
Numbered list of atomic commits with the exact Conventional Commit subjects (see the git-practices skill). Tests travel with the code. The last commit body ends with `Task: <ID>`.
````

Optional sections when useful: **Assumptions**, **Risks**, **Out of scope**, **Rollback**.

## 6. Writing rules for the content

- Snippets are runnable in spirit, use real names from the codebase, and obey every project rule: **no comments in code or config**, `declare(strict_types=1)`, Action pattern, types, security rules, Tailwind-only styles, and so on. Snippets show structure and intent; say when a library API must be checked against the installed version.
- Commands use the project's wrappers (`pnpm api:test`, `pnpm --filter web test`), never host PHP.
- Tests: describe them as specifications, with the exact inputs and expected outputs. Cover edge cases systematically: empty, null, minimum, maximum, one past the limit, unicode, duplicated, concurrent, expired, unauthorized, foreign resource (must be 404), rate limited, network failure, retries.
- Acceptance criteria and tests must trace back to the business rules.
- Write prose in clear, normal English (not caveman style): task files are persisted documentation.
- No filler. No restating the plan. No decisions left open: pick one and state why in one line.

## 7. Finish

1. Save the files and update the indexes.
2. Re-read each file against the checklist below and fix gaps.
3. Reply to the user with the list of created files in order, the assumptions you made, and anything you need decided. Do not paste the documents into the chat.
4. Do not commit unless asked; if asked, follow the git-practices skill (documentation commits use `docs(docs)` or `docs(<scope>)`).

## Checklist

- [ ] File names are `ORDER-NAME.md`, in the correct folder, with the next free numbers.
- [ ] Indexes and global order updated; dependencies are real task ids.
- [ ] Every section of the template is present and specific.
- [ ] Business rules are numbered and referenced by tests and acceptance criteria.
- [ ] Tests describe cases and assertions, including edge cases and authorization.
- [ ] Snippets follow the project rules and contain no comments.
- [ ] Commands are exact and use the project wrappers.
- [ ] Commits are atomic, ordered, and each leaves the repository green.
