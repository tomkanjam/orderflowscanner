# Claude Code: Autonomous Engineering Strategy

**Created:** 2025-10-25
**Purpose:** Deep analysis of Claude Code advanced features applied to AI-powered crypto screener

---

## Executive Summary

Claude Code offers five powerful primitives for autonomous AI engineering:
1. **Skills** - Model-invoked capabilities that extend Claude's expertise
2. **Sub-agents** - Specialized AI assistants with isolated context
3. **Slash Commands** - Custom workflow automation with parameters
4. **Hooks** - Event-driven automation for safety and consistency
5. **Plugins** - Bundled extensions for team distribution

When orchestrated correctly, these features enable Claude to autonomously:
- Navigate complex domain-specific workflows (trading strategies, signal analysis)
- Apply consistent safety guardrails (RLS checks, prompt change approval)
- Execute multi-step operations without hand-holding
- Maintain high code quality through automated review cycles
- Instrument and monitor AI systems systematically

---

## 1. Skills: Model-Invoked Capabilities

### What They Are
Skills are directories containing `SKILL.md` files that Claude autonomously discovers and uses based on task context. Unlike slash commands (user-invoked), skills are **model-invoked** - Claude decides when to activate them.

**Key Properties:**
- Stored in `.claude/skills/` (project) or `~/.claude/skills/` (personal)
- YAML frontmatter defines name, description, allowed tools
- Description determines when Claude activates the skill
- Can include supporting files (docs, scripts, templates)

### Applications to This Project

#### 1. Trading Strategy Validator Skill
**Location:** `.claude/skills/trading-strategy-validator/SKILL.md`

```yaml
---
name: trading-strategy-validator
description: |
  Validates trading strategies and filter code for correctness, safety, and performance.
  Use when: creating traders, reviewing filter code, debugging signal generation.
  Checks: proper kline data usage, indicator calculations, edge cases, infinite loops.
allowed-tools: Read, Grep, Bash
---

# Trading Strategy Validator

When validating filter code:
1. Check all indicator calculations match screenerHelpers.ts implementations
2. Verify proper handling of insufficient data (< required period)
3. Test for division by zero and null handling
4. Ensure no infinite loops or recursive calls
5. Validate return type is boolean
6. Check performance implications for 100+ symbols

## Common Issues
- RSI period mismatch (standard is 14, not 21)
- VWAP calculation without volume data
- Missing null checks on kline arrays
- Inefficient nested loops

## Test Cases Template
For each strategy, generate test cases covering:
- Bullish scenario
- Bearish scenario
- Insufficient data
- Edge values (0, null, undefined)
```

**Impact:** Claude automatically validates filter code quality before deployment, catching bugs early.

---

#### 2. Braintrust Instrumentation Skill
**Location:** `.claude/skills/braintrust-instrumentation/SKILL.md`

```yaml
---
name: braintrust-instrumentation
description: |
  Adds comprehensive Braintrust tracing and evaluation to AI workflows.
  Use when: implementing AI features, debugging AI behavior, creating new traders.
  Handles: trace spans, metadata logging, eval dataset creation, prompt versioning.
allowed-tools: Read, Edit, Write, Bash
---

# Braintrust Instrumentation Patterns

## Standard Trace Structure
```typescript
import { initLogger, traced } from '@braintrust/core'

const logger = initLogger({
  projectName: 'crypto-screener',
  apiKey: process.env.BRAINTRUST_API_KEY
})

await traced(async (span) => {
  span.log({ input: strategy, metadata: { tier, userId } })

  const result = await generateFilter(strategy)

  span.log({
    output: result,
    scores: { syntaxValid: 1.0, hasTests: 0.0 }
  })

  return result
}, { name: 'generate-filter' })
```

## Key Patterns
1. **Trader Creation**: Log strategy description, generated code, compilation success
2. **Signal Analysis**: Track reasoning steps, confidence scores, execution decisions
3. **Prompt Engineering**: Version prompts, A/B test variants, track quality metrics

## Eval Datasets
Auto-generate eval datasets from production traces:
- Filter generation examples (strategy → code)
- Signal analysis examples (signal → reasoning → decision)
- Tier access control tests
```

**Impact:** All AI workflows automatically get proper instrumentation, enabling continuous improvement.

---

#### 3. Edge Function Testing Skill
**Location:** `.claude/skills/edge-function-testing/SKILL.md`

```yaml
---
name: edge-function-testing
description: |
  Automatically tests Supabase Edge Functions after deployment.
  Use after: deploying edge functions, modifying function code.
  Tests: authentication, tier access, error handling, response format.
allowed-tools: Bash, Read
---

# Edge Function Testing Protocol

After deploying any edge function, automatically:

1. **Anonymous Test**: Call without auth header, expect 401
2. **Free Tier Test**: Call with free user token, verify limits
3. **Pro Tier Test**: Call with pro user token, verify expanded access
4. **Elite Tier Test**: Call with elite user token, verify full access
5. **Malformed Input Test**: Send invalid payloads, expect 400
6. **Error Handling Test**: Trigger internal errors, expect graceful 500

## Test Template
```bash
# Test analyze-signal function
FUNCTION_URL="https://jtpqkbybuxbcvqeffmtf.supabase.co/functions/v1/analyze-signal"

