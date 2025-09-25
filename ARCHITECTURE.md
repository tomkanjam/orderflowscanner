# Architecture Document: AI-Powered Binance Crypto Screener

## 1. High-Level Overview

This document outlines the architecture of the AI-Powered Binance Crypto Screener, a web-based platform designed for real-time cryptocurrency market analysis and signal generation. The system is built as a modern, performant, and scalable application that leverages a sophisticated frontend, a robust backend-as-a-service (BaaS), and a highly optimized real-time data processing pipeline.

The core philosophy of the architecture is to provide a rich, interactive user experience by offloading computationally intensive tasks to background processes, ensuring the UI remains fluid and responsive at all times. This is achieved through a combination of web workers, shared memory, and a reactive component-based frontend.

## 2. Frontend Architecture

The frontend is a single-page application (SPA) built with React and TypeScript, using Vite as the development server and build tool.

### 2.1. Core Technologies

*   **React:** The primary UI library, used for building a component-based and reactive user interface.
*   **TypeScript:** Provides static typing for the entire codebase, improving code quality and maintainability.
*   **Vite:** A modern frontend build tool that offers a fast development experience with features like Hot Module Replacement (HMR).
*   **Tailwind CSS:** A utility-first CSS framework used for styling the application.

### 2.2. Component Structure

The application is broken down into a series of modular and reusable components:

*   **`App.tsx`:** The root component of the application, responsible for orchestrating the main layout, managing global state, and initializing services.
*   **`Sidebar.tsx`:** A major component that houses the user authentication status, the list of user-defined "Traders," and the form for creating and editing them.
*   **`MainContent.tsx`:** The main view of the application, which includes the interactive candlestick chart (`ChartDisplay`) and the table of real-time market data and signals (`TraderSignalsTable`).
*   **`ChartDisplay.tsx`:** A component dedicated to rendering the financial charts using a library like TradingView or a custom-built solution.
*   **Web Workers:** While not components, the web workers are a critical part of the frontend architecture. They run in the background and are responsible for the heavy lifting of the screening process.

### 2.3. State Management

Global state management is handled through a combination of React's built-in Context API and custom hooks:

*   **`AuthContext`:** Manages user authentication state.
*   **`SubscriptionContext`:** Manages the user's subscription tier and access levels.
*   **`StrategyContext`:** Manages the currently selected trading strategy.
*   **Custom Hooks:** Custom hooks like `useSharedTraderIntervals` encapsulate the complex logic of managing the web workers and their communication with the main thread.

For performance-critical data, such as the high-frequency ticker and k-line updates, the application avoids storing this data directly in React state. Instead, it uses `SharedArrayBuffer` to share this data between the main thread and the web workers, and the UI components read directly from this shared memory when they need to update.

## 3. Backend Architecture

The backend is built on Supabase, a comprehensive Backend-as-a-Service (BaaS) platform that provides a suite of tools for building and scaling applications.

### 3.1. Supabase Services

*   **PostgreSQL Database:** The primary data store for the application, used to store user data, trading strategies, and other application-related information.
*   **Realtime:** Supabase's real-time capabilities are used to push updates to the frontend, although the primary real-time data feed comes directly from Binance.
*   **Authentication:** Supabase Auth handles user authentication, supporting various providers and providing a secure way to manage user sessions.
*   **Edge Functions:** Serverless functions that can be used to run custom backend logic. In this project, they are likely used for tasks like interacting with the Gemini AI API.

### 3.2. Firebase AI Logic

The `README.md` also mentions Firebase AI Logic, which is used for secure API key management. This suggests that the application uses Firebase to securely store and manage the API keys needed to interact with the Gemini AI API, preventing them from being exposed in the frontend code.

## 4. Real-time Data Pipeline

The real-time data pipeline is the heart of the application and is designed for high performance and low latency.

1.  **Data Ingestion:** The application establishes a WebSocket connection directly to the Binance API to receive a continuous stream of ticker and k-line data for all relevant trading pairs.
2.  **Shared Memory Storage:** As the data streams in, it is written directly into a `SharedArrayBuffer`. This shared memory is accessible by both the main UI thread and the background web workers.
3.  **Worker-based Processing:** The `persistentTraderWorker.ts` runs in a separate thread and has direct, zero-copy access to the market data in the shared buffer. It continuously runs the user-defined filter logic against this data.
4.  **Signal Generation:** When a filter's conditions are met, the worker identifies this as a "signal" and sends a message back to the main thread.
5.  **UI Updates:** The main thread receives the signal and updates the UI to display it to the user.

This architecture minimizes the work done on the main thread and avoids the performance bottlenecks associated with serializing and deserializing large amounts of data, allowing the application to process high-frequency updates for hundreds of symbols in real time.

## 5. AI Integration

AI is a core feature of this project, used in two key areas:

*   **Natural Language to Code:** The application uses the Gemini AI API to translate user-defined trading strategies, written in natural language, into executable JavaScript code. This `filterCode` is then run by the web workers.
*   **Automated Code Review:** The project uses a GitHub Action that leverages a Claude AI model to automatically review pull requests. This helps to maintain a high standard of code quality and identify potential issues before they are merged into the main codebase.

## 6. Performance and Optimization

Performance is a critical aspect of this application's architecture. The following techniques are used to ensure a fast and responsive user experience:

*   **Web Workers:** Offloading all heavy computation to background threads.
*   **`SharedArrayBuffer`:** Eliminating data serialization overhead by allowing the main thread and workers to share memory.
*   **Stateful Workers:** Using long-lived workers to avoid the cost of re-initialization and code compilation.
*   **Selective Processing:** The workers only process data for symbols that have been updated, significantly reducing the computational load.
*   **Delta Updates:** The workers send only the changes (deltas) back to the main thread, minimizing the amount of data that needs to be transferred.

## 7. Development and Deployment

*   **Monorepo:** The project is structured as a monorepo using pnpm workspaces, which allows for better code sharing and management of multiple applications and packages.
*   **Build Process:** Vite is used for building the frontend application.
*   **Deployment:** The `VERCEL_DEPLOYMENT_GUIDE.md` file indicates that the application is designed to be deployed on Vercel, a platform optimized for hosting modern web applications.
