import { useState, useEffect } from 'react';
import { supabase } from '../config/supabase';

interface WebSocketStatus {
  url: string;
  status: string;
  lastError?: string;
  connectedAt?: string;
  subscriptions: Array<{
    channel: string;
    status: string;
  }>;
}

interface KlineDataFreshness {
  symbol: string;
  timeframe: string;
  firstTime: string;
  lastTime: string;
  ageMinutes: number;
  klineCount: number;
}

export function DebugPanel() {
  const [isOpen, setIsOpen] = useState(false);
  const [wsStatus, setWsStatus] = useState<WebSocketStatus | null>(null);
  const [dataFreshness, setDataFreshness] = useState<KlineDataFreshness[]>([]);
  const [envInfo, setEnvInfo] = useState({
    supabaseUrl: import.meta.env.VITE_SUPABASE_URL || 'NOT SET',
    anonKeyPrefix: '',
    anonKeyHasNewline: false,
    goServerUrl: import.meta.env.VITE_GO_SERVER_URL || 'NOT SET',
    useEdgeFunctions: import.meta.env.VITE_USE_EDGE_FUNCTIONS || 'NOT SET',
  });

  useEffect(() => {
    // Check API key for newline
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    const hasNewline = anonKey.includes('\n') || anonKey.includes('\r');
    setEnvInfo(prev => ({
      ...prev,
      anonKeyPrefix: anonKey.slice(0, 50) + '...',
      anonKeyHasNewline: hasNewline,
    }));

    // Monitor WebSocket status
    const checkWSStatus = () => {
      const realtime = supabase.realtime;
      const channels = realtime.getChannels();

      setWsStatus({
        url: `wss://${envInfo.supabaseUrl.replace('https://', '')}/realtime/v1/websocket`,
        status: realtime.ws?.readyState === 1 ? 'CONNECTED' :
                realtime.ws?.readyState === 0 ? 'CONNECTING' :
                realtime.ws?.readyState === 2 ? 'CLOSING' :
                realtime.ws?.readyState === 3 ? 'CLOSED' : 'UNKNOWN',
        connectedAt: realtime.ws?.readyState === 1 ? new Date().toISOString() : undefined,
        subscriptions: channels.map(ch => ({
          channel: ch.topic,
          status: ch.state,
        })),
      });
    };

    const interval = setInterval(checkWSStatus, 2000);
    checkWSStatus();

    return () => clearInterval(interval);
  }, [envInfo.supabaseUrl]);

  useEffect(() => {
    // Check kline data freshness from IndexedDB
    const checkDataFreshness = async () => {
      try {
        const db = await new Promise<IDBDatabase>((resolve, reject) => {
          const request = indexedDB.open('market-data', 1);
          request.onsuccess = () => resolve(request.result);
          request.onerror = () => reject(request.error);
        });

        const transaction = db.transaction(['klines'], 'readonly');
        const store = transaction.objectStore('klines');
        const allKeys = await new Promise<string[]>((resolve, reject) => {
          const request = store.getAllKeys();
          request.onsuccess = () => resolve(request.result as string[]);
          request.onerror = () => reject(request.error);
        });

        const samples = allKeys.slice(0, 5); // Check first 5 entries
        const freshnessData: KlineDataFreshness[] = [];

        for (const key of samples) {
          const data = await new Promise<any>((resolve, reject) => {
            const request = store.get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });

          if (data?.klines && data.klines.length > 0) {
            const [symbol, timeframe] = key.split(':');
            const firstKline = data.klines[0];
            const lastKline = data.klines[data.klines.length - 1];
            const now = Date.now();
            const ageMinutes = Math.floor((now - lastKline.closeTime) / 60000);

            freshnessData.push({
              symbol,
              timeframe,
              firstTime: new Date(firstKline.openTime).toISOString(),
              lastTime: new Date(lastKline.closeTime).toISOString(),
              ageMinutes,
              klineCount: data.klines.length,
            });
          }
        }

        setDataFreshness(freshnessData);
        db.close();
      } catch (error) {
        console.error('[DebugPanel] Failed to check data freshness:', error);
      }
    };

    if (isOpen) {
      checkDataFreshness();
      const interval = setInterval(checkDataFreshness, 10000);
      return () => clearInterval(interval);
    }
  }, [isOpen]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONNECTED':
      case 'joined':
        return 'text-green-400';
      case 'CONNECTING':
      case 'joining':
        return 'text-yellow-400';
      case 'CLOSED':
      case 'error':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const getFreshnessColor = (ageMinutes: number) => {
    if (ageMinutes < 5) return 'text-green-400';
    if (ageMinutes < 60) return 'text-yellow-400';
    if (ageMinutes < 1440) return 'text-orange-400';
    return 'text-red-400';
  };

  return (
    <>
      {/* Debug Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed bottom-4 right-4 z-50 px-3 py-2 bg-gray-800 text-gray-300 rounded-lg text-xs font-mono hover:bg-gray-700 border border-gray-600 shadow-lg"
        title="Toggle Debug Panel"
      >
        🐛 Debug {isOpen ? '▼' : '▲'}
      </button>

      {/* Debug Panel */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-50 w-[600px] max-h-[80vh] overflow-auto bg-gray-900 text-gray-300 rounded-lg border border-gray-700 shadow-2xl font-mono text-xs">
          <div className="sticky top-0 bg-gray-800 px-4 py-2 border-b border-gray-700 flex items-center justify-between">
            <h3 className="font-bold text-sm">🐛 Debug Panel</h3>
            <button
              onClick={() => setIsOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          <div className="p-4 space-y-4">
            {/* Environment Info */}
            <section>
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                🔧 Environment
              </h4>
              <div className="space-y-1 pl-4">
                <div>
                  <span className="text-gray-500">Supabase URL:</span>{' '}
                  <span className="text-blue-400">{envInfo.supabaseUrl}</span>
                </div>
                <div>
                  <span className="text-gray-500">Anon Key:</span>{' '}
                  <span className="text-gray-400">{envInfo.anonKeyPrefix}</span>
                </div>
                <div>
                  <span className="text-gray-500">Has Newline:</span>{' '}
                  <span className={envInfo.anonKeyHasNewline ? 'text-red-400 font-bold' : 'text-green-400'}>
                    {envInfo.anonKeyHasNewline ? '⚠️ YES (ERROR!)' : '✓ NO'}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Go Server:</span>{' '}
                  <span className="text-blue-400">{envInfo.goServerUrl}</span>
                </div>
                <div>
                  <span className="text-gray-500">Use Edge Functions:</span>{' '}
                  <span className="text-blue-400">{envInfo.useEdgeFunctions}</span>
                </div>
              </div>
            </section>

            {/* WebSocket Status */}
            <section>
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                🔌 WebSocket Status
              </h4>
              {wsStatus ? (
                <div className="space-y-1 pl-4">
                  <div>
                    <span className="text-gray-500">URL:</span>{' '}
                    <span className="text-gray-400 break-all">{wsStatus.url}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">Status:</span>{' '}
                    <span className={getStatusColor(wsStatus.status)}>
                      {wsStatus.status}
                    </span>
                  </div>
                  {wsStatus.connectedAt && (
                    <div>
                      <span className="text-gray-500">Connected At:</span>{' '}
                      <span className="text-gray-400">{wsStatus.connectedAt}</span>
                    </div>
                  )}
                  {wsStatus.lastError && (
                    <div>
                      <span className="text-gray-500">Last Error:</span>{' '}
                      <span className="text-red-400">{wsStatus.lastError}</span>
                    </div>
                  )}
                  <div className="mt-2">
                    <div className="text-gray-500 mb-1">Subscriptions ({wsStatus.subscriptions.length}):</div>
                    {wsStatus.subscriptions.length === 0 ? (
                      <div className="text-gray-500 pl-4">No active subscriptions</div>
                    ) : (
                      <div className="space-y-1 pl-4 max-h-40 overflow-auto">
                        {wsStatus.subscriptions.map((sub, i) => (
                          <div key={i}>
                            <span className="text-gray-400">{sub.channel}</span>{' '}
                            <span className={getStatusColor(sub.status)}>({sub.status})</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="text-gray-500 pl-4">Loading...</div>
              )}
            </section>

            {/* Data Freshness */}
            <section>
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                📊 Data Freshness (Sample)
              </h4>
              {dataFreshness.length === 0 ? (
                <div className="text-gray-500 pl-4">No data in cache</div>
              ) : (
                <div className="space-y-2 pl-4">
                  {dataFreshness.map((data, i) => (
                    <div key={i} className="border-l-2 border-gray-700 pl-2">
                      <div className="font-bold text-white">
                        {data.symbol}:{data.timeframe}
                      </div>
                      <div className="space-y-0.5 text-xs">
                        <div>
                          <span className="text-gray-500">Last Update:</span>{' '}
                          <span className={getFreshnessColor(data.ageMinutes)}>
                            {data.ageMinutes < 60
                              ? `${data.ageMinutes}m ago`
                              : data.ageMinutes < 1440
                              ? `${Math.floor(data.ageMinutes / 60)}h ago`
                              : `${Math.floor(data.ageMinutes / 1440)}d ago`}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Count:</span>{' '}
                          <span className="text-gray-400">{data.klineCount} klines</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Range:</span>{' '}
                          <span className="text-gray-400">
                            {new Date(data.firstTime).toLocaleString()} →{' '}
                            {new Date(data.lastTime).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* System Info */}
            <section>
              <h4 className="font-bold text-white mb-2 flex items-center gap-2">
                💻 System Info
              </h4>
              <div className="space-y-1 pl-4">
                <div>
                  <span className="text-gray-500">User Agent:</span>{' '}
                  <span className="text-gray-400 break-all">{navigator.userAgent}</span>
                </div>
                <div>
                  <span className="text-gray-500">Timestamp:</span>{' '}
                  <span className="text-gray-400">{new Date().toISOString()}</span>
                </div>
                <div>
                  <span className="text-gray-500">IndexedDB:</span>{' '}
                  <span className="text-green-400">
                    {typeof indexedDB !== 'undefined' ? '✓ Available' : '✗ Not Available'}
                  </span>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}
    </>
  );
}