# Issues Workflow

This directory contains all feature development issues. Each file represents a complete feature journey from idea to implementation.

## File Structure

Each issue is a single markdown file named: `YYYY-MM-DD-feature-name.md`

## Workflow Commands

- `/new "idea"` - Create new issue file with idea review
- `/spec #filename` - Add specification to issue
- `/design #filename` - Add UI/UX design
- `/engineering-review #filename` - Add technical review  
- `/architect #filename` - Add architecture design
- `/plan #filename` - Add implementation plan
- `/implement #filename` - Execute plan with progress tracking
- `/update-spec #filename` - Add final documentation
- `/status` - Show all issues status
- `/status #filename` - Show specific issue status

## Issue States

- 🎯 **idea** - Initial idea review
- 📋 **spec** - Specification created
- 🎨 **design** - UI/UX designed
- 🔍 **engineering-review** - Technically reviewed
- 🏗️ **architecture** - Architecture designed
- 📊 **planning** - Implementation planned
- 🚀 **implementing** - In progress
- ✅ **complete** - Finished
- 🚫 **blocked** - Blocked by dependencies

## Finding Issues

- Most recent: Sort by filename (date prefix)
- By status: Check metadata section
- By content: Search across all files