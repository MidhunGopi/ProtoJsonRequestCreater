# Use Node.js LTS version
FROM node:18

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json ./

# Install dependencies
RUN npm config set strict-ssl false && npm install --no-package-lock

# Copy application files
COPY server.js .
COPY public ./public

# Create uploads directory
RUN mkdir -p uploads

# Expose port
EXPOSE 3000

# Set environment variable
ENV PORT=3000

# Start the application
CMD ["node", "server.js"]
