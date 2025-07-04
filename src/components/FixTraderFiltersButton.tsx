import React, { useState } from 'react';
import { Wrench, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { fixBrokenTraderFilters } from '../utils/fixTraderFilters';

export function FixTraderFiltersButton() {
  const [isFixing, setIsFixing] = useState(false);
  const [result, setResult] = useState<{
    totalTraders: number;
    fixedCount: number;
    errorCount: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFix = async () => {
    setIsFixing(true);
    setError(null);
    setResult(null);

    try {
      const fixResult = await fixBrokenTraderFilters();
      setResult(fixResult);
      
      // Reload the page after successful fix to refresh traders
      if (fixResult.fixedCount > 0) {
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    } catch (err) {
      console.error('Failed to fix trader filters:', err);
      setError(err instanceof Error ? err.message : 'Failed to fix trader filters');
    } finally {
      setIsFixing(false);
    }
  };

  return (
    <div className="space-y-3">
      <button
        onClick={handleFix}
        disabled={isFixing}
        className="flex items-center gap-2 px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 
                   text-orange-400 rounded-lg transition-colors disabled:opacity-50 
                   disabled:cursor-not-allowed"
      >
        {isFixing ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Wrench className="h-4 w-4" />
        )}
        <span>
          {isFixing ? 'Fixing Trader Filters...' : 'Fix Broken Trader Filters'}
        </span>
      </button>

      {result && (
        <div className="p-3 bg-green-500/10 border border-green-500 rounded-lg">
          <div className="flex items-start gap-2">
            <CheckCircle className="h-4 w-4 text-green-400 mt-0.5" />
            <div className="text-sm">
              <p className="text-green-400 font-medium">Fix Complete!</p>
              <p className="text-[var(--tm-text-muted)] mt-1">
                Checked {result.totalTraders} traders
              </p>
              {result.fixedCount > 0 && (
                <p className="text-green-400">
                  ✅ Fixed {result.fixedCount} trader{result.fixedCount > 1 ? 's' : ''}
                </p>
              )}
              {result.errorCount > 0 && (
                <p className="text-red-400">
                  ❌ {result.errorCount} error{result.errorCount > 1 ? 's' : ''}
                </p>
              )}
              {result.fixedCount > 0 && (
                <p className="text-[var(--tm-text-muted)] mt-2">
                  Reloading page to apply changes...
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-400 mt-0.5" />
            <div className="text-sm">
              <p className="text-red-400 font-medium">Error</p>
              <p className="text-[var(--tm-text-muted)] mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      <div className="p-3 bg-[var(--tm-bg-primary)] border border-[var(--tm-border)] rounded-lg">
        <div className="flex items-start gap-2">
          <AlertCircle className="h-4 w-4 text-[var(--tm-accent)] mt-0.5" />
          <div className="text-sm text-[var(--tm-text-muted)]">
            <p className="font-medium text-[var(--tm-text-primary)]">
              What does this do?
            </p>
            <p className="mt-1">
              This will fix trader filters that were created with an older format. 
              It regenerates the filter code to use the correct syntax for variables 
              like <code className="text-xs bg-[var(--tm-bg-secondary)] px-1 py-0.5 rounded">ticker.c</code> instead 
              of <code className="text-xs bg-[var(--tm-bg-secondary)] px-1 py-0.5 rounded">price</code> and 
              helper functions like <code className="text-xs bg-[var(--tm-bg-secondary)] px-1 py-0.5 rounded">helpers.getLatestEMA()</code> instead 
              of <code className="text-xs bg-[var(--tm-bg-secondary)] px-1 py-0.5 rounded">ema()</code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}