
import React, { useState, useMemo } from 'react';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, SignalLogEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress } from '../types';
import { TraderSignalsTable } from '../src/components/TraderSignalsTable';
import { SignalHistorySidebar } from '../src/components/SignalHistorySidebar';
import { SignalLifecycle } from '../src/abstractions/interfaces';
import { signalManager } from '../src/services/signalManager';
import ChartDisplay from './ChartDisplay';
import Loader from './Loader';
import ErrorMessage from './ErrorMessage';
import ActivityPanel from '../src/components/ActivityPanel';
import { useSubscription } from '../src/contexts/SubscriptionContext';
import { sharedMarketData } from '../src/shared/SharedMarketData';
import * as screenerHelpers from '../screenerHelpers'; 

type ScreenerHelpersType = typeof screenerHelpers;

interface MainContentProps {
  statusText: string;
  statusLightClass: string;
  initialLoading: boolean;
  initialError: string | null;
  allSymbols: string[];
  tickers: Map<string, Ticker>;
  traders?: any[]; // Add traders prop
  selectedTraderId?: string | null; // Selected trader for filtering
  onSelectTrader?: (traderId: string | null) => void; // Trader selection callback
  currentFilterFn: null;
  klineInterval: KlineInterval;
  selectedSymbolForChart: string | null;
  chartConfigForDisplay: CustomIndicatorConfig[] | null;
  onRowClick: (symbol: string, traderId?: string, signalId?: string) => void;
  selectedSignalId?: string | null;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  signalLog: SignalLogEntry[]; // Add signalLog prop
  historicalSignals?: HistoricalSignal[]; // Add historicalSignals prop
  // Historical scanner props
  hasActiveFilter?: boolean;
  onRunHistoricalScan?: () => void;
  isHistoricalScanning?: boolean;
  historicalScanProgress?: HistoricalScanProgress | null;
  historicalScanConfig?: HistoricalScanConfig;
  onHistoricalScanConfigChange?: (config: HistoricalScanConfig) => void;
  onCancelHistoricalScan?: () => void;
  // Signal deduplication
  signalDedupeThreshold?: number;
  onSignalDedupeThresholdChange?: (threshold: number) => void;
  // Kline history configuration
  klineHistoryConfig?: any; // Using any to avoid importing KlineHistoryConfig
  onKlineHistoryConfigChange?: (config: any) => void;
  // Activity panel props
  isActivityPanelOpen?: boolean;
  allSignals?: any[]; // Signal[]
  allTrades?: any[]; // Trade[]
  onCloseActivityPanel?: () => void;
  isMobile?: boolean;
}

const MainContent: React.FC<MainContentProps> = ({
  statusText,
  statusLightClass,
  initialLoading,
  initialError,
  allSymbols,
  tickers,
  traders,
  selectedTraderId,
  onSelectTrader,
  currentFilterFn,
  klineInterval,
  selectedSymbolForChart,
  chartConfigForDisplay,
  onRowClick,
  selectedSignalId,
  onAiInfoClick,
  signalLog,
  historicalSignals = [],
  hasActiveFilter,
  onRunHistoricalScan,
  isHistoricalScanning,
  historicalScanProgress,
  historicalScanConfig,
  onHistoricalScanConfigChange,
  onCancelHistoricalScan,
  signalDedupeThreshold,
  onSignalDedupeThresholdChange,
  klineHistoryConfig,
  onKlineHistoryConfigChange,
  isActivityPanelOpen = false,
  allSignals = [],
  allTrades = [],
  onCloseActivityPanel,
  isMobile = false,
}) => {
  const { currentTier } = useSubscription();
  const [selectedSignal, setSelectedSignal] = useState<SignalLifecycle | null>(null);
  
  // Memoize klines to prevent unnecessary recalculations
  const chartKlines = useMemo(() => {
    if (!selectedSymbolForChart) {
      return undefined;
    }
    const klines = sharedMarketData.getKlines(selectedSymbolForChart, klineInterval);
    console.log(`[DEBUG ${new Date().toISOString()}] Memoizing klines for ${selectedSymbolForChart}`, {
      klinesLength: klines.length,
      interval: klineInterval
    });
    return klines;
  }, [selectedSymbolForChart, klineInterval]);
  
  
  return (
    <div className="w-full md:w-2/3 xl:w-3/4 flex-grow flex h-screen overflow-hidden">
      <div className="flex-grow flex flex-col overflow-hidden">
        <div className="container mx-auto px-4 py-2 md:px-6 md:py-3 flex-grow flex flex-col overflow-hidden">
        <main className="flex-grow flex flex-col overflow-hidden">
          {initialLoading && <Loader text="Fetching initial market data..." />}
          <ErrorMessage message={initialError} />

          {!initialLoading && !initialError && (
            <>
              <ChartDisplay
                symbol={selectedSymbolForChart}
                klines={chartKlines}
                indicators={chartConfigForDisplay}
                interval={klineInterval}
                signalLog={signalLog} // Pass signalLog to ChartDisplay
                historicalSignals={historicalSignals} // Pass historicalSignals to ChartDisplay
              />
              <div className="mt-2 flex flex-1 overflow-hidden">
                <div className={`${!isMobile ? 'flex-1' : 'w-full'} overflow-hidden`}>
                  <TraderSignalsTable 
                    tickers={tickers}
                    traders={traders}
                    selectedTraderId={selectedTraderId}
                    onSelectTrader={onSelectTrader}
                    onRowClick={onRowClick}
                    onSignalSelect={setSelectedSignal}
                    selectedSignalId={selectedSignal?.id || null}
                    hasActiveFilter={hasActiveFilter}
                    onRunHistoricalScan={onRunHistoricalScan}
                    isHistoricalScanning={isHistoricalScanning}
                    historicalScanProgress={historicalScanProgress}
                    historicalScanConfig={historicalScanConfig}
                    onHistoricalScanConfigChange={onHistoricalScanConfigChange}
                    onCancelHistoricalScan={onCancelHistoricalScan}
                    historicalSignals={historicalSignals}
                    signalDedupeThreshold={signalDedupeThreshold}
                    onSignalDedupeThresholdChange={onSignalDedupeThresholdChange}
                    klineHistoryConfig={klineHistoryConfig}
                    onKlineHistoryConfigChange={onKlineHistoryConfigChange}
                  />
                </div>
              </div>
            </>
          )}
        </main>
        </div>
      </div>
      
      {/* Signal History Sidebar - Elite tier only */}
      {selectedSignal && currentTier === 'elite' && (
        <div className="w-96 border-l border-[var(--nt-border-default)] bg-[var(--nt-bg-primary)] h-full overflow-hidden flex-shrink-0">
          <SignalHistorySidebar 
            signal={selectedSignal}
            onClose={() => setSelectedSignal(null)}
            tickers={tickers}
            traders={traders || []}
          />
        </div>
      )}
    </div>
  );
};

export default MainContent;
