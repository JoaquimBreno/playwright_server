# Use the official Playwright image (jammy is Ubuntu 22.04 LTS)
FROM mcr.microsoft.com/playwright:v1.54.0-jammy

# Set working directory
WORKDIR /app

# Set environment variables
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8931 \
    DEBIAN_FRONTEND=noninteractive

# Install curl for healthcheck
USER root
RUN apt-get update && \
    apt-get install -y curl && \
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
    chown -R pwuser:pwuser /app

# Switch to non-root user
USER pwuser

# Expose the port the app runs on
EXPOSE 8931

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8931/health || exit 1

# Command to run the application
CMD ["npm", "run", "start"]
