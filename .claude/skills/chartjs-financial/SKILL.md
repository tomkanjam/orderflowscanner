---
name: chartjs-financial
description: Expert guidance for Chart.js 4.x financial charts with candlesticks, real-time updates, indicators, and performance optimization
---

# Chart.js Financial Charts Skill

This skill provides comprehensive guidance for implementing, optimizing, and debugging Chart.js financial charts in the AI-powered Binance crypto screener project.

## Project Context

**Current Implementation:**
- Chart.js 4.5.0 with chartjs-chart-financial 0.2.1
- chartjs-adapter-date-fns for time scale support
- chartjs-plugin-zoom for pan/zoom functionality
- Main component: `apps/app/components/ChartDisplay.tsx`
- Helpers: `apps/app/utils/chartHelpers.ts`

**Key Features:**
- Candlestick price charts with custom plugins (crosshair, signal markers)
- Multi-panel indicator charts (RSI, MACD, Volume, etc.)
- Real-time WebSocket data updates from Binance
- Synchronized crosshair across all chart panels
- Pan/zoom with preserved state across updates
- Web Worker-based indicator calculations

## Core Chart.js Patterns

### 1. Chart Registration (Required Setup)

```typescript
import { Chart, registerables, Filler } from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement
} from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';

// MUST register all components before creating charts
Chart.register(
  ...registerables,
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement,
  Filler,
  zoomPlugin
);
```

### 2. Candlestick Chart Configuration

```typescript
// Data format for candlestick charts
interface CandlestickDataPoint {
  x: number;        // timestamp in milliseconds
  o: number;        // open price
  h: number;        // high price
  l: number;        // low price
  c: number;        // close price
}

// Basic candlestick chart
const config: ChartConfiguration = {
  type: 'candlestick',
  data: {
    datasets: [{
      label: 'BTC/USDT Price',
      data: candlestickData,
      yAxisID: 'yPrice',
      borderColor: {
        up: '#10b981',      // green for bullish
        down: '#ef4444',    // red for bearish
        unchanged: '#71717a' // gray for no change
      },
      color: {
        up: '#10b981',
        down: '#ef4444',
        unchanged: '#71717a'
      }
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    animation: false, // CRITICAL for real-time updates
    // ... see full configuration below
  }
};
```

### 3. Time Scale Configuration (Financial Data)

```typescript
scales: {
  x: {
    type: 'time',  // Use 'time' not 'timeseries' for proper spacing
    time: {
      unit: 'minute',  // or 'hour', 'day' based on interval
      displayFormats: {
        minute: 'HH:mm',
        hour: 'MMM d, HH:mm',
        day: 'MMM d'
      },
      tooltipFormat: 'MMM d, yyyy HH:mm:ss'
    },
    ticks: {
      color: '#d4d4d8',
      maxRotation: 0,
      autoSkip: true,
      autoSkipPadding: 15,
      source: 'data' // Use actual data points for ticks
    },
    grid: {
      display: false  // Cleaner look
    }
  },
  yPrice: {
    type: 'linear',
    position: 'left',
    ticks: {
      color: '#d4d4d8',
      callback: function(value) {
        // Format based on price magnitude
        return typeof value === 'number'
          ? value.toFixed(value < 1 ? 6 : 2)
          : value;
      }
    },
    grid: {
      display: false
    }
  }
}
```

### 4. Real-Time Data Updates

```typescript
// PATTERN: Update data without recreating chart
function updateChartData(chart: Chart, newKlines: Kline[]) {
  // Transform to candlestick format
  const candlestickData = newKlines.map(k => ({
    x: k[0],
    o: parseFloat(k[1]),
    h: parseFloat(k[2]),
    l: parseFloat(k[3]),
    c: parseFloat(k[4])
  }));

  // Save zoom state before update
  const currentMin = chart.scales.x.min;
  const currentMax = chart.scales.x.max;

  // Update dataset
  chart.data.datasets[0].data = candlestickData;

  // Restore zoom state
  chart.options.scales!.x!.min = currentMin;
  chart.options.scales!.x!.max = currentMax;

  // Update WITHOUT animation for performance
  chart.update('none');
}
```

### 5. Multi-Panel Indicator Charts

