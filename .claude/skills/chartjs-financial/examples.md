# Chart.js Financial Charts - Code Examples

## Complete Working Examples from Project

### 1. Full Price Chart with Candlesticks and Overlays

```typescript
// From: apps/app/components/ChartDisplay.tsx

import React, { useEffect, useRef } from 'react';
import { Chart, registerables, Filler, ChartConfiguration } from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement
} from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';

// Register components
Chart.register(
  ...registerables,
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement,
  Filler,
  zoomPlugin
);

function PriceChart({ symbol, klines, overlayIndicators }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !klines || klines.length === 0) return;

    // Destroy existing chart
    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Transform klines to candlestick format
    const candlestickData = klines.map(k => ({
      x: k[0],                  // timestamp
      o: parseFloat(k[1]),      // open
      h: parseFloat(k[2]),      // high
      l: parseFloat(k[3]),      // low
      c: parseFloat(k[4])       // close
    }));

    // Start with candlestick dataset
    const datasets: any[] = [{
      label: `${symbol} Price`,
      data: candlestickData,
      yAxisID: 'yPrice',
      borderColor: {
        up: '#10b981',
        down: '#ef4444',
        unchanged: '#71717a'
      },
      color: {
        up: '#10b981',
        down: '#ef4444',
        unchanged: '#71717a'
      }
    }];

    // Add overlay indicators (e.g., SMA, EMA, Bollinger Bands)
    overlayIndicators?.forEach(indicator => {
      const dataPoints = indicator.calculatedData || [];

      if (dataPoints.length === 0) return;

      // Check if multi-line (e.g., Bollinger Bands with upper/lower)
      const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);

      if (hasMultipleLines) {
        const colors = Array.isArray(indicator.style.color)
          ? indicator.style.color
          : [indicator.style.color || '#8efbba'];

        const lineNames = ['', ' Upper', ' Lower'];
        ['y', 'y2', 'y3'].forEach((key, idx) => {
          const yKey = key as keyof typeof dataPoints[0];
          if (dataPoints.some(p => p[yKey] !== undefined)) {
            datasets.push({
              type: 'line',
              label: `${indicator.name}${lineNames[idx]}`,
              data: dataPoints.map(p => ({ x: p.x, y: p[yKey] })),
              borderColor: colors[idx] || colors[0],
              borderWidth: indicator.style.lineWidth || 1.5,
              pointRadius: 0,
              yAxisID: 'yPrice'
            });
          }
        });
      } else {
        // Single line indicator
        datasets.push({
          type: 'line',
          label: indicator.name,
          data: dataPoints.map(p => ({ x: p.x, y: p.y })),
          borderColor: Array.isArray(indicator.style.color)
            ? indicator.style.color[0]
            : (indicator.style.color || '#8efbba'),
          borderWidth: indicator.style.lineWidth || 1.5,
          pointRadius: 0,
          yAxisID: 'yPrice'
        });
      }
    });

    // Create chart
    chartRef.current = new Chart(canvasRef.current, {
      type: 'candlestick',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        interaction: {
          mode: 'x',
          intersect: false
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: '#f5f5f7',
              boxWidth: 15,
              padding: 10
            }
          },
          title: {
            display: true,
            text: `${symbol} - Chart`,
            color: '#f5f5f7'
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#131316',
            titleColor: '#f59e0b',
            bodyColor: '#f5f5f7',
            callbacks: {
              label: function(context) {
                if (context.dataset.type === 'candlestick') {
                  const ohlc = context.raw as any;
                  return `O:${ohlc.o.toFixed(4)} H:${ohlc.h.toFixed(4)} L:${ohlc.l.toFixed(4)} C:${ohlc.c.toFixed(4)}`;
                }
                return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
              }
            }
          },
          zoom: {
            limits: {
              x: {
                min: 'original',
                max: 'original',
                minRange: 60000 * 5
              }
            },
            pan: {
              enabled: true,
              mode: 'x'
            },
            zoom: {
              wheel: {
                enabled: true,
                speed: 0.15
              },
              pinch: {
                enabled: true
              },
              mode: 'x'
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'minute' },
            ticks: {
              color: '#d4d4d8',
              maxRotation: 0,
              autoSkip: true
            },
            grid: { display: false }
          },
          yPrice: {
            type: 'linear',
            position: 'left',
            ticks: { color: '#d4d4d8' },
            grid: { display: false }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [symbol, klines, overlayIndicators]);

  return (
    <div style={{ height: '400px' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
```

### 2. Indicator Panel Chart (RSI Example)

