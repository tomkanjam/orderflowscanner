/**
 * UpdateFrequencyMetric Component
 *
 * Displays WebSocket update frequency with sparkline visualization
 * - Health-based color coding
 * - Responsive (hidden on mobile <768px)
 */

import React, { useMemo } from 'react';
import { Sparkline } from './micro/Sparkline';
import { UpdateFrequencyMetricProps } from '../types/sparkline.types';
import {
  calculateHealthStatus,
  getHealthConfig,
  formatFrequency
} from '../utils/sparklineHelpers';

export const UpdateFrequencyMetric = React.memo<UpdateFrequencyMetricProps>(({
  frequency,
  history,
  className = ''
}) => {
  // Calculate health status and get configuration
  const healthStatus = useMemo(() => calculateHealthStatus(frequency), [frequency]);
  const healthConfig = useMemo(() => getHealthConfig(healthStatus), [healthStatus]);

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {/* Sparkline - Hidden on mobile */}
      <div className="hidden md:block">
        <Sparkline
          data={history}
          width={32}
          height={12}
          color={healthConfig.color}
        />
      </div>

      {/* Frequency Text */}
      <span className="text-xs">{formatFrequency(frequency)}</span>
    </div>
  );
});

UpdateFrequencyMetric.displayName = 'UpdateFrequencyMetric';
