FROM node:20-alpine AS frontend-build
WORKDIR /app
COPY . .
RUN sh setup.sh
RUN cd frontend && npm install && npx vite build

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server.js db.js timer-sound.mp3 sw.js manifest.json ./
COPY icons ./icons
COPY quest ./quest
COPY --from=frontend-build /app/dist ./dist
EXPOSE 3001
CMD ["node", "server.js"]
