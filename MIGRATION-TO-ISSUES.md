# Migration Guide: From .ai-workflow to Single-File Issues

## Overview

This guide helps you migrate from the distributed `.ai-workflow/` folder system to the new single-file issue workflow.

## What's Changing

### Old System
```
.ai-workflow/
├── context/
│   ├── SYSTEM.md
│   ├── PRODUCT.md
│   └── FEATURES.md
├── specs/
│   ├── ideas/
│   ├── features/
│   └── final/
├── design/
├── architecture/
├── plans/
└── implementation/
```

### New System
```
issues/
├── README.md
├── index.md (auto-generated)
├── 2025-01-15-portfolio-tracking.md
├── 2025-01-16-ai-signals.md
└── [date]-[feature-name].md
```

Each issue file contains the COMPLETE journey from idea to implementation.

## Command Changes

| Old Command | New Command | What It Does |
|-------------|-------------|--------------|
| `/idea` | `/new` | Creates new issue file with idea review |
| `/create-spec` | `/spec` | Appends specification to issue file |
| `/design` | `/design-issue` | Appends design to issue file |
| `/engineering-review` | `/engineering-review-issue` | Appends review to issue file |
| `/architect` | `/architect-issue` | Appends architecture to issue file |
| `/plan` | `/plan-issue` | Appends plan with checkboxes to issue file |
| `/implement` | `/implement-issue` | Updates checkboxes and progress in issue file |
| `/update-spec` | `/update-spec-issue` | Appends final documentation to issue file |
| `/status` | `/status-issue` | Shows status from issue files |
| - | `/index-issues` | Generates index.md dashboard |

## How to Use the New Workflow

### Starting a New Feature

```bash
# Old way
/idea "Add portfolio tracking"
# Output: .ai-workflow/specs/ideas/portfolio-tracking-review.md

# New way
/new "Add portfolio tracking"
# Output: issues/2025-01-15-portfolio-tracking.md
```

### Adding Specification

```bash
# Old way
/create-spec
# Output: .ai-workflow/specs/features/portfolio-tracking-PRD.md

# New way
/spec issues/2025-01-15-portfolio-tracking.md
# Output: Appends to same file
```

### Implementation Tracking

The biggest improvement! During implementation, the plan's checkboxes are updated IN PLACE:

```markdown
# Before
- [ ] Create TypeScript interfaces
- [ ] Add validation schemas

# During (automatically updated by /implement-issue)
- [x] Create TypeScript interfaces <!-- ✅ 2025-01-15T14:15:00Z -->
- [ ] Add validation schemas

# After
- [x] Create TypeScript interfaces <!-- ✅ 2025-01-15T14:15:00Z -->
- [x] Add validation schemas <!-- ✅ 2025-01-15T14:30:00Z -->
```

Progress percentage in metadata is also auto-updated!

## Benefits of New System

### 1. Single Source of Truth
Everything about a feature is in ONE file. No hunting across folders.

### 2. Complete History
Read top to bottom to understand the entire journey.

### 3. Git-Friendly
Single file changes are easy to track in git history.

### 4. Searchable
```bash
# Find all blocked issues
grep -l "blocked" issues/*.md

# Find all high priority
grep -l "Priority: High" issues/*.md

# Find issues mentioning WebSocket
grep -l "WebSocket" issues/*.md
```

### 5. Portable
Copy one file to share complete context with someone.

## Migration Steps

### For New Work (Recommended)
1. Start using `/new` for new ideas immediately
2. Old workflow remains for reference
3. No migration needed - just start fresh

### For In-Progress Work (Optional)
1. Create new issue file with current date
2. Copy relevant sections from `.ai-workflow/` folders
3. Continue with new commands

### Keeping Context
The `.ai-workflow/context/` files (SYSTEM.md, PRODUCT.md, etc.) can remain as reference. They don't need migration.

## Quick Start

Try it now:
```bash
/new "Your next feature idea"
```

Then follow the prompts:
```bash
/spec issues/[created-filename]
/design-issue issues/[created-filename]
/engineering-review-issue issues/[created-filename]
/architect-issue issues/[created-filename]
/plan-issue issues/[created-filename]
/implement-issue issues/[created-filename]
/update-spec-issue issues/[created-filename]
```

## View All Issues

```bash
/status-issue  # Shows all issues dashboard
/index-issues  # Generates index.md file
```

## Example Issue File

See `issues/2025-01-15-example-portfolio-tracking.md` for a complete example showing all stages.

## Tips

1. **Filename includes date** - Natural chronological sorting
2. **Status in metadata** - Quick scanning of issue state
3. **Progress bar** - Visual indication of completion
4. **Checkboxes for tasks** - GitHub-style task tracking
5. **Timestamps everywhere** - Complete audit trail

## Rollback

If you don't like the new system:
1. Simply use the old commands (`/idea`, `/create-spec`, etc.)
2. Delete the `issues/` folder
3. Continue with `.ai-workflow/` as before

The systems can coexist - use whichever you prefer!

## Questions?

The new system is designed to be simpler while maintaining all the sophistication of your AI agents. Each agent still provides the same expert analysis - it just goes into a single file instead of scattered folders.

Happy building! 🚀