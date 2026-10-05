---
name: laravel-best-practices
description: >
  Laravel 12 rules for the api/ project: strict types in every file, PHPStan max, Action pattern, thin controllers,
  form requests, policies, API resources, Eloquent strictness with lazy loading prevented, queues, config, testing
  with Pest at 100% coverage, and no comments in code. Use on ANY task that touches PHP, Laravel, migrations,
  routes, models, jobs, config, Docker for the API, or API tests.
---

# laravel-best-practices

Sources: Laravel 12 docs (Eloquent, Eloquent relationships, validation, authorization, queues, deployment) plus the rules of this project. Pair with `best-practices` (SOLID, DRY, KISS) and `security-check`. PHP runs **only inside Docker**: use `pnpm api:artisan`, `pnpm api:composer`, `pnpm api:test`, `pnpm api:lint`.

## 1. Non-negotiable project rules

1. **No comments in code.** No `//`, `#`, `/* */`, no banners, no commented-out code, no TODO. Names, types and tests carry the meaning. The only docblocks allowed are type-only PHPDoc that PHPStan needs (`@param list<int> $ids`, `@return HasMany<Note, $this>`, array shapes), with no prose. Generated stubs from `artisan make:*` must have their comments deleted.
2. **`declare(strict_types=1);` in every PHP file** of the Laravel project: `app/`, `bootstrap/`, `config/`, `database/` (migrations, factories, seeders), `routes/`, `tests/`, `public/index.php`. It is the first statement after `<?php`, separated by a blank line. Enforced by Pint (`declare_strict_types`) and by a test that scans all project PHP files.
3. **PHPStan with the maximum strictness**: Larastan, `level: max`, strict-rules and deprecation-rules extensions, no baseline, no `ignoreErrors`, no `@phpstan-ignore`. Fix the type, not the report.
4. **Action pattern for database persistence only.** Business logic that persists data (create, update, delete) lives in `app/Actions/<Domain>/<VerbNoun>Action.php`: `final readonly class`, one public method `handle()`, constructor injection. Read-only queries, filtering, and orchestration logic lives in controllers or query builders. There is no `app/Services` directory.
5. **Lazy loading is forbidden everywhere.** It is prevented globally in `AppServiceProvider` for the `local` and `testing` environments (section 5), and every relationship that is used must be eager loaded.
6. **100% test coverage** of `app/` with Pest, no coverage ignores.
7. **Every endpoint is documented** with OpenAPI attributes (L5-Swagger) and covered by the spec parity test.

## 2. Types and static analysis

`phpstan.neon`:

```neon
includes:
    - vendor/larastan/larastan/extension.neon
    - vendor/phpstan/phpstan-strict-rules/rules.neon
    - vendor/phpstan/phpstan-deprecation-rules/rules.neon

parameters:
    level: max
    paths:
        - app
        - bootstrap
        - config
        - database
        - routes
        - tests
    checkMissingCallableSignature: true
    checkUninitializedProperties: true
    checkTooWideReturnTypeInProtectedAndPublicMethod: true
    checkBenevolentUnionTypes: true
    checkImplicitMixed: true
    reportUnmatchedIgnoredErrors: true
    treatPhpDocTypesAsCertain: false
```

Check the parameter names against the installed PHPStan version; keep every strictness switch that exists. Install `phpstan/phpstan-strict-rules` and `phpstan/phpstan-deprecation-rules` as dev dependencies.

Rules of thumb:

- Every parameter, return type and property is typed. No `mixed` unless unavoidable at a boundary; narrow it immediately (`is_string`, `Assert`-style guards, validated DTOs).
- Use `final` classes, `readonly` properties, enums, first-class callables, `match` over `switch`, constructor promotion.
- Generics on relations and collections: `@return HasMany<Note, $this>`, `@param Collection<int, Note> $notes`.
- Prefer small readonly DTOs (`app/Data/`) over associative arrays crossing layers. Array shapes (`@param array{title?: string|null, content?: array<mixed>} $data`) only at the HTTP edge.
- Strict comparisons (`===`), no loose `==`, no `empty()` on non-booleans, no `@` suppression, no `extract`, no `eval`, no globals.

Test that enforces strict types everywhere (`tests/Arch/StrictTypesTest.php`):

```php
<?php

declare(strict_types=1);

it('declares strict types in every php file', function (string $path): void {
    expect(file_get_contents($path))->toContain('declare(strict_types=1);');
})->with(function (): array {
    $roots = ['app', 'bootstrap', 'config', 'database', 'routes', 'tests'];
    $files = [];

    foreach ($roots as $root) {
        $iterator = new RecursiveIteratorIterator(new RecursiveDirectoryIterator(base_path($root), FilesystemIterator::SKIP_DOTS));

        foreach ($iterator as $file) {
            $path = $file->getPathname();

            if ($file->getExtension() === 'php' && ! str_contains($path, DIRECTORY_SEPARATOR.'cache'.DIRECTORY_SEPARATOR)) {
                $files[$path] = [$path];
            }
        }
    }

    $files[base_path('public/index.php')] = [base_path('public/index.php')];

    return $files;
});
```

