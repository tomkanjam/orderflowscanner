# Chart.js Financial Charts - Quick Reference

## Package Versions (Project)

```json
{
  "chart.js": "^4.5.0",
  "chartjs-adapter-date-fns": "^3.0.0",
  "chartjs-chart-financial": "^0.2.1",
  "chartjs-plugin-zoom": "^2.2.0"
}
```

## Essential Imports

```typescript
import { Chart, registerables, Filler, ChartConfiguration } from 'chart.js';
import 'chartjs-adapter-date-fns';
import {
  CandlestickController,
  CandlestickElement,
  OhlcController,
  OhlcElement
} from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
```

## Data Structures

### Candlestick Data Point

```typescript
interface CandlestickDataPoint {
  x: number;  // timestamp (milliseconds)
  o: number;  // open price
  h: number;  // high price
  l: number;  // low price
  c: number;  // close price
}
```

### Indicator Data Point

```typescript
interface IndicatorDataPoint {
  x: number;               // timestamp
  y: number;               // primary value
  y2?: number;             // secondary value (e.g., signal line)
  y3?: number;             // tertiary value (e.g., histogram)
  y4?: number;             // quaternary value
  color?: string;          // optional color override
}
```

### Binance Kline Format

```typescript
type Kline = [
  number,   // [0] Open time (timestamp)
  string,   // [1] Open price
  string,   // [2] High price
  string,   // [3] Low price
  string,   // [4] Close price
  string,   // [5] Volume
  number,   // [6] Close time
  string,   // [7] Quote asset volume
  number,   // [8] Number of trades
  string,   // [9] Taker buy base asset volume
  string,   // [10] Taker buy quote asset volume
  string    // [11] Unused field (ignore)
];
```

## Chart Types

### Candlestick Chart

```typescript
type: 'candlestick'
data: CandlestickDataPoint[]
```

### OHLC Chart

```typescript
type: 'ohlc'
data: CandlestickDataPoint[]  // Same format as candlestick
```

### Line Chart

```typescript
type: 'line'
data: { x: number, y: number }[]
```

### Bar Chart

```typescript
type: 'bar'
data: { x: number, y: number }[]
```

## Scale Types

### Time Scale (for Financial Data)

```typescript
x: {
  type: 'time',
  time: {
    unit: 'minute' | 'hour' | 'day' | 'week' | 'month',
    displayFormats: {
      minute: 'HH:mm',
      hour: 'MMM d, HH:mm',
      day: 'MMM d',
      week: 'MMM d',
      month: 'MMM yyyy'
    },
    tooltipFormat: 'MMM d, yyyy HH:mm:ss'
  }
}
```

### Linear Scale (for Prices/Values)

```typescript
y: {
  type: 'linear',
  position: 'left' | 'right',
  min: number,        // optional
  max: number,        // optional
  ticks: {
    color: string,
    maxTicksLimit: number,
    callback: (value) => string
  }
}
```

## Common Plugin Configurations

### Zoom Plugin

```typescript
zoom: {
  limits: {
    x: {
      min: 'original',
      max: 'original',
      minRange: 60000 * 5  // 5 minutes in ms
    }
  },
  pan: {
    enabled: true,
    mode: 'x',
    threshold: 10,
    onPanComplete: ({ chart }) => { }
  },
  zoom: {
    wheel: {
      enabled: true,
      speed: 0.15
    },
    pinch: {
      enabled: true
    },
    mode: 'x',
    onZoomComplete: ({ chart }) => { }
  }
}
```

### Tooltip

```typescript
tooltip: {
  mode: 'index',
  intersect: false,
  animation: false,
  backgroundColor: '#131316',
  titleColor: '#f59e0b',
  bodyColor: '#f5f5f7',
  borderColor: '#3f3f46',
  borderWidth: 1,
  padding: 12,
  cornerRadius: 8,
  callbacks: {
    label: function(context) {
      return `${context.dataset.label}: ${context.parsed.y}`;
    }
  }
}
```

### Legend

```typescript
legend: {
  display: true,
  position: 'top',
  labels: {
    color: '#f5f5f7',
    boxWidth: 15,
    padding: 10,
    usePointStyle: true
  }
}
```