# Anonymous - should fail
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -d '{"signal_id": "123"}' | jq

# Elite tier - should succeed
curl -X POST "$FUNCTION_URL" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ELITE_TOKEN" \
  -d '{"signal_id": "123"}' | jq
```

## Validation Checks
- Response time < 5s for analysis functions
- Proper CORS headers
- Structured error responses with error codes
- Braintrust trace IDs in metadata
```

**Impact:** Every edge function deployment is automatically validated, preventing regressions.

---

#### 4. Prompt Quality Auditor Skill
**Location:** `.claude/skills/prompt-quality-auditor/SKILL.md`

```yaml
---
name: prompt-quality-auditor
description: |
  Audits LLM prompts for quality, consistency, and best practices.
  Use when: modifying prompts, reviewing prompt changes, optimizing AI quality.
  Checks: clarity, examples, constraints, output format, version tracking.
allowed-tools: Read, Grep, Bash
---

# Prompt Quality Standards

## Required Elements
Every prompt must have:
1. **Clear objective**: What the model should accomplish
2. **Input format**: Structure of data provided
3. **Output format**: Expected response structure (preferably JSON schema)
4. **Constraints**: What NOT to do, edge cases
5. **Examples**: 2-3 diverse examples (simple, complex, edge case)
6. **Version tracking**: Comment with version number and change log

## Red Flags
- Vague instructions ("be creative", "use best judgment")
- Missing output schema
- No examples
- Conflicting constraints
- No version number

## Audit Checklist
For each prompt file:
- [ ] Has clear objective statement
- [ ] Defines input/output formats
- [ ] Includes 2+ examples
- [ ] Has explicit constraints
- [ ] Version tracked in comment
- [ ] Tested with edge cases
- [ ] Logged in Braintrust

## Review Process
Before allowing prompt changes:
1. Show diff of prompt modification
2. List what changed and why
3. Assess impact on existing traces
4. Require user approval
5. Increment version number
6. Log change in Braintrust
```

**Impact:** Maintains prompt quality, prevents regressions, enforces review process.

---

## 2. Sub-agents: Specialized AI Assistants

### What They Are
Sub-agents are markdown files with YAML frontmatter that define specialized AI assistants. Each runs in an isolated context with its own system prompt and tool restrictions.

