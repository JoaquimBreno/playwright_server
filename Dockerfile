# Use Node.js LTS version as base image
FROM node:20-slim

# Set working directory
WORKDIR /app

# Install dependencies required for Playwright and additional tools
RUN apt-get update && apt-get install -y \
    libglib2.0-0 \
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxcb1 \
    libxkbcommon0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libxtst6 \
    xvfb \
    fonts-liberation \
    fonts-noto-color-emoji \
    && rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install Node.js dependencies with clean npm cache
RUN npm cache clean --force && \
    npm install

# Install Playwright browsers
RUN npx playwright install chromium --with-deps

# Copy the rest of the application
COPY . .

# Create directories for user data and screenshots with proper permissions
RUN mkdir -p user-data-dirs screenshots && \
    chmod -R 777 user-data-dirs screenshots

# Expose the port the app runs on
EXPOSE 8931

# Set NODE_ENV to production
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8931

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8931/health || exit 1

# Command to run the application
CMD ["npm", "run", "start"] 