# Use the official Playwright image as base with matching version from package.json
FROM mcr.microsoft.com/playwright:v1.53.1-jammy

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8931

# Install system dependencies
RUN apt-get update && \
    apt-get install -y wget curl && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm cache clean --force && \
    npm install

# Copy the rest of the application
COPY . .

# Create directories and set permissions
RUN mkdir -p user-data-dirs screenshots && \
    chmod -R 777 user-data-dirs screenshots

# Expose the port the app runs on
EXPOSE 8931

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8931/health || exit 1

# Command to run the application
CMD ["npm", "run", "start"] 