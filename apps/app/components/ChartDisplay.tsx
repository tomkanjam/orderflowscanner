import React, { useEffect, useRef, useCallback, useState } from 'react';
import { Chart, registerables, Filler, ChartConfiguration } from 'chart.js';
import 'chartjs-adapter-date-fns';
import { CandlestickController, CandlestickElement, OhlcController, OhlcElement } from 'chartjs-chart-financial';
import zoomPlugin from 'chartjs-plugin-zoom';
import { Kline, CustomIndicatorConfig, CandlestickDataPoint, SignalLogEntry, HistoricalSignal, KlineInterval, IndicatorDataPoint } from '../types';
import { useIndicatorWorker } from '../hooks/useIndicatorWorker';
import { createEmptyDatasets, createIndicatorDatasets } from '../utils/chartHelpers';
import { useKlineData } from '../src/hooks/useKlineData';
import { useKlineDataContext } from '../src/contexts/KlineDataProvider';

Chart.register(...registerables, CandlestickController, CandlestickElement, OhlcController, OhlcElement, Filler, zoomPlugin);

interface ChartDisplayProps {
  symbol: string | null;
  klines: Kline[] | undefined;
  indicators: CustomIndicatorConfig[] | null;
  interval: KlineInterval;
  signalLog: SignalLogEntry[];
  historicalSignals?: HistoricalSignal[];
  isMobile?: boolean;
  preCalculatedIndicators?: Record<string, Array<{ x: number; y: number; y2?: number; y3?: number }>>; // Backend-calculated indicator data
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

const ChartDisplay: React.FC<ChartDisplayProps> = ({ symbol, klines, indicators, interval, signalLog, historicalSignals = [], isMobile = false, preCalculatedIndicators }) => {

  const priceCanvasRef = useRef<HTMLCanvasElement>(null);
  const priceChartInstanceRef = useRef<Chart | null>(null);

  // Dynamic panel refs based on indicators
  const panelCanvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const panelChartInstanceRefs = useRef<(Chart | null)[]>([]);

  // State for calculated indicator data
  const [calculatedIndicators, setCalculatedIndicators] = useState<Map<string, IndicatorDataPoint[]>>(new Map());

  // Loading state management for indicators
  const [loadingStates, setLoadingStates] = useState<Map<string, { isLoading: boolean; startTime: number }>>(new Map());
  const currentSymbolRef = useRef<string | null>(null);

  // State for crosshair synchronization
  const [crosshairX, setCrosshairX] = useState<number | null>(null);

  // State for wheel zoom management and horizontal pan
  const [wheelZoomEnabled, setWheelZoomEnabled] = useState(true);

  // Get data context for cache stats, refresh, and prefetching
  const { cacheStats, invalidateSymbol, prefetchCorrelated } = useKlineDataContext();

  // Use kline data hook for additional data management
  const {
    isLoading: dataLoading,
    error: dataError,
    isCached,
    latency,
    refetch
  } = useKlineData({
    symbol: symbol || '',
    interval,
    enabled: !!symbol && (!klines || klines.length === 0),
    onSuccess: () => {
      // Data loaded successfully - trigger prefetch for related symbols
      if (symbol) {
        prefetchCorrelated(symbol, interval);
      }
    }
  });
  const wheelZoomTimeoutRef = useRef<NodeJS.Timeout>();
  const wheelEventHandlerRef = useRef<((e: WheelEvent) => void) | null>(null);
  
  // State to preserve zoom/pan state across chart recreations
  const zoomStateRef = useRef<{ min: number | undefined; max: number | undefined }>({ min: undefined, max: undefined });
  
  // Use the indicator worker hook
  const { calculateIndicators, cancelCalculations } = useIndicatorWorker();

  // Trigger prefetch when symbol changes
  useEffect(() => {
    if (symbol && symbol !== currentSymbolRef.current) {
      // New symbol selected, prefetch correlated
      prefetchCorrelated(symbol, interval);
      currentSymbolRef.current = symbol;
    }
  }, [symbol, interval, prefetchCorrelated]);

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
      // Clear saved zoom state when manually resetting
      zoomStateRef.current = { min: undefined, max: undefined };
      // Sync reset with indicator charts
      syncIndicatorCharts(priceChartInstanceRef.current);
    }
  }, [syncIndicatorCharts]);
  
  // Handler for horizontal pan
  const handleHorizontalPan = useCallback((
    chart: Chart, 
    deltaX: number, 
    animate: boolean = false
  ) => {
    if (!chart) return;
    
    const panSpeed = 2; // Configurable
    const mode = animate ? 'default' : 'none';
    
    chart.pan({ x: -deltaX * panSpeed }, undefined, mode);
    syncIndicatorCharts(chart);
  }, [syncIndicatorCharts]);
  
  // Helper function to temporarily disable/enable wheel zoom
  const toggleWheelZoom = useCallback((enabled: boolean, chart: Chart) => {
    if (!chart?.options?.plugins?.zoom) return;
    
    // Clear any existing timeout
    if (wheelZoomTimeoutRef.current) {
      clearTimeout(wheelZoomTimeoutRef.current);
    }
    
    // Update zoom plugin config
    chart.options.plugins.zoom.zoom.wheel.enabled = enabled;
    
    // If disabling, set timeout to re-enable
    if (!enabled) {
      wheelZoomTimeoutRef.current = setTimeout(() => {
        if (chart?.options?.plugins?.zoom) {
          chart.options.plugins.zoom.zoom.wheel.enabled = true;
        }
        setWheelZoomEnabled(true);
      }, 100);
    }
    
    setWheelZoomEnabled(enabled);
  }, []); 

  // Calculate indicators when they change (or use pre-calculated from backend)
  useEffect(() => {
    if (!indicators || !klines || klines.length === 0) {
      setCalculatedIndicators(new Map());
      setLoadingStates(new Map());
      return;
    }

    // If we have pre-calculated indicators from backend, use them directly
    if (preCalculatedIndicators) {
      const resultsMap = new Map<string, IndicatorDataPoint[]>();

      indicators.forEach(indicator => {
        const backendData = preCalculatedIndicators[indicator.id];
        if (backendData) {
          // Convert backend format to IndicatorDataPoint format
          const indicatorPoints: IndicatorDataPoint[] = backendData.map(point => ({
            x: point.x,
            y: point.y,
            y2: point.y2,
            y3: point.y3
          }));
          resultsMap.set(indicator.id, indicatorPoints);
        }
      });

      setCalculatedIndicators(resultsMap);
      setLoadingStates(new Map()); // Clear all loading states
      return;
    }

    // Otherwise, calculate using Web Worker (legacy path for signals without backend data)
    // Initialize loading states for all indicators
    const newLoadingStates = new Map<string, { isLoading: boolean; startTime: number }>();
    indicators.forEach(indicator => {
      newLoadingStates.set(indicator.id, { isLoading: true, startTime: Date.now() });
    });
    setLoadingStates(newLoadingStates);

    // Debug: Indicator calculation triggered
    // console.log(`[DEBUG ${new Date().toISOString()}] ChartDisplay useEffect triggered - recalculating indicators`, {
    //   indicatorsLength: indicators.length,
    //   klinesLength: klines.length,
    //   klinesRef: klines
    // });

    let isCurrentCalculation = true;

    const calculateAllIndicators = async () => {
      // console.log(`[DEBUG ${new Date().toISOString()}] Starting indicator calculation for symbol: ${symbol}`);
      try {
        const results = await calculateIndicators(indicators, klines);

        // Only update if this is still the current calculation (not cancelled)
        if (isCurrentCalculation) {
          setCalculatedIndicators(results);

          // Clear loading states for completed indicators
          setLoadingStates(prev => {
            const next = new Map(prev);
            results.forEach((_, indicatorId) => {
              next.delete(indicatorId);
            });
            return next;
          });

          // console.log(`[DEBUG ${new Date().toISOString()}] Indicator calculation completed`, results.size);
        } else {
          // console.log(`[DEBUG ${new Date().toISOString()}] Calculation results ignored (symbol changed)`);
        }
      } catch (error) {
        if (isCurrentCalculation) {
          console.error('Error calculating indicators:', error);
        }
      } finally {
        if (isCurrentCalculation) {
          // console.log(`[DEBUG ${new Date().toISOString()}] Indicator calculation finished (finally block)`);
        }
      }
    };

    calculateAllIndicators();

    // Cleanup: Cancel calculations if component unmounts or dependencies change
    return () => {
      isCurrentCalculation = false;
      cancelCalculations(indicators.map(ind => ind.id));
      // console.log(`[DEBUG ${new Date().toISOString()}] Cancelled pending calculations for symbol: ${symbol}`);
    };
  }, [indicators, klines, calculateIndicators, cancelCalculations, symbol, preCalculatedIndicators]);

  // Create or recreate charts only when symbol or interval changes
  useEffect(() => {
    // console.log(`[DEBUG ${new Date().toISOString()}] Chart creation useEffect triggered. Symbol: ${symbol}, Interval: ${interval}, calculatedIndicators size: ${calculatedIndicators.size}`);

    // Track current symbol for cancellation
    if (symbol) {
      currentSymbolRef.current = symbol;
    }

    // Save current zoom/pan state before destroying charts (if we have one)
    if (priceChartInstanceRef.current?.scales?.x) {
      const currentMin = priceChartInstanceRef.current.scales.x.min;
      const currentMax = priceChartInstanceRef.current.scales.x.max;
      zoomStateRef.current = { min: currentMin, max: currentMax };
    }

    destroyAllCharts();

    // Don't proceed if we don't have the necessary data
    // Create chart immediately - don't wait for calculations
    if (!symbol || !klines || klines.length === 0) {
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
                // Clear saved zoom state when manually resetting
                zoomStateRef.current = { min: undefined, max: undefined };
                syncIndicatorCharts(priceChartInstanceRef.current);
            }
        };
        
        // Add custom wheel handler for horizontal panning (Shift+Scroll and native horizontal)
        const handleWheelEvent = (e: WheelEvent) => {
            if (!priceChartInstanceRef.current) return;
            
            const isHorizontalGesture = Math.abs(e.deltaX) > Math.abs(e.deltaY);
            const isShiftScroll = e.shiftKey && e.deltaY !== 0;
            
            if (isHorizontalGesture || isShiftScroll) {
                e.preventDefault();
                
                // Temporarily disable zoom
                toggleWheelZoom(false, priceChartInstanceRef.current);
                
                // Determine delta based on gesture type
                const delta = isHorizontalGesture ? e.deltaX : e.deltaY;
                
                // Pan horizontally
                handleHorizontalPan(priceChartInstanceRef.current, delta, false);
            }
        };
        
        // Store the handler reference for cleanup
        wheelEventHandlerRef.current = handleWheelEvent;
        priceCanvasRef.current.addEventListener('wheel', handleWheelEvent, { passive: false });
        
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
                    display: !isMobile,  // Hide legend on mobile
                    labels: {
                        color: '#f5f5f7',
                        boxWidth: 15,
                        padding: 10,
                        usePointStyle: true,
                        pointStyle: 'rect'
                    }
                },
                title: {
                    display: !isMobile,  // Hide title on mobile
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
                        onPanComplete: ({chart}) => {
                            syncIndicatorCharts(chart);
                        } 
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
                        onZoomComplete: ({chart}) => {
                            syncIndicatorCharts(chart);
                        } 
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
                    grid: { display: false }, // Hide grid lines
                    ticks: { color: '#d4d4d8', maxRotation: 0, autoSkip: true, autoSkipPadding: 15 } 
                },
                yPrice: { 
                    type: 'linear', 
                    display: true, 
                    position: 'left', 
                    grid: { display: false }, // Hide grid lines
                    ticks: { color: '#d4d4d8' }
                },
              },
            }
        });
        
        // Restore zoom/pan state if it exists
        if (priceChartInstanceRef.current && zoomStateRef.current.min !== undefined && zoomStateRef.current.max !== undefined) {
            // Apply the saved zoom state
            priceChartInstanceRef.current.options.scales!.x!.min = zoomStateRef.current.min;
            priceChartInstanceRef.current.options.scales!.x!.max = zoomStateRef.current.max;
            priceChartInstanceRef.current.update('none');
            
            // Sync with indicator charts
            syncIndicatorCharts(priceChartInstanceRef.current);
        }
    }

    // --- Panel Indicators ---
    panelIndicators.forEach((indicator, idx) => {
        const canvasRef = panelCanvasRefs.current[idx];
        if (!canvasRef) {
            console.warn(`No canvas ref for panel indicator ${indicator.name} at index ${idx}`);
            return;
        }

        const dataPoints = calculatedIndicators.get(indicator.id) || [];
        const isLoading = loadingStates.has(indicator.id);

        // CORE FIX: Always create chart, even with empty data
        const datasets = dataPoints.length > 0
            ? createIndicatorDatasets(dataPoints, indicator)
            : createEmptyDatasets(indicator);

        // Dynamic title with loading state
        const chartTitle = indicator.name;

        // console.log(`[DEBUG ${new Date().toISOString()}] Creating panel chart for ${indicator.name} with ${dataPoints.length} data points, loading: ${isLoading}`);

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
                        text: chartTitle,
                        color: isLoading ? '#9ca3af' : '#f5f5f7', 
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
                        grid: { display: false }, // Hide grid lines
                        ticks: { display: false } 
                    },
                    y: {
                        type: 'linear',
                        display: true,
                        position: indicator.yAxisConfig?.position || 'left',
                        grid: {
                            display: dataPoints.length === 0, // Show grid for empty charts
                            color: 'rgba(255, 255, 255, 0.05)'
                        },
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
      // Remove wheel event listener
      if (priceCanvasRef.current && wheelEventHandlerRef.current) {
        priceCanvasRef.current.removeEventListener('wheel', wheelEventHandlerRef.current);
      }
      
      // Clear any pending timeouts
      if (wheelZoomTimeoutRef.current) {
        clearTimeout(wheelZoomTimeoutRef.current);
      }
      
      destroyAllCharts();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, interval]); // Only recreate chart when symbol or interval changes

  // Separate effect to update chart data without recreating the chart
  useEffect(() => {
    // console.log(`[DEBUG ${new Date().toISOString()}] Chart data update useEffect triggered. Has price chart: ${!!priceChartInstanceRef.current}, klines: ${klines?.length || 0}, calculatedIndicators size: ${calculatedIndicators.size}`);
    if (!priceChartInstanceRef.current || !klines || klines.length === 0) {
      return;
    }


    const candlestickData: CandlestickDataPoint[] = klines.map(k => ({
      x: k[0], o: parseFloat(k[1]), h: parseFloat(k[2]), l: parseFloat(k[3]), c: parseFloat(k[4]),
    }));

    const chart = priceChartInstanceRef.current;
    if (chart && chart.data.datasets[0]) {
      // Save current zoom state
      const currentMin = chart.scales.x.min;
      const currentMax = chart.scales.x.max;
      
      // Update candlestick data
      chart.data.datasets[0].data = candlestickData;
      
      // Update indicator data
      const overlayIndicators = indicators?.filter(ind => !ind.panel) || [];
      let datasetIndex = 1; // Start after candlestick dataset
      
      overlayIndicators.forEach(indicator => {
        const dataPoints = calculatedIndicators.get(indicator.id) || [];
        if (dataPoints.length === 0) return;
        
        const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);
        
        if (hasMultipleLines) {
          ['y', 'y2', 'y3', 'y4'].forEach((key) => {
            const yKey = key as keyof IndicatorDataPoint;
            if (dataPoints.some(p => p[yKey] !== undefined)) {
              if (chart.data.datasets[datasetIndex]) {
                chart.data.datasets[datasetIndex].data = dataPoints.map(p => ({x: p.x, y: p[yKey]}));
              }
              datasetIndex++;
            }
          });
        } else {
          if (chart.data.datasets[datasetIndex]) {
            chart.data.datasets[datasetIndex].data = dataPoints.map(p => ({x: p.x, y: p.y}));
          }
          datasetIndex++;
        }
      });
      
      // Restore zoom state
      chart.options.scales!.x!.min = currentMin;
      chart.options.scales!.x!.max = currentMax;
      
      // Update chart without animation
      chart.update('none');
      syncIndicatorCharts(chart);
      
      // Update panel charts similarly
      const panelIndicators = indicators?.filter(ind => ind.panel) || [];
      // console.log(`[DEBUG ${new Date().toISOString()}] Updating panel charts. Count: ${panelIndicators.length}, Existing charts: ${panelChartInstanceRefs.current.length}`);
      panelIndicators.forEach((indicator, idx) => {
        const panelChart = panelChartInstanceRefs.current[idx];
        if (!panelChart) {
            console.warn(`No panel chart instance for ${indicator.name} at index ${idx}`);
            return;
        }

        const dataPoints = calculatedIndicators.get(indicator.id) || [];
        const loadingState = loadingStates.get(indicator.id);
        const isLoading = loadingState?.isLoading || false;

        // Update title when data arrives
        if (panelChart.options.plugins?.title) {
            panelChart.options.plugins.title.text = indicator.name;
            panelChart.options.plugins.title.color = '#f5f5f7';
        }

        if (dataPoints.length === 0) {
            // console.log(`[DEBUG ${new Date().toISOString()}] No data to update for panel ${indicator.name} - keeping empty chart visible`);
            // Still update the chart to ensure title changes are reflected
            panelChart.options.scales!.x!.min = chart.scales.x.min;
            panelChart.options.scales!.x!.max = chart.scales.x.max;
            panelChart.update('none');
            return;
        }
        // console.log(`[DEBUG ${new Date().toISOString()}] Updating panel chart ${indicator.name} with ${dataPoints.length} points`);

        // Update panel chart datasets
        let panelDatasetIndex = 0;
        if (indicator.chartType === 'bar') {
          if (panelChart.data.datasets[panelDatasetIndex]) {
            panelChart.data.datasets[panelDatasetIndex].data = dataPoints.map(p => ({x: p.x, y: p.y}));
          }
        } else {
          const hasMultipleLines = dataPoints.some(p => p.y2 !== undefined);
          if (hasMultipleLines) {
            ['y', 'y2', 'y3', 'y4'].forEach((key) => {
              const yKey = key as keyof IndicatorDataPoint;
              if (dataPoints.some(p => p[yKey] !== undefined)) {
                if (panelChart.data.datasets[panelDatasetIndex]) {
                  panelChart.data.datasets[panelDatasetIndex].data = dataPoints.map(p => ({x: p.x, y: p[yKey]}));
                }
                panelDatasetIndex++;
              }
            });
          } else {
            if (panelChart.data.datasets[panelDatasetIndex]) {
              panelChart.data.datasets[panelDatasetIndex].data = dataPoints.map(p => ({x: p.x, y: p.y}));
            }
          }
        }
        
        // Match zoom with main chart
        panelChart.options.scales!.x!.min = currentMin;
        panelChart.options.scales!.x!.max = currentMax;
        panelChart.update('none');
      });
    }
  }, [klines, calculatedIndicators, indicators, syncIndicatorCharts]); 

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
    <div className={`tm-card shadow-lg flex flex-col ${isMobile ? 'h-full p-0 mb-0' : 'p-2 mb-2'}`} style={!isMobile ? {height: '480px'} : undefined}>
      {symbol ? (
        <>
          {/* Data status bar - Hidden on mobile */}
          {!isMobile && (
          <div className="flex items-center justify-between px-2 py-1 mb-1 bg-[var(--tm-bg-secondary)] rounded text-xs">
            <div className="flex items-center gap-3">
              {/* Loading indicator */}
              {dataLoading && (
                <div className="flex items-center gap-1 text-[var(--tm-accent)]">
                  <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Loading...</span>
                </div>
              )}

              {/* Cache indicator */}
              {!dataLoading && isCached && (
                <div className="flex items-center gap-1 text-green-500">
                  <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.293l-3-3a1 1 0 00-1.414 1.414L10.586 9.5H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                  </svg>
                  <span>Cached</span>
                </div>
              )}

              {/* Latency display */}
              {latency > 0 && (
                <span className="text-[var(--tm-text-muted)]">
                  {latency}ms
                </span>
              )}

              {/* Cache stats */}
              {cacheStats.size > 0 && (
                <span className="text-[var(--tm-text-muted)]">
                  Cache: {cacheStats.hits}/{cacheStats.hits + cacheStats.misses} ({Math.round((cacheStats.hits / (cacheStats.hits + cacheStats.misses)) * 100)}%)
                </span>
              )}

              {/* Error indicator */}
              {dataError && (
                <span className="text-red-500">
                  ⚠️ {dataError}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Refresh button */}
              <button
                onClick={() => {
                  if (symbol) {
                    invalidateSymbol(symbol);
                    refetch();
                  }
                }}
                className="p-1 hover:bg-[var(--tm-bg-tertiary)] rounded transition-colors"
                title="Refresh data"
              >
                <svg className="h-3 w-3 text-[var(--tm-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
          )}

          <div className={`${priceChartHeight} relative`}>
            {/* Loading skeleton */}
            {dataLoading && (!klines || klines.length === 0) && (
              <div className="absolute inset-0 flex items-center justify-center bg-[var(--tm-bg-primary)] z-20">
                <div className="text-center">
                  <div className="animate-pulse">
                    <div className="h-32 bg-[var(--tm-bg-secondary)] rounded mb-2"></div>
                    <div className="h-4 bg-[var(--tm-bg-secondary)] rounded w-3/4 mx-auto mb-2"></div>
                    <div className="h-4 bg-[var(--tm-bg-secondary)] rounded w-1/2 mx-auto"></div>
                  </div>
                  <p className="text-[var(--tm-text-muted)] text-sm mt-4">Loading chart data...</p>
                </div>
              </div>
            )}

            <canvas ref={priceCanvasRef}></canvas>
            {/* Zoom controls - Hidden on mobile */}
            {!isMobile && (
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
            )}
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