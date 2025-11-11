# Multi-stage Dockerfile for Order Processor (Optimized)

FROM node:18-alpine AS dependencies

# Install security updates
RUN apk add --no-cache libc6-compat dumb-init

WORKDIR /app

# Copy package files (leverage Docker cache)
COPY package.json package-lock.json* ./

# Install production dependencies with exact versions
RUN npm ci --only=production --ignore-scripts && \
    npm cache clean --force && \
    rm -rf /tmp/*

# =========================================
# Production Stage
# =========================================

FROM node:18-alpine AS runner

# Install dumb-init for proper signal handling
RUN apk add --no-cache dumb-init

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nodejs

WORKDIR /app

ENV NODE_ENV=production

# Copy dependencies and source code
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs backend ./backend

USER nodejs

# Use dumb-init for proper signal handling in containers
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/workers/orderProcessor.js"]