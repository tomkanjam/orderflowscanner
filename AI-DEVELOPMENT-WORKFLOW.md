# AI-Powered Development Workflow

## The Complete Idea-to-Implementation Flow

All AI agents are experts in their field AND experienced traders/quants. They deeply review code at each stage to maintain quality and prevent regressions.

---

## 📂 Artifact Organization

All workflow artifacts are stored in a single root folder to keep the repository clean:

```
.ai-workflow/                 # Root folder for all AI workflow artifacts
├── context/                  # System and product context
│   ├── SYSTEM.md            # Architecture and conventions
│   ├── PRODUCT.md           # Product vision and features
│   ├── FEATURES.md          # Feature registry
│   ├── DECISIONS.md         # Decision log
│   ├── TECH_DEBT.md         # Technical debt tracking
│   ├── PATTERNS.md          # Code patterns
│   └── CURRENT/
│       ├── active.md        # Current work
│       └── blockers.md      # Active blockers
│
├── specs/                    # Specifications
│   ├── ideas/               # Reviewed ideas
│   ├── features/            # Feature PRDs
│   ├── enhancements/        # Enhancement specs
│   ├── engineering-review/  # Technical reviews
│   └── final/               # Final specs after implementation
│
├── design/                   # UI/UX designs
│   ├── STYLE-GUIDE.md       # Extracted style guide
│   └── [feature]-design.md  # Feature designs
│
├── architecture/             # Technical architecture
│   └── [feature]-arch.md    # Architecture documents
│
├── plans/                    # Implementation plans
│   └── [feature]-plan.md    # Detailed plans
│
├── implementation/           # Implementation tracking
│   └── [feature]-progress.md # Progress tracking
│
└── knowledge/                # Learnings and patterns
    └── [feature].md          # Feature learnings
```

---

## 📋 The Complete Workflow

### Stage 0: Initialize (First Time) `/spec-init`
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

### Stage 1: Idea Review `/idea`
**AI Role:** Senior Product Manager with trading experience

```bash
/idea "Add portfolio tracking with P&L calculation"
```

The AI will:
- Review idea through trader's lens
- Suggest enhancements based on trading expertise
- Ask critical questions about edge cases
- Consider market conditions and volatility
- Provide priority assessment

**Output:** `.ai-workflow/specs/ideas/[feature]-review.md`

---

### Stage 2: Create Spec `/create-spec`
**AI Role:** Principal Product Manager with trading expertise

```bash
/create-spec "Portfolio tracking feature"
```

Creates either:
- **Full PRD** for new features
- **Streamlined spec** for enhancements

Includes:
- User stories with trader workflows
- Performance requirements for trading
- Edge cases (market volatility, disconnections)
- Success metrics

**Output:** `.ai-workflow/specs/features/[name]-PRD.md` or `.ai-workflow/specs/enhancements/[name]-spec.md`

---

### Stage 3: Design UI/UX `/design`
**AI Role:** Senior Product Designer with trading interface expertise

```bash
/design
```

The AI will:
- Review the style guide page
- Analyze existing UI patterns
- Design component layouts
- Specify visual hierarchy
- Define interactions and states
- Ensure responsive design
- Follow accessibility standards

**Output:** `.ai-workflow/design/[feature-name]-design.md`

---

### Stage 4: Engineering Review `/engineering-review`
**AI Role:** Staff Engineer with trading systems experience

```bash
/engineering-review
```

The AI will:
- **DEEPLY review all related code**
- Review the design for technical feasibility
- Analyze technical complexity
- Assess performance implications
- Provide implementation guidance
- Ask technical questions

**Output:** `.ai-workflow/specs/engineering-review/[feature]-review.md`

---

### Stage 5: Architecture `/architect`
**AI Role:** Principal Architect with trading systems expertise

```bash
/architect
```

The AI will:
- **DEEPLY review codebase for patterns**
- Design scalable architecture
- Define data models and flows
- Plan for high-frequency trading needs
- Consider failover and recovery
- Document integration points

**Output:** `.ai-workflow/architecture/[feature]-[timestamp].md`

---

### Stage 6: Planning `/plan`
**AI Role:** Senior Tech Lead with trading platform experience

```bash
/plan
```

The AI will:
- **DEEPLY review code for context**
- Break work into testable phases
- Create detailed implementation steps
- Define success criteria per phase
- Identify checkpoints for review
- Estimate time for each phase

**Output:** `.ai-workflow/plans/[feature]-implementation.md`

---

### Stage 7: Implementation `/implement`
**AI Role:** Senior Software Engineer specializing in trading systems

```bash
/implement
```

The AI will:
- Execute plan phase by phase
- Test after each phase
- Commit working code frequently
- Stop to verify each testable part works
- Handle edge cases properly
- Report progress continuously

