# GEMINI.md

## Project Overview

This project is a sophisticated, AI-powered cryptocurrency screener for the Binance exchange. It is designed to provide real-time market analysis and generate trading signals based on user-defined strategies. The application is a monorepo built with TypeScript, React, and Vite on the frontend, and leverages Supabase for its backend infrastructure.

The architecture is highly performance-oriented, utilizing web workers and `SharedArrayBuffer` to offload heavy data processing from the main UI thread, ensuring a smooth and responsive user experience while handling high-frequency data streams.

A unique aspect of this project is its use of AI in both its core functionality and its development process. It uses Gemini AI to translate natural language trading strategies into executable code and employs a Claude AI model to automate code reviews for pull requests.

### Key Technologies

*   **Frontend:** React, TypeScript, Vite
*   **Backend:** Supabase (PostgreSQL, Realtime, Auth, Edge Functions)
*   **AI:** Gemini AI (for natural language processing), Anthropic Claude (for code review)
*   **Real-time Data:** Binance WebSocket API
*   **Package Manager:** pnpm (in a monorepo setup)
*   **Deployment:** Vercel (as indicated by `VERCEL_DEPLOYMENT_GUIDE.md`)

### Architecture

The project is structured as a monorepo with two main applications, `app` and `web`, located in the `apps` directory. The `app` directory contains the core screener application.

The application's architecture is designed for high performance and real-time data processing:

1.  **UI (Main Thread):** The main thread is responsible for rendering the React UI, managing user interactions, and displaying data.
2.  **Web Workers (Background Threads):** The heavy lifting of screening cryptocurrencies against user-defined filters is offloaded to persistent web workers.
3.  **Shared Memory:** The main thread and the web workers use `SharedArrayBuffer` to share market data (tickers and k-lines) in memory. This "zero-copy" approach eliminates the performance overhead of serializing and deserializing large amounts of data, allowing for near-instantaneous data access between threads.
4.  **Stateful Workers:** The workers are stateful and long-lived. They are initialized once and then receive commands to add, update, or remove trading strategies. This avoids the cost of repeatedly creating workers and recompiling filter code.
5.  **Efficient Processing:** The workers are designed to be highly efficient. They use a system of update flags to process only the symbols whose data has changed, and they send "delta" updates (only the changes) back to the main thread to minimize data transfer.

## Building and Running

**Prerequisites:**

*   Node.js
*   pnpm

**Installation:**

```bash
pnpm install
```

**Running the Development Server:**

To run all applications in the workspace simultaneously:

```bash
pnpm dev
```

To run only the main screener application:

```bash
pnpm dev:app
```

**Building for Production:**

To build all applications:

```bash
pnpm build
```

To build only the main screener application:

```bash
pnpm build:app
```

## Development Conventions

*   **AI-Assisted Development:** The project uses AI for both development and code review. The `.claude` and `.ai-workflow` directories, along with the `claude.yml` file and the `claude-code-review.yml` GitHub workflow, indicate a strong reliance on AI to improve code quality and streamline the development process.
*   **Monorepo:** The project is organized as a monorepo using pnpm workspaces. Shared configurations and types are intended to be placed in the `packages` directory.
*   **Testing:** While no explicit testing framework is defined in the root `package.json`, the presence of a `.playwright-mcp` directory suggests that Playwright is used for end-to-end testing.
*   **Code Quality:** The use of an automated AI code reviewer enforces a high standard of code quality, focusing on best practices, performance, security, and test coverage.
