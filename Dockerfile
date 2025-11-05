# Build stage for type checking
FROM node:18-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install all dependencies (including devDependencies for type checking)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Run type checking
RUN npm run type-check

# Production stage
FROM node:18-alpine

WORKDIR /app

# Install git (required for repository operations)
RUN apk add --no-cache git openssh-client

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy application source
COPY --chown=nodejs:nodejs src/ ./src/
COPY --chown=nodejs:nodejs prompts/ ./prompts/
COPY --chown=nodejs:nodejs tsconfig.json ./

# Create directories for data with correct permissions
RUN mkdir -p /app/data/checkouts /app/data/history && \
    chown -R nodejs:nodejs /app/data

# Switch to non-root user
USER nodejs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["npm", "start"]
