/**
 * Utility to fix indicator functions that incorrectly declare klines
 * Removes declarations like: const klines = timeframes['1m'];
 * Since klines is already provided as a parameter to the function
 */

export function fixIndicatorFunction(calculateFunction: string): string {
  // Pattern to match const/let/var klines = timeframes['...'] with optional whitespace
  const klineDeclarationPattern = /(?:const|let|var)\s+klines\s*=\s*timeframes\[['"]\w+['"]\]\s*;?\s*\n?/g;
  
  // Remove the problematic declaration
  let fixed = calculateFunction.replace(klineDeclarationPattern, '');
  
  // Clean up any double newlines that might result
  fixed = fixed.replace(/\n\n+/g, '\n');
  
  // Trim any leading/trailing whitespace
  fixed = fixed.trim();
  
  return fixed;
}

/**
 * Fix all indicators in an array
 */
export function fixIndicatorArray(indicators: any[]): any[] {
  return indicators.map(indicator => {
    if (indicator.calculateFunction && typeof indicator.calculateFunction === 'string') {
      return {
        ...indicator,
        calculateFunction: fixIndicatorFunction(indicator.calculateFunction)
      };
    }
    return indicator;
  });
}

/**
 * Check if an indicator function has the klines redeclaration issue
 */
export function hasKlinesRedeclaration(calculateFunction: string): boolean {
  const klineDeclarationPattern = /(?:const|let|var)\s+klines\s*=\s*timeframes\[['"]\w+['"]\]/;
  return klineDeclarationPattern.test(calculateFunction);
}

// Example usage:
// const problematicFunction = "const klines = timeframes['1m'];\nif (!klines || klines.length < 20) return [];\nconst bands = helpers.calculateBollingerBands(klines, 20, 2);\nreturn klines.map((k, i) => ({x: k[0], y: bands.middle[i], y2: bands.upper[i], y3: bands.lower[i]}));";
// const fixedFunction = fixIndicatorFunction(problematicFunction);
// Result: "if (!klines || klines.length < 20) return [];\nconst bands = helpers.calculateBollingerBands(klines, 20, 2);\nreturn klines.map((k, i) => ({x: k[0], y: bands.middle[i], y2: bands.upper[i], y3: bands.lower[i]}));"