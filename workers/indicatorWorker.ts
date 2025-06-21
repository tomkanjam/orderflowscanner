import { Kline, IndicatorDataPoint, CustomIndicatorConfig } from '../types';
import * as helpers from '../screenerHelpers';

// Message types for communication with main thread
export interface IndicatorWorkerMessage {
  id: string;
  type: 'CALCULATE_INDICATOR';
  data: {
    indicator: CustomIndicatorConfig;
    klines: Kline[];
  };
}

export interface IndicatorWorkerResponse {
  id: string;
  type: 'INDICATOR_RESULT' | 'INDICATOR_ERROR';
  data?: IndicatorDataPoint[];
  error?: string;
}

// Indicator execution function (copied from indicatorExecutor.ts)
function executeIndicatorFunction(
  code: string,
  klines: Kline[],
  params?: Record<string, any>
): IndicatorDataPoint[] {
  try {
    // Create a new function with controlled scope
    const func = new Function(
      'klines', 
      'helpers', 
      'params',
      'Math',
      'parseFloat',
      'parseInt',
      'isNaN',
      'isFinite',
      'console',
      code
    );
    
    // Execute the function
    const result = func(
      klines, 
      helpers, 
      params || {},
      Math,
      parseFloat,
      parseInt,
      isNaN,
      isFinite,
      { log: () => {} } // Provide no-op console
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
    throw error;
  }
}

function validateNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  if (isNaN(num) || !isFinite(num)) return null;
  return num;
}

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

// Listen for messages from main thread
self.addEventListener('message', (event: MessageEvent<IndicatorWorkerMessage>) => {
  const { id, type, data } = event.data;
  
  if (type === 'CALCULATE_INDICATOR') {
    try {
      const result = executeIndicatorFunction(
        data.indicator.calculateFunction,
        data.klines
      );
      
      const response: IndicatorWorkerResponse = {
        id,
        type: 'INDICATOR_RESULT',
        data: result
      };
      
      self.postMessage(response);
    } catch (error) {
      const response: IndicatorWorkerResponse = {
        id,
        type: 'INDICATOR_ERROR',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      
      self.postMessage(response);
    }
  }
});

// Export nothing as this is a worker script
export {};