## Color Schemes (Project Theme)

```typescript
// Theme colors
const colors = {
  background: {
    primary: '#0a0a0b',
    secondary: '#131316',
    tertiary: '#1c1c21'
  },
  text: {
    primary: '#f5f5f7',
    muted: '#71717a',
    inverse: '#0a0a0b'
  },
  accent: '#f59e0b',      // Orange/yellow
  success: '#10b981',     // Green (bullish)
  danger: '#ef4444',      // Red (bearish)
  neutral: '#71717a',     // Gray
  indicator: '#8efbba',   // Mint green (default indicator)
  border: '#3f3f46'
};

// Candlestick colors
borderColor: {
  up: colors.success,
  down: colors.danger,
  unchanged: colors.neutral
}

// Volume bar colors
backgroundColor: (ctx) => {
  const isUp = close >= open;
  return isUp ? colors.success : colors.danger;
}
```

## Update Modes

```typescript
// No animation (fastest, for real-time)
chart.update('none');

// Default animation
chart.update();

// Specific mode
chart.update('resize');
chart.update('reset');
chart.update('active');
```

## Common Methods

```typescript
// Create chart
const chart = new Chart(canvas, config);

// Update data
chart.data.datasets[0].data = newData;
chart.update('none');

// Reset zoom
chart.resetZoom();

// Pan programmatically
chart.pan({ x: deltaX }, undefined, 'none');

// Zoom programmatically
chart.zoom(1.1); // 10% zoom in

// Destroy chart
chart.destroy();

// Get pixel for value
const x = chart.scales.x.getPixelForValue(timestamp);
const y = chart.scales.y.getPixelForValue(price);

// Get value for pixel
const timestamp = chart.scales.x.getValueForPixel(x);
const price = chart.scales.y.getValueForPixel(y);
```

## Plugin Structure

```typescript
const myPlugin = {
  id: 'uniqueId',

  // Lifecycle hooks (in order)
  beforeInit: (chart, args, options) => { },
  afterInit: (chart, args, options) => { },
  beforeUpdate: (chart, args, options) => { },
  afterUpdate: (chart, args, options) => { },
  beforeLayout: (chart, args, options) => { },
  afterLayout: (chart, args, options) => { },
  beforeDatasetsUpdate: (chart, args, options) => { },
  afterDatasetsUpdate: (chart, args, options) => { },
  beforeDatasetUpdate: (chart, args, options) => { },
  afterDatasetUpdate: (chart, args, options) => { },
  beforeRender: (chart, args, options) => { },
  afterRender: (chart, args, options) => { },
  beforeDraw: (chart, args, options) => { },
  afterDraw: (chart, args, options) => { },
  beforeDatasetsDraw: (chart, args, options) => { },
  afterDatasetsDraw: (chart, args, options) => { },
  beforeDatasetDraw: (chart, args, options) => { },
  afterDatasetDraw: (chart, args, options) => { },
  beforeEvent: (chart, args, options) => { },
  afterEvent: (chart, args, options) => { },
  beforeDestroy: (chart, args, options) => { },
  afterDestroy: (chart, args, options) => { }
};
```

## Chart.js Context Objects

```typescript
// Chart context
interface Chart {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  data: ChartData;
  options: ChartOptions;
  scales: { [key: string]: Scale };
  chartArea: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  };
  update: (mode?: string) => void;
  destroy: () => void;
  resetZoom: () => void;
  pan: (delta: any, undefined, mode?: string) => void;
  zoom: (scale: number) => void;
}

// Scale context
interface Scale {
  min: number;
  max: number;
  getPixelForValue: (value: number) => number;
  getValueForPixel: (pixel: number) => number;
}
```

## Performance Tips

```typescript
// 1. Disable animations
animation: false

// 2. Use 'none' update mode
chart.update('none');

// 3. Limit decimation
decimation: {
  enabled: true,
  algorithm: 'lttb',
  samples: 1000
}

// 4. Reduce point radius
pointRadius: 0

// 5. Disable hover interactions if not needed
interaction: {
  mode: false
}

// 6. Use parsing: false if data is already formatted
parsing: false

// 7. Batch updates
// Update multiple datasets, then call update() once
```

