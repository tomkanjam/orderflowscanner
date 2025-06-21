
import React from 'react';
import { SignalLogEntry, KlineInterval } from '../types';
import { KLINE_INTERVALS } from '../constants';

interface SignalLogViewProps {
  signalLog: SignalLogEntry[];
}

const SignalLogView: React.FC<SignalLogViewProps> = ({ signalLog }) => {
  const getIntervalLabel = (intervalValue: KlineInterval): string => {
    const found = KLINE_INTERVALS.find(i => i.value === intervalValue);
    return found ? found.label.replace(' Minute', 'm').replace(' Hour', 'h').replace(' Day', 'd').replace('s', '') : intervalValue;
  };

  if (signalLog.length === 0) {
    return (
      <div className="bg-gray-800 shadow-lg rounded-lg p-4 h-full flex items-center justify-center">
        <p className="text-gray-500 text-center">No signals logged for the current filter yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 shadow-lg rounded-lg p-4 h-full flex flex-col">
      <h3 className="text-lg font-semibold text-yellow-400 mb-3 border-b border-gray-700 pb-2">Signal Log</h3>
      <div className="overflow-y-auto flex-grow pr-1">
        {signalLog.map((entry, index) => (
          <div key={index} className="text-xs text-gray-300 mb-2 pb-2 border-b border-gray-700/50 last:border-b-0 last:mb-0">
            <div className="flex justify-between items-center">
                <span className="font-semibold text-indigo-300">{entry.symbol}</span>
                <span className="text-gray-400">{new Date(entry.timestamp).toLocaleTimeString()}</span>
            </div>
            <div className="text-gray-400 text-[11px] mt-0.5">
                <span>{getIntervalLabel(entry.interval)}</span> | <span className="italic truncate" title={entry.filterDesc}>{entry.filterDesc}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default SignalLogView;
