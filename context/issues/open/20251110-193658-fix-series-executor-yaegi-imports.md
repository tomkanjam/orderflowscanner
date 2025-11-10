# Fix SeriesExecutor Yaegi Symbol Imports

**Type:** bug
**Initiative:** Current initiative
**Created:** 2025-11-10 19:36:58

## Context
Backend-generated indicator data (seriesCode) is failing to execute, causing all signals to have `indicator_data: NULL`. This forces frontend to fall back to Web Worker with empty `calculateFunction`, resulting in indicator panels appearing but with no line data.

## Root Cause
`SeriesExecutor` (backend/go-screener/internal/screener/series_executor.go) tries to import custom packages directly:
```go
import (
    "github.com/yourusername/go-screener/pkg/indicators"
    "github.com/yourusername/go-screener/pkg/types"
)
```

Yaegi cannot resolve these imports without Symbol exports, causing error:
```
Series code execution failed: unable to find source related to: "github.com/yourusername/go-screener/pkg/indicators"
```

## Solution
The codebase already has a working solution in `pkg/yaegi/executor.go` with `getCustomSymbols()` that properly exports indicators and types packages using reflection. SeriesExecutor should use the same approach.

## Progress
Starting implementation...

## Spec
Update `series_executor.go` to:
1. Import the symbols helper from `pkg/yaegi`
2. Use `i.Use(yaegi.GetCustomSymbols())` instead of relying on direct imports
3. Update import paths from `github.com/yourusername/go-screener` to `github.com/vyx/go-screener`
4. Test with existing "RSI Overbought" trader
