# claude-skills

A collection of [Claude Code](https://claude.com/claude-code) skills plus a small CLI to install and update them in any project. Works on Windows, Linux and macOS, with no runtime dependencies.

## Requirements

- Node.js 18 or newer

## Setup

Clone the repository and link the CLI globally:

```bash
git clone <repository-url>
cd claude-skills
npm link
```

After that, `claude-skills` is available in any terminal. To remove it later:

```bash
npm unlink -g claude-skills
```

Without linking, run it directly from the repository:

```bash
node bin/claude-skills.js <command>
```

## Commands

### `install`

Copies skills into `<project>/.claude/skills/`.

```bash
claude-skills install
claude-skills install skills=best-practices,cypress-tests,e2e-tests --path=~/documents/code/my-project
claude-skills install except=best-practices --path=~/documents/code/my-project
```

- Without `--path`, the CLI asks for the project path.
- Without `skills` or `except`, all skills are installed.
- `skills` and `except` cannot be used together.
- Skills that already exist in the project are skipped. Add `--force` to overwrite them.

### `update`

Refreshes the skills already installed in a project with the content from this repository.

```bash
claude-skills update
claude-skills update --path=~/documents/code/my-project
```

- Without `--path`, the current directory is used.
- Only skills that exist both in the project and in this repository are updated.
- Skills that exist only in the project are never touched or removed.
- New skills from this repository are not added; use `install` for that.
- An updated skill is replaced entirely, so files added inside it in the project are lost.

### `list`

Prints the available skills.

```bash
claude-skills list
```

### `help`

Prints the usage summary.

## Options

| Option | Applies to | Description |
| --- | --- | --- |
| `skills=<a,b>` | `install` | Install only the listed skills |
| `except=<a,b>` | `install` | Install everything except the listed skills |
| `--path=<dir>` | `install`, `update` | Target project. Supports `~`, `C:\...` and `/...` |
| `--force` | `install` | Overwrite skills that already exist |

Both `skills=a,b` and `--skills=a,b` are accepted, as is `--path <dir>`. Quote paths that contain spaces.

## Available skills

| Skill | Purpose |
| --- | --- |
| `best-practices` | SOLID, DRY, KISS and the no-comments rule for every code change |
| `git-practices` | Atomic commits and Conventional Commit messages |
| `plan` | Turns a feature idea into ordered task documents under `docs/` |
| `security-check` | Security gate covering OWASP Top 10, secrets, uploads, Electron and Docker |
| `laravel-best-practices` | Laravel 12 rules: strict types, PHPStan max, persistence-only Actions, Pest |
| `react-best-practices` | React 19 and Next.js 16 rules: one responsibility per file, `@/` imports, Tailwind, accessibility |
| `electron-best-practices` | Electron security checklist, IPC, preload, packaging, one responsibility per file |
| `e2e-tests` | End-to-end testing strategy and edge-case coverage |
| `cypress-tests` | Writing Cypress tests against the full stack |
| `stress-testing` | Load and stress testing with Artillery |

## Project structure

```
bin/claude-skills.js     CLI entry point
src/cli.js               Command routing
src/commands/            install, update, list and help commands
src/*.js                 Single-purpose helpers (argument parsing, path expansion, skill selection and copying)
.claude/skills/<name>/   Skill sources, each with a SKILL.md
```

## Adding or editing a skill

1. Create or edit `.claude/skills/<name>/SKILL.md` with a `name` and `description` in the frontmatter.
2. Run `claude-skills list` to confirm it appears.
3. Run `claude-skills update` in the projects that should receive the change.
