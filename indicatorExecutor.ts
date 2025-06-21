import { Kline, IndicatorDataPoint } from './types';
import * as helpers from './screenerHelpers';

/**
 * Safely executes custom indicator calculation functions
 * @param code - JavaScript function body that calculates indicator values
 * @param klines - Array of kline data
 * @param params - Optional parameters passed to the indicator function
 * @returns Array of indicator data points
 */
export function executeIndicatorFunction(
  code: string,
  klines: Kline[],
  params?: Record<string, any>
): IndicatorDataPoint[] {
  try {
    // Create a new function with controlled scope
    // Only expose safe globals and helper functions
    const func = new Function(
      'klines', 
      'helpers', 
      'params',
      'Math',
      'parseFloat',
      'parseInt',
      'isNaN',
      'isFinite',
      'console', // Allow console for debugging
      code
    );
    
    // Execute the function with timeout protection would require async
    // For now, we'll rely on the browser's built-in protections
    const result = func(
      klines, 
      helpers, 
      params || {},
      Math,
      parseFloat,
      parseInt,
      isNaN,
      isFinite,
      { log: () => {} } // Provide no-op console to prevent spam
    );
    
    // Validate the result
    if (!Array.isArray(result)) {
      console.error('Indicator function must return an array, got:', typeof result);
      return [];
    }
    
    // Sanitize and validate each data point
    const sanitized: IndicatorDataPoint[] = [];
    
    for (const point of result) {
      if (!point || typeof point !== 'object') {
        continue;
      }
      
      // Ensure x is a valid timestamp
      if (typeof point.x !== 'number' || isNaN(point.x) || !isFinite(point.x)) {
        continue;
      }
      
      // Create sanitized point
      const sanitizedPoint: IndicatorDataPoint = {
        x: point.x,
        y: validateNumber(point.y)
      };
      
      // Add optional fields if they exist
      if ('y2' in point) sanitizedPoint.y2 = validateNumber(point.y2);
      if ('y3' in point) sanitizedPoint.y3 = validateNumber(point.y3);
      if ('y4' in point) sanitizedPoint.y4 = validateNumber(point.y4);
      
      // Validate color if provided
      if (point.color && typeof point.color === 'string' && isValidColor(point.color)) {
        sanitizedPoint.color = point.color;
      }
      
      sanitized.push(sanitizedPoint);
    }
    
    return sanitized;
    
  } catch (error) {
    console.error('Indicator execution failed:', error);
    console.error('Failed code:', code);
    return [];
  }
}

/**
 * Validates a number value, converting to null if invalid
 */
function validateNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

/**
 * Basic color validation (hex colors and named colors)
 */
function isValidColor(color: string): boolean {
  // Check hex color
  if (/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3}|[A-Fa-f0-9]{8})$/.test(color)) {
    return true;
  }
  
  // Check rgba/rgb
  if (/^rgba?\([\d\s,.]+\)$/.test(color)) {
    return true;
  }
  
  // Basic named colors
  const namedColors = ['red', 'green', 'blue', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'gray', 'transparent'];
  return namedColors.includes(color.toLowerCase());
}

/**
 * Example indicator calculations for reference
 * These show the expected format for calculateFunction strings
 */
export const EXAMPLE_INDICATORS = {
  // Simple Moving Average
  simpleMA: `
    const period = params.period || 20;
    const maSeries = helpers.calculateMASeries(klines, period);
    return maSeries.map((value, index) => ({
      x: klines[index][0],
      y: value
    }));
  `,
  
  // Bollinger Bands (3 lines)
  bollingerBands: `
    const period = params.period || 20;
    const stdDev = params.stdDev || 2;
    const maSeries = helpers.calculateMASeries(klines, period);
    
    return klines.map((kline, i) => {
      if (!maSeries[i]) {
        return { x: kline[0], y: null, y2: null, y3: null };
      }
      
      // Calculate standard deviation
      let sumSquares = 0;
      let count = 0;
      for (let j = Math.max(0, i - period + 1); j <= i; j++) {
        const close = parseFloat(klines[j][4]);
        sumSquares += Math.pow(close - maSeries[i], 2);
        count++;
      }
      const std = Math.sqrt(sumSquares / count);
      
      return {
        x: kline[0],
        y: maSeries[i],              // Middle band
        y2: maSeries[i] + (std * stdDev),  // Upper band
        y3: maSeries[i] - (std * stdDev)   // Lower band
      };
    });
  `,
  
  // Volume with colors
  volumeBars: `
    return klines.map(kline => ({
      x: kline[0],
      y: parseFloat(kline[5]),
      color: parseFloat(kline[4]) > parseFloat(kline[1]) ? '#10b981' : '#ef4444'
    }));
  `,
  
  // RSI
  rsi: `
    const period = params.period || 14;
    const rsiSeries = helpers.calculateRSI(klines, period);
    if (!rsiSeries) return [];
    
    return rsiSeries.map((value, index) => ({
      x: klines[index][0],
      y: value
    }));
  `
};