```typescript
// PATTERN: Separate chart instances for each panel
const panelChartRefs = useRef<(Chart | null)[]>([]);

// Create indicator panel chart
function createIndicatorPanel(
  canvas: HTMLCanvasElement,
  indicator: CustomIndicatorConfig,
  dataPoints: IndicatorDataPoint[]
) {
  return new Chart(canvas, {
    type: indicator.chartType || 'line',
    data: {
      datasets: createIndicatorDatasets(dataPoints, indicator)
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: indicator.name,
          align: 'left',
          font: { size: 11 }
        },
        zoom: {
          // Disable zoom on indicator panels
          pan: { enabled: false },
          zoom: { wheel: { enabled: false } }
        }
      },
      scales: {
        x: {
          type: 'time',
          time: { unit: 'minute' },
          ticks: { display: false }, // Hide labels on panels
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: indicator.yAxisConfig?.position || 'left',
          min: indicator.yAxisConfig?.min,
          max: indicator.yAxisConfig?.max,
          ticks: {
            color: '#d4d4d8',
            font: { size: 10 },
            maxTicksLimit: 5
          }
        }
      }
    }
  });
}

// Sync zoom/pan across all panels
function syncIndicatorCharts(mainChart: Chart, panelCharts: Chart[]) {
  const { min, max } = mainChart.scales.x;
  panelCharts.forEach(chart => {
    if (chart) {
      chart.options.scales!.x!.min = min;
      chart.options.scales!.x!.max = max;
      chart.update('none');
    }
  });
}
```

### 6. Custom Plugins

```typescript
// PATTERN: Crosshair plugin for synchronized cursor
const crosshairPlugin = {
  id: 'crosshair',
  events: ['mousemove', 'mouseout'],
  afterEvent: (chart: Chart, args: any, options: any) => {
    const { event } = args;

    if (event.type === 'mouseout') {
      delete (chart as any).crosshair;
      args.changed = true;
      return;
    }

    if (event.type === 'mousemove') {
      const rect = chart.canvas.getBoundingClientRect();
      const x = event.native.clientX - rect.left;
      const y = event.native.clientY - rect.top;

      (chart as any).crosshair = { x, y };

      // Sync across panels
      const dataX = chart.scales.x.getValueForPixel(x);
      if (options?.setCrosshairX) {
        options.setCrosshairX(dataX);
      }

      args.changed = true;
    }
  },
  afterDatasetsDraw: (chart: Chart, args: any, options: any) => {
    const { ctx } = chart;
    const crosshair = (chart as any).crosshair;

    if (!crosshair) return;

    const chartArea = chart.chartArea;
    const { x, y } = crosshair;

    ctx.save();

    // Draw vertical line
    ctx.beginPath();
    ctx.moveTo(x, chartArea.top);
    ctx.lineTo(x, chartArea.bottom);
    ctx.strokeStyle = 'rgba(113, 113, 122, 0.5)';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.stroke();

    // Draw horizontal line with price label (price chart only)
    if (chart.scales.yPrice && y >= chartArea.top && y <= chartArea.bottom) {
      ctx.beginPath();
      ctx.moveTo(chartArea.left, y);
      ctx.lineTo(chartArea.right, y);
      ctx.stroke();

      const price = chart.scales.yPrice.getValueForPixel(y);
      if (price) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.9)';
        ctx.fillRect(chartArea.right + 2, y - 10, 50, 20);
        ctx.fillStyle = '#0a0a0b';
        ctx.font = '11px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(price.toFixed(price < 1 ? 6 : 2), chartArea.right + 4, y + 3);
      }
    }

    ctx.restore();
  }
};

// Register plugin when creating chart
const chart = new Chart(canvas, {
  // ... config
  plugins: [crosshairPlugin, signalMarkerPlugin]
});
```

### 7. Pan & Zoom Configuration

```typescript
plugins: {
  zoom: {
    limits: {
      x: {
        min: 'original',  // Can't pan before first data point
        max: 'original',  // Can't pan after last data point
        minRange: 60000 * 5  // Minimum zoom: 5 candles
      }
    },
    pan: {
      enabled: true,
      mode: 'x',
      threshold: 10,  // Prevent accidental panning
      onPanComplete: ({ chart }) => {
        syncIndicatorCharts(chart);
      }
    },
    zoom: {
      wheel: {
        enabled: true,
        speed: 0.15,  // 15% zoom per scroll
        modifierKey: null  // No key required
      },
      pinch: {
        enabled: true  // Trackpad support
      },
      mode: 'x',  // X-axis only
      onZoomComplete: ({ chart }) => {
        syncIndicatorCharts(chart);
      }
    }
  }
}

// Custom horizontal pan with Shift+Scroll
canvas.addEventListener('wheel', (e: WheelEvent) => {
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
    e.preventDefault();
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    chart.pan({ x: -delta * 2 }, undefined, 'none');
    syncIndicatorCharts(chart);
  }
}, { passive: false });

// Double-click to reset zoom
canvas.ondblclick = () => {
  chart.resetZoom();
  syncIndicatorCharts(chart);
};
```