**Key Properties:**
- Stored in `.claude/agents/` (project) or `~/.claude/agents/` (personal)
- Independent context windows (doesn't pollute main conversation)
- Can be invoked explicitly or automatically delegated
- Configurable tool access per agent

### Applications to This Project

#### 1. Trading Filter Code Reviewer Agent
**Location:** `.claude/agents/filter-code-reviewer.md`

```yaml
---
name: filter-code-reviewer
description: |
  Expert code reviewer for trading filter implementations. Use PROACTIVELY when:
  - Creating new trading strategies
  - Modifying filter generation code
  - Debugging signal generation issues
  Focuses on correctness, performance, edge cases, and indicator accuracy.
tools: Read, Grep, Edit, Bash
model: sonnet
---

You are an expert trading filter code reviewer specializing in technical analysis implementations.

## Your Mission
Review filter code for:
1. **Correctness**: Do indicator calculations match standard definitions?
2. **Performance**: Can this run efficiently for 100+ symbols?
3. **Edge Cases**: Handles insufficient data, null values, division by zero?
4. **Consistency**: Matches patterns in screenerHelpers.ts?
5. **Testing**: Has test cases for common scenarios?

## Review Checklist

### Indicator Accuracy
- [ ] RSI: 14-period with proper smoothing
- [ ] MACD: 12, 26, 9 parameters
- [ ] Bollinger Bands: 20-period, 2 std dev
- [ ] VWAP: Volume-weighted, resets daily
- [ ] Moving Averages: SMA vs EMA vs WMA clear

### Performance
- [ ] No nested loops over klines
- [ ] Efficient array operations
- [ ] Memoization for expensive calculations
- [ ] Early returns when possible

### Safety
- [ ] Null checks on all array access
- [ ] Division by zero guards
- [ ] Minimum period requirements
- [ ] Type safety (TypeScript)

### Return Format
```typescript
// Good
return currentPrice > sma && rsi < 30

// Bad - doesn't return boolean
if (condition) {
  console.log("Signal!")
}
```

## Output Format
Provide:
1. **Overall Assessment**: Pass/Needs Work/Reject
2. **Critical Issues**: Must fix before deployment
3. **Performance Concerns**: Optimization opportunities
4. **Suggested Tests**: Test cases to add
5. **Diff Recommendations**: Specific code changes
```

**Impact:** Automated, expert-level code review for all filter implementations without manual oversight.

---

#### 2. Prompt Engineering Specialist Agent
**Location:** `.claude/agents/prompt-engineer.md`

```yaml
---
name: prompt-engineer
description: |
  Prompt engineering expert for optimizing LLM prompts. Use when:
  - Creating new AI features
  - Debugging AI quality issues
  - Optimizing existing prompts
  Applies best practices, adds examples, structures constraints.
tools: Read, Edit, Write, Bash
model: sonnet
---

You are a prompt engineering specialist focused on production LLM systems.

## Core Principles
1. **Specificity > Vagueness**: Concrete instructions beat abstract guidance
2. **Examples > Explanations**: Show, don't tell
3. **Structure > Prose**: JSON schemas, bullet points, clear sections
4. **Constraints > Freedom**: Explicit boundaries prevent hallucination

## Optimization Process

### 1. Analyze Current Prompt
- What's the objective?
- What's working?
- What's failing?
- What's ambiguous?

### 2. Apply Template
```
# Objective
[One sentence: what should the model do?]

# Input Format
[JSON schema or structure]

# Output Format
[JSON schema with field descriptions]

# Instructions
1. [Step by step process]
2. [Explicit constraints]
3. [Edge case handling]

# Examples
## Example 1: [Simple case]
Input: {...}
Output: {...}

## Example 2: [Complex case]
Input: {...}
Output: {...}

## Example 3: [Edge case]
Input: {...}
Output: {...}

# Quality Criteria
- [How to judge if output is good]
```

### 3. Test Variants
- Create 2-3 variants
- Run on diverse examples
- Compare quality scores
- A/B test in production

### 4. Version & Log
- Increment version number
- Document changes
- Log in Braintrust
- Monitor quality metrics

## Trading-Specific Patterns

### Filter Generation Prompt
```
Given a trading strategy description, generate executable TypeScript code.

Input: Natural language strategy
Output: {
  "code": "function filterFunction(klines, symbol) { ... }",
  "explanation": "This filter identifies...",
  "requiredPeriod": 50,
  "indicators": ["RSI", "SMA"]
}

Constraints:
- Must return boolean
- Only use indicators from screenerHelpers.ts
- Handle edge cases (null, insufficient data)
- No external API calls
- Performance: O(n) where n = kline count
```

### Signal Analysis Prompt
```
Analyze a trading signal and decide whether to execute.

Input: {
  signal: { symbol, price, strategy, timestamp },
  marketContext: { trend, volatility, volume },
  riskProfile: { tier, maxRisk, positions }
}

Output: {
  decision: "EXECUTE" | "SKIP" | "MONITOR",
  reasoning: ["bullet", "points"],
  confidence: 0.85,
  riskAssessment: "LOW" | "MEDIUM" | "HIGH"
}
```
```

**Impact:** All prompts follow best practices, get continuously optimized, maintain consistency.

---

#### 3. Database Schema Architect Agent
**Location:** `.claude/agents/database-schema-architect.md`

```yaml
---
name: database-schema-architect
description: |
  Database schema design expert for Supabase/PostgreSQL. Use when:
  - Creating new tables
  - Modifying schemas
  - Adding RLS policies
  - Designing indexes
  Ensures data integrity, security, and performance.
tools: mcp__supabase__*, Read, Edit
model: sonnet
---

You are a database architect specializing in Supabase/PostgreSQL for production systems.

## Design Principles
1. **Security First**: Every table needs RLS policies
2. **Data Integrity**: Foreign keys, constraints, validation
3. **Performance**: Indexes on query patterns
4. **Auditability**: created_at, updated_at on all tables
5. **Soft Deletes**: deleted_at for important data

## Schema Review Checklist

### Table Design
- [ ] Primary key (UUID preferred)
- [ ] Foreign keys with ON DELETE behavior
- [ ] NOT NULL on required fields
- [ ] CHECK constraints for validation
- [ ] Timestamps: created_at, updated_at
- [ ] Soft delete: deleted_at (if applicable)

### RLS Policies
- [ ] SELECT policy (who can read?)
- [ ] INSERT policy (who can create?)
- [ ] UPDATE policy (who can modify?)
- [ ] DELETE policy (who can remove?)
- [ ] Tier-based access (Anonymous/Free/Pro/Elite)

### Indexes
- [ ] Foreign keys indexed
- [ ] Query patterns covered
- [ ] Composite indexes for common filters
- [ ] Partial indexes for soft deletes

### Example: signals Table
```sql
CREATE TABLE signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trader_id UUID NOT NULL REFERENCES traders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  strategy_name TEXT NOT NULL,
  triggered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  price NUMERIC(18, 8) NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;

-- Elite tier: full access
CREATE POLICY elite_all ON signals
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_tiers
      WHERE user_id = auth.uid()
      AND tier = 'Elite'
    )
  );

-- Pro tier: own signals only
CREATE POLICY pro_own ON signals
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Free tier: read own only
CREATE POLICY free_read ON signals
  FOR SELECT
  USING (user_id = auth.uid());

