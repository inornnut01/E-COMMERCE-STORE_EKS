# Multi-stage Dockerfile for Backend (Optimized)

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
ENV PORT=3000

# Copy dependencies and source code
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --chown=nodejs:nodejs package*.json ./
COPY --chown=nodejs:nodejs backend ./backend

USER nodejs

EXPOSE 3000

# Better health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init for proper signal handling in containers
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/server.js"]