```typescript
// From: apps/app/components/ChartDisplay.tsx

function RSIIndicatorPanel({ rsiData, syncedMinX, syncedMaxX }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !rsiData || rsiData.length === 0) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // RSI typically has main line + overbought/oversold levels
    const datasets = [
      {
        type: 'line',
        label: 'RSI',
        data: rsiData.map(p => ({ x: p.x, y: p.y })),
        borderColor: '#8efbba',
        borderWidth: 1.5,
        pointRadius: 0
      },
      {
        type: 'line',
        label: 'Overbought (70)',
        data: rsiData.map(p => ({ x: p.x, y: 70 })),
        borderColor: '#ef4444',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0
      },
      {
        type: 'line',
        label: 'Oversold (30)',
        data: rsiData.map(p => ({ x: p.x, y: 30 })),
        borderColor: '#10b981',
        borderWidth: 1,
        borderDash: [5, 5],
        pointRadius: 0
      }
    ];

    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: { datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'RSI (14)',
            align: 'left',
            font: { size: 11 }
          },
          zoom: {
            pan: { enabled: false },
            zoom: { wheel: { enabled: false } }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'minute' },
            min: syncedMinX,
            max: syncedMaxX,
            ticks: { display: false },
            grid: { display: false }
          },
          y: {
            type: 'linear',
            position: 'left',
            min: 0,
            max: 100,
            ticks: {
              color: '#d4d4d8',
              maxTicksLimit: 5
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [rsiData, syncedMinX, syncedMaxX]);

  return (
    <div style={{ height: '150px' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
```

### 3. Volume Bar Chart

```typescript
function VolumeChart({ volumeData, klines }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    if (!canvasRef.current || !volumeData || !klines) return;

    if (chartRef.current) {
      chartRef.current.destroy();
    }

    // Color bars based on price direction
    const coloredVolumeData = volumeData.map((v, idx) => {
      const kline = klines[idx];
      const close = parseFloat(kline[4]);
      const open = parseFloat(kline[1]);

      return {
        x: v.x,
        y: v.y,
        color: close >= open ? '#10b981' : '#ef4444'
      };
    });

    chartRef.current = new Chart(canvasRef.current, {
      type: 'bar',
      data: {
        datasets: [{
          label: 'Volume',
          data: coloredVolumeData.map(v => ({ x: v.x, y: v.y })),
          backgroundColor: (ctx: any) => {
            const data = coloredVolumeData[ctx.dataIndex];
            return data ? data.color : '#71717a';
          },
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: 'Volume',
            align: 'left'
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { unit: 'minute' },
            ticks: { display: false },
            grid: { display: false }
          },
          y: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: '#d4d4d8',
              callback: function(value) {
                // Format large numbers (e.g., 1.5M)
                if (value >= 1000000) {
                  return (value / 1000000).toFixed(1) + 'M';
                }
                if (value >= 1000) {
                  return (value / 1000).toFixed(1) + 'K';
                }
                return value;
              }
            }
          }
        }
      }
    });

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
      }
    };
  }, [volumeData, klines]);

  return (
    <div style={{ height: '120px' }}>
      <canvas ref={canvasRef}></canvas>
    </div>
  );
}
```

### 4. Real-Time Data Update Pattern

```typescript
// From: apps/app/components/ChartDisplay.tsx

// Effect to update chart data without recreating the chart
useEffect(() => {
  if (!chartRef.current || !klines || klines.length === 0) return;

  const chart = chartRef.current;

  // Transform new klines
  const candlestickData = klines.map(k => ({
    x: k[0],
    o: parseFloat(k[1]),
    h: parseFloat(k[2]),
    l: parseFloat(k[3]),
    c: parseFloat(k[4])
  }));

  // Save zoom state
  const currentMin = chart.scales.x.min;
  const currentMax = chart.scales.x.max;

  // Update candlestick data
  chart.data.datasets[0].data = candlestickData;

  // Update overlay indicators
  overlayIndicators?.forEach((indicator, idx) => {
    const dataPoints = indicator.calculatedData || [];
    if (dataPoints.length > 0 && chart.data.datasets[idx + 1]) {
      chart.data.datasets[idx + 1].data = dataPoints.map(p => ({
        x: p.x,
        y: p.y
      }));
    }
  });

  // Restore zoom state
  chart.options.scales!.x!.min = currentMin;
  chart.options.scales!.x!.max = currentMax;

  // Update without animation
  chart.update('none');

  // Sync indicator panels
  syncIndicatorCharts(chart);

}, [klines, overlayIndicators]);
```

### 5. Custom Crosshair Plugin

