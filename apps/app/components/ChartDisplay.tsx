import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Chart, registerables, Filler, ChartConfiguration } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Kline, CustomIndicatorConfig, CandlestickDataPoint, SignalLogEntry, HistoricalSignal, KlineInterval, IndicatorDataPoint } from '../types';
import { useIndicatorWorker } from '../hooks/useIndicatorWorker';

Chart.register(...registerables, CandlestickController, CandlestickElement, OhlcController, OhlcElement, Filler, zoomPlugin);

interface ChartDisplayProps {
  symbol: string | null;
  klines: Kline[] | undefined;
  indicators: CustomIndicatorConfig[] | null;
  interval: KlineInterval; 
  signalLog: SignalLogEntry[];
  historicalSignals?: HistoricalSignal[];
}

// Signal marker plugin for highlighting signals on the chart
const signalMarkerPlugin = {
    id: 'signalMarkers',
    afterDatasetsDraw: (chart: Chart, args: any, options: { signalLog: SignalLogEntry[], historicalSignals: HistoricalSignal[], selectedSymbol: string | null, currentInterval: KlineInterval }) => {
        const { ctx } = chart;
        const { signalLog, historicalSignals, selectedSymbol, currentInterval } = options;

        if (!selectedSymbol) {
            return;
        }

        // Combine live and historical signals
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
        
        if(allSignals.length === 0) return;

        ctx.save();
        ctx.fillStyle = 'rgba(245, 158, 11, 0.3)'; // Accent yellow highlight

        const xAxis = chart.scales.x;
        const yAxis = chart.scales.yPrice || chart.scales.y; 

        if (!yAxis) return; 

        const chartArea = chart.chartArea;

        allSignals.forEach(signal => {
            const xPixel = xAxis.getPixelForValue(signal.timestamp);
            
            const klinePoints = chart.data.datasets[0]?.data as CandlestickDataPoint[];
            let markerWidth = 10; 
            if (klinePoints && klinePoints.length > 1) {
                 const firstX = xAxis.getPixelForValue(klinePoints[0].x);
                 const secondX = xAxis.getPixelForValue(klinePoints[1].x);
                 if (!isNaN(firstX) && !isNaN(secondX) && Math.abs(secondX - firstX) > 0) {
                     markerWidth = Math.abs(secondX - firstX) * 0.8; 
                 }
            }
            markerWidth = Math.max(2, Math.min(markerWidth, 15)); 

            if (xPixel >= chartArea.left && xPixel <= chartArea.right) {
                 ctx.fillRect(xPixel - markerWidth / 2, chartArea.top, markerWidth, chartArea.height);
            }
        });
        ctx.restore();
    }
};


