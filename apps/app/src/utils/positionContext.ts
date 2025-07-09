import { Position } from '../abstractions/trading.interfaces';
import { tradingManager } from '../services/tradingManager';

export interface PositionContext {
  hasPosition: boolean;
  position?: Position;
  formattedText: string;
}

/**
 * Get position context for a symbol to include in AI prompts
 */
export async function getPositionContext(symbol: string): Promise<PositionContext> {
  try {
    const engine = tradingManager.getEngine();
    if (!engine) {
      return {
        hasPosition: false,
        formattedText: 'Position Status: No trading engine active (demo mode not initialized)'
      };
    }

    const position = await engine.getPosition(symbol);
    
    if (!position) {
      return {
        hasPosition: false,
        formattedText: 'Position Status: No open position for this symbol'
      };
    }

    // Format position details for AI consumption
    const formattedText = `Position Status: OPEN POSITION
- Side: ${position.side.toUpperCase()}
- Size: ${position.contracts.toFixed(4)} contracts
- Entry Price: $${position.entryPrice.toFixed(4)}
- Current Price: $${position.markPrice.toFixed(4)}
- Unrealized P&L: ${position.unrealizedPnl >= 0 ? '+' : ''}$${position.unrealizedPnl.toFixed(2)} (${position.percentage >= 0 ? '+' : ''}${position.percentage.toFixed(2)}%)
- Realized P&L: ${position.realizedPnl >= 0 ? '+' : ''}$${position.realizedPnl.toFixed(2)}
${position.liquidationPrice ? `- Liquidation Price: $${position.liquidationPrice.toFixed(4)}` : ''}
- Position Age: ${getPositionAge(position.timestamp)}`;

    return {
      hasPosition: true,
      position,
      formattedText
    };
  } catch (error) {
    console.error('[PositionContext] Error getting position:', error);
    return {
      hasPosition: false,
      formattedText: 'Position Status: Unable to retrieve position data'
    };
  }
}

/**
 * Get all open positions formatted for AI context
 */
export async function getAllPositionsContext(): Promise<string> {
  try {
    const engine = tradingManager.getEngine();
    if (!engine) {
      return 'Positions Overview: No trading engine active';
    }

    const positions = await engine.getPositions();
    
    if (positions.length === 0) {
      return 'Positions Overview: No open positions';
    }

    let text = `Positions Overview: ${positions.length} open position(s)\n`;
    
    for (const position of positions) {
      text += `\n${position.symbol}:
- Side: ${position.side.toUpperCase()}, Size: ${position.contracts.toFixed(4)}
- Entry: $${position.entryPrice.toFixed(4)}, Current: $${position.markPrice.toFixed(4)}
- P&L: ${position.unrealizedPnl >= 0 ? '+' : ''}$${position.unrealizedPnl.toFixed(2)} (${position.percentage >= 0 ? '+' : ''}${position.percentage.toFixed(2)}%)`;
    }

    return text;
  } catch (error) {
    console.error('[PositionContext] Error getting all positions:', error);
    return 'Positions Overview: Unable to retrieve positions data';
  }
}

/**
 * Calculate position age in human-readable format
 */
function getPositionAge(timestamp: Date): string {
  const now = new Date();
  const ageMs = now.getTime() - timestamp.getTime();
  
  const hours = Math.floor(ageMs / (1000 * 60 * 60));
  const minutes = Math.floor((ageMs % (1000 * 60 * 60)) / (1000 * 60));
  
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes}m`;
  }
}

/**
 * Get risk context based on current positions
 */
export async function getRiskContext(): Promise<string> {
  try {
    const engine = tradingManager.getEngine();
    if (!engine) {
      return '';
    }

    const positions = await engine.getPositions();
    const balances = await engine.getBalances();
    const usdtBalance = balances.find(b => b.currency === 'USDT');
    
    if (!usdtBalance) {
      return '';
    }

    const totalExposure = positions.reduce((sum, pos) => {
      return sum + (pos.contracts * pos.markPrice);
    }, 0);

    const exposurePercent = (totalExposure / usdtBalance.total) * 100;

    return `\nRisk Context:
- Account Balance: $${usdtBalance.total.toFixed(2)} USDT
- Total Exposure: $${totalExposure.toFixed(2)} (${exposurePercent.toFixed(1)}% of balance)
- Open Positions: ${positions.length}`;
  } catch (error) {
    console.error('[PositionContext] Error getting risk context:', error);
    return '';
  }
}