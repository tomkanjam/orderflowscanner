import { regenerateFilterCode } from '../../services/geminiService';
import { TraderManager } from '../services/traderManager';

export async function fixBrokenTraderFilters() {
  console.log('[FixTraderFilters] Starting to fix broken trader filters...');
  
  const traderManager = new TraderManager();
  
  // Wait for initialization
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  try {
    // Get all traders
    const traders = await traderManager.getTraders();
    console.log(`[FixTraderFilters] Found ${traders.length} traders to check`);
    
    let fixedCount = 0;
    let errorCount = 0;
    
    for (const trader of traders) {
      console.log(`[FixTraderFilters] Checking trader: ${trader.name}`);
      
      // Check if filter code has old syntax
      const hasOldSyntax = 
        trader.filter.code.includes('price') && !trader.filter.code.includes('ticker.c') ||
        trader.filter.code.includes('volume') && !trader.filter.code.includes('ticker.v') ||
        trader.filter.code.includes('ema(') && !trader.filter.code.includes('helpers.') ||
        trader.filter.code.includes('rsi(') && !trader.filter.code.includes('helpers.') ||
        trader.filter.code.includes('sma(') && !trader.filter.code.includes('helpers.') ||
        trader.filter.code.includes('lowest(') && !trader.filter.code.includes('helpers.') ||
        trader.filter.code.includes('highest(') && !trader.filter.code.includes('helpers.') ||
        trader.filter.code.includes('bollingerBands(') && !trader.filter.code.includes('helpers.') ||
        trader.filter.code.includes('movingAverage(') && !trader.filter.code.includes('helpers.');
      
      if (hasOldSyntax) {
        console.log(`[FixTraderFilters] Trader ${trader.name} has old syntax, regenerating filter...`);
        
        try {
          // Regenerate filter code from descriptions
          const { filterCode } = await regenerateFilterCode(
            trader.filter.description,
            'gemini-2.5-pro',
            trader.filter.interval || '1m'
          );
          
          console.log(`[FixTraderFilters] Generated new filter code for ${trader.name}`);
          console.log(`[FixTraderFilters] Old code preview: ${trader.filter.code.substring(0, 100)}...`);
          console.log(`[FixTraderFilters] New code preview: ${filterCode.substring(0, 100)}...`);
          
          // Update the trader with new filter code
          await traderManager.updateTrader(trader.id, {
            filter: {
              ...trader.filter,
              code: filterCode
            }
          });
          
          fixedCount++;
          console.log(`[FixTraderFilters] ✅ Successfully fixed ${trader.name}`);
          
          // Add a small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
          
        } catch (error) {
          errorCount++;
          console.error(`[FixTraderFilters] ❌ Failed to fix ${trader.name}:`, error);
        }
      } else {
        console.log(`[FixTraderFilters] Trader ${trader.name} already has correct syntax, skipping`);
      }
    }
    
    console.log(`[FixTraderFilters] Fix complete! Fixed ${fixedCount} traders, ${errorCount} errors`);
    
    return {
      totalTraders: traders.length,
      fixedCount,
      errorCount
    };
    
  } catch (error) {
    console.error('[FixTraderFilters] Fatal error:', error);
    throw error;
  }
}

// Manual fixes for common patterns if regeneration fails
export function manuallyFixFilterCode(oldCode: string): string {
  let fixedCode = oldCode;
  
  // Fix price references
  fixedCode = fixedCode.replace(/\bprice\b/g, 'parseFloat(ticker.c)');
  
  // Fix volume references
  fixedCode = fixedCode.replace(/\bvolume\b/g, 'parseFloat(ticker.v)');
  
  // Fix close/open/high/low references
  fixedCode = fixedCode.replace(/\bclose\b(?!\s*\()/g, 'parseFloat(klines[klines.length - 1][4])');
  fixedCode = fixedCode.replace(/\bopen\b(?!\s*\()/g, 'parseFloat(klines[klines.length - 1][1])');
  fixedCode = fixedCode.replace(/\bhigh\b(?!\s*\()/g, 'parseFloat(klines[klines.length - 1][2])');
  fixedCode = fixedCode.replace(/\blow\b(?!\s*\()/g, 'parseFloat(klines[klines.length - 1][3])');
  
  // Fix function calls
  fixedCode = fixedCode.replace(/\bema\s*\(/g, 'helpers.getLatestEMA(klines, ');
  fixedCode = fixedCode.replace(/\bsma\s*\(/g, 'helpers.calculateMA(klines, ');
  fixedCode = fixedCode.replace(/\brsi\s*\(/g, 'helpers.getLatestRSI(klines, ');
  fixedCode = fixedCode.replace(/\bmovingAverage\s*\(/g, 'helpers.calculateMASeries(klines, ');
  fixedCode = fixedCode.replace(/\bbollingerBands\s*\(/g, 'helpers.getLatestBollingerBands(klines, ');
  fixedCode = fixedCode.replace(/\blowest\s*\(/g, 'helpers.getLowestLow(klines, ');
  fixedCode = fixedCode.replace(/\bhighest\s*\(/g, 'helpers.getHighestHigh(klines, ');
  
  // Remove multi-timeframe references (not supported in current system)
  fixedCode = fixedCode.replace(/,\s*['"]4h['"]\)/g, ')');
  fixedCode = fixedCode.replace(/,\s*['"]1h['"]\)/g, ')');
  fixedCode = fixedCode.replace(/,\s*['"]15m['"]\)/g, ')');
  
  return fixedCode;
}