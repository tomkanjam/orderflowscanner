# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is an AI-powered cryptocurrency screener for Binance Spot markets that allows users to describe technical trading conditions in natural language. The application uses Firebase AI Logic with Google's Gemini models to convert natural language into executable screening filters and visualizes results with real-time charts.

## Development Environment
Use pnpm

## Workflow
- Break down tasks into testable sub-tasks
- As you complete each sub-task, run pnpm build to catch errors, and test the new functionality either programatically or by asking the PM to test it before moving on.

## Debugging
If you run into errors, lean towards debugging first before implementing big fixes/changes
Always includes timestamps in your logging
Work with the PM on debugging


## Architecture Overview

### Service Layer
- **binanceService.ts**: Manages all Binance API interactions including WebSocket connections for real-time data
- **geminiService.ts**: Handles AI integration for generating filters and analysis using Firebase AI Logic
- **config/firebase.ts**: Firebase configuration and AI service initialization

### Data Flow
1. Initial load fetches top 100 USDT pairs by volume with 250 historical klines
2. WebSocket streams provide continuous ticker and kline updates
3. AI-generated filters execute against real-time data using helper functions
4. Results are displayed in table format with interactive charts

### Key Technical Patterns
- **State Management**: Uses React state with Map structures for O(1) lookups
- **Real-time Updates**: WebSocket-based architecture for live market data
- **AI Integration**: Firebase AI Logic with secure server-side API key management
- **Prompt Processing**: Structured prompts with JSON schema validation and retry logic
- **Technical Analysis**: Comprehensive helper functions in `screenerHelpers.ts` for indicators (MA, RSI, MACD, etc.)

### Component Structure
- **App.tsx**: Main orchestrator managing global state and data flow
- **Components**: Modular UI components in `/components` directory
- **Types**: All TypeScript interfaces defined in `types.ts`

## Important Considerations

### When Adding Features
- All technical indicators should be added to `screenerHelpers.ts` to be accessible by AI-generated code
- Maintain the separation between data fetching (services) and UI (components)
- Follow existing TypeScript patterns with strict mode enabled

### API Limitations
- Binance API has rate limits - current implementation fetches top 100 pairs
- Firebase AI Logic handles Gemini API authentication securely
- WebSocket connections may disconnect and need reconnection logic

### Security Notes
- API keys are managed securely through Firebase AI Logic - never exposed in frontend code
- Firebase configuration is safe to commit as it's meant to be public
- Consider implementing Firebase App Check for additional security

### Performance Notes
- Application filters for USDT spot pairs with >100k volume to reduce data load
- Historical data limited to 250 klines for screening, 100 for detailed analysis
- Real-time updates use efficient Map-based state management


## Git Commits
- Create a commit after every task is complete.
- Do frequent commits so that we can roll back changes easily.
- Use the Github MCP tool for commits.
