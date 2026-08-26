FROM node:18-alpine

WORKDIR /app

# Install dependencies first for efficient layer caching
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

EXPOSE 4000

ENV NODE_ENV=production

CMD ["npm", "start"]
