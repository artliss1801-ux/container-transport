# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma

# Prisma generate needs DATABASE_URL (can be dummy during build)
# NextAuth needs NEXTAUTH_SECRET and NEXTAUTH_URL during build
# Skip prisma db push (prebuild) during Docker build
ENV DATABASE_URL="postgresql://user:pass@localhost:5432/db"
ENV NEXTAUTH_URL="https://artliss.mooo.com"
ENV NEXTAUTH_SECRET="container-transport-secret-key-2024-production"
RUN npm install --legacy-peer-deps

COPY . .
RUN npx prisma generate && npx next build && cp -r .next/static .next/standalone/.next/ && cp -r public .next/standalone/

# Stage 2: Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
