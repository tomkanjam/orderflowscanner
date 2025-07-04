import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle, Wrench } from 'lucide-react';
import { traderManager } from '../services/traderManager';
import { debugTraderFilters, fixFilterCode, validateFilterCode } from '../utils/debugTraderFilters';
import { Trader } from '../abstractions/trader.interfaces';

export function TraderFilterDebugger() {
  const [issues, setIssues] = useState<Array<{
    traderId: string;
    traderName: string;
    issue: string;
    suggestion: string;
  }>>([]);
  const [loading, setLoading] = useState(true);
  const [fixing, setFixing] = useState<string | null>(null);
  const [fixed, setFixed] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkForIssues();
  }, []);

  const checkForIssues = async () => {
    setLoading(true);
    try {
      const foundIssues = await debugTraderFilters();
      setIssues(foundIssues);
    } catch (error) {
      console.error('Error checking for issues:', error);
    } finally {
      setLoading(false);
    }
  };

  const fixTraderFilter = async (traderId: string) => {
    setFixing(traderId);
    try {
      const trader = await traderManager.getTrader(traderId);
      if (!trader || !trader.filter?.code) {
        throw new Error('Trader or filter not found');
      }

      // Fix the filter code
      const fixedCode = fixFilterCode(trader.filter.code);
      
      // Validate the fixed code
      const validation = validateFilterCode(fixedCode);
      if (!validation.valid) {
        throw new Error(`Fixed code validation failed: ${validation.error}`);
      }

      // Update the trader
      await traderManager.updateTrader(traderId, {
        filter: {
          ...trader.filter,
          code: fixedCode
        }
      });

      // Mark as fixed
      setFixed(prev => new Set([...prev, traderId]));
      
      // Re-check for issues
      await checkForIssues();
      
      console.log(`✅ Fixed filter for ${trader.name}`);
    } catch (error) {
      console.error('Error fixing trader filter:', error);
      alert(`Failed to fix filter: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setFixing(null);
    }
  };

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <p className="text-gray-400">Checking trader filters for issues...</p>
      </div>
    );
  }

  if (issues.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-6">
        <div className="flex items-center text-green-400">
          <CheckCircle className="w-5 h-5 mr-2" />
          <p>All trader filters are working correctly!</p>
        </div>
      </div>
    );
  }

  // Group issues by trader
  const issuesByTrader = new Map<string, typeof issues>();
  for (const issue of issues) {
    if (!issuesByTrader.has(issue.traderId)) {
      issuesByTrader.set(issue.traderId, []);
    }
    issuesByTrader.get(issue.traderId)!.push(issue);
  }

  return (
    <div className="bg-gray-800 rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">Trader Filter Issues</h3>
        <button
          onClick={checkForIssues}
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          Re-check
        </button>
      </div>

      <div className="space-y-4">
        {Array.from(issuesByTrader).map(([traderId, traderIssues]) => {
          const isFixed = fixed.has(traderId);
          const isFixing = fixing === traderId;
          
          return (
            <div
              key={traderId}
              className={`border rounded-lg p-4 ${
                isFixed
                  ? 'border-green-600 bg-green-900/20'
                  : 'border-yellow-600 bg-yellow-900/20'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h4 className="font-medium text-white">
                    {traderIssues[0].traderName}
                  </h4>
                  <p className="text-xs text-gray-400 mt-1">ID: {traderId}</p>
                </div>
                {!isFixed && (
                  <button
                    onClick={() => fixTraderFilter(traderId)}
                    disabled={isFixing}
                    className={`flex items-center px-3 py-1 text-sm rounded ${
                      isFixing
                        ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white'
                    }`}
                  >
                    <Wrench className="w-4 h-4 mr-1" />
                    {isFixing ? 'Fixing...' : 'Auto Fix'}
                  </button>
                )}
                {isFixed && (
                  <div className="flex items-center text-green-400">
                    <CheckCircle className="w-4 h-4 mr-1" />
                    <span className="text-sm">Fixed</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                {traderIssues.map((issue, idx) => (
                  <div key={idx} className="text-sm">
                    <div className="flex items-start">
                      <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 mr-2 flex-shrink-0" />
                      <div>
                        <p className="text-yellow-300">{issue.issue}</p>
                        <p className="text-gray-400 mt-1">
                          💡 {issue.suggestion}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-6 p-4 bg-gray-900 rounded-lg">
        <h4 className="text-sm font-medium text-gray-300 mb-2">Common Issues Found:</h4>
        <ul className="text-xs text-gray-400 space-y-1">
          <li>• <code>bands.slice()</code> - Bollinger Bands returns an object, not array</li>
          <li>• <code>tickerVolume</code> - Use <code>ticker.v</code> or <code>ticker.q</code> instead</li>
          <li>• Missing <code>return</code> statement in filter code</li>
        </ul>
      </div>
    </div>
  );
}