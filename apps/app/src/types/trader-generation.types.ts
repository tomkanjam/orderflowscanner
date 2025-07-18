// Types for two-step trader generation

export interface TraderMetadata {
  suggestedName: string;
  description: string;
  filterConditions: string[];
  strategyInstructions: string;
  indicators: any[]; // Using any to match existing CustomIndicatorConfig
  riskParameters: {
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