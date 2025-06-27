

3. Fix volume profile layout
4. Volume profile improvement - HVN levels should also have a lower volume level above and below so that we catch the peaks.
5. Implement langfuse.
- vwap has to use a 1440 lookback or lookback from the last start of day(smart lookback?)
-sometimes the json respnse from gemini is not correct, especially from the smaller 2.5 flash model, and I get an error. We should catch 100% of errors in the flow and do one retry with the 2.5 model.
7. feature flags
8. posthog implementation
9. Default volume
10. No screen state
- ai sdk implementation
- remove flashing on price update from signals table
- Strategy crud: 
-- Screener
-- Trade Plan - 
-- Trade Management 
- notifications
- remove flashing rows
- Quick Start strategy templates
- performance enhancement - review how we're handling large amounts of signals in the signals table

The Advanced Settings collapsible component looks good but it           │
│   shouldn't look the same as the collapsible   

Done:
1. Create bollinger band helper
2. Historical signals are in the wrong order. Newer signals should be at the top.
6. move historical scanner controls to the top of the signals table



RSI < 30

RSI < 30 (oversold), price within 0.5% of hvn support



Break above 30-min high, Volume > 3x average, ADX rising above 25, No immediate resistance
Improve this even more that we're not catching these breakouts in a downtrend



price just mad and impulse move up and is now within 0.5% of a hvn

bullish macd
3 bullish conditions

rsi bullish divergence followed by a higher high\nrsi was below 30 within the last 50 candles

Look for a higher high and enter long on a pull back to a support level

rsi bullish divergence followed by a higher high\nrsi was below 30 within the last 50 candles
bullish macd
if price is starting to curl up, take the long. 


bullish macd
more than 1 million dollars trade volume in the last hour
breaking out


price crosses above 20ma

20ma crosses above 50ma

price is close to vwap and and hvn


tight consolidation with buildup of shorts

if price is on an HVN enter long and the setup looks bullish then target the hvn above for tp. SL at the recent low


price above 20ma. Draw fib lines on chart.

price above 20ma. Draw .618 fib on chart from the last high pivot in the last 100 bars.
price above 20ma. Draw .618 fib on chart from the last high pivot in the last 100 bars to the low in the last 100 bars.



Please ultrathink about how to implement this. Include edge cases, risks with mitigations, and any questions that you might have for the pm. Include recommended answers for the PM questions.  


1. Bar Definition: use kline intervals
  2. Persistence: yes
  3. Count Display: Column
  4. Maximum Count: no
  5. History Cleanup: no
  6. Filter-Specific: no
  7. Count Reset: When new signal is created, because the threshold was surpassed, the count should be reset. 


whats the best strategy from a ux and business perspective? each    │
│   gemini action costs me money. everthing is wssentially free right now. what im thinking is that if a   │
│   user submits a sreener input, we ask them to enter their emai and use the supabase magic link login.   │
│   thet get free access to gemini flash screener creation. they do not get access to strategy             │
│   functionality                       