## Performance Optimization

### 1. Disable Animations for Real-Time Updates

```typescript
options: {
  animation: false,  // CRITICAL
  // Or use transition mode 'none' for updates
  // chart.update('none');
}
```

### 2. Optimize Tooltip Rendering

```typescript
plugins: {
  tooltip: {
    mode: 'index',
    intersect: false,
    animation: false,  // Faster tooltips
    callbacks: {
      // Cache formatters if possible
      label: function(context) {
        if (context.dataset.type === 'candlestick') {
          const ohlc = context.raw as CandlestickDataPoint;
          return `O:${ohlc.o.toFixed(4)} H:${ohlc.h.toFixed(4)} L:${ohlc.l.toFixed(4)} C:${ohlc.c.toFixed(4)}`;
        }
        return `${context.dataset.label}: ${context.parsed.y.toFixed(4)}`;
      }
    }
  }
}
```

### 3. Efficient Data Updates

```typescript
// ✅ GOOD: Update in place without recreating chart
chart.data.datasets[0].data = newData;
chart.update('none');

// ❌ BAD: Recreating chart on every update
chart.destroy();
chart = new Chart(canvas, config);
```

### 4. Use Web Workers for Indicator Calculations

```typescript
// See apps/app/hooks/useIndicatorWorker.ts
const { calculateIndicators } = useIndicatorWorker();

// Offload heavy calculations
const results = await calculateIndicators(indicators, klines);
```

## Common Patterns

### Adding Overlay Indicators (e.g., Moving Averages)

```typescript
// Add to price chart datasets
priceChartDatasets.push({
  type: 'line',
  label: 'SMA 20',
  data: smaData.map(p => ({ x: p.x, y: p.y })),
  borderColor: '#8efbba',
  borderWidth: 1.5,
  pointRadius: 0,
  yAxisID: 'yPrice',
  fill: false
});
```

### Creating Bar Charts (e.g., Volume, MACD Histogram)

```typescript
// Bar dataset with conditional coloring
{
  type: 'bar',
  label: 'Volume',
  data: volumeData.map(p => ({ x: p.x, y: p.y })),
  backgroundColor: (ctx: any) => {
    const point = volumeData[ctx.dataIndex];
    return point.color || '#9ca3af';
  },
  yAxisID: 'yVolume'
}
```

### Multi-Line Indicators (e.g., Bollinger Bands)

```typescript
// Create separate dataset for each line
const colors = ['#8efbba', '#fbbf24', '#fbbf24'];
const lineNames = ['', ' Upper', ' Lower'];

['y', 'y2', 'y3'].forEach((key, idx) => {
  const yKey = key as keyof IndicatorDataPoint;
  datasets.push({
    type: 'line',
    label: `${indicator.name}${lineNames[idx]}`,
    data: dataPoints.map(p => ({ x: p.x, y: p[yKey] })),
    borderColor: colors[idx],
    borderWidth: 1.5,
    pointRadius: 0,
    yAxisID: 'yPrice'
  });
});
```

## Debugging & Troubleshooting

### Chart Not Rendering

**Check:**
1. All components registered with `Chart.register(...)`
2. Canvas ref is valid: `canvasRef.current !== null`
3. Data format matches expected structure
4. Container has explicit height (Chart.js requires height)

```typescript
// Container must have height
<div style={{ height: '480px' }}>
  <canvas ref={canvasRef}></canvas>
</div>
```

### Data Not Updating

**Common issues:**
1. Not calling `chart.update()` after data change
2. Chart instance destroyed but still referenced
3. Using wrong update mode (use `'none'` for real-time)

```typescript
// Ensure chart exists and update properly
if (chart && chart.data.datasets[0]) {
  chart.data.datasets[0].data = newData;
  chart.update('none');
}
```

### Zoom State Lost on Update

**Solution:** Save and restore zoom state

```typescript
const currentMin = chart.scales.x.min;
const currentMax = chart.scales.x.max;

// ... update data ...

chart.options.scales!.x!.min = currentMin;
chart.options.scales!.x!.max = currentMax;
chart.update('none');
```

### Plugins Not Working

**Check:**
1. Plugin registered: `plugins: [myPlugin]` in config
2. Plugin ID is unique
3. Event handlers properly defined

```typescript
const myPlugin = {
  id: 'uniquePluginId',  // Must be unique
  afterDatasetsDraw: (chart, args, options) => {
    // Implementation
  }
};

new Chart(canvas, {
  plugins: [myPlugin],  // Register here
  options: {
    plugins: {
      uniquePluginId: {  // Pass options here
        customOption: true
      }
    }
  }
});
```

## Best Practices

### 1. Chart Lifecycle Management

```typescript
useEffect(() => {
  // Create chart
  const chart = new Chart(canvas, config);

  // Cleanup on unmount
  return () => {
    chart.destroy();
  };
}, [symbol, interval]); // Only recreate when necessary
```

### 2. Separate Data Updates from Chart Creation

```typescript
// Effect 1: Create/destroy chart structure
useEffect(() => {
  // Create chart with empty/initial data
}, [symbol, interval]);

// Effect 2: Update data without recreating
useEffect(() => {
  // Update chart.data only
}, [klines, calculatedIndicators]);
```

### 3. Memory Management

```typescript
// Always destroy charts when done
function destroyAllCharts() {
  panelCharts.forEach(chart => {
    if (chart) chart.destroy();
  });
  panelCharts = [];

  if (priceChart) {
    priceChart.destroy();
    priceChart = null;
  }
}
```

### 4. Type Safety

```typescript
// Use proper types for Chart.js
import type { Chart, ChartConfiguration, ChartEvent } from 'chart.js';

// Type your data properly
interface CandlestickDataPoint {
  x: number;
  o: number;
  h: number;
  l: number;
  c: number;
}
```

## Project-Specific Patterns

### Tier Access for Chart Features

```typescript
// Check user tier before enabling features
if (userTier === 'Elite') {
  // Enable advanced chart features
  chartOptions.plugins.annotation = { /* AI analysis overlays */ };
}
```

### Integration with Binance WebSocket

```typescript
// Update chart when new kline data arrives
useEffect(() => {
  if (!socket) return;

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    if (data.e === 'kline') {
      // Update chart with new candle
      updateChartData(chart, data.k);
    }
  };
}, [socket, chart]);
```

### Signal Markers Plugin

```typescript
// Mark signals on chart with colored bars
const signalMarkerPlugin = {
  id: 'signalMarkers',
  afterDatasetsDraw: (chart, args, options) => {
    const { signalLog, historicalSignals } = options;
    const { ctx } = chart;

    // Filter signals for current symbol/interval
    const relevantSignals = signalLog.filter(
      s => s.symbol === selectedSymbol && s.interval === currentInterval
    );

    // Draw vertical bars at signal timestamps
    relevantSignals.forEach(signal => {
      const x = chart.scales.x.getPixelForValue(signal.timestamp);
      ctx.fillStyle = 'rgba(245, 158, 11, 0.3)';
      ctx.fillRect(x - 5, chartArea.top, 10, chartArea.height);
    });
  }
};
```

## References

- **Chart.js Docs:** https://www.chartjs.org/docs/latest/
- **Financial Plugin:** https://github.com/chartjs/chartjs-chart-financial
- **Zoom Plugin:** https://github.com/chartjs/chartjs-plugin-zoom
- **Time Scale:** https://www.chartjs.org/docs/latest/axes/cartesian/time.html
- **Date Adapters:** https://github.com/chartjs/awesome#adapters

## When to Use This Skill

Use this skill when:
- Implementing new chart types or indicators
- Debugging chart rendering or update issues
- Optimizing chart performance for real-time data
- Adding custom plugins or features
- Configuring zoom, pan, or interaction behavior
- Troubleshooting candlestick or financial chart display
- Synchronizing multiple chart panels
- Integrating with WebSocket data streams

## Implementation Checklist

When working with charts in this project:
- [ ] Register all Chart.js components before use
- [ ] Set `animation: false` for real-time updates
- [ ] Use `chart.update('none')` for performance
- [ ] Preserve zoom/pan state across updates
- [ ] Sync indicator panels with main chart
- [ ] Destroy charts properly on unmount
- [ ] Type data structures correctly
- [ ] Test with various intervals (1m, 5m, 1h, etc.)
- [ ] Verify mobile/trackpad gestures work
- [ ] Check tooltip performance with many indicators
