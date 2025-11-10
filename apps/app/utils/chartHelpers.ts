import { CustomIndicatorConfig, IndicatorDataPoint } from '../types';

/**
 * Empty dataset structure for Chart.js
 */
export interface EmptyChartDataset {
  type: 'line' | 'bar';
  label: string;
  data: [];  // Always empty array, never null
  borderColor?: string;
  backgroundColor?: string | ((ctx: any) => string);
  borderWidth?: number;
  pointRadius?: number;
  fill?: boolean | { target: string; above?: string };
  borderDash?: number[];
}

/**
 * Creates empty dataset structure for Chart.js when indicator data is not yet available
 * This ensures charts render immediately with proper structure while calculating
 *
 * DEFENSIVE: Handles missing style property (legacy/malformed indicators)
 */
export function createEmptyDatasets(indicator: CustomIndicatorConfig): EmptyChartDataset[] {
  // Ensure style exists with defaults
  const style = indicator.style || { color: '#8efbba', lineWidth: 1.5 };

  if (indicator.chartType === 'bar') {
    return [{
      type: 'bar',
      label: indicator.name,
      data: [],
      backgroundColor: Array.isArray(style.color)
        ? style.color[0]
        : (style.color || '#9ca3af')
    }];
  }

  // Line chart - default
  return [{
    type: 'line',
    label: indicator.name,
    data: [],
    borderColor: Array.isArray(style.color)
      ? style.color[0]
      : (style.color || '#8efbba'),
    borderWidth: style.lineWidth || 1.5,
    pointRadius: 0,
    fill: false
  }];
}

/**
 * Creates populated datasets from calculated indicator data
 * Extracted from ChartDisplay.tsx for reusability
 *
 * DEFENSIVE: Handles missing style property (legacy/malformed indicators)
 */
export function createIndicatorDatasets(
  dataPoints: IndicatorDataPoint[],
  indicator: CustomIndicatorConfig
): any[] {
  const datasets: any[] = [];

  // Ensure style exists with defaults
  const style = indicator.style || { color: '#8efbba', lineWidth: 1.5 };

  if (indicator.chartType === 'bar') {
    // Bar chart (e.g., Volume, MACD Histogram)
    datasets.push({
      type: 'bar',
      label: indicator.name,
      data: dataPoints.map(p => ({x: p.x, y: p.y})),
      backgroundColor: (ctx: any) => {
        const point = dataPoints[ctx.dataIndex];
        if (point?.color) return point.color;

        // Default coloring based on positive/negative
        if (style.barColors) {
          const val = point?.y || 0;
          if (val > 0) return style.barColors.positive || '#10b981';
          if (val < 0) return style.barColors.negative || '#ef4444';
          return style.barColors.neutral || '#71717a';
        }

        return Array.isArray(style.color)
          ? style.color[0]
          : (style.color || '#9ca3af');
      }
    });
  } else if (indicator.chartType === 'line') {
    // Line chart (can be multi-line)
    const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);

    if (hasMultipleLines) {
      const colors = Array.isArray(style.color)
        ? style.color
        : [style.color || '#8efbba'];

      const lineNames = ['', ' Signal', ' Lower', ' 4th'];
      ['y', 'y2', 'y3', 'y4'].forEach((key, idx) => {
        const yKey = key as keyof IndicatorDataPoint;
        if (dataPoints.some(p => p[yKey] !== undefined)) {
          // Special handling for histogram-like data in MACD
          if (idx === 2 && indicator.name.toLowerCase().includes('macd')) {
            // MACD histogram as bars
            datasets.push({
              type: 'bar',
              label: `${indicator.name} Histogram`,
              data: dataPoints.map(p => ({x: p.x, y: p.y3})),
              backgroundColor: (ctx: any) => {
                const val = dataPoints[ctx.dataIndex]?.y3 || 0;
                return val >= 0 ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)';
              }
            });
          } else {
            // Regular line
            datasets.push({
              type: 'line',
              label: `${indicator.name}${lineNames[idx]}`,
              data: dataPoints.map(p => ({x: p.x, y: p[yKey]})),
              borderColor: colors[idx] || colors[0],
              borderWidth: style.lineWidth || 1.5,
              pointRadius: 0,
              fill: false,
              borderDash: idx > 0 && indicator.name.toLowerCase().includes('rsi') ? [5, 5] : undefined
            });
          }
        }
      });
    } else {
      // Single line
      datasets.push({
        type: 'line',
        label: indicator.name,
        data: dataPoints.map(p => ({x: p.x, y: p.y})),
        borderColor: Array.isArray(style.color)
          ? style.color[0]
          : (style.color || '#8efbba'),
        borderWidth: style.lineWidth || 1.5,
        pointRadius: 0,
        fill: style.fillColor ? {
          target: 'origin',
          above: style.fillColor
        } : false
      });
    }
  }

  return datasets;
}

/**
 * Loading state tracking for charts
 */
export interface ChartLoadingState {
  isLoading: boolean;
  startTime: number;
  error?: string;
}

/**
 * Creates a loading state entry for an indicator
 */
export function createLoadingState(): ChartLoadingState {
  return {
    isLoading: true,
    startTime: Date.now(),
    error: undefined
  };
}