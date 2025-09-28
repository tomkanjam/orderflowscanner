# AI-Powered Binance Crypto Screener

An AI-powered cryptocurrency screener for Binance Spot markets that uses natural language to create technical trading filters. Features server-side execution architecture for optimal performance and scalability.

## Features

- Natural language to technical filter conversion using Gemini AI
- **Server-side execution** via Supabase Edge Functions (no client-side workers)
- Real-time signal streaming via Supabase Realtime
- Interactive candlestick charts with technical indicators
- Signal tracking and alerts with server persistence
- Secure API key management with Firebase AI Logic
- 95% reduction in client memory usage (<100MB)
- 460x reduction in execution frequency (candle boundaries only)

## Architecture

### Server-Side Execution (2025-09-28)
The application now uses a server-side execution model:
- **Edge Functions**: All trader logic runs in Supabase Edge Functions
- **Redis Storage**: Market data cached server-side for efficient processing
- **Real-time Streaming**: Signals stream to clients via WebSocket
- **No Web Workers**: Trader execution moved entirely to server (except chart indicators)

## Run Locally

**Prerequisites:** Node.js, pnpm, Supabase CLI

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Set up Firebase:
   - Create a Firebase project at [console.firebase.google.com](https://console.firebase.google.com)
   - Enable Firebase AI Logic
   - Select "Vertex AI Gemini API" as your provider
   - Ensure your Google Cloud project has billing enabled
   - Update `config/firebase.ts` with your Firebase configuration (if different)

3. Set up Supabase:
   - Create a Supabase project at [supabase.com](https://supabase.com)
   - Deploy Edge Functions for trader execution
   - Configure environment variables for API keys
   - Set up Redis for kline data storage

4. Run the app:
   ```bash
   pnpm dev
   ```

5. Monitor server execution:
   ```bash
   supabase functions logs --tail
   ```

## Security

This app uses Firebase AI Logic with Vertex AI backend for secure AI integration. API authentication is handled through your Google Cloud project, with no API keys exposed in the frontend code.
