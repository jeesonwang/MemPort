# MemPort

MemPort syncs local Codex memories from `~/.codex/memories/` into a Claude Code project.

## Install

```bash
npm install -g memport
```

One-shot sync is also supported:

```bash
npx memport sync
```

## Commands

```bash
memport init
memport sync
memport hook session-start --project-root "$CLAUDE_PROJECT_DIR" --silent
```

`memport init` creates `.claude/`, installs a project-local SessionStart hook in `.claude/settings.local.json`, and runs one sync.

`memport sync` writes:

- `.claude/CLAUDE.md`
- `.claude/codex-memories/`
- `.claude/skills/<skill-name>/`

## Default Memory Scope

MemPort syncs these detailed memory files by default:

- `memory_summary.md`
- `MEMORY.md`
- `raw_memories.md`
- `rollout_summaries/**/*.md`

It does not sync `extensions/ad_hoc/**/*.md` or `automations/**/memory.md` by default.

## Skill Conflict Rules

MemPort only overwrites project skills that contain a valid `.memport.json` marker with `managedBy: "memport"` and a matching `sourcePath`.

If `~/.claude/skills/<skill-name>/SKILL.md` exists, Claude Code may prefer that personal skill over the project skill. MemPort still syncs the project skill and prints a warning.

## Recommended Project Ignore Rules

```gitignore
.claude/codex-memories/
.claude/CLAUDE.md.backup
.claude/settings.local.json
```

Do not ignore the entire `.claude/skills/` directory when the project uses team-shared skills.
