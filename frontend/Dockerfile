FROM node:18-alpine

WORKDIR /app

# Copy package manager files first for better caching
COPY package.json yarn.lock ./

# Enable corepack and install dependencies with Yarn
RUN corepack enable && yarn install --frozen-lockfile

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Start development server
CMD ["yarn", "start"]