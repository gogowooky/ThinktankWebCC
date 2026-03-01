FROM node:20-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .

# Build frontend
RUN npm run build

# Build server (TypeScript to JavaScript)
RUN npm run build:server

# Expose port
EXPOSE 8080

# Start server (use compiled TypeScript server)
CMD ["node", "dist-server/index.js"]
