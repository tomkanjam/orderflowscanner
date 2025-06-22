
import React from 'react';
import { Ticker, Kline, CustomIndicatorConfig, KlineInterval, SignalLogEntry, VolumeNode } from '../types';
import SignalTable from './SignalTable';
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
  hvnData: Map<string, VolumeNode[]>; // Add hvnData prop
  currentFilterFn: ((ticker: Ticker, klines: Kline[], helpers: ScreenerHelpersType, hvnNodes: VolumeNode[]) => boolean) | null;
  klineInterval: KlineInterval;
  selectedSymbolForChart: string | null;
  chartConfigForDisplay: CustomIndicatorConfig[] | null;
  onRowClick: (symbol: string) => void;
  onAiInfoClick: (symbol: string, event: React.MouseEvent) => void;
  signalLog: SignalLogEntry[]; // Add signalLog prop
  onNewSignal: (symbol: string, timestamp: number) => void; // Add onNewSignal prop
}

const MainContent: React.FC<MainContentProps> = ({
  statusText,
  statusLightClass,
  initialLoading,
  initialError,
  allSymbols,
  tickers,
  historicalData,
  hvnData,
  currentFilterFn,
  klineInterval,
  selectedSymbolForChart,
  chartConfigForDisplay,
  onRowClick,
  onAiInfoClick,
  signalLog, 
  onNewSignal,
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
                hvnNodes={selectedSymbolForChart ? hvnData.get(selectedSymbolForChart) : undefined}
              />
              <div className="mt-6 flex-grow">
                <SignalTable
                  signalLog={signalLog}
                  tickers={tickers}
                  onRowClick={onRowClick}
                  onAiInfoClick={onAiInfoClick}
                  isLoading={initialLoading}
                />
              </div>
              {/* Hidden CryptoTable to keep screener running */}
              <div className="hidden">
                <CryptoTable
                  allSymbols={allSymbols}
                  tickers={tickers}
                  historicalData={historicalData}
                  hvnData={hvnData}
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
      <footer className="text-center text-gray-500 py-3 text-xs md:text-sm border-t border-gray-700">
        <p>Powered by Binance API &amp; Gemini AI. Not financial advice.</p>
      </footer>
    </div>
  );
};

export default MainContent;
