import { 
  IAnalysisEngine, 
  Strategy, 
  MarketData, 
  AnalysisResult, 
  TradeDecision,
  KeyLevels 
} from '../../abstractions/interfaces';
// Import from the correct location
import { generateStructuredAnalysis } from '../../../services/geminiService';
import * as helpers from '../../../screenerHelpers';

export class BrowserAnalysisEngine implements IAnalysisEngine {
  async analyzeSetup(
    symbol: string, 
    strategy: Strategy, 
    marketData: MarketData, 
    chartImage?: Blob,
    modelName: string = 'gemini-2.0-flash-exp' // Default to Gemini 2.0 Flash
  ): Promise<AnalysisResult> {
    try {
      // Calculate technical indicators
      const technicalIndicators = this.calculateTechnicalIndicators(marketData);
      
      // Convert chart image to base64 if provided
      let chartBase64: string | undefined;
      if (chartImage) {
        chartBase64 = await this.blobToBase64(chartImage);
      }
      
      // Get AI analysis using structured analysis
      const response = await generateStructuredAnalysis(
        symbol,
        marketData,
        strategy.description,
        modelName // Use the model passed in or default
      );
      
      // Parse the structured response from the analysis text
      const analysis = this.parseAnalysisResponse(response);
      
      // Enhance with calculated levels if not provided
      if (!analysis.keyLevels) {
        analysis.keyLevels = this.calculateKeyLevels(marketData, analysis.direction);
      }
      
      return {
        ...analysis,
        technicalIndicators,
        timestamp: new Date(),
      };
    } catch (error) {
      console.error('Analysis error:', error);
      throw new Error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  generateTradeDecision(analysis: AnalysisResult): TradeDecision {
    // Convert analysis to actionable trade decision
    const shouldEnter = analysis.decision === 'enter_trade';
    
    // Calculate risk/reward based on key levels
    let riskReward = 0;
    if (analysis.keyLevels && analysis.keyLevels.entry && analysis.keyLevels.stopLoss) {
      const risk = Math.abs(analysis.keyLevels.entry - analysis.keyLevels.stopLoss);
      const reward = analysis.keyLevels.takeProfit?.[0] 
        ? Math.abs(analysis.keyLevels.takeProfit[0] - analysis.keyLevels.entry)
        : risk * 2; // Default 2:1 if no TP provided
      riskReward = reward / risk;
    }
    
    // Determine urgency based on confidence and market conditions
    let urgency: 'low' | 'medium' | 'high' = 'low';
    if (analysis.confidence > 0.8) urgency = 'high';
    else if (analysis.confidence > 0.6) urgency = 'medium';
    
    return {
      shouldEnter,
      direction: analysis.direction,
      urgency,
      riskReward,
      confidence: analysis.confidence,
    };
  }

  validateAnalysis(analysis: AnalysisResult): boolean {
    // Validate that analysis has required fields
    if (!analysis.decision || !analysis.confidence || !analysis.reasoning) {
      return false;
    }
    
    // Validate confidence is in valid range
    if (analysis.confidence < 0 || analysis.confidence > 1) {
      return false;
    }
    
    // If decision is to enter, must have direction
    if (analysis.decision === 'enter_trade' && !analysis.direction) {
      return false;
    }
    
    // Validate key levels if provided
    if (analysis.keyLevels) {
      if (analysis.keyLevels.entry && analysis.keyLevels.stopLoss) {
        // Stop loss should make sense relative to entry and direction
        if (analysis.direction === 'long' && analysis.keyLevels.stopLoss >= analysis.keyLevels.entry) {
          return false;
        }
        if (analysis.direction === 'short' && analysis.keyLevels.stopLoss <= analysis.keyLevels.entry) {
          return false;
        }
      }
    }
    
    return true;
  }

  private calculateTechnicalIndicators(marketData: MarketData): Record<string, any> {
    const closes = marketData.klines.map(k => parseFloat(k[4]));
    const highs = marketData.klines.map(k => parseFloat(k[2]));
    const lows = marketData.klines.map(k => parseFloat(k[3]));
    const volumes = marketData.klines.map(k => parseFloat(k[5]));
    
    return {
      currentPrice: marketData.price,
      sma20: helpers.calculateSMA(closes, 20),
      sma50: helpers.calculateSMA(closes, 50),
      ema9: helpers.calculateEMA(closes, 9),
      ema21: helpers.calculateEMA(closes, 21),
      rsi: helpers.calculateRSI(closes, 14),
      macd: helpers.calculateMACD(closes),
      bollingerBands: helpers.calculateBollingerBands(closes, 20, 2),
      vwap: helpers.calculateVWAP(marketData.klines),
      volumeProfile: this.calculateVolumeProfile(marketData.klines),
    };
  }

  private calculateVolumeProfile(klines: any[]): { poc: number; val: number; vah: number } {
    // Simple volume profile calculation
    const priceVolumes: Record<number, number> = {};
    
    klines.forEach(kline => {
      const price = Math.round(parseFloat(kline[4])); // Round to nearest integer for grouping
      const volume = parseFloat(kline[5]);
      priceVolumes[price] = (priceVolumes[price] || 0) + volume;
    });
    
    const sortedPrices = Object.entries(priceVolumes)
      .sort((a, b) => b[1] - a[1])
      .map(([price]) => Number(price));
    
    const poc = sortedPrices[0] || 0; // Point of Control
    const val = Math.min(...sortedPrices.slice(0, 5)) || 0; // Value Area Low
    const vah = Math.max(...sortedPrices.slice(0, 5)) || 0; // Value Area High
    
    return { poc, val, vah };
  }


  private parseAnalysisResponse(response: string): Omit<AnalysisResult, 'timestamp' | 'technicalIndicators'> {
    try {
      // Extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validate and return
      return {
        decision: parsed.decision,
        direction: parsed.direction,
        confidence: parseFloat(parsed.confidence),
        reasoning: parsed.reasoning,
        keyLevels: parsed.keyLevels,
        chartAnalysis: parsed.chartAnalysis,
      };
    } catch (error) {
      console.error('Failed to parse analysis response:', error);
      // Return a safe default
      return {
        decision: 'bad_setup',
        confidence: 0,
        reasoning: 'Failed to parse AI response',
      };
    }
  }

  private calculateKeyLevels(marketData: MarketData, direction?: 'long' | 'short'): KeyLevels {
    const closes = marketData.klines.map(k => parseFloat(k[4]));
    const highs = marketData.klines.map(k => parseFloat(k[2]));
    const lows = marketData.klines.map(k => parseFloat(k[3]));
    
    const currentPrice = marketData.price;
    
    // Calculate ATR manually for stop loss calculation
    const atr = this.calculateSimpleATR(highs, lows, closes, 14);
    
    // Calculate support/resistance using recent highs/lows
    const recentHighs = highs.slice(-20).sort((a, b) => b - a);
    const recentLows = lows.slice(-20).sort((a, b) => a - b);
    
    const resistance = [recentHighs[0], recentHighs[2], recentHighs[4]].filter(Boolean);
    const support = [recentLows[0], recentLows[2], recentLows[4]].filter(Boolean);
    
    // Calculate entry and stops based on direction
    let entry = currentPrice;
    let stopLoss = currentPrice;
    let takeProfit: number[] = [];
    
    if (direction === 'long') {
      stopLoss = currentPrice - (atr * 1.5);
      takeProfit = [
        currentPrice + (atr * 2),
        currentPrice + (atr * 3),
        currentPrice + (atr * 5),
      ];
    } else if (direction === 'short') {
      stopLoss = currentPrice + (atr * 1.5);
      takeProfit = [
        currentPrice - (atr * 2),
        currentPrice - (atr * 3),
        currentPrice - (atr * 5),
      ];
    }
    
    return {
      entry,
      stopLoss,
      takeProfit,
      support,
      resistance,
    };
  }

  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        // Remove data URL prefix to get just the base64 string
        const base64Data = base64.split(',')[1];
        resolve(base64Data);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private calculateSimpleATR(highs: number[], lows: number[], closes: number[], period: number): number {
    if (highs.length < period + 1) return 0;
    
    const trueRanges: number[] = [];
    for (let i = 1; i < highs.length; i++) {
      const highLow = highs[i] - lows[i];
      const highPrevClose = Math.abs(highs[i] - closes[i - 1]);
      const lowPrevClose = Math.abs(lows[i] - closes[i - 1]);
      trueRanges.push(Math.max(highLow, highPrevClose, lowPrevClose));
    }
    
    // Simple moving average of true ranges
    const recentTR = trueRanges.slice(-period);
    return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
  }
}