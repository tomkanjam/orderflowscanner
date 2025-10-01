# Fly Machine - AI-Powered Crypto Screener
# Multi-stage build for optimized production image

# Stage 1: Build
FROM node:20-alpine AS builder

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY . .

# Copy app types (needed for compilation)
COPY ../../apps/app/types.ts ./node_modules/@app/types.ts
COPY ../../apps/app/src/abstractions/trader.interfaces.ts ./node_modules/@app/src/abstractions/trader.interfaces.ts

# Build TypeScript
RUN pnpm build

# Stage 2: Production
FROM node:20-alpine

# Install pnpm
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# Install production dependencies only
RUN pnpm install --prod --frozen-lockfile

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Copy app types for runtime (if needed)
COPY --from=builder /app/node_modules/@app ./node_modules/@app

# Set environment variables
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/health', (r) => { process.exit(r.statusCode === 200 ? 0 : 1); }).on('error', () => process.exit(1));"

# Expose WebSocket port
EXPOSE 8080

# Start the application
CMD ["node", "dist/index.js"]
