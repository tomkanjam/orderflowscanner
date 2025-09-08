# Claude Code Team Member Slash Commands Proposal

## Overview
This proposal extends Claude Code's slash command system to invoke specialized team member perspectives for different aspects of software development.

## Proposed Commands

### 1. `/ux-researcher`
**Purpose**: Conduct online research for UX best practices, competitor analysis, and user behavior patterns
**File**: `ux-researcher.md`
```
Please ultrathink about the UX research needs for this feature/problem. Conduct online research to:
- Analyze similar implementations and best practices
- Identify common UX patterns and anti-patterns
- Research accessibility considerations
- Find relevant user behavior studies or statistics
- Provide evidence-based recommendations

Document findings in research/ux-<feature-name>.md with:
- Executive summary
- Key findings with sources
- Recommended UX patterns
- Accessibility considerations
- Questions for stakeholder validation
```

### 2. `/designer`
**Purpose**: Create design specifications and UI/UX recommendations
**File**: `designer.md`
```
Please ultrathink about the design requirements. Analyze the codebase's existing design patterns and:
- Review current UI components and style patterns
- Propose design solutions with rationale
- Consider responsive design requirements
- Suggest color schemes, typography, and spacing
- Identify reusable component opportunities

Create design/spec-<feature-name>.md with:
- Design objectives
- Visual hierarchy recommendations
- Component specifications
- Interaction patterns
- Implementation notes for developers
```

### 3. `/architect`
**Purpose**: Design system architecture and technical solutions
**File**: `architect.md`
```
Please ultrathink about the architectural implications. Analyze the existing codebase architecture and:
- Evaluate current patterns and structures
- Design scalable technical solutions
- Consider performance implications
- Identify potential technical debt
- Propose integration strategies

Document in architecture/<feature-name>.md:
- Architectural overview
- Component relationships
- Data flow diagrams
- Technology choices with rationale
- Migration strategy if needed
- Risk assessment
```

### 4. `/senior-engineer`
**Purpose**: Create detailed implementation plans and execute development
**File**: `senior-engineer.md`
```
Please ultrathink and create a comprehensive implementation plan. Carefully analyze related code and:
- Break down into testable sub-tasks
- Identify dependencies and prerequisites
- Consider edge cases and error handling
- Estimate complexity and effort
- Propose testing strategies

Create implementation/<feature-name>.md with:
- Task breakdown with priorities
- Technical approach for each component
- Testing plan (unit, integration, e2e)
- Performance considerations
- Deployment strategy
- Questions for PM with recommended answers
```

### 5. `/code-reviewer`
**Purpose**: Perform thorough code reviews with constructive feedback
**File**: `code-reviewer.md`
```
Please ultrathink and perform a comprehensive code review. Analyze the changes/code for:
- Code quality and maintainability
- Adherence to project conventions
- Performance implications
- Security vulnerabilities
- Test coverage adequacy
- Documentation completeness

Provide review/feedback-<timestamp>.md with:
- Summary of changes reviewed
- Critical issues that must be addressed
- Suggestions for improvement
- Positive feedback on good practices
- Refactoring opportunities
- Questions about implementation choices
```

### 6. `/qa-engineer`
**Purpose**: Design test strategies and identify quality issues
**File**: `qa-engineer.md`
```
Please ultrathink about quality assurance for this feature. Analyze the implementation and:
- Design comprehensive test scenarios
- Identify edge cases and boundary conditions
- Create user acceptance criteria
- Suggest automation opportunities
- Review error handling

Document in qa/test-plan-<feature-name>.md:
- Test strategy overview
- Manual test cases
- Automation recommendations
- Performance test scenarios
- Security test considerations
- Regression test areas
```

## Integration Pattern

All commands follow a consistent pattern:
1. Start with "ultrathink" to encourage deep analysis
2. Provide specific focus areas for the role
3. Include concrete deliverables with file locations
4. Maintain consistency with existing `/plan` and `/implement` commands

## Usage Examples

```bash
# Research UX for a new feature
/ux-researcher analyze onboarding flow improvements

# Get architectural guidance
/architect design real-time notification system

# Implementation planning
/senior-engineer create trading dashboard feature

# Code review
/code-reviewer review recent WebSocket implementation
```

## Benefits

1. **Specialized Perspectives**: Each command brings focused expertise
2. **Consistent Documentation**: Structured outputs in designated folders
3. **Collaborative Workflow**: Different "team members" can build on each other's work
4. **Quality Assurance**: Multiple viewpoints reduce blind spots
5. **Knowledge Capture**: Decisions and rationale are documented

## Next Steps

1. Create the command files in `/Users/tom/.claude/commands/`
2. Test each command with sample scenarios
3. Refine prompts based on output quality
4. Consider additional roles (DevOps, Security, Product Manager)