// Crosshair plugin for synchronized cursor across charts
const crosshairPlugin = {
    id: 'crosshair',
    events: ['mousemove', 'mouseout'], // Explicitly declare which events to listen to
    afterEvent: (chart: Chart, args: any, options: any) => {
        const { event } = args;
        
        if (event.type === 'mouseout') {
            delete (chart as any).crosshair;
            const pluginOptions = chart.options.plugins?.crosshair as any;
            if (pluginOptions?.setCrosshairX) {
                pluginOptions.setCrosshairX(null);
            }
            args.changed = true; // Force redraw
            return;
        }
        
        if (event.type !== 'mousemove') return;

        // Get mouse position relative to the chart
        const rect = chart.canvas.getBoundingClientRect();
        const x = event.native.clientX - rect.left;
        const y = event.native.clientY - rect.top;
        
        // Store the position for drawing
        (chart as any).crosshair = {
            x: x,
            y: y
        };

        // Update synchronized X position
        const pluginOptions = chart.options.plugins?.crosshair as any;
        if (pluginOptions?.setCrosshairX && chart.scales.x) {
            const dataX = chart.scales.x.getValueForPixel(x);
            pluginOptions.setCrosshairX(dataX);
        }

        args.changed = true; // Force redraw
    },
    afterDatasetsDraw: (chart: Chart, args: any, options: any) => {
        const { ctx } = chart;
        const crosshair = (chart as any).crosshair;
        const chartArea = chart.chartArea;
        const pluginOptions = chart.options.plugins?.crosshair as any;

        // Use synchronized X position if available
        let x, y;
        if (pluginOptions?.crosshairX !== undefined && pluginOptions?.crosshairX !== null && chart.scales.x) {
            try {
                x = chart.scales.x.getPixelForValue(pluginOptions.crosshairX);
                y = crosshair?.y || chartArea.top + chartArea.height / 2;
            } catch (e) {
                // If conversion fails, fall back to crosshair position
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

        // Check if cursor is inside chart area
        if (x < chartArea.left || x > chartArea.right) {
            return;
        }

        ctx.save();

        // Draw vertical line
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.strokeStyle = 'rgba(113, 113, 122, 0.5)'; // tm-text-muted with opacity
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();

        // Draw horizontal line and price label (only for price chart with valid y position)
        if (chart.scales.yPrice && crosshair && y >= chartArea.top && y <= chartArea.bottom) {
            ctx.beginPath();
            ctx.moveTo(chartArea.left, y);
            ctx.lineTo(chartArea.right, y);
            ctx.stroke();

            // Draw price label
            const price = chart.scales.yPrice.getValueForPixel(y);
            if (price) {
                ctx.fillStyle = 'rgba(245, 158, 11, 0.9)'; // tm-accent
                ctx.fillRect(chartArea.right + 2, y - 10, 50, 20);
                ctx.fillStyle = '#0a0a0b'; // tm-text-inverse
                ctx.font = '11px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(price.toFixed(price < 1 ? 6 : 2), chartArea.right + 4, y + 3);
            }
        }

        ctx.restore();
    }
};

const ChartDisplay: React.FC<ChartDisplayProps> = ({ symbol, klines, indicators, interval, signalLog, historicalSignals = [] }) => {
  const priceCanvasRef = useRef<HTMLCanvasElement>(null);
  const priceChartInstanceRef = useRef<Chart | null>(null);
  
  // Dynamic panel refs based on indicators
  const panelCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const panelChartInstanceRefs = useRef<(Chart | null)[]>([]);
  
  // State for calculated indicator data
  const [calculatedIndicators, setCalculatedIndicators] = useState<Map<string, IndicatorDataPoint[]>>(new Map());
  const [isCalculating, setIsCalculating] = useState(false);
  
  // State for crosshair synchronization
  const [crosshairX, setCrosshairX] = useState<number | null>(null);
  
  // Use the indicator worker hook
  const { calculateIndicators } = useIndicatorWorker();

  const destroyAllCharts = () => {
    // Destroy panel charts
    panelChartInstanceRefs.current.forEach(chart => {
      if (chart) {
        chart.destroy();
      }
    });
    panelChartInstanceRefs.current = [];
    
    // Destroy price chart
    if (priceChartInstanceRef.current) {
      priceChartInstanceRef.current.destroy();
      priceChartInstanceRef.current = null;
    }
  };
  
  const syncIndicatorCharts = useCallback((mainChart: Chart) => {
    const { min, max } = mainChart.scales.x;
    panelChartInstanceRefs.current.forEach(chart => {
        if (chart) {
            chart.options.scales!.x!.min = min;
            chart.options.scales!.x!.max = max;
            chart.update('none');
        }
    });
  }, []);
  
  // Function to reset zoom on all charts
  const resetZoom = useCallback(() => {
    if (priceChartInstanceRef.current) {
      priceChartInstanceRef.current.resetZoom();
      // Sync reset with indicator charts
      syncIndicatorCharts(priceChartInstanceRef.current);
    }
  }, [syncIndicatorCharts]); 

  // Calculate indicators when they change
  useEffect(() => {
    if (!indicators || !klines || klines.length === 0) {
      console.log('[CHART_DEBUG] No indicators or klines, clearing calculated indicators');
      setCalculatedIndicators(new Map());
      return;
    }
    
    console.log('[CHART_DEBUG] Processing indicators:', indicators.map(ind => ({
      id: ind.id,
      name: ind.name,
      panel: ind.panel,
      hasCalculateFunction: !!ind.calculateFunction,
      calculateFunctionPreview: ind.calculateFunction?.substring(0, 100) + '...'
    })));
    
    const calculateAllIndicators = async () => {
      setIsCalculating(true);
      try {
        const results = await calculateIndicators(indicators, klines);
        console.log('[CHART_DEBUG] Calculated indicators results:', Array.from(results.entries()).map(([id, data]) => ({
          id,
          dataLength: data.length,
          firstPoint: data[0]
        })));
        setCalculatedIndicators(results);
      } catch (error) {
        console.error('Error calculating indicators:', error);
      } finally {
        setIsCalculating(false);
      }
    };
    
    calculateAllIndicators();
  }, [indicators, klines, calculateIndicators]);

  // Render charts when calculations are complete
  useEffect(() => {
    destroyAllCharts();

    if (!symbol || !klines || klines.length === 0 || isCalculating) {
      return;
    }

    const candlestickData: CandlestickDataPoint[] = klines.map(k => ({
      x: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]),
    }));

    // Group indicators by panel
    const overlayIndicators = indicators?.filter(ind => !ind.panel) || [];
    const panelIndicators = indicators?.filter(ind => ind.panel) || [];

    // --- Price Chart with Overlays ---
    if (priceCanvasRef.current) {
        const priceChartDatasets: any[] = [{
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

        // Add overlay indicators
        overlayIndicators.forEach(indicator => {
            const dataPoints = calculatedIndicators.get(indicator.id) || [];
            
            if (dataPoints.length === 0) return;

            // Check if multi-line indicator
            const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);
            
            if (hasMultipleLines) {
                // Handle multi-line indicators
                const colors = Array.isArray(indicator.style.color) 
                    ? indicator.style.color 
                    : [indicator.style.color || '#8efbba'];
                
                // Create dataset for each y value
                const lineNames = ['', ' Upper', ' Lower', ' 4th'];
                ['y', 'y2', 'y3', 'y4'].forEach((key, idx) => {
                    const yKey = key as keyof IndicatorDataPoint;
                    if (dataPoints.some(p => p[yKey] !== undefined)) {
                        priceChartDatasets.push({
                            type: 'line',
                            label: `${indicator.name}${lineNames[idx]}`,
                            data: dataPoints.map(p => ({x: p.x, y: p[yKey]})),
                            borderColor: colors[idx] || colors[0],
                            borderWidth: indicator.style.lineWidth || 1.5,
                            pointRadius: 0,
                            yAxisID: 'yPrice',
                            fill: idx === 0 && indicator.style.fillColor ? {
                                target: 'origin',
                                above: indicator.style.fillColor
                            } : false
                        });
                    }
                });
            } else {
                // Single line indicator
                priceChartDatasets.push({
                    type: 'line',
                    label: indicator.name,
                    data: dataPoints.map(p => ({x: p.x, y: p.y})),
                    borderColor: Array.isArray(indicator.style.color) 
                        ? indicator.style.color[0] 
                        : (indicator.style.color || '#8efbba'),
                    borderWidth: indicator.style.lineWidth || 1.5,
                    pointRadius: 0,
                    yAxisID: 'yPrice',
                    fill: indicator.style.fillColor ? {
                        target: 'origin',
                        above: indicator.style.fillColor
                    } : false
                });
            }
        });

        // Add double-click handler to reset zoom
        priceCanvasRef.current.ondblclick = () => {
            if (priceChartInstanceRef.current) {
                priceChartInstanceRef.current.resetZoom();
                syncIndicatorCharts(priceChartInstanceRef.current);
            }
        };
        
        priceChartInstanceRef.current = new Chart(priceCanvasRef.current, {
            type: 'candlestick',
            data: { datasets: priceChartDatasets },
            plugins: [signalMarkerPlugin, crosshairPlugin], 
            options: {
              responsive: true, 
              maintainAspectRatio: false, 
              animation: false,
              interaction: {
                  mode: 'x',
                  intersect: false
              },
              layout: { padding: { top: 5, bottom: 0, left: 60, right: 35 } }, 
              plugins: {
                legend: { 
                    display: true, 
                    labels: { 
                        color: '#f5f5f7', 
                        boxWidth: 15, 
                        padding: 10, 
                        usePointStyle: true, 
                        pointStyle: 'rect' 
                    } 
                },
                title: { 
                    display: true, 
                    text: `${symbol} - ${interval} Chart`, 
                    color: '#f5f5f7', 
                    font: { size: 14 }, 
                    padding: { bottom: 5 } 
                },
                tooltip: { 
                    mode: 'index', 
                    intersect: false,
                    backgroundColor: '#131316', 
                    titleColor: '#f59e0b', 
                    bodyColor: '#f5f5f7', 
                    borderColor: '#3f3f46', 
                    borderWidth: 1,
                    padding: 12,
                    cornerRadius: 8,
                    titleFont: { size: 14, weight: '600' },
                    bodyFont: { size: 13 },
                    callbacks: {
                        label: function(context) {
                            const datasetLabel = context.dataset.label || '';
                            if (context.dataset.type === 'candlestick' || (context.dataset as any).isCandleStick) { 
                                const ohlc = context.raw as CandlestickDataPoint;
                                return `${datasetLabel}: O:${ohlc.o.toFixed(4)} H:${ohlc.h.toFixed(4)} L:${ohlc.l.toFixed(4)} C:${ohlc.c.toFixed(4)}`;
                            }
                            const value = context.parsed.y;
                            return `${datasetLabel}: ${typeof value === 'number' ? value.toFixed(4) : value}`;
                        }
                    }
                },
                zoom: {
                    limits: {
                        x: {
                            min: 'original',  // Cannot pan/zoom before first data point
                            max: 'original',  // Cannot pan/zoom after last data point  
                            minRange: 60000 * 5  // Minimum zoom: 5 candles worth of time (5 minutes for 1m candles)
                        }
                    },
                    pan: { 
                        enabled: true, 
                        mode: 'x',
                        threshold: 10,  // Minimum pixels to trigger pan
                        onPanComplete: ({chart}) => syncIndicatorCharts(chart) 
                    },
                    zoom: { 
                        wheel: { 
                            enabled: true, 
                            speed: 0.15,  // Optimized for smooth scrolling (15% zoom per wheel event)
                            modifierKey: null  // No modifier key needed - zoom works directly with scroll
                        }, 
                        pinch: { 
                            enabled: true  // Support trackpad pinch gestures
                        },
                        drag: {
                            enabled: false  // Disable drag to zoom (can be enabled if needed)
                        },
                        mode: 'x',  // Restrict zoom to x-axis only
                        onZoomComplete: ({chart}) => syncIndicatorCharts(chart) 
                    }
                },
                signalMarkers: { 
                    signalLog: signalLog,
                    historicalSignals: historicalSignals,
                    selectedSymbol: symbol,
                    currentInterval: interval
                } as any,
                crosshair: {
                    setCrosshairX: setCrosshairX
                } as any
              },
              scales: {
                x: { 
                    type: 'time', 
                    time: { unit: 'minute' },
                    grid: { color: '#3f3f46' }, 
                    ticks: { color: '#d4d4d8', maxRotation: 0, autoSkip: true, autoSkipPadding: 15 } 
                },
                yPrice: { 
                    type: 'linear', 
                    display: true, 
                    position: 'left', 
                    grid: { color: '#3f3f46' }, 
                    ticks: { color: '#d4d4d8' }
                },
              },
            }
        });
    }

    // --- Panel Indicators ---
    panelIndicators.forEach((indicator, idx) => {
        const canvasRef = panelCanvasRefs.current[idx];
        if (!canvasRef) return;

        const dataPoints = calculatedIndicators.get(indicator.id) || [];
        if (dataPoints.length === 0) return;

        const datasets: any[] = [];
        
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
                    if (indicator.style.barColors) {
                        const val = point?.y || 0;
                        if (val > 0) return indicator.style.barColors.positive || '#10b981';
                        if (val < 0) return indicator.style.barColors.negative || '#ef4444';
                        return indicator.style.barColors.neutral || '#71717a';
                    }
                    
                    return Array.isArray(indicator.style.color) 
                        ? indicator.style.color[0] 
                        : (indicator.style.color || '#9ca3af');
                }
            });
        } else if (indicator.chartType === 'line') {
            // Line chart (can be multi-line)
            const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);
            
            if (hasMultipleLines) {
                const colors = Array.isArray(indicator.style.color) 
                    ? indicator.style.color 
                    : [indicator.style.color || '#8efbba'];
                
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
                                borderWidth: indicator.style.lineWidth || 1.5,
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
                    borderColor: Array.isArray(indicator.style.color) 
                        ? indicator.style.color[0] 
                        : (indicator.style.color || '#8efbba'),
                    borderWidth: indicator.style.lineWidth || 1.5,
                    pointRadius: 0,
                    fill: indicator.style.fillColor ? {
                        target: 'origin',
                        above: indicator.style.fillColor
                    } : false
                });
            }
        }

        const chartConfig: ChartConfiguration = {
            type: datasets[0]?.type || 'line',
            data: { datasets },
            plugins: [crosshairPlugin],
            options: {
                responsive: true, 
                maintainAspectRatio: false, 
                animation: false,
                interaction: {
                    mode: 'x',
                    intersect: false
                },
                layout: { padding: { top: 0, bottom: 0, left: 60, right: 35 } },
                plugins: {
                    legend: { display: false },
                    title: { 
                        display: true, 
                        text: indicator.name, 
                        color: '#f5f5f7', 
                        font: { size: 11 }, 
                        align: 'left', 
                        padding: { top: 0, bottom: 0 } 
                    },
                    tooltip: { 
                        enabled: true, 
                        mode: 'index', 
                        intersect: false, 
                        backgroundColor: '#131316', 
                        titleColor: '#f59e0b', 
                        bodyColor: '#f5f5f7',
                        borderColor: '#3f3f46', 
                        borderWidth: 1, 
                        padding: 12,
                        cornerRadius: 8,
                        titleFont: { size: 14, weight: '600' },
                        bodyFont: { size: 13 },
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                const datasetLabel = context.dataset.label || '';
                                const value = context.parsed.y;
                                return `${datasetLabel}: ${typeof value === 'number' ? value.toFixed(4) : value}`;
                            }
                        }
                    }, 
                    zoom: { 
                        pan: { enabled: false }, 
                        zoom: { 
                            wheel: { enabled: false }, 
                            pinch: { enabled: false },
                            drag: { enabled: false }
                        } 
                    },
                    crosshair: {
                        crosshairX: crosshairX,
                        setCrosshairX: setCrosshairX
                    } as any
                },
                scales: {
                    x: { 
                        type: 'time', 
                        time: { unit: 'minute' },
                        grid: { display: false }, 
                        ticks: { display: false } 
                    },
                    y: { 
                        type: 'linear', 
                        display: true, 
                        position: indicator.yAxisConfig?.position || 'left', 
                        grid: { color: '#3f3f46' }, 
                        ticks: { 
                            color: '#d4d4d8', 
                            font: { size: 10 }, 
                            maxTicksLimit: 5 
                        },
                        min: indicator.yAxisConfig?.min,
                        max: indicator.yAxisConfig?.max
                    },
                },
            }
        };

        panelChartInstanceRefs.current[idx] = new Chart(canvasRef, chartConfig);
    });

    // Update all charts
    if (priceChartInstanceRef.current) { 
        priceChartInstanceRef.current.update('none'); 
        syncIndicatorCharts(priceChartInstanceRef.current); 
    }
    panelChartInstanceRefs.current.forEach(chart => { 
        if (chart) chart.update('none');
    });

    return () => {
      destroyAllCharts();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, klines, indicators, interval, signalLog, syncIndicatorCharts, calculatedIndicators, isCalculating]); 

  // Update crosshair position across all charts
  useEffect(() => {
    // Update main chart
    if (priceChartInstanceRef.current) {
      const chart = priceChartInstanceRef.current;
      if ((chart as any).config.options.plugins.crosshair) {
        (chart as any).config.options.plugins.crosshair.crosshairX = crosshairX;
        // Set crosshair data if we have a valid X position
        if (crosshairX !== null) {
          try {
            (chart as any).crosshair = {
              x: chart.scales.x.getPixelForValue(crosshairX),
              y: (chart as any).crosshair?.y || chart.chartArea.top + chart.chartArea.height / 2
            };
          } catch (e) {
            // If conversion fails, clear crosshair
            delete (chart as any).crosshair;
          }
        } else {
          delete (chart as any).crosshair;
        }
        chart.draw();
      }
    }
    
    // Update all panel charts with new crosshair position
    panelChartInstanceRefs.current.forEach(chart => {
      if (chart && (chart as any).config.options.plugins.crosshair) {
        (chart as any).config.options.plugins.crosshair.crosshairX = crosshairX;
        // Set crosshair data if we have a valid X position
        if (crosshairX !== null && chart.scales.x) {
          try {
            (chart as any).crosshair = {
              x: chart.scales.x.getPixelForValue(crosshairX),
              y: chart.chartArea.top + chart.chartArea.height / 2
            };
          } catch (e) {
            // If conversion fails, clear crosshair
            delete (chart as any).crosshair;
          }
        } else {
          delete (chart as any).crosshair;
        }
        chart.draw();
      }
    });
  }, [crosshairX]);

  // Calculate panel indicators and heights
  const panelIndicators = indicators?.filter(ind => ind.panel) || [];
  const visiblePanelsCount = panelIndicators.length;

  let priceChartHeight = 'h-[100%]'; 
  let panelHeight = 'h-0';

  if (visiblePanelsCount === 1) {
    priceChartHeight = 'h-[70%]';
    panelHeight = 'h-[30%]';
  } else if (visiblePanelsCount === 2) {
    priceChartHeight = 'h-[50%]';
    panelHeight = 'h-[25%]';
  } else if (visiblePanelsCount === 3) {
    priceChartHeight = 'h-[40%]';
    panelHeight = 'h-[20%]';
  } else if (visiblePanelsCount >= 4) {
    priceChartHeight = 'h-[40%]';
    panelHeight = 'h-[15%]';
  }

  return (
    <div className="tm-card shadow-lg p-2 mb-2 flex flex-col" style={{height: '480px'}}>
      {symbol ? (
        <>
          <div className={`${priceChartHeight} relative`}>
            <canvas ref={priceCanvasRef}></canvas>
            {isCalculating && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--tm-bg-secondary)] bg-opacity-75">
                <div className="text-[var(--tm-accent)]">Calculating indicators...</div>
              </div>
            )}
            {/* Zoom controls */}
            <div className="absolute top-2 right-2 flex gap-2 z-10">
              <button
                onClick={resetZoom}
                className="px-2 py-1 bg-[var(--tm-bg-secondary)] hover:bg-[var(--tm-bg-tertiary)] text-[var(--tm-text-muted)] hover:text-[var(--tm-accent)] rounded text-xs font-medium transition-colors"
                title="Reset zoom (double-click also resets)"
              >
                Reset Zoom
              </button>
              <div className="px-2 py-1 bg-[var(--tm-bg-secondary)] text-[var(--tm-text-muted)] rounded text-xs">
                Scroll to zoom X-axis
              </div>
            </div>
          </div>
          {panelIndicators.map((indicator, idx) => (
            <div key={indicator.id} className={`${panelHeight} relative border-t border-[var(--tm-border)]`}>
              <canvas ref={el => panelCanvasRefs.current[idx] = el}></canvas>
            </div>
          ))}
        </>
      ) : (
        <div className="flex items-center justify-center h-full text-[var(--tm-text-muted)]">
          <div className="text-center">
            <svg className="w-16 h-16 mx-auto mb-4 text-[var(--tm-text-muted)] opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <p className="text-sm">Select a signal from the table to view its chart</p>
            <p className="text-xs text-[var(--tm-text-muted)] mt-1">The chart will display relevant indicators for the selected signal</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ChartDisplay;