Pint: `pint.json` with the `laravel` preset plus `declare_strict_types`, `ordered_imports`, `no_unused_imports`, `global_namespace_import`. CI runs `pint --test`.

## 3. Structure

```
app/
  Actions/{Domain}/VerbNounAction.php
  Data/                         readonly DTOs
  Http/Controllers/Api/V1/      thin controllers
  Http/Requests/                one FormRequest per write endpoint
  Http/Resources/               every response goes through a Resource
  Http/Middleware/
  Jobs/  Models/  Policies/  Rules/  Enums/  Console/Commands/
  OpenApi/{Schemas,Responses}/  attributes only
```

- **Controller**: authorize, call actions for persistence, return resources. No query building, no business conditions, no `DB::`, no `Storage::`.
- **Action**: owns a database persistence use case (create, update, delete) and its transaction (`DB::transaction()`), receives primitives, models or DTOs, never a `Request`. Actions may call other actions. Inject contracts and managers (`FilesystemManager`, `Hasher`, `Dispatcher`, `ConnectionInterface`) instead of using facades. Read-only operations stay in the query builder or controller.
- **Model**: relations, casts (`casts()` method), scopes, accessors. No business logic, no HTTP.
- **FormRequest**: `rules()`, `prepareForValidation()`, `after()`; always use `validated()`/`safe()`, never `all()` or `input()` for writes. `authorize()` returns `true` only when authorization happens in a policy call in the controller; otherwise authorize there.
- **Command, job, listener**: orchestration only; delegate to an action.
- Route model binding for every `{model}` parameter; never `Model::find($request->id)`.

```php
final readonly class CreateNoteAction
{
    public function handle(User $user, ?string $title = null): Note
    {
        return $user->notes()->create([
            'title' => $title,
            'content' => Note::emptyDocument(),
            'content_text' => '',
        ]);
    }
}
```

```php
public function update(UpdateNoteRequest $request, Note $note, UpdateNoteAction $action): NoteResource
{
    Gate::authorize('update', $note);

    return new NoteResource($action->handle($note, $request->validated()));
}
```

## 4. Eloquent

- **Mass assignment**: explicit `$fillable`; never `$guarded = []`. Foreign keys and ownership (`user_id`) are set through relations (`$user->notes()->create()`), not from input.
- **Casts and enums**: use `casts()` with backed enums, `array`/`AsArrayObject`, `datetime`, `hashed`. No manual JSON encoding.
- **Keys**: ULIDs (`HasUlids`, `ulid()`/`foreignUlid()`/`ulidMorphs()` in migrations).
- **Queries**: select only the columns you need for lists (never load large `jsonb` columns for summaries); `where` on indexed columns; add composite indexes that match `where` + `orderBy`; use `cursorPaginate` for infinite lists; `chunkById`/`lazyById`/`cursor` for large jobs; `exists()` over `count() > 0`; `whereIn` over loops; `upsert` for bulk writes; `increment` for counters.
- **Database does the work**: foreign keys with `cascadeOnDelete`, unique constraints, `nullable` correct, check constraints when needed. Do not rely on application code alone for integrity.
- **Scopes**: local scopes (`#[Scope]` attribute or `scopeX`) for reusable filters; no global scopes that hide data silently.
- **Observers and events**: avoid hidden side effects. Prefer calling an action explicitly. When audits or Scout need model events, delete and update through models, not through raw queries (which skip events).
- **Soft deletes** only when the product needs restore; this project hard-deletes.
- **Transactions**: wrap multi-write use cases in `DB::transaction()` inside the action; dispatch jobs `afterCommit`.
- **N+1**: see the next section.

## 5. Lazy loading prevention (mandatory)

`app/Providers/AppServiceProvider.php`:

```php
public function boot(): void
{
    Model::preventLazyLoading($this->app->environment(['local', 'testing']));
}
```

`Model::shouldBeStrict()` and `preventAccessingMissingAttributes()` are not enabled: list endpoints select partial columns on purpose, and reading a column that was not selected is already caught by tests. Revisit only if that changes.

- It runs in `local` (so a lazy load fails while developing) and in `testing` (so a lazy load fails the test suite). Production keeps working if one slips through, but the test suite must make that impossible.
- A violation throws `LazyLoadingViolationException`. Fix it with `with()`, `load()` or `loadMissing()` at the query that needs the relation. Never disable the check to make a test pass.
- Eager load only what the response uses: `with('author:id,name')` (always include the key and the foreign keys).
- Filter through the query builder, not in PHP: `$user->notes()->where(...)->get()`, not `$user->notes->where(...)`.
- Resources must not trigger queries: use `whenLoaded()` for relations.
- Cover the setting with a test:

