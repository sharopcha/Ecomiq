# Stage 1: Install dependencies and build
FROM node:22-alpine AS builder
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./
RUN npm install

# Copy source code and build
COPY . .
# We use NX to build the storefront app
RUN npx nx build storefront --prod

# Stage 2: Production runner
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV production
# Disable Next.js telemetry
ENV NEXT_TELEMETRY_DISABLED 1

# Don't run production as root
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs
USER nextjs

# Set correct permissions for nextjs user
COPY --from=builder /app/apps/frontend/storefront/public ./public

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
# Note: Next.js standalone output must be enabled in next.config.js (`output: 'standalone'`)
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/storefront/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/storefront/.next/static ./.next/static

EXPOSE 4300
ENV PORT 4300

# server.js is created by next build from the standalone output
CMD ["node", "apps/frontend/storefront/server.js"]
