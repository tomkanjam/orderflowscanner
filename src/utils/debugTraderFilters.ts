import { Trader } from '../abstractions/trader.interfaces';
import { traderManager } from '../services/traderManager';

/**
 * Debug utility to inspect and fix common trader filter issues
 */
export async function debugTraderFilters() {
  const traders = await traderManager.getTraders();
  const issues: Array<{traderId: string, traderName: string, issue: string, suggestion: string}> = [];
  
  for (const trader of traders) {
    if (!trader.filter?.code) continue;
    
    const filterCode = trader.filter.code;
    
    // Check for bands.slice issue
    if (filterCode.includes('bands.slice')) {
      issues.push({
        traderId: trader.id,
        traderName: trader.name,
        issue: 'Using bands.slice() on Bollinger Bands result',
        suggestion: 'Bollinger Bands returns an object {upper, middle, lower}, not an array. Use bands.upper, bands.middle, bands.lower instead.'
      });
    }
    
    // Check for tickerVolume issue
    if (filterCode.includes('tickerVolume')) {
      issues.push({
        traderId: trader.id,
        traderName: trader.name,
        issue: 'Using undefined tickerVolume property',
        suggestion: 'Use ticker.v for base asset volume or ticker.q for quote asset volume (USDT volume).'
      });
    }
    
    // Check for other common issues
    if (filterCode.includes('ticker.volume')) {
      issues.push({
        traderId: trader.id,
        traderName: trader.name,
        issue: 'Using ticker.volume instead of ticker.v or ticker.q',
        suggestion: 'Use ticker.v for base asset volume or ticker.q for quote asset volume.'
      });
    }
    
    // Check for missing return statement
    if (!filterCode.includes('return')) {
      issues.push({
        traderId: trader.id,
        traderName: trader.name,
        issue: 'Filter code missing return statement',
        suggestion: 'Filter must return true (match) or false (no match).'
      });
    }
  }
  
  return issues;
}

/**
 * Fix common issues in trader filter code
 */
export function fixFilterCode(code: string): string {
  let fixedCode = code;
  
  // Fix bands.slice issue - assuming they want recent values
  // Replace patterns like bands.slice(-N) with getting the latest band values
  fixedCode = fixedCode.replace(
    /const\s+recentBands\s*=\s*bands\.slice\(([^)]+)\);/g,
    `// Fixed: Bollinger Bands returns {upper, middle, lower} arrays, not a single array
const recentBands = {
  upper: bands.upper.slice($1),
  middle: bands.middle.slice($1),
  lower: bands.lower.slice($1)
};`
  );
  
  // Fix direct bands.slice usage
  fixedCode = fixedCode.replace(
    /bands\.slice\(([^)]+)\)/g,
    'bands.upper.slice($1) /* Fixed: Use bands.upper, bands.middle, or bands.lower */'
  );
  
  // Fix tickerVolume references
  fixedCode = fixedCode.replace(
    /ticker\.tickerVolume/g,
    'parseFloat(ticker.v) /* Fixed: Use ticker.v for volume */'
  );
  
  fixedCode = fixedCode.replace(
    /tickerVolume/g,
    'parseFloat(ticker.v) /* Fixed: Use ticker.v for volume */'
  );
  
  // Fix ticker.volume references
  fixedCode = fixedCode.replace(
    /ticker\.volume(?!\s*\))/g,
    'parseFloat(ticker.v) /* Fixed: Use ticker.v for base asset volume or ticker.q for quote volume */'
  );
  
  // Add parseFloat for numeric ticker values if missing
  fixedCode = fixedCode.replace(
    /ticker\.([cvPpqh])(?!\))/g,
    'parseFloat(ticker.$1)'
  );
  
  return fixedCode;
}

/**
 * Validate and test a filter code snippet
 */
export function validateFilterCode(code: string): { valid: boolean; error?: string } {
  try {
    // Check for return statement
    if (!code.includes('return')) {
      return { valid: false, error: 'Filter must include a return statement' };
    }
    
    // Try to create the function
    const testFn = new Function('ticker', 'klines', 'helpers', 'hvnNodes', code);
    
    // Basic syntax is valid
    return { valid: true };
  } catch (error) {
    return { 
      valid: false, 
      error: error instanceof Error ? error.message : 'Invalid JavaScript syntax' 
    };
  }
}