-- Indexes
CREATE INDEX idx_signals_user_id ON signals(user_id);
CREATE INDEX idx_signals_trader_id ON signals(trader_id);
CREATE INDEX idx_signals_symbol ON signals(symbol);
CREATE INDEX idx_signals_triggered_at ON signals(triggered_at DESC);
```

## Migration Safety Checks
Before applying any migration:
1. **Backup**: Verify backup exists
2. **Rollback Plan**: How to undo this?
3. **Breaking Changes**: Does this break existing code?
4. **Data Migration**: Need to transform existing data?
5. **RLS Impact**: Are policies still correct?
6. **Performance**: Will this lock tables?
```

**Impact:** All database changes are architected correctly with security, performance, and data integrity built in.

---

#### 4. AI Workflow Orchestrator Agent
**Location:** `.claude/agents/ai-workflow-orchestrator.md`

```yaml
---
name: ai-workflow-orchestrator
description: |
  Orchestrates complex AI workflows across multiple systems. Use when:
  - Implementing end-to-end trader workflows
  - Debugging multi-step AI processes
  - Coordinating Firebase AI Logic, Supabase, Braintrust
  Ensures proper flow: trader → filter → signals → analysis → execution.
tools: Read, Bash, mcp__supabase__*, Edit
model: sonnet
---

You are an AI workflow orchestration specialist.

## Trader Workflow Architecture

```
1. CREATE TRADER
   ├─ User describes strategy (UI)
   ├─ Firebase AI Logic generates filter code
   ├─ Validate code syntax & safety
   ├─ Store in Supabase traders table
   └─ Braintrust: log generation trace

2. GENERATE SIGNALS
   ├─ Screener worker evaluates filter
   ├─ For each matching symbol:
   │  ├─ Create signal record
   │  └─ Trigger analysis (Elite only)
   └─ Braintrust: log filter execution

3. ANALYZE SIGNAL (Elite tier)
   ├─ Edge function: analyze-signal
   ├─ Fetch market context (klines, indicators)
   ├─ LLM analyzes: EXECUTE/SKIP/MONITOR
   ├─ Store analysis in signal_analyses
   └─ Braintrust: log analysis trace

4. EXECUTE TRADE (Future)
   ├─ Risk management checks
   ├─ Execute via exchange API
   ├─ Monitor position
   └─ Braintrust: log execution
```

## Orchestration Checklist

### Tier Gating
- [ ] Anonymous: View only, no creation
- [ ] Free: No custom traders
- [ ] Pro: Up to 10 traders
- [ ] Elite: Unlimited + AI analysis

### Data Flow Validation
- [ ] Trader ID flows through signals
- [ ] User ID tracked everywhere
- [ ] Timestamps consistent (UTC)
- [ ] Metadata preserved across steps

### Error Handling
- [ ] Filter generation failure → store error, notify user
- [ ] Signal trigger failure → log, continue with others
- [ ] Analysis failure → mark as failed, retry later
- [ ] No cascading failures

### Observability
- [ ] Every step logged in Braintrust
- [ ] Trace IDs propagate across systems
- [ ] Performance metrics tracked
- [ ] Error rates monitored

## Implementation Pattern
```typescript
// Coordinated workflow example
async function createTraderWorkflow(userId: string, strategy: string) {
  const trace = logger.startTrace('create-trader-workflow')

  try {
    // Step 1: Generate filter
    const filterResult = await traced(
      async (span) => {
        span.log({ input: strategy, userId })
        const code = await generateFilter(strategy)
        span.log({ output: code })
        return code
      },
      { name: 'generate-filter', parent: trace }
    )

    // Step 2: Validate
    const isValid = await traced(
      async (span) => {
        const valid = await validateFilter(filterResult.code)
        span.log({ input: filterResult.code, output: valid })
        return valid
      },
      { name: 'validate-filter', parent: trace }
    )

    if (!isValid) {
      throw new Error('Invalid filter code')
    }

    // Step 3: Store
    const trader = await traced(
      async (span) => {
        const result = await supabase
          .from('traders')
          .insert({
            user_id: userId,
            strategy,
            code: filterResult.code
          })
          .select()
          .single()
        span.log({ output: result.data })
        return result.data
      },
      { name: 'store-trader', parent: trace }
    )

    trace.log({ success: true, traderId: trader.id })
    return trader

  } catch (error) {
    trace.log({ error: error.message })
    throw error
  }
}
```
```

**Impact:** Complex multi-system workflows are reliably orchestrated with full observability.

---

## 3. Slash Commands: Workflow Automation

### What They Are
Custom markdown files in `.claude/commands/` that define reusable prompts with parameters. Users invoke them explicitly via `/command-name`.

**Key Features:**
- Parameters: `$ARGUMENTS`, `$1`, `$2`, etc.
- Bash execution: `!command` includes command output
- File references: `@file.ts` includes file contents
- YAML frontmatter for metadata

### Applications to This Project

