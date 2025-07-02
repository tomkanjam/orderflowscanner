
import React from 'react';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, SignalLogEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress } from '../types';
import { TraderSignalsTable } from '../src/components/TraderSignalsTable';
import ChartDisplay from './ChartDisplay';
import Loader from './Loader';
import ErrorMessage from './ErrorMessage';
import ActivityPanel from '../src/components/ActivityPanel';
import * as screenerHelpers from '../screenerHelpers'; 

type ScreenerHelpersType = typeof screenerHelpers;

interface MainContentProps {
  statusText: string;
  statusLightClass: string;
  initialLoading: boolean;
  initialError: string | null;
  allSymbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Map<KlineInterval, Kline[]>>;
  traders?: any[]; // Add traders prop
  selectedTraderId?: string | null; // Selected trader for filtering
  onSelectTrader?: (traderId: string | null) => void; // Trader selection callback
  currentFilterFn: null;
  klineInterval: KlineInterval;
  selectedSymbolForChart: string | null;
  chartConfigForDisplay: CustomIndicatorConfig[] | null;
  onRowClick: (symbol: string, traderId?: string) => void;
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
  historicalData,
  traders,
  selectedTraderId,
  onSelectTrader,
  currentFilterFn,
  klineInterval,
  selectedSymbolForChart,
  chartConfigForDisplay,
  onRowClick,
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
  return (
    <div className="w-full md:w-2/3 xl:w-3/4 flex-grow flex flex-col h-screen overflow-y-auto">
      <div className="container mx-auto px-4 py-2 md:px-6 md:py-3 flex-grow flex flex-col">
        <main className="flex-grow flex flex-col">
          {initialLoading && <Loader text="Fetching initial market data..." />}
          <ErrorMessage message={initialError} />

          {!initialLoading && !initialError && (
            <>
              <ChartDisplay
                symbol={selectedSymbolForChart}
                klines={selectedSymbolForChart ? historicalData.get(selectedSymbolForChart)?.get(klineInterval) : undefined}
                indicators={chartConfigForDisplay}
                interval={klineInterval}
                signalLog={signalLog} // Pass signalLog to ChartDisplay
                historicalSignals={historicalSignals} // Pass historicalSignals to ChartDisplay
              />
              <div className="mt-2 flex h-full">
                <div className={`${isActivityPanelOpen && !isMobile ? 'flex-1' : 'w-full'} h-full`}>
                  <TraderSignalsTable 
                    tickers={tickers}
                    traders={traders}
                    selectedTraderId={selectedTraderId}
                    onSelectTrader={onSelectTrader}
                    onRowClick={onRowClick}
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
                {!isMobile && (
                  <ActivityPanel
                    signals={allSignals}
                    trades={allTrades}
                    isOpen={isActivityPanelOpen}
                    onClose={onCloseActivityPanel || (() => {})}
                    isMobile={false}
                  />
                )}
              </div>
            </>
          )}
        </main>
      </div>
      <footer className="text-center text-[var(--tm-text-muted)] py-3 text-xs md:text-sm border-t border-[var(--tm-border)]">
        <p>Powered by <span className="text-[var(--tm-secondary)]">Binance API</span> &amp; <span className="text-[var(--tm-accent)]">Gemini AI</span>. Not financial advice.</p>
      </footer>
      
      {/* Mobile Activity Panel */}
      {isMobile && (
        <ActivityPanel
          signals={allSignals}
          trades={allTrades}
          isOpen={isActivityPanelOpen}
          onClose={onCloseActivityPanel || (() => {})}
          isMobile={true}
        />
      )}
    </div>
  );
};

export default MainContent;
