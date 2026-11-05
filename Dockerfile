FROM node:20-alpine AS build
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install
COPY backend ./
RUN npm run build

FROM node:20-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm install --omit=dev
COPY --from=build /app/backend/dist ./dist
COPY frontend /app/frontend

EXPOSE 3000
CMD ["node", "dist/index.js"]