#### 1. Test Trader Command
**Location:** `.claude/commands/test-trader.md`

```yaml
---
description: End-to-end test of a trading strategy
argument-hint: <strategy description>
allowed-tools: Bash, Read, Edit, mcp__supabase__*, mcp__chrome-devtools__*
---

Test trading strategy: "$ARGUMENTS"

1. Generate filter code from strategy description
2. Validate syntax and safety
3. Create test trader in database
4. Run screener against sample data (10 symbols, 7 days)
5. Verify signals generated correctly
6. Test UI display using Chrome DevTools
7. Clean up test data
8. Report results with performance metrics

Use the filter-code-reviewer agent for validation.
```

**Usage:** `/test-trader "Buy when RSI < 30 and price crosses above 20-day SMA"`

**Impact:** One command runs complete end-to-end test cycle, catching issues before manual testing.

---

#### 2. Deploy Edge Function Command
**Location:** `.claude/commands/deploy-edge.md`

```yaml
---
description: Deploy and test Supabase Edge Function
argument-hint: <function-name>
allowed-tools: mcp__supabase__*, Bash, Read, mcp__chrome-devtools__*
---

Deploy edge function: $1

Current functions:
!supabase functions list

1. Read function code from supabase/functions/$1
2. Check for Braintrust instrumentation
3. Deploy to production
4. Run automated tests (anonymous, free, pro, elite tiers)
5. Verify response times < 5s
6. Check Braintrust traces
7. Test in UI using Chrome DevTools
8. Report deployment status

Use edge-function-testing skill for validation.
```

**Usage:** `/deploy-edge analyze-signal`

**Impact:** Deployments include automatic testing across all tiers, preventing broken deploys.

---

#### 3. Audit Prompts Command
**Location:** `.claude/commands/audit-prompts.md`

```yaml
---
description: Audit all LLM prompts in codebase
allowed-tools: Grep, Read, Bash
---

Audit all LLM prompts for quality and consistency.

1. Find all prompt files:
   - supabase/functions/**/prompts/*.md
   - src/prompts/**/*.ts

2. For each prompt, check:
   - Has clear objective
   - Defines input/output formats
   - Includes examples
   - Has version number
   - Logged in Braintrust

3. Generate report:
   - Total prompts
   - Passing quality checks
   - Failing checks (with details)
   - Recommendations

Use prompt-quality-auditor skill.
```

**Usage:** `/audit-prompts`

**Impact:** Regular prompt quality checks maintain AI system reliability.

---

#### 4. Verify Tier Access Command
**Location:** `.claude/commands/verify-tier.md`

```yaml
---
description: Test tier-based access controls
argument-hint: <tier-name>
allowed-tools: Bash, mcp__supabase__*, mcp__chrome-devtools__*
---

Verify tier access controls for: $1

1. Create test user with tier: $1
2. Test access to:
   - Custom trader creation
   - Signal viewing
   - Signal history
   - AI analysis
   - Chart features

3. Expected access for $1:
   !grep -A 5 "## Tier Access Rules" CLAUDE.md

4. Test in UI using Chrome DevTools
5. Verify RLS policies blocking/allowing correctly
6. Clean up test user
7. Report pass/fail for each feature

Use database-schema-architect agent for RLS verification.
```

**Usage:** `/verify-tier Elite`

**Impact:** Automated testing of tier restrictions prevents unauthorized feature access.

---

#### 5. Instrument Function Command
**Location:** `.claude/commands/instrument.md`

```yaml
---
description: Add Braintrust instrumentation to a function
argument-hint: <file-path> <function-name>
allowed-tools: Read, Edit, Bash
---

Add Braintrust instrumentation to:
File: $1
Function: $2

Current function:
@$1

1. Import Braintrust traced utility
2. Wrap function with traced()
3. Add input logging
4. Add output logging
5. Add error handling
6. Add metadata (user_id, tier, etc.)
7. Test locally
8. Verify trace appears in Braintrust

Use braintrust-instrumentation skill.

Example pattern:
```typescript
import { traced } from '@braintrust/core'

export const $2 = traced(
  async (params) => {
    // original function logic
  },
  { name: '$2' }
)
```
```

**Usage:** `/instrument src/services/filterGenerator.ts generateFilter`

**Impact:** Systematically instrument all AI functions for observability.

---

## 4. Hooks: Event-Driven Automation

### What They Are
User-defined shell commands that execute at specific lifecycle events. Configured in `.claude/hooks/hooks.json`.

**Available Events:**
- PreToolUse, PostToolUse
- UserPromptSubmit
- SessionStart, SessionEnd
- SubagentStop
- PreCompact

### Applications to This Project

#### 1. Migration Safety Hook
**Location:** `.claude/hooks/hooks.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__supabase__apply_migration",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/check-rls-policies.js"
          }
        ]
      }
    ]
  }
}
```

**Script:** `.claude/hooks/check-rls-policies.js`

