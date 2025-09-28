const fetch = require('node-fetch');

async function fetchTopUSDTPairs(limit = 50) {
  try {
    console.log(`Fetching top ${limit} USDT pairs by volume...`);

    const response = await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const tickers = await response.json();

    // Filter USDT pairs and sort by volume
    const usdtPairs = tickers
      .filter(t => t.symbol.endsWith('USDT'))
      .filter(t => !t.symbol.includes('DOWN') && !t.symbol.includes('UP')) // Exclude leveraged tokens
      .filter(t => !t.symbol.includes('BEAR') && !t.symbol.includes('BULL')) // Exclude leveraged tokens
      .filter(t => parseFloat(t.quoteVolume) > 1000000) // Min volume threshold (1M USDT)
      .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
      .slice(0, limit)
      .map(t => ({
        symbol: t.symbol,
        volume: Math.round(parseFloat(t.quoteVolume) / 1000000) + 'M'
      }));

    console.log('\nTop USDT pairs by 24h volume:');
    console.log('================================');
    usdtPairs.forEach((pair, i) => {
      console.log(`${(i + 1).toString().padStart(2)}. ${pair.symbol.padEnd(12)} ${pair.volume.padStart(8)} USDT`);
    });

    console.log('\n\nFor .env file:');
    console.log('SYMBOLS=' + usdtPairs.map(p => p.symbol).join(','));

    return usdtPairs.map(p => p.symbol);

  } catch (error) {
    console.error('Failed to fetch top pairs:', error);
    return [];
  }
}

fetchTopUSDTPairs(50);