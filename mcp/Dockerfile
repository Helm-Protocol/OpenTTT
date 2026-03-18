FROM node:20-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY server.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