```javascript
#!/usr/bin/env node

const fs = require('fs')

// Read the migration being applied
const toolInput = JSON.parse(process.stdin.toString())
const migrationSQL = toolInput.tool_input.query

// Check if it's a CREATE TABLE without RLS
if (migrationSQL.includes('CREATE TABLE') &&
    !migrationSQL.includes('ENABLE ROW LEVEL SECURITY')) {
  console.error('❌ BLOCKED: Migration creates table without RLS policies')
  console.error('Add: ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;')
  process.exit(1)
}

// Check for missing indexes on foreign keys
const fkeyRegex = /REFERENCES\s+(\w+)/g
const indexRegex = /CREATE INDEX/g
const fkeys = (migrationSQL.match(fkeyRegex) || []).length
const indexes = (migrationSQL.match(indexRegex) || []).length

if (fkeys > 0 && indexes === 0) {
  console.warn('⚠️  WARNING: Foreign keys without indexes may cause performance issues')
}

console.log('✅ Migration safety check passed')
process.exit(0)
```

**Impact:** Prevents deploying tables without RLS, catches missing indexes, ensures security.

---

#### 2. Prompt Change Approval Hook
**Location:** `.claude/hooks/hooks.json`

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/prompt-change-guard.js"
          }
        ]
      }
    ]
  }
}
```

**Script:** `.claude/hooks/prompt-change-guard.js`

```javascript
#!/usr/bin/env node

const toolInput = JSON.parse(process.stdin.toString())
const filePath = toolInput.tool_input.file_path || ''

// Check if modifying a prompt file
const isPromptFile = filePath.includes('/prompts/') ||
                     filePath.includes('SYSTEM_PROMPT')

if (!isPromptFile) {
  process.exit(0) // Not a prompt, allow
}

// Block and require user approval
console.error('❌ BLOCKED: Attempting to modify prompt file')
console.error(`File: ${filePath}`)
console.error('')
console.error('Per CLAUDE.md: Prompt changes require user permission.')
console.error('Please review the proposed change and approve if correct.')
process.exit(1)
```

**Impact:** Enforces CLAUDE.md requirement for prompt change approval, prevents accidental regressions.

---

#### 3. Auto-Format on Edit Hook
**Location:** `.claude/hooks/hooks.json`

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/auto-format.js"
          }
        ]
      }
    ]
  }
}
```

**Script:** `.claude/hooks/auto-format.js`

```javascript
#!/usr/bin/env node

const { execSync } = require('child_process')
const toolResult = JSON.parse(process.stdin.toString())
const filePath = toolResult.tool_input?.file_path || ''

// Only format TypeScript/JavaScript files
if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) {
  process.exit(0)
}

try {
  // Run prettier
  execSync(`npx prettier --write "${filePath}"`, { stdio: 'inherit' })

  // Run ESLint fix
  execSync(`npx eslint --fix "${filePath}"`, { stdio: 'inherit' })

  console.log(`✅ Formatted: ${filePath}`)
} catch (error) {
  console.warn(`⚠️  Format failed: ${error.message}`)
}

process.exit(0)
```

**Impact:** All code automatically formatted and linted, maintains consistency.

---

#### 4. Braintrust Trace Logger Hook
**Location:** `.claude/hooks/hooks.json`

```json
{
  "hooks": {
    "SubagentStop": [
      {
        "matcher": "*",
        "hooks": [
          {
            "type": "command",
            "command": "node .claude/hooks/log-subagent-trace.js"
          }
        ]
      }
    ]
  }
}
```

**Script:** `.claude/hooks/log-subagent-trace.js`

```javascript
#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const toolResult = JSON.parse(process.stdin.toString())
const agentName = toolResult.subagent_name || 'unknown'
const task = toolResult.task || 'unknown'
const success = toolResult.success || false

// Log to Braintrust-compatible JSONL
const logEntry = {
  timestamp: new Date().toISOString(),
  agent: agentName,
  task: task,
  success: success,
  duration_ms: toolResult.duration_ms
}

const logPath = path.join(process.cwd(), '.claude/logs/subagent-traces.jsonl')
fs.appendFileSync(logPath, JSON.stringify(logEntry) + '\n')

console.log(`✅ Logged ${agentName} trace`)
process.exit(0)
```

**Impact:** All sub-agent invocations logged for analysis, debugging, optimization.

---

## 5. Plugins: Bundled Extensions

### What They Are
Plugins package multiple extension types (skills, agents, commands, hooks) into a single distributable unit.

**Structure:**
```
ai-trading-platform-plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest
├── skills/
│   ├── trading-strategy-validator/
│   ├── braintrust-instrumentation/
│   └── edge-function-testing/
├── agents/
│   ├── filter-code-reviewer.md
│   ├── prompt-engineer.md
│   └── database-schema-architect.md
├── commands/
│   ├── test-trader.md
│   ├── deploy-edge.md
│   └── audit-prompts.md
├── hooks/
│   └── hooks.json
└── README.md
```

### Plugin Manifest
**File:** `.claude-plugin/plugin.json`

