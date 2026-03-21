FROM node:20-alpine

RUN apk add --no-cache docker-cli git

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

ENTRYPOINT ["node", "dist/runner-sim/index.js"]