```typescript
// From: apps/app/components/ChartDisplay.tsx

const crosshairPlugin = {
  id: 'crosshair',
  events: ['mousemove', 'mouseout'],

  afterEvent: (chart: Chart, args: any, options: any) => {
    const { event } = args;

    if (event.type === 'mouseout') {
      delete (chart as any).crosshair;
      const pluginOptions = chart.options.plugins?.crosshair as any;
      if (pluginOptions?.setCrosshairX) {
        pluginOptions.setCrosshairX(null);
      }
      args.changed = true;
      return;
    }

    if (event.type !== 'mousemove') return;

    // Get mouse position
    const rect = chart.canvas.getBoundingClientRect();
    const x = event.native.clientX - rect.left;
    const y = event.native.clientY - rect.top;

    // Store position
    (chart as any).crosshair = { x, y };

    // Sync X position across charts
    const pluginOptions = chart.options.plugins?.crosshair as any;
    if (pluginOptions?.setCrosshairX && chart.scales.x) {
      const dataX = chart.scales.x.getValueForPixel(x);
      pluginOptions.setCrosshairX(dataX);
    }

    args.changed = true;
  },

  afterDatasetsDraw: (chart: Chart, args: any, options: any) => {
    const { ctx } = chart;
    const crosshair = (chart as any).crosshair;
    const chartArea = chart.chartArea;
    const pluginOptions = chart.options.plugins?.crosshair as any;

    // Use synced X position if available
    let x, y;
    if (pluginOptions?.crosshairX !== undefined &&
        pluginOptions?.crosshairX !== null &&
        chart.scales.x) {
      try {
        x = chart.scales.x.getPixelForValue(pluginOptions.crosshairX);
        y = crosshair?.y || chartArea.top + chartArea.height / 2;
      } catch (e) {
        if (crosshair) {
          x = crosshair.x;
          y = crosshair.y;
        } else {
          return;
        }
      }
    } else if (crosshair) {
      x = crosshair.x;
      y = crosshair.y;
    } else {
      return;
    }

    // Check if inside chart area
    if (x < chartArea.left || x > chartArea.right) return;

    ctx.save();

    // Vertical line
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.strokeStyle = 'rgba(113, 113, 122, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();

    // Horizontal line with price (price chart only)
    if (chart.scales.yPrice && crosshair &&
        y >= chartArea.top && y <= chartArea.bottom) {
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();

      // Price label
      const price = chart.scales.yPrice.getValueForPixel(y);
      if (price) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.fillRect(chartArea.right + 2, y - 10, 50, 20);
        ctx.fillStyle = '#0a0a0b';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(
          price.toFixed(price < 1 ? 6 : 2),
          chartArea.right + 4,
          y + 3
        );
      }
    }

    ctx.restore();
  }
};

// Usage
const chart = new Chart(canvas, {
  // ... config
  plugins: [crosshairPlugin],
  options: {
    plugins: {
      crosshair: {
        setCrosshairX: setCrosshairX  // Function to sync across charts
      } as any
    }
  }
});
```

### 6. Signal Marker Plugin

```typescript
// From: apps/app/components/ChartDisplay.tsx

const signalMarkerPlugin = {
  id: 'signalMarkers',

  afterDatasetsDraw: (chart: Chart, args: any, options: {
    signalLog: SignalLogEntry[],
    historicalSignals: HistoricalSignal[],
    selectedSymbol: string | null,
    currentInterval: KlineInterval
  }) => {
    const { ctx } = chart;
    const { signalLog, historicalSignals, selectedSymbol, currentInterval } = options;

    if (!selectedSymbol) return;

    // Filter signals for current symbol/interval
    const relevantLiveSignals = signalLog.filter(
      log => log.symbol === selectedSymbol && log.interval === currentInterval
    );

    const relevantHistoricalSignals = historicalSignals.filter(
      signal => signal.symbol === selectedSymbol && signal.interval === currentInterval
    );

    const allSignals = [
      ...relevantLiveSignals.map(s => ({ timestamp: s.timestamp })),
      ...relevantHistoricalSignals.map(s => ({ timestamp: s.klineTimestamp }))
    ];

    if (allSignals.length === 0) return;

    ctx.save();
    ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';

    const xAxis = chart.scales.x;
    const chartArea = chart.chartArea;

    // Calculate marker width based on candle spacing
    const klinePoints = chart.data.datasets[0]?.data as any[];
    let markerWidth = 10;

    if (klinePoints && klinePoints.length > 1) {
      const firstX = xAxis.getPixelForValue(klinePoints[0].x);
      const secondX = xAxis.getPixelForValue(klinePoints[1].x);
      if (!isNaN(firstX) && !isNaN(secondX)) {
        markerWidth = Math.abs(secondX - firstX) * 0.8;
      }
    }

    markerWidth = Math.max(2, Math.min(markerWidth, 15));

    // Draw signal markers
    allSignals.forEach(signal => {
      const xPixel = xAxis.getPixelForValue(signal.timestamp);

      if (xPixel >= chartArea.left && xPixel <= chartArea.right) {
        ctx.fillRect(
          xPixel - markerWidth / 2,
          chartArea.top,
          markerWidth,
          chartArea.height
        );
      }
    });

    ctx.restore();
  }
};

// Usage
const chart = new Chart(canvas, {
  plugins: [signalMarkerPlugin],
  options: {
    plugins: {
      signalMarkers: {
        signalLog: signalLog,
        historicalSignals: historicalSignals,
        selectedSymbol: symbol,
        currentInterval: interval
      } as any
    }
  }
});
```