**Output:** `.ai-workflow/implementation/[feature]-progress.md`

---

### Stage 8: Update Spec `/update-spec`
**AI Role:** Senior Technical Writer with trading systems expertise

```bash
/update-spec
```

The AI will:
- Review what was actually built
- Document all deviations from original spec
- Capture decisions made during implementation
- Record performance metrics achieved
- Document edge cases discovered
- Create maintenance guide

**Output:** `.ai-workflow/specs/final/[feature]-final.md`

---

## 🔄 Workflow Examples

### Example 1: New Trading Feature

```bash
You: /idea "AI-powered trade signals based on technical indicators"

AI: Reviews idea, suggests adding risk management, asks about latency requirements

You: "Sub-100ms latency, include stop-loss recommendations"

You: /create-spec

AI: Creates comprehensive PRD with trader user stories

You: /design

AI: Creates UI/UX design following style guide

You: /engineering-review

AI: Deep code review, identifies WebSocket capacity issues, suggests solutions

You: "Let's proceed with the WebSocket pooling approach"

You: /architect

AI: Designs architecture with real-time processing pipeline

You: /plan

AI: Breaks into 5 testable phases, each 1-2 hours

You: /implement

AI: Implements phase by phase, testing each before proceeding

You: /update-spec

AI: Documents what was built, deviations, and learnings
```

### Example 2: Performance Enhancement

```bash
You: /idea "Optimize chart rendering for 100+ symbols"

AI: Identifies virtualization opportunity, asks about priority

You: "High priority, users complaining about lag"

You: /create-spec

AI: Creates enhancement spec with performance targets

You: /engineering-review

AI: Reviews rendering code, finds inefficient re-renders

You: /architect

AI: Designs virtualization with caching strategy

You: /plan

AI: 3-phase plan: measure, optimize, verify

You: /implement

AI: Implements with performance metrics at each step

You: /update-spec

AI: Records actual performance achieved and optimizations applied
```

---

## 📊 Key Principles

### 1. Deep Code Review at Every Stage
Each AI agent thoroughly reviews existing code before making decisions

### 2. Trading Expertise Throughout
All agents understand:
- Market microstructure
- Technical analysis
- Risk management
- High-frequency requirements
- Regulatory considerations

### 3. Testable Increments
Every implementation phase must be independently testable

### 4. No Surprises
Specs and plans are detailed enough that implementation is straightforward

### 5. Continuous Validation
Test after every change, not just at the end

### 6. Living Documentation
Specs are updated after implementation to reflect reality

---

## 🎯 Success Metrics

You know the workflow is working when:
- ✅ No regressions in existing features
- ✅ Ideas are enhanced with trading expertise
- ✅ Technical issues caught before implementation
- ✅ Each phase completes successfully
- ✅ Features work reliably during market volatility

---

## 🚀 Quick Start

```bash
# First time on a project? Initialize the spec system
/spec-init

# Start with any idea
/idea "Your trading feature idea"

# Follow the complete flow
/create-spec → /design → /engineering-review → /architect → /plan → /implement → /update-spec

# Check progress anytime
/status
```

---

## 📝 Workflow Commands Summary

| Stage | Command | Purpose | Output Location |
|-------|---------|---------|-----------------|
| 0 | `/spec-init` | Initialize context system | `.ai-workflow/context/` |
| 1 | `/idea` | Review and enhance idea | `.ai-workflow/specs/ideas/` |
| 2 | `/create-spec` | Create PRD or spec | `.ai-workflow/specs/features/` or `/enhancements/` |
| 3 | `/design` | Design UI/UX | `.ai-workflow/design/` |
| 4 | `/engineering-review` | Technical feasibility | `.ai-workflow/specs/engineering-review/` |
| 5 | `/architect` | System architecture | `.ai-workflow/architecture/` |
| 6 | `/plan` | Implementation roadmap | `.ai-workflow/plans/` |
| 7 | `/implement` | Execute the plan | `.ai-workflow/implementation/` |
| 8 | `/update-spec` | Document final state | `.ai-workflow/specs/final/` |
| - | `/status` | Check progress | Console output |
| - | `/style-guide` | Extract design system | `.ai-workflow/design/STYLE-GUIDE.md` |

---

## ⚠️ Important Notes

1. **Never skip stages** - Each builds on the previous
2. **Deep review is mandatory** - AI must understand existing code
3. **Test continuously** - Don't wait until the end
4. **Trading first** - Consider trader needs in every decision
5. **Document decisions** - Future you will thank you

---

## 🆘 When Issues Arise

If blocked at any stage:
1. Review the previous stage's output
2. Check if questions were answered
3. Verify code was reviewed deeply
4. Consider if requirements changed
5. Ask for clarification

Remember: The AI agents are your expert team. They prevent problems before they happen.