```json
{
  "name": "ai-trading-platform",
  "version": "1.0.0",
  "description": "Autonomous engineering tools for AI-powered crypto trading platform",
  "author": "Your Team",
  "repository": "https://github.com/yourorg/ai-trading-plugin",
  "skills": ["trading-strategy-validator", "braintrust-instrumentation", "edge-function-testing", "prompt-quality-auditor"],
  "agents": ["filter-code-reviewer", "prompt-engineer", "database-schema-architect", "ai-workflow-orchestrator"],
  "commands": ["test-trader", "deploy-edge", "audit-prompts", "verify-tier", "instrument"],
  "hooks": ["migration-safety", "prompt-change-approval", "auto-format", "braintrust-trace-logger"]
}
```

### Installation & Distribution

**Personal marketplace:** `.claude-plugin/marketplace.json`

```json
{
  "name": "team-marketplace",
  "plugins": [
    {
      "name": "ai-trading-platform",
      "path": "./plugins/ai-trading-platform"
    }
  ]
}
```

**Install:**
```bash
/plugin marketplace add ./.claude-plugin/marketplace.json
/plugin install ai-trading-platform@team-marketplace
```

**Impact:** Entire team gets unified autonomous engineering toolkit with one command.

---

## 6. Orchestration: How It All Works Together

### Scenario 1: Create New Trading Strategy

**User:** "Create a new strategy that buys on RSI oversold"

**Autonomous Flow:**

1. **Main Claude** recognizes trading task, delegates to `ai-workflow-orchestrator` agent
2. **Orchestrator** coordinates workflow:
   - Calls Firebase AI Logic to generate filter code
   - Invokes `filter-code-reviewer` sub-agent for validation
   - Uses `braintrust-instrumentation` skill to add tracing
3. **Pre-migration hook** checks RLS policies before storing trader
4. **Post-deployment hook** auto-formats generated TypeScript
5. **Main Claude** runs `/test-trader` command automatically
6. **Chrome DevTools** used to verify UI display
7. **Braintrust trace logger hook** captures entire workflow

**Result:** Fully tested, instrumented, validated trading strategy deployed without manual intervention.

---

### Scenario 2: Modify LLM Prompt

**User:** "Improve the signal analysis prompt to consider market volatility"

**Autonomous Flow:**

1. **Main Claude** starts editing prompt file
2. **Prompt change guard hook** BLOCKS the edit
3. **Main Claude** invokes `prompt-engineer` sub-agent to design improvement
4. **Sub-agent** proposes prompt changes with A/B test plan
5. **Main Claude** presents changes to user for approval
6. **User approves**
7. **Main Claude** applies changes with version increment
8. **Braintrust instrumentation skill** logs prompt change
9. **Auto-format hook** formats file
10. **Sub-agent stop hook** logs the optimization trace

**Result:** Prompt improvements vetted by expert, versioned, tested, and logged.

---

### Scenario 3: Deploy Edge Function

**User:** "/deploy-edge analyze-signal"

**Autonomous Flow:**

1. **Slash command** triggered
2. **Main Claude** reads function code
3. **Braintrust instrumentation skill** verifies tracing present
4. **Main Claude** deploys to Supabase
5. **Edge function testing skill** automatically runs tier tests
6. **Chrome DevTools** verifies UI integration
7. **Main Claude** checks Braintrust for trace data
8. **Deployment report** generated with performance metrics

**Result:** Zero-touch deployment with comprehensive testing and observability.

---

## 7. Implementation Roadmap

### Phase 1: Foundation (Week 1)
**Goal:** Core skills and agents operational

**Tasks:**
1. Create project skills directory: `.claude/skills/`
2. Implement:
   - `trading-strategy-validator` skill
   - `braintrust-instrumentation` skill
   - `edge-function-testing` skill
3. Create project agents directory: `.claude/agents/`
4. Implement:
   - `filter-code-reviewer` agent
   - `database-schema-architect` agent
5. Test with existing trader workflows

**Success Criteria:**
- Trading strategies automatically validated
- All new code gets Braintrust tracing
- Edge functions tested post-deployment

---

### Phase 2: Automation (Week 2)
**Goal:** Slash commands and hooks streamline workflows

**Tasks:**
1. Create commands directory: `.claude/commands/`
2. Implement:
   - `/test-trader` command
   - `/deploy-edge` command
   - `/audit-prompts` command
3. Create hooks directory: `.claude/hooks/`
4. Implement:
   - Migration safety hook
   - Prompt change approval hook
   - Auto-format hook
5. Test end-to-end workflows

**Success Criteria:**
- One-command testing for traders
- Migrations blocked without RLS
- Prompt changes require approval

---

### Phase 3: Orchestration (Week 3)
**Goal:** Complex workflows fully autonomous

**Tasks:**
1. Implement remaining agents:
   - `prompt-engineer` agent
   - `ai-workflow-orchestrator` agent
2. Implement remaining commands:
   - `/verify-tier` command
   - `/instrument` command
