# AI-Powered Binance Crypto Screener

An AI-powered cryptocurrency screener for Binance Spot markets that uses natural language to create technical trading filters.

## Features

- Natural language to technical filter conversion using Gemini AI
- Real-time market data from Binance WebSocket
- Interactive candlestick charts with technical indicators
- Signal tracking and alerts
- Secure API key management with Firebase AI Logic

## Run Locally

**Prerequisites:** Node.js, pnpm

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

3. Run the app:
   ```bash
   pnpm dev
   ```

## Security

This app uses Firebase AI Logic with Vertex AI backend for secure AI integration. API authentication is handled through your Google Cloud project, with no API keys exposed in the frontend code.