### 7. Horizontal Pan Handler

```typescript
// From: apps/app/components/ChartDisplay.tsx

// Custom wheel handler for Shift+Scroll horizontal panning
const handleWheelEvent = (e: WheelEvent) => {
  if (!chartRef.current) return;

  const isHorizontalGesture = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const isShiftScroll = e.shiftKey && e.deltaY !== 0;

  if (isHorizontalGesture || isShiftScroll) {
    e.preventDefault();

    // Temporarily disable zoom
    if (chartRef.current.options.plugins?.zoom) {
      chartRef.current.options.plugins.zoom.zoom.wheel.enabled = false;
    }

    // Pan horizontally
    const delta = isHorizontalGesture ? e.deltaX : e.deltaY;
    chartRef.current.pan({ x: -delta * 2 }, undefined, 'none');

    // Sync with indicator panels
    syncIndicatorCharts(chartRef.current);

    // Re-enable zoom after timeout
    setTimeout(() => {
      if (chartRef.current?.options?.plugins?.zoom) {
        chartRef.current.options.plugins.zoom.zoom.wheel.enabled = true;
      }
    }, 100);
  }
};

// Attach listener
canvas.addEventListener('wheel', handleWheelEvent, { passive: false });

// Cleanup
return () => {
  canvas.removeEventListener('wheel', handleWheelEvent);
};
```

### 8. Chart Synchronization

```typescript
// From: apps/app/components/ChartDisplay.tsx

// Sync zoom/pan across all indicator panels
const syncIndicatorCharts = useCallback((mainChart: Chart) => {
  const { min, max } = mainChart.scales.x;

  panelChartRefs.current.forEach(chart => {
    if (chart) {
      chart.options.scales!.x!.min = min;
      chart.options.scales!.x!.max = max;
      chart.update('none');
    }
  });
}, []);

// Use in zoom/pan callbacks
plugins: {
  zoom: {
    pan: {
      onPanComplete: ({ chart }) => {
        syncIndicatorCharts(chart);
      }
    },
    zoom: {
      onZoomComplete: ({ chart }) => {
        syncIndicatorCharts(chart);
      }
    }
  }
}
```

## Helper Functions

### Dataset Creation

```typescript
// From: apps/app/utils/chartHelpers.ts

export function createIndicatorDatasets(
  dataPoints: IndicatorDataPoint[],
  indicator: CustomIndicatorConfig
): any[] {
  const datasets: any[] = [];

  if (indicator.chartType === 'bar') {
    datasets.push({
      type: 'bar',
      label: indicator.name,
      data: dataPoints.map(p => ({ x: p.x, y: p.y })),
      backgroundColor: (ctx: any) => {
        const point = dataPoints[ctx.dataIndex];
        if (point?.color) return point.color;

        if (indicator.style.barColors) {
          const val = point?.y || 0;
          if (val > 0) return indicator.style.barColors.positive;
          if (val < 0) return indicator.style.barColors.negative;
          return indicator.style.barColors.neutral;
        }

        return indicator.style.color || '#9ca3af';
      }
    });
  } else {
    // Line chart logic
    const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);

    if (hasMultipleLines) {
      const colors = Array.isArray(indicator.style.color)
        ? indicator.style.color
        : [indicator.style.color || '#8efbba'];

      ['y', 'y2', 'y3', 'y4'].forEach((key, idx) => {
        const yKey = key as keyof IndicatorDataPoint;
        if (dataPoints.some(p => p[yKey] !== undefined)) {
          datasets.push({
            type: 'line',
            label: `${indicator.name} Line ${idx + 1}`,
            data: dataPoints.map(p => ({ x: p.x, y: p[yKey] })),
            borderColor: colors[idx] || colors[0],
            borderWidth: indicator.style.lineWidth || 1.5,
            pointRadius: 0
          });
        }
      });
    } else {
      datasets.push({
        type: 'line',
        label: indicator.name,
        data: dataPoints.map(p => ({ x: p.x, y: p.y })),
        borderColor: indicator.style.color || '#8efbba',
        borderWidth: indicator.style.lineWidth || 1.5,
        pointRadius: 0
      });
    }
  }

  return datasets;
}
```

These examples demonstrate real, production-ready patterns from the project. Copy and adapt them for your specific use case.
