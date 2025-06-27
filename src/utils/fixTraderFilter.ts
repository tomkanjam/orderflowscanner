/**
 * Utility to help fix common issues in trader filter code
 */

export function validateAndFixFilterCode(filterCode: string): { 
  isValid: boolean; 
  fixedCode?: string; 
  issues: string[] 
} {
  const issues: string[] = [];
  let fixedCode = filterCode;

  // Check for common issues
  
  // 1. Check for undefined variable references
  const undefinedVars = ['inputs', 'data', 'config', 'params'];
  for (const varName of undefinedVars) {
    const regex = new RegExp(`\\b${varName}\\b`, 'g');
    if (regex.test(filterCode)) {
      issues.push(`References undefined variable '${varName}'`);
    }
  }

  // 2. Check for Bollinger Bands usage without null checks
  const bbPatterns = [
    /(\w+)\.lower(?!\s*===?\s*null)/g,
    /(\w+)\.upper(?!\s*===?\s*null)/g,
    /(\w+)\.middle(?!\s*===?\s*null)/g
  ];
  
  for (const pattern of bbPatterns) {
    const matches = filterCode.match(pattern);
    if (matches) {
      issues.push('Accessing Bollinger Bands properties without null checks');
      
      // Try to fix by adding null checks
      fixedCode = fixedCode.replace(
        /const\s+(\w+)\s*=\s*helpers\.(calculateBollingerBands|getLatestBollingerBands)\([^;]+\);/g,
        (match, varName, funcName) => {
          return `${match}\n  if (!${varName} || ${varName}.lower === null || ${varName}.upper === null) return false;`;
        }
      );
    }
  }

  // 3. Check for array access without length checks
  if (/klines\[\d+\]/.test(filterCode) && !/klines\.length\s*[<>]=?\s*\d+/.test(filterCode)) {
    issues.push('Accessing klines array without length check');
  }

  // 4. Check for division by zero
  if (/\/\s*0\b/.test(filterCode)) {
    issues.push('Potential division by zero');
  }

  // 5. Check if using closes array incorrectly
  if (/calculateBollingerBands\s*\(\s*closes/.test(filterCode)) {
    issues.push('calculateBollingerBands should take klines, not closes');
    fixedCode = fixedCode.replace(
      /calculateBollingerBands\s*\(\s*closes/g,
      'calculateBollingerBands(klines'
    );
  }

  return {
    isValid: issues.length === 0,
    fixedCode: issues.length > 0 ? fixedCode : undefined,
    issues
  };
}

/**
 * Common filter code templates that work correctly
 */
export const filterTemplates = {
  bollingerBands: `
// Bollinger Bands squeeze example
const bb = helpers.getLatestBollingerBands(klines, 20, 2);
if (!bb || bb.lower === null || bb.upper === null) return false;

const lastClose = parseFloat(klines[klines.length - 1][4]);
const bandwidth = (bb.upper - bb.lower) / bb.middle;

// Look for price near lower band with narrow bandwidth
return lastClose <= bb.lower * 1.02 && bandwidth < 0.1;
`,

  rsiOversold: `
// RSI oversold example
const rsi = helpers.getLatestRSI(klines, 14);
if (rsi === null) return false;

return rsi < 30;
`,

  movingAverageCrossover: `
// MA crossover example
if (klines.length < 50) return false;

const ma20 = helpers.getLatestMA(klines, 20);
const ma50 = helpers.getLatestMA(klines, 50);
if (!ma20 || !ma50) return false;

const prevMa20 = helpers.calculateMA(klines.slice(0, -1), 20);
const prevMa50 = helpers.calculateMA(klines.slice(0, -1), 50);
if (!prevMa20 || !prevMa50) return false;

// Check for golden cross
return prevMa20 <= prevMa50 && ma20 > ma50;
`
};