# Stage 1: Build the TypeScript application
FROM node:22-alpine AS builder

WORKDIR /usr/src/app

COPY package*.json tsconfig.json ./

RUN npm ci

COPY src/ ./src/

RUN npm run build

# Stage 2: Run the production application
FROM node:22-alpine AS runner

WORKDIR /usr/src/app

COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

COPY --from=builder /usr/src/app/dist ./dist

# Expose HTTP server port
EXPOSE 5000

ENV NODE_ENV=production

# Default start command runs the HTTP server.
# Can be overridden in container config to run the worker process (node dist/worker.js)
CMD ["node", "dist/server.js"]
