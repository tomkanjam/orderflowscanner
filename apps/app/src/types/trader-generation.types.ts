// Types for two-step trader generation

export interface TraderMetadata {
  suggestedName: string;
  category?: string;
  conditions: string[]; // Changed from filterConditions to match backend
  strategyInstructions: string;
  timeframe?: string;
  riskLevel?: string;
  expectedWinRate?: number;
  indicators?: any[]; // Using any to match existing CustomIndicatorConfig
  riskParameters?: {
    stopLoss?: number;
    takeProfit?: number;
    maxPositions?: number;
    positionSizePercent?: number;
    maxDrawdown?: number;
  };
}

export interface FilterCodeResult {
  filterCode: string;
  requiredTimeframes: string[];
}

export interface StreamingUpdate {
  type: 'progress' | 'condition' | 'strategy' | 'indicator' | 'complete' | 'error';
  condition?: string;
  strategyText?: string;
  indicator?: any;
  progress?: number;
  error?: Error;
  metadata?: Partial<TraderMetadata>;
}