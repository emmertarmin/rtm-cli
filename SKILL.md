---
name: rtm-cli
description: Manage Remember The Milk (RTM) todo tasks, lists, and tags via CLI. Use for task management, shopping lists, household organization, and any GTD-style productivity workflows.
---

# RTM CLI Skill

Manage your Remember The Milk (RTM) account via command line.

## Command Reference

All commands support `--help` for detailed usage:

```bash
rtm --help                 # Top-level commands
rtm items --help           # Task management
rtm lists --help           # List management
rtm tags --help            # Tag management
rtm items note --help      # Notes management
```

Common commands: `rtm items`, `rtm lists`, `rtm tags`, `rtm items add`, `rtm items done`, `rtm items delete`

## Organization & Maintenance Strategies

### Before Adding: Duplicate Prevention

Always check for existing similar tasks before creating new ones:

```bash
# Search for similar tasks first
rtm items --status all

# Check across specific lists
rtm items --list <list-id>
```

**Strategy**: If a similar task exists, mention the fact to the user and either:

- Update the existing task
- Add clarifying tags or notes or distinct names to distinguish them (e.g., "Buy milk (weekly)" vs "Buy extra milk (party)")

### Before Deleting: Safety Checklist

**ALWAYS confirm before deleting** - deletions are permanent.

Ask the user:

1. "Are you sure you want to delete '<task-name>'?"
2. "Should I complete it instead of deleting?" (if it's done)
3. For bulk deletions: "This will delete N tasks. Continue?"

**Prefer archiving over deleting** for completed or no-longer-relevant tasks:

```bash
rtm lists archive <list-id>   # Keep history, remove from active view
```

### List Organization Principles

**Limit list count** to 5-10 active lists to reduce cognitive load:

- Personal, Work, Shopping, Household, Projects, Someday/Maybe
- Archive old project lists rather than deleting

**Use consistent naming conventions**:

- Singular vs plural: pick one (e.g., all singular: "Work", "Home", "Shop")
- Avoid generic names like "Tasks" or "Todo" - be specific

### Tag Strategy

**Use tags for cross-cutting concerns** (not list replacements):

- Context: `@home`, `@office`, `@phone`, `@computer`
- Energy/Time: `quick`, `deep-work`, `15min`, `1hour`
- People: `<name>`
- Priority modifiers: `urgent`, `blocked`, `someday`

**Tag hygiene**:

- Consolidate similar tags (e.g., merge `buy` and `shopping`)
- Delete unused tags to keep autocomplete useful

### Regular Maintenance Workflows

**Weekly Review (15 minutes)**:

```bash
# Stale tasks check
rtm items --due before:today   # Overdue items - reschedule or drop
rtm items --priority 1       # Ensure urgent items are truly urgent

# Tag cleanup
rtm tags | sort               # Look for duplicates to rename/merge
```

**Monthly Consolidation**:

```bash
# Find potential duplicates across all lists
rtm items --status all | sort | uniq -d  # Manual review for dups

# Archive completed project lists
rtm lists                     # Identify completed projects
rtm lists archive <list-id>   # Archive, don't delete
```

### Task Naming Best Practices

**Use action verbs**: "Buy milk" not "Milk"
**Include enough context**: "Call dentist re: appointment" not just "Dentist"
**One task = one action**: Break "Plan party" into "Create guest list", "Buy decorations", etc.
**Use notes for details**: Keep task name short, put URLs, addresses, sub-steps in notes

### Priority Guidelines

Don't overuse Priority 1 - it becomes meaningless:

- Priority 1: Truly urgent/critical (deadline today/tomorrow, consequences if missed)
- Priority 2: Important but not urgent (this week)
- Priority 3: Should do soon (next 2 weeks)
- N (none): Backlog/someday

**Re-prioritize during weekly review** - priorities change!

## Quick Examples

```bash
# Add with full metadata
rtm items add "Buy milk" --list Shopping --due today --priority 1 --tags buy,groceries,@store

# Complete and verify
rtm items done <task-id>
rtm items --list Shopping      # Confirm it moved to completed

# Find and clean duplicates
rtm items --status all | grep -i "milk"
# [review output, then delete duplicate]
rtm items delete <duplicate-id>
```

## Output Tips

Use `--json` for machine-readable output or when filtering with `jq`.
