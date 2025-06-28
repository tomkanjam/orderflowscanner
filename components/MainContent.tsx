
import React from 'react';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, SignalLogEntry, HistoricalSignal, HistoricalScanConfig, HistoricalScanProgress } from '../types';
import { TraderSignalsTable } from '../src/components/TraderSignalsTable';
import CryptoTable from './CryptoTable';
import ChartDisplay from './ChartDisplay';
import Loader from './Loader';
import ErrorMessage from './ErrorMessage';
import * as screenerHelpers from '../screenerHelpers'; 

type ScreenerHelpersType = typeof screenerHelpers;

interface MainContentProps {
  statusText: string;
  statusLightClass: string;
  initialLoading: boolean;
  initialError: string | null;
  allSymbols: string[];
  tickers: Map<string, Ticker>;
  historicalData: Map<string, Kline[]>;
  traders?: any[]; // Add traders prop
  selectedTraderId?: string | null; // Selected trader for filtering
  onSelectTrader?: (traderId: string | null) => void; // Trader selection callback
  currentFilterFn: ((ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType, hvnNodes: any[]) => boolean) | null;
  klineInterval: KlineInterval;
  selectedSymbolForChart: string | null;
  chartConfigForDisplay: CustomIndicatorConfig[] | null;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  signalLog: SignalLogEntry[]; // Add signalLog prop
  onNewSignal: (symbol: string, timestamp: number) => void; // Add onNewSignal prop
  historicalSignals?: HistoricalSignal[]; // Add historicalSignals prop
  // Historical scanner props
  hasActiveFilter?: boolean;
  onRunHistoricalScan?: () => void;
  isHistoricalScanning?: boolean;
  historicalScanProgress?: HistoricalScanProgress | null;
  historicalScanConfig?: HistoricalScanConfig;
  onHistoricalScanConfigChange?: (config: HistoricalScanConfig) => void;
  onCancelHistoricalScan?: () => void;
  // Strategy selection
  onSetAiPrompt?: (prompt: string) => void;
  // Signal deduplication
  signalDedupeThreshold?: number;
  onSignalDedupeThresholdChange?: (threshold: number) => void;
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
  onNewSignal,
  historicalSignals = [],
  hasActiveFilter,
  onRunHistoricalScan,
  isHistoricalScanning,
  historicalScanProgress,
  historicalScanConfig,
  onHistoricalScanConfigChange,
  onCancelHistoricalScan,
  onSetAiPrompt,
  signalDedupeThreshold,
  onSignalDedupeThresholdChange,
}) => {
  return (
    <div className="w-full md:w-2/3 xl:w-3/4 flex-grow flex flex-col h-screen overflow-y-hidden">
      <div className="container mx-auto px-4 py-6 md:px-6 md:py-8 flex-grow flex flex-col overflow-y-auto">
        <main className="flex-grow flex flex-col">
          {initialLoading && <Loader text="Fetching initial market data..." />}
          <ErrorMessage message={initialError} />

          {!initialLoading && !initialError && (
            <>
              <ChartDisplay
                symbol={selectedSymbolForChart}
                klines={selectedSymbolForChart ? historicalData.get(selectedSymbolForChart) : undefined}
                indicators={chartConfigForDisplay}
                interval={klineInterval}
                signalLog={signalLog} // Pass signalLog to ChartDisplay
                historicalSignals={historicalSignals} // Pass historicalSignals to ChartDisplay
              />
              <div className="mt-6 flex-grow">
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
                />
              </div>
              {/* Hidden CryptoTable to keep screener running */}
              <div className="hidden">
                <CryptoTable
                  allSymbols={allSymbols}
                  tickers={tickers}
                  historicalData={historicalData}
                  currentFilterFn={currentFilterFn}
                  onRowClick={onRowClick}
                  onAiInfoClick={onAiInfoClick}
                  isLoading={initialLoading}
                  onNewSignal={onNewSignal}
                />
              </div>
            </>
          )}
        </main>
      </div>
      <footer className="text-center text-[var(--tm-text-muted)] py-3 text-xs md:text-sm border-t border-[var(--tm-border)]">
        <p>Powered by <span className="text-[var(--tm-secondary)]">Binance API</span> &amp; <span className="text-[var(--tm-accent)]">Gemini AI</span>. Not financial advice.</p>
      </footer>
    </div>
  );
};

export default MainContent;
