# AI-Powered Development Workflow

## Single-File Issue Workflow

All AI agents are experts in their field who first analyze your project's domain, then adopt deep expertise specific to that industry. They deeply review code at each stage to maintain quality and prevent regressions. Each feature's complete journey is documented in a single markdown file.

**Domain Adaptation:** Whether your app is for healthcare, finance, e-commerce, gaming, or any other domain, the AI agents will understand the context and apply appropriate industry expertise.

---

## 📂 Organization

```
issues/                           # All feature issues
├── YYYY-MM-DD-feature-name.md  # One file per feature
├── index.md                     # Auto-generated dashboard
└── README.md                    # Workflow documentation

.ai-workflow/context/            # System-wide context (reference only)
├── SYSTEM.md                    # Architecture and conventions
├── PRODUCT.md                   # Product vision and features
├── FEATURES.md                  # Feature registry
├── DECISIONS.md                 # Decision log
├── TECH_DEBT.md                 # Technical debt tracking
└── PATTERNS.md                  # Code patterns
```

---

## 📋 The Complete Workflow

### Stage 0: Initialize Context (First Time Only) `/spec-init`
**AI Role:** Principal Systems Architect

```bash
/spec-init
```

Run once per project to:
- Analyze entire codebase
- Create context foundation (SYSTEM.md, PRODUCT.md, FEATURES.md)
- Document existing patterns and conventions
- Identify technical debt
- Establish feature registry
- Set up specification system

**Output:** `.ai-workflow/context/` directory with foundational documentation

---

### Stage 1: New Issue with Idea Review `/new`
**AI Role:** Senior Product Manager with domain expertise

```bash
/new "Add user authentication with SSO"
```

The AI will:
- Analyze project to understand domain
- Create new issue file with date prefix
- Review idea through domain expert's lens
- Suggest enhancements based on industry expertise
- Ask critical questions about edge cases
- Consider domain-specific conditions and requirements
- Provide priority assessment

**Output:** `issues/YYYY-MM-DD-user-authentication.md` with idea review

---

### Stage 2: Create Specification `/spec`
**AI Role:** Principal Product Manager with domain expertise

```bash
/spec issues/2025-01-15-user-authentication.md
```

Appends to issue file:
- **Full PRD** for new features
- **Streamlined spec** for enhancements
- User stories with domain-specific workflows
- Performance requirements for the industry
- Edge cases relevant to the domain
- Success metrics

**Output:** Specification appended to issue file

---

### Stage 3: Design UI/UX `/design-issue`
**AI Role:** Senior Product Designer with domain-specific interface expertise

```bash
/design-issue issues/2025-01-15-user-authentication.md
```

The AI will:
- Review the style guide
- Analyze existing UI patterns
- Design component layouts
- Specify visual hierarchy
- Define interactions and states
- Ensure responsive design
- Follow accessibility standards

**Output:** Design specifications appended to issue file

---

### Stage 4: Engineering Review `/engineering-review-issue`
**AI Role:** Staff Engineer with domain-specific systems experience

```bash
/engineering-review-issue issues/2025-01-15-user-authentication.md
```

The AI will:
- **DEEPLY review all related code**
- Assess technical feasibility
- Analyze technical complexity
- Identify performance implications
- Provide implementation guidance
- Ask technical questions

**Output:** Engineering review appended to issue file

---

### Stage 5: Architecture `/architect-issue`
**AI Role:** Principal Architect with domain-specific systems expertise

```bash
/architect-issue issues/2025-01-15-user-authentication.md
```

The AI will:
- **DEEPLY review codebase for patterns**
- Design scalable architecture
- Define data models and flows
- Plan for domain-specific performance needs
- Consider failover and recovery
- Document integration points

**Output:** Architecture design appended to issue file

---

### Stage 6: Planning `/plan-issue`
**AI Role:** Senior Tech Lead with domain platform experience

```bash
/plan-issue issues/2025-01-15-user-authentication.md
```

The AI will:
- **DEEPLY review code for context**
- Break work into testable phases
- Create detailed implementation steps with checkboxes
- Define success criteria per phase
- Identify checkpoints for review
- Estimate time for each phase

**Output:** Implementation plan with task lists appended to issue file

---

### Stage 7: Implementation `/implement-issue`
**AI Role:** Senior Software Engineer specializing in domain systems

```bash
/implement-issue issues/2025-01-15-user-authentication.md
```

The AI will:
- Execute plan phase by phase
- **Update checkboxes in real-time** as tasks complete
- Add timestamps to completed tasks
- Test after each phase
- Update progress percentage in metadata
- Commit working code frequently
- Report progress continuously

**Output:** Updated checkboxes and progress in issue file

---

### Stage 8: Final Documentation `/update-spec-issue`
**AI Role:** Senior Technical Writer with domain systems expertise

```bash
/update-spec-issue issues/2025-01-15-user-authentication.md
```

The AI will:
- Review what was actually built
- Document all deviations from original spec
- Capture decisions made during implementation
- Record performance metrics achieved
- Document edge cases discovered
- Create maintenance guide

**Output:** Final specification appended to issue file

---

## 🔄 Workflow Example

