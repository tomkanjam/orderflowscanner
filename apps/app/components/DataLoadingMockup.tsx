import React, { useState, useEffect } from 'react';
import { CheckCircle2, Clock, AlertCircle, Loader2, Database, Server, Wifi } from 'lucide-react';

interface DataFlowStep {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'loading' | 'success' | 'error';
  latency?: number;
  dataSize?: string;
}

const DataLoadingMockup: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const [isSimulating, setIsSimulating] = useState(false);
  const [steps, setSteps] = useState<DataFlowStep[]>([
    {
      id: 'edge-function',
      title: '⚡ Edge Function',
      description: 'get-klines receives request',
      status: 'pending'
    },
    {
      id: 'redis-query',
      title: '🗄️ Redis Query',
      description: 'Fetch from Upstash Redis',
      status: 'pending'
    },
    {
      id: 'data-transform',
      title: '🔄 Transform',
      description: 'Parse and format data',
      status: 'pending'
    },
    {
      id: 'cache-check',
      title: '💾 Cache Check',
      description: 'LRU cache lookup',
      status: 'pending'
    },
    {
      id: 'dedup-check',
      title: '🔍 Deduplication',
      description: 'Check in-flight requests',
      status: 'pending'
    },
    {
      id: 'chart-render',
      title: '📊 Chart Update',
      description: 'Render with new data',
      status: 'pending'
    }
  ]);

  const simulateDataFlow = async () => {
    setIsSimulating(true);
    setCurrentStep(0);

    // Reset all steps
    setSteps(prev => prev.map(s => ({ ...s, status: 'pending', latency: undefined })));

    const stepTimings = [
      { delay: 500, latency: 15, dataSize: '2KB' },   // Edge function
      { delay: 800, latency: 8, dataSize: '45KB' },    // Redis
      { delay: 200, latency: 2, dataSize: '40KB' },    // Transform
      { delay: 100, latency: 0.1, dataSize: 'HIT' },   // Cache
      { delay: 50, latency: 0.05, dataSize: 'SKIP' },  // Dedup
      { delay: 300, latency: 25, dataSize: '40KB' }    // Chart
    ];

    for (let i = 0; i < steps.length; i++) {
      setCurrentStep(i);
      setSteps(prev => prev.map((s, idx) => {
        if (idx === i) return { ...s, status: 'loading' };
        if (idx < i) return { ...s, status: 'success' };
        return s;
      }));

      await new Promise(resolve => setTimeout(resolve, stepTimings[i].delay));

      setSteps(prev => prev.map((s, idx) => {
        if (idx === i) {
          return {
            ...s,
            status: 'success',
            latency: stepTimings[i].latency,
            dataSize: stepTimings[i].dataSize
          };
        }
        return s;
      }));
    }

    setIsSimulating(false);
  };

  const getStatusIcon = (status: DataFlowStep['status']) => {
    switch (status) {
      case 'pending':
        return <Clock className="w-5 h-5 text-gray-400" />;
      case 'loading':
        return <Loader2 className="w-5 h-5 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
    }
  };

  const totalLatency = steps.reduce((sum, step) => sum + (step.latency || 0), 0);

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
        <h2 className="text-2xl font-bold text-white mb-2">Data Loading Flow Mockup</h2>
        <p className="text-gray-400 mb-6">
          Visualizing the new server-side data pipeline with LRU caching and deduplication
        </p>

        {/* Architecture Overview */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <Database className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            <h3 className="text-white font-semibold">Upstash Redis</h3>
            <p className="text-gray-400 text-sm">Global edge cache</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <Server className="w-8 h-8 text-purple-500 mx-auto mb-2" />
            <h3 className="text-white font-semibold">Edge Functions</h3>
            <p className="text-gray-400 text-sm">Supabase Deno</p>
          </div>
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <Wifi className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <h3 className="text-white font-semibold">Client Cache</h3>
            <p className="text-gray-400 text-sm">LRU 100 symbols</p>
          </div>
        </div>

        {/* Data Flow Steps */}
        <div className="space-y-3 mb-6">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className={`
                flex items-center justify-between p-4 rounded-lg border transition-all
                ${step.status === 'loading' ? 'bg-blue-900/20 border-blue-500' :
                  step.status === 'success' ? 'bg-green-900/20 border-green-500' :
                  'bg-gray-800 border-gray-700'}
              `}
            >
              <div className="flex items-center gap-3">
                {getStatusIcon(step.status)}
                <div>
                  <h3 className="text-white font-semibold">{step.title}</h3>
                  <p className="text-gray-400 text-sm">{step.description}</p>
                </div>
              </div>
              <div className="text-right">
                {step.latency !== undefined && (
                  <div className="text-green-400 font-mono text-sm">
                    {step.latency}ms
                  </div>
                )}
                {step.dataSize && (
                  <div className="text-gray-500 text-xs">
                    {step.dataSize}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Performance Metrics */}
        {totalLatency > 0 && (
          <div className="bg-gray-800 rounded-lg p-4 mb-6">
            <h3 className="text-white font-semibold mb-3">Performance Metrics</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <p className="text-gray-400 text-sm">Total Latency</p>
                <p className="text-white font-mono text-lg">{totalLatency.toFixed(2)}ms</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Memory Usage</p>
                <p className="text-white font-mono text-lg">~95MB</p>
                <p className="text-green-400 text-xs">↓ 81% from 500MB</p>
              </div>
              <div>
                <p className="text-gray-400 text-sm">Cache Hit Rate</p>
                <p className="text-white font-mono text-lg">85%</p>
                <p className="text-green-400 text-xs">After warmup</p>
              </div>
            </div>
          </div>
        )}

        {/* Control Button */}
        <button
          onClick={simulateDataFlow}
          disabled={isSimulating}
          className={`
            w-full py-3 px-6 rounded-lg font-semibold transition-colors
            ${isSimulating
              ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
              : 'bg-blue-600 hover:bg-blue-700 text-white'}
          `}
        >
          {isSimulating ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 animate-spin" />
              Simulating Data Flow...
            </span>
          ) : (
            'Simulate Data Loading'
          )}
        </button>

        {/* Implementation Status */}
        <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-600 rounded-lg">
          <h3 className="text-yellow-400 font-semibold mb-2">📋 Implementation Status</h3>
          <ul className="space-y-1 text-sm text-gray-300">
            <li>✅ Edge function created (get-klines)</li>
            <li>✅ Redis connection configured</li>
            <li>⏳ KlineDataService to be implemented</li>
            <li>⏳ LRU cache integration pending</li>
            <li>⏳ Request deduplication pending</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default DataLoadingMockup;