```php
it('prevents lazy loading outside production', function (): void {
    expect(Model::preventsLazyLoading())->toBeTrue();
});

it('fails when a relationship is lazy loaded', function (): void {
    $note = Note::factory()->create();
    $fresh = Note::query()->findOrFail($note->id);

    expect(fn () => $fresh->user)->toThrow(LazyLoadingViolationException::class);
});
```

## 6. Validation and authorization

- One `FormRequest` per write endpoint. Use rule objects (`Rule::enum`, `Rule::in`, `Rule::unique`), custom `ValidationRule` classes for domain rules (for example `ValidTiptapDocument`), `prepareForValidation()` for normalization (lowercasing emails), `after()` for cross-field checks.
- Files: `file`, `image`, `mimes:`, `max:`, `dimensions:`; never trust the client extension or MIME. SVG is not allowed.
- Policies for every model, `Gate::authorize()` in controllers. Hide other users' resources with `Response::denyAsNotFound()` (404, not 403).
- Authorization is never done by checking a `user_id` from the request body.

## 7. API design

- Prefix `/api/v1`, JSON only, errors as JSON (`shouldRenderJsonWhen`), responses via API Resources wrapped in `data`.
- Stateless, Sanctum token-only. No sessions, no CSRF cookie, CORS closed.
- Idempotent updates (`PATCH` same payload twice gives the same result); `201` for create, `204` for delete, `422` validation, `429` rate limited, `404` missing or foreign.
- Rate limiters by name (`api`, `uploads`, `auth`) in `AppServiceProvider`; limits come from `config/notes.php`, not magic numbers.
- Cursor pagination for growing lists; `limit` bounded.
- Every operation has Swagger attributes with every status code, examples, and `security`.

## 8. Queues, scheduling, storage

- Jobs implement `ShouldQueue` with `Queueable`; serialize ids or models `withoutRelations()`; dispatch `->afterCommit()` (and `after_commit` for Scout).
- Declare `$tries`, `backoff()`, `$timeout`, `$failOnTimeout`; make jobs idempotent; use `ShouldBeUnique` or `WithoutOverlapping` when concurrent runs are harmful; `RateLimited` middleware for external calls.
- Failed jobs table configured; workers run under a supervisor and are reloaded on deploy (`php artisan reload`).
- Scheduled work is a thin `Schedule::command(...)` calling an action.
- Storage always through the filesystem manager and the configured disk (`s3` with MinIO locally). Never write user files with raw `file_put_contents`. Never use a client-provided name in a path.

## 9. Configuration and environment

- `env()` only inside `config/*.php`. Everywhere else `config('...')`. After `config:cache` any other `env()` returns `null`.
- Application settings live in `config/notes.php`; secrets only in `.env` (never committed); every variable documented in `.env.example`.
- `APP_DEBUG=false` in production. Production deploy runs `composer install --no-dev --optimize-autoloader` and `php artisan optimize`; keep the `/up` health route.

## 10. Testing (Pest)

- `RefreshDatabase`, factories for all models, one feature test file per endpoint, one unit test per action.
- Feature tests cover: success, validation (datasets), unauthenticated (401), foreign resource (404), rate limiting (429), idempotency, and the exact JSON shape; assert against the OpenAPI spec with the contract helper.
- Fakes: `Storage::fake('s3')`, `Queue::fake()`, `Event::fake()` only where needed, Scout `collection` engine, `Carbon::setTestNow` / `travel()` for time. Never call real S3, Meilisearch or the network.
- Architecture tests (`arch()`): no `App\Services`, actions are `final readonly` with only `handle()`, strict types everywhere, no debug functions, controllers do not use `DB`.
- Run `pnpm api:test` (coverage gate `--min=100`), `pnpm api:lint` (Pint and PHPStan max). Both must pass before any commit.
- Tests also have no comments.

## 11. Performance and operations

- Index what you filter and sort on; check `EXPLAIN` for new list queries.
- Cache expensive, rarely changing reads with explicit keys and invalidation; never cache per-user data without the user in the key.
- Use `Model::preventLazyLoading` plus query counts in tests (`DB::enableQueryLog()`) to guard N+1 on list endpoints.
- Logs never contain tokens, passwords or note content.

## Review checklist

- [ ] `declare(strict_types=1);` present; zero comments; only type-only docblocks.
- [ ] PHPStan max and Pint pass with no ignores and no baseline.
- [ ] Persistence logic is in a `final readonly` Action with a single `handle()`; read queries stay in controller or query builder; controller is thin.
- [ ] FormRequest, policy (404 for foreign), resource, route model binding used.
- [ ] No lazy loading: relations eager loaded; the AppServiceProvider guard is intact.
- [ ] Transaction around multi-write logic; jobs dispatched after commit.
- [ ] `env()` only in config; limits in `config/notes.php`.
- [ ] Swagger attributes complete; contract and parity tests pass.
- [ ] Tests for every branch, datasets for edge cases; coverage 100%.