```bash
# Create new feature
/new "Add automated reporting dashboard"
# Creates: issues/2025-01-15-automated-reporting.md

# Review says: "Consider data refresh rates, user permissions needed"

# Add specification
/spec issues/2025-01-15-automated-reporting.md
# Appends: Comprehensive PRD with user stories

# Design the UI
/design-issue issues/2025-01-15-automated-reporting.md
# Appends: UI/UX design following style guide

# Technical review
/engineering-review-issue issues/2025-01-15-automated-reporting.md
# Appends: Identifies performance bottlenecks, suggests solutions

# Architecture
/architect-issue issues/2025-01-15-automated-reporting.md
# Appends: Scalable architecture design

# Planning
/plan-issue issues/2025-01-15-automated-reporting.md
# Appends: 5 phases with checkboxes, each 1-2 hours

# Implementation
/implement-issue issues/2025-01-15-automated-reporting.md
# Updates: Checkboxes in real-time as work progresses
# - [x] Create data models <!-- ✅ 2025-01-15 10:30 -->
# - [x] Add API endpoints <!-- ✅ 2025-01-15 11:15 -->
# Progress: [=====     ] 50%

# Documentation
/update-spec-issue issues/2025-01-15-automated-reporting.md
# Appends: Final spec with what was built, deviations, learnings

# Check status
/status-issue issues/2025-01-15-automated-reporting.md
# Shows: Current stage, progress, blockers

# Generate dashboard
/index-issues
# Creates: issues/index.md with all issues overview
```

---

## 📊 Key Principles

### 1. Single Source of Truth
Each issue file contains the complete journey from idea to implementation.

### 2. Deep Code Review at Every Stage
Each AI agent thoroughly reviews existing code before making decisions.

### 3. Domain Expertise Throughout
All agents understand:
- Industry-specific patterns and practices
- Domain terminology and workflows
- Regulatory and compliance requirements
- Performance and scale expectations
- User behavior and needs in this domain

### 4. Testable Increments
Every implementation phase must be independently testable.

### 5. Real-time Progress Tracking
Implementation updates checkboxes and progress percentage as work proceeds.

### 6. Living Documentation
Issue files are continuously updated throughout development.

---

## 🎯 Success Metrics

You know the workflow is working when:
- ✅ No regressions in existing features
- ✅ Ideas are enhanced with domain expertise
- ✅ Technical issues caught before implementation
- ✅ Each phase completes successfully
- ✅ Features work reliably under domain-specific conditions
- ✅ Complete story readable in one file

---

## 🚀 Quick Start

```bash
# First time on a project? Initialize context
/spec-init

# Start new feature
/new "Your feature idea"

# Follow the workflow (all append to same file)
/spec issues/[filename]
/design-issue issues/[filename]
/engineering-review-issue issues/[filename]
/architect-issue issues/[filename]
/plan-issue issues/[filename]
/implement-issue issues/[filename]
/update-spec-issue issues/[filename]

# Check progress
/status-issue                    # All issues
/status-issue issues/[filename]  # Specific issue

# Generate dashboard
/index-issues                     # Creates index.md
```

---

## 📝 Workflow Commands

| Stage | Command | Purpose | Action |
|-------|---------|---------|--------|
| 0 | `/spec-init` | Initialize context | Creates `.ai-workflow/context/` |
| 1 | `/new` | Start new feature | Creates issue file |
| 2 | `/spec` | Add specification | Appends to issue |
| 3 | `/design-issue` | Add UI/UX design | Appends to issue |
| 4 | `/engineering-review-issue` | Add technical review | Appends to issue |
| 5 | `/architect-issue` | Add architecture | Appends to issue |
| 6 | `/plan-issue` | Add implementation plan | Appends to issue |
| 7 | `/implement-issue` | Execute plan | Updates checkboxes |
| 8 | `/update-spec-issue` | Add final docs | Appends to issue |
| - | `/status-issue` | Check status | Shows progress |
| - | `/index-issues` | Generate dashboard | Creates index.md |

---

## ⚠️ Important Notes

1. **Never skip stages** - Each builds on the previous
2. **Deep review is mandatory** - AI must understand existing code
3. **Test continuously** - Don't wait until the end
4. **Domain first** - Consider domain-specific needs in every decision
5. **Update in real-time** - Keep issue file current during implementation

---

## 🆘 When Issues Arise

If blocked at any stage:
1. Review the previous sections in the issue file
2. Check if questions were answered
3. Verify code was reviewed deeply
4. Consider if requirements changed
5. Document blockers in the issue file
6. Ask for clarification

---

## 📁 Issue File Structure

Each issue file evolves through stages:

```markdown
# Feature Name

## Metadata
- Status: [current stage emoji]
- Progress: [=====     ] 50%
- Priority: High
- Created: YYYY-MM-DD
- Updated: YYYY-MM-DD HH:MM

---

## Idea Review
[Original idea and PM review]

---

## Product Requirements Document
[Specification details]

---

## UI/UX Design
[Design specifications]

---

## Engineering Review
[Technical feasibility]

---

## System Architecture
[Architecture design]

---

## Implementation Plan
[Checkboxes that update during implementation]
- [x] Task 1 <!-- ✅ timestamp -->
- [ ] Task 2

---

## Implementation Progress
[Phase completion reports]

---

## Final Specification
[What was actually built]
```

Remember: The AI agents are your expert team. They prevent problems before they happen, and everything they do goes into one coherent file per feature.