## Common Intervals

```typescript
type KlineInterval =
  | '1m' | '3m' | '5m' | '15m' | '30m'
  | '1h' | '2h' | '4h' | '6h' | '8h' | '12h'
  | '1d' | '3d' | '1w' | '1M';

// Time unit mapping
const intervalToUnit: Record<KlineInterval, TimeUnit> = {
  '1m': 'minute',
  '3m': 'minute',
  '5m': 'minute',
  '15m': 'minute',
  '30m': 'minute',
  '1h': 'hour',
  '2h': 'hour',
  '4h': 'hour',
  '6h': 'hour',
  '8h': 'hour',
  '12h': 'hour',
  '1d': 'day',
  '3d': 'day',
  '1w': 'week',
  '1M': 'month'
};
```

## Debugging Checklist

```typescript
// ✅ Components registered
Chart.register(...registerables, CandlestickController, ...);

// ✅ Canvas ref valid
if (!canvasRef.current) return;

// ✅ Data formatted correctly
const data: CandlestickDataPoint[] = [{ x: 123, o: 1, h: 2, l: 0.5, c: 1.5 }];

// ✅ Container has height
<div style={{ height: '400px' }}>
  <canvas ref={canvasRef}></canvas>
</div>

// ✅ Update called after data change
chart.data.datasets[0].data = newData;
chart.update('none');

// ✅ Chart destroyed on unmount
useEffect(() => {
  // ... create chart
  return () => chart.destroy();
}, []);

// ✅ Scale types correct
x: { type: 'time' }  // NOT 'timeseries' for candlestick spacing
y: { type: 'linear' }

// ✅ Date adapter imported
import 'chartjs-adapter-date-fns';
```

## External Resources

### Official Documentation
- **Chart.js Main Docs**: https://www.chartjs.org/docs/latest/
- **Chart.js API**: https://www.chartjs.org/docs/latest/api/
- **Financial Charts**: https://github.com/chartjs/chartjs-chart-financial
- **Zoom Plugin**: https://github.com/chartjs/chartjs-plugin-zoom

### Samples & Examples
- **Chart.js Samples**: https://www.chartjs.org/docs/latest/samples/
- **Financial Examples**: https://www.chartjs.org/chartjs-chart-financial/
- **Time Scale Samples**: https://www.chartjs.org/docs/latest/samples/scales/time-line.html

### Date Adapters
- **date-fns Adapter**: https://github.com/chartjs/chartjs-adapter-date-fns
- **Luxon Adapter**: https://github.com/chartjs/chartjs-adapter-luxon
- **Moment Adapter**: https://github.com/chartjs/chartjs-adapter-moment

### Community
- **Chart.js GitHub**: https://github.com/chartjs/Chart.js
- **Stack Overflow**: https://stackoverflow.com/questions/tagged/chart.js
- **Chart.js Slack**: https://chartjs-slack.herokuapp.com/

## Common Error Messages

### "Canvas is already in use"
```typescript
// Solution: Destroy previous chart before creating new one
if (chartRef.current) {
  chartRef.current.destroy();
}
chartRef.current = new Chart(canvas, config);
```

### "Incorrect data format for candlestick"
```typescript
// Solution: Ensure data has o, h, l, c properties
const data: CandlestickDataPoint[] = [
  { x: timestamp, o: open, h: high, l: low, c: close }
];
```

### "Time adapter not found"
```typescript
// Solution: Import adapter at top of file
import 'chartjs-adapter-date-fns';
```

### "Scale type 'time' is not registered"
```typescript
// Solution: Register all components
import { Chart, registerables } from 'chart.js';
Chart.register(...registerables);
```

### "Cannot read property 'getPixelForValue' of undefined"
```typescript
// Solution: Ensure scale exists before using
if (chart.scales.x) {
  const pixel = chart.scales.x.getPixelForValue(value);
}
```

This reference provides quick lookups for common Chart.js operations and configurations used in the project.
