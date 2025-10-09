/**
 * Sparkline Component
 *
 * Minimal line chart visualization for trend data
 * - Custom SVG implementation (zero dependencies)
 * - 32×12px default dimensions
 * - Memoized for performance
 */

import React, { useMemo } from 'react';
import { SparklineProps } from '../../types/sparkline.types';
import { generateSparklinePath } from '../../utils/sparklineHelpers';

export const Sparkline = React.memo<SparklineProps>(({
  data,
  width = 32,
  height = 12,
  color,
  className = ''
}) => {
  // Memoize SVG path calculation
  const path = useMemo(() => {
    return generateSparklinePath(data, width, height);
  }, [data, width, height]);

  // If no data or empty path, render empty SVG
  if (data.length === 0 || !path) {
    return (
      <svg
        width={width}
        height={height}
        className={className}
        aria-hidden="true"
      >
        <line
          x1="0"
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke={color}
          strokeWidth="1"
          opacity="0.3"
        />
      </svg>
    );
  }

  return (
    <svg
      width={width}
      height={height}
      className={className}
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
});

Sparkline.displayName = 'Sparkline';
