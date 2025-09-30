import React, { useEffect, useState } from 'react';
import { supabase } from '../config/firebase';

interface ExecutionRecord {
  id: string;
  trader_id: string;
  started_at: string;
  completed_at: string | null;
  symbols_checked: number;
  symbols_matched: number;
  execution_time_ms: number;
  error: string | null;
}

interface TraderMetrics {
  traderId: string;
  traderName: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  avgExecutionTime: number;
  minExecutionTime: number;
  maxExecutionTime: number;
  totalMatches: number;
  avgMatchRate: number;
}

interface ExecutionMetricsProps {
  traderId?: string; // Optional: filter by specific trader
}

export const ExecutionMetrics: React.FC<ExecutionMetricsProps> = ({ traderId }) => {
  const [metrics, setMetrics] = useState<TraderMetrics[]>([]);
  const [recentExecutions, setRecentExecutions] = useState<ExecutionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');

  useEffect(() => {
    fetchMetrics();
    const interval = setInterval(fetchMetrics, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [traderId, timeRange]);

  const getTimeRangeFilter = () => {
    const now = new Date();
    switch (timeRange) {
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000).toISOString();
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    }
  };

  const fetchMetrics = async () => {
    try {
      setLoading(true);
      const timeFilter = getTimeRangeFilter();

      // Fetch execution history
      let query = supabase
        .from('execution_history')
        .select(`
          *,
          traders (
            id,
            name
          )
        `)
        .gte('started_at', timeFilter)
        .order('started_at', { ascending: false });

      if (traderId) {
        query = query.eq('trader_id', traderId);
      }

      const { data: executions, error } = await query;

      if (error) {
        console.error('Failed to fetch execution metrics:', error);
        return;
      }

      // Calculate metrics per trader
      const traderMap = new Map<string, {
        name: string;
        executions: ExecutionRecord[];
      }>();

      executions?.forEach((exec: any) => {
        const tid = exec.trader_id;
        if (!traderMap.has(tid)) {
          traderMap.set(tid, {
            name: exec.traders?.name || 'Unknown',
            executions: []
          });
        }
        traderMap.get(tid)!.executions.push(exec);
      });

      // Aggregate metrics
      const aggregatedMetrics: TraderMetrics[] = Array.from(traderMap.entries()).map(([tid, data]) => {
        const successful = data.executions.filter(e => !e.error);
        const failed = data.executions.filter(e => e.error);
        const executionTimes = successful.map(e => e.execution_time_ms).filter(t => t > 0);

        return {
          traderId: tid,
          traderName: data.name,
          totalExecutions: data.executions.length,
          successfulExecutions: successful.length,
          failedExecutions: failed.length,
          avgExecutionTime: executionTimes.length > 0
            ? Math.round(executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length)
            : 0,
          minExecutionTime: executionTimes.length > 0 ? Math.min(...executionTimes) : 0,
          maxExecutionTime: executionTimes.length > 0 ? Math.max(...executionTimes) : 0,
          totalMatches: successful.reduce((sum, e) => sum + (e.symbols_matched || 0), 0),
          avgMatchRate: successful.length > 0
            ? successful.reduce((sum, e) => sum + ((e.symbols_matched || 0) / e.symbols_checked * 100), 0) / successful.length
            : 0
        };
      });

      setMetrics(aggregatedMetrics);
      setRecentExecutions(executions?.slice(0, 20) || []);
    } catch (error) {
      console.error('Error fetching metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="p-4 bg-gray-800 rounded-lg">
        <div className="text-gray-400">Loading execution metrics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time Range Selector */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-white">Execution Metrics</h3>
        <div className="flex gap-2">
          {(['1h', '24h', '7d', '30d'] as const).map((range) => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-1 rounded text-sm ${
                timeRange === range
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {range}
            </button>
          ))}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((metric) => (
          <div key={metric.traderId} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="text-white font-semibold mb-3">{metric.traderName}</div>

            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Total Runs:</span>
                <span className="text-white font-mono">{metric.totalExecutions}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Success Rate:</span>
                <span className={`font-mono ${metric.failedExecutions === 0 ? 'text-green-500' : 'text-yellow-500'}`}>
                  {metric.totalExecutions > 0
                    ? `${((metric.successfulExecutions / metric.totalExecutions) * 100).toFixed(1)}%`
                    : 'N/A'}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Avg Time:</span>
                <span className="text-white font-mono">{formatDuration(metric.avgExecutionTime)}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Min/Max:</span>
                <span className="text-gray-300 font-mono text-xs">
                  {formatDuration(metric.minExecutionTime)} / {formatDuration(metric.maxExecutionTime)}
                </span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Total Matches:</span>
                <span className="text-blue-400 font-mono">{metric.totalMatches}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-gray-400">Avg Match Rate:</span>
                <span className="text-blue-400 font-mono">{metric.avgMatchRate.toFixed(2)}%</span>
              </div>

              {metric.failedExecutions > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-700">
                  <span className="text-red-500 text-xs">
                    ⚠️ {metric.failedExecutions} failed execution{metric.failedExecutions > 1 ? 's' : ''}
                  </span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Recent Executions Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden border border-gray-700">
        <div className="px-4 py-3 border-b border-gray-700">
          <h4 className="text-white font-semibold">Recent Executions</h4>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-900">
              <tr>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">Timestamp</th>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">Trader</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium">Duration</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium">Checked</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium">Matches</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium">Match Rate</th>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {recentExecutions.map((exec: any) => {
                const matchRate = exec.symbols_checked > 0
                  ? ((exec.symbols_matched / exec.symbols_checked) * 100).toFixed(1)
                  : '0.0';

                return (
                  <tr key={exec.id} className="hover:bg-gray-750">
                    <td className="px-4 py-2 text-gray-300 font-mono text-xs">
                      {formatTimestamp(exec.started_at)}
                    </td>
                    <td className="px-4 py-2 text-white">
                      {exec.traders?.name || 'Unknown'}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300 font-mono">
                      {formatDuration(exec.execution_time_ms || 0)}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-300 font-mono">
                      {exec.symbols_checked || 0}
                    </td>
                    <td className="px-4 py-2 text-right text-blue-400 font-mono font-semibold">
                      {exec.symbols_matched || 0}
                    </td>
                    <td className="px-4 py-2 text-right text-blue-400 font-mono">
                      {matchRate}%
                    </td>
                    <td className="px-4 py-2">
                      {exec.error ? (
                        <span className="text-red-500 text-xs" title={exec.error}>
                          ❌ Failed
                        </span>
                      ) : (
                        <span className="text-green-500 text-xs">✓ Success</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {metrics.length === 0 && (
        <div className="text-center py-8 text-gray-400">
          No execution data available for the selected time range.
        </div>
      )}
    </div>
  );
};