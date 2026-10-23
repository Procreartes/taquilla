# API de Taquilla (también se usa para el proceso «trabajador»)
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/dominio/package.json packages/dominio/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --workspace @taquilla/api --include-workspace-root=false --omit=dev --ignore-scripts
COPY packages/dominio packages/dominio
COPY apps/api apps/api
COPY db db
COPY datos datos
USER node
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "@taquilla/api"]
