# Use Node.js LTS (20)
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Install system dependencies (git is required for simple-git)
RUN apk add --no-cache git

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the project
RUN npm run build

# Link the executable
RUN npm link

# Set entrypoint
ENTRYPOINT ["orchestra"]

# Default command
CMD ["--help"]