3. Create comprehensive integration tests
4. Document usage patterns

**Success Criteria:**
- End-to-end trader workflow autonomous
- All prompts follow quality standards
- Full observability via Braintrust

---

### Phase 4: Distribution (Week 4)
**Goal:** Team-wide adoption via plugin

**Tasks:**
1. Package as plugin: `.claude-plugin/`
2. Create marketplace configuration
3. Write comprehensive README
4. Train team on usage
5. Gather feedback and iterate

**Success Criteria:**
- Entire team using plugin
- Reduced manual testing time
- Higher code quality metrics
- Faster feature velocity

---

## 8. Expected Impact

### Quantitative Benefits

| Metric | Before | After | Improvement |
|--------|--------|-------|-------------|
| Trader creation time | 30 min | 5 min | 83% faster |
| Manual testing effort | 2 hrs/feature | 15 min/feature | 87% reduction |
| Prompt regressions | 2-3/month | <1/month | 66% reduction |
| RLS policy mistakes | 1/month | 0/month | 100% reduction |
| Code review time | 1 hr/PR | 20 min/PR | 66% faster |
| Instrumentation gaps | 40% coverage | 95% coverage | 137% increase |
| Deployment confidence | Low | High | Qualitative |

### Qualitative Benefits

**Autonomous Engineering:**
- Claude handles complete workflows independently
- Proactive quality checks without prompting
- Consistent patterns across all AI features

**Reduced Cognitive Load:**
- No need to remember testing steps
- Automatic safety guardrails
- Built-in best practices

**Team Leverage:**
- Junior devs get senior-level review
- Consistent code quality
- Shared knowledge via plugin

**Faster Iteration:**
- Immediate feedback on quality
- Automated testing cycles
- Confidence to move quickly

**Better Observability:**
- All AI operations traced
- Historical analysis via Braintrust
- Easy debugging

---

## 9. Key Insights

### 1. Skills vs Sub-agents vs Commands

**Use Skills when:**
- Capability applies broadly (e.g., all AI functions need Braintrust)
- Claude should autonomously decide when to use it
- Supporting files/docs needed

**Use Sub-agents when:**
- Need deep domain expertise (e.g., prompt engineering)
- Isolated context prevents pollution
- Multi-step analysis required

**Use Commands when:**
- User-triggered workflows
- Specific sequences of steps
- Testing/deployment automation

### 2. Hooks Are Guardrails

Hooks enforce invariants that LLMs might miss:
- RLS policies on all tables
- Prompt changes approved
- Code formatted consistently
- Traces logged reliably

Don't rely on prompting for deterministic requirements - use hooks.

### 3. Plugins Enable Team Leverage

Individual skills/agents help one developer. Plugins help entire team:
- Shared knowledge
- Consistent patterns
- Easy onboarding
- Collective improvement

Invest in plugin packaging for team-wide adoption.

### 4. Observability Is Infrastructure

Braintrust instrumentation should be:
- Automatic (via skill)
- Comprehensive (all AI operations)
- Queryable (JSONL logs)
- Actionable (link to traces)

Treat AI observability like production monitoring.

### 5. Start Focused, Then Expand

Don't try to automate everything at once:
1. Pick highest-leverage workflow (trader creation)
2. Build skills/agents for that workflow
3. Test thoroughly
4. Expand to next workflow
5. Extract patterns into reusable components

---

## 10. Next Steps

### Immediate (Today)

1. **Create directories:**
   ```bash
   mkdir -p .claude/skills .claude/agents .claude/commands .claude/hooks
   ```

2. **Start with one skill:**
   - Implement `trading-strategy-validator`
   - Test on existing traders
   - Refine based on results

3. **Start with one agent:**
   - Implement `filter-code-reviewer`
   - Run on existing filter code
   - Iterate on prompts

### This Week

1. **Add Braintrust instrumentation skill**
2. **Add database-schema-architect agent**
3. **Create `/test-trader` command**
4. **Implement migration safety hook**

### This Month

1. **Complete all Phase 1-3 tasks**
2. **Package as plugin**
3. **Team adoption**
4. **Measure impact**

---

## Conclusion

Claude Code's advanced features transform AI from a coding assistant into an **autonomous engineering system**. By combining:

- **Skills** for broad capabilities
- **Sub-agents** for deep expertise
- **Commands** for user workflows
- **Hooks** for deterministic safety
- **Plugins** for team distribution

You create a self-improving, self-checking, fully observable development environment where Claude can:

1. **Understand** complex trading domain requirements
2. **Generate** high-quality, instrumented code
3. **Validate** correctness, safety, performance
4. **Test** across all tiers and scenarios
5. **Deploy** with confidence
6. **Monitor** via comprehensive tracing
7. **Improve** based on production data

The result: **10x faster feature velocity** with **higher quality** and **lower risk**.

This is the future of AI-powered software engineering.

---

**Document Version:** 1.0
**Last Updated:** 2025-10-25
**Maintained By:** Development Team
