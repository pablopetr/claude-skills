---
name: best-practices
description: >
  Mandatory design rules for every code change in this repository: SOLID, DRY and KISS, plus the no-comments rule.
  Use on ANY task that writes, modifies, refactors, reviews or designs code in any language (PHP, TypeScript, SQL,
  YAML, shell). Run it before writing code and again as a self-review before finishing or committing.
---

# best-practices: SOLID, DRY, KISS

These rules apply to all code in `api/`, `web/`, `desktop/` and `packages/`. They are not optional and they are not style preferences. If a change violates a principle, redesign it before presenting it.

## Procedure

1. **Before writing:** read the files you will touch and search the repository for existing helpers, types, actions, components and tests that already solve part of the problem. Reuse before creating.
2. **While writing:** after each new class, function or component, run the check in the matching section below.
3. **Before finishing:** run the final review checklist at the end of this file. Fix violations. Do not mention a violation and leave it in place.
4. **Report** in one line which principle forced a design decision only when it changed the obvious solution.

## No comments

Code in this repository has **no comments**. Not explanatory comments, not section banners, not commented-out code, not TODO notes, not `// eslint-disable` or `/* istanbul ignore */` or `@codeCoverageIgnore`.

- Express intent with names, small functions, types and tests.
- If a block needs a comment to be understood, extract a function or rename until it does not.
- Allowed, because they are types and not prose: PHPDoc generic and array-shape annotations that PHPStan requires (`@param list<string> $ids`, `@return HasMany<Note, $this>`), and `'use client'` or `'use server'` directives. Never add prose to them.
- Tool directives that cannot be expressed in configuration are tolerated only when there is no alternative, as a single line without prose. Prefer configuration (for example a Jest `projects` entry instead of a docblock).
- Documentation belongs in `README.md`, `docs/` and Swagger attributes, not in code.

## S: Single Responsibility

One reason to change per unit.

- A class, function or component does one thing, and its name says what, without "and".
- This project's rule: one use case per Action class with a single public `handle()`. Controllers validate, authorize, call an action and return a resource. Models hold relations, casts and scopes only.
- React: a component either renders or orchestrates data. Extract logic into hooks, rendering into small components.
- Smells: a name containing `And`, `Manager`, `Helper`, `Util`, `Handler` with several verbs; a function over about 20 lines; more than three dependencies injected; a test that needs unrelated setup.
- Fix: split by reason to change, not by size.

## O: Open/Closed

Extend behavior by adding code, not by editing working code.

- Replace `if`/`switch` ladders on a type with a map, an enum with methods, a strategy or polymorphism when a third variant appears.
- Add new Tiptap behavior as a new extension, a new validation rule as a new `Rule` class, a new notification as a new class.
- Do not add extension points that nothing uses yet (see KISS).

```php
enum ImageMime: string
{
    case Jpeg = 'image/jpeg';
    case Png = 'image/png';
    case Gif = 'image/gif';
    case Webp = 'image/webp';

    public function extension(): string
    {
        return match ($this) {
            self::Jpeg => 'jpg',
            self::Png => 'png',
            self::Gif => 'gif',
            self::Webp => 'webp',
        };
    }
}
```

## L: Liskov Substitution

Subtypes must work wherever the base type is expected.

- Never narrow accepted input or widen thrown errors in an override. Never make an overriding method throw "not supported".
- Prefer composition over inheritance. Extend framework base classes only as the framework requires.
- Contracts: if two classes implement an interface, a caller must not need `instanceof` to use them correctly.
- Test doubles must obey the same contract as the real implementation.

## I: Interface Segregation

Small, role-focused contracts.

- Depend on the narrowest type a consumer needs: pass an `Image`, not a `Note` with images; pass `{ id: string }`, not the whole `User`.
- React props: pass what the component renders, not the whole entity. TypeScript: `Pick`, small interfaces, no "god" option bags.
- Electron preload API: one method per capability, never a generic pass-through.

## D: Dependency Inversion

Depend on abstractions at the edges, concrete code inside.

- Inject dependencies through constructors (PHP) or parameters/props/providers (TypeScript). No `new` of collaborators with side effects inside business logic.
- I/O boundaries (filesystem, HTTP, clock, time, randomness, Electron modules, `fetch`) go behind an injected parameter so tests can replace them.
- Laravel: type-hint contracts (`FilesystemManager`, `Hasher`, `Dispatcher`) in Actions instead of calling facades. Facades are acceptable in controllers, routes, service providers and tests.
- Do not create an interface for something with one implementation and no I/O. That is over-engineering.

```ts
export interface DraftStore {
  read(noteId: string): Draft | null;
  write(noteId: string, draft: Draft): void;
  remove(noteId: string): void;
}

export function attachDrafts(controller: AutosaveController, noteId: string, store: DraftStore): void {
  controller.subscribe((state) => {
    if (state.status === 'saved') store.remove(noteId);
  });
}
```

## DRY

Every piece of knowledge has one representation.

- Duplicated **knowledge** (a rule, a constant, a type, a query, a permission, a limit) must live in one place and be imported or injected. Examples here: limits in `config/notes.php`, API types generated from the OpenAPI spec, business rules referenced by `BR-xx` ids.
- Duplicated **text** that expresses different knowledge is fine. Do not merge code that only looks alike and will change for different reasons.
- Rule of three: tolerate two similar blocks, extract on the third, unless the duplicated block encodes a business rule or a security check (extract immediately).
- Tests: shared setup goes into factories, helpers and datasets. Do not copy-paste test bodies; use `->with()` datasets (Pest) and `it.each` (Jest).
- Never copy code between `web` and `desktop`. Put it in `packages/shared`.
- Smells: the same literal in two files, two validators for the same rule, a type declared twice, copied regex.

## KISS

The simplest design that satisfies the requirement and the rules above.

- No abstraction without a second real use or an I/O boundary. No config for values that never change. No generic framework for one case.
- Prefer the platform and the framework over new code, and installed dependencies over new ones. Do not add a package for a few lines.
- Prefer early returns over nested conditions; prefer plain data and pure functions over class hierarchies; prefer a `match` over a strategy registry when there are two cases.
- Keep functions short and flat. Cyclomatic complexity above about 8 means split.
- Names: say what it is or does. No abbreviations other than universal ones (`id`, `url`, `db`, `api`).
- When ponytail is active it decides how little to build. This skill decides the floor: SOLID, DRY, tests, security and the no-comments rule are never traded for brevity.

## Conflicts

Resolve in this order: security and data integrity, then explicit project rules in `CLAUDE.md`, then the language skill (`laravel-best-practices`, `react-best-practices`, `electron-best-practices`), then SOLID, then DRY, then KISS. When SOLID and KISS pull apart, keep the boundary abstraction (I/O, framework edge) and drop the speculative ones.

## Final review checklist

- [ ] Each new unit has one reason to change and a name without "and".
- [ ] No `if`/`switch` ladder on a type that will grow; no override that breaks its base contract.
- [ ] Dependencies are injected; I/O is behind a parameter; no hidden globals in business logic.
- [ ] No knowledge duplicated; shared code lives in the shared package or a helper; tests use datasets.
- [ ] No abstraction, option or config that nothing uses.
- [ ] Zero comments, no commented-out code, no suppression directives, no TODOs.
- [ ] Tests exist for every behavior and edge case added, and the coverage gate still passes.
