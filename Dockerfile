FROM oven/bun:alpine

# Install system dependencies
# python3 and py3-pip are required for yt-dlp
# ffmpeg is required for media processing
# curl and ca-certificates are needed for downloading yt-dlp
RUN apk add --no-cache \
    python3 \
    py3-pip \
    ffmpeg \
    curl \
    ca-certificates \
    nodejs

# Install yt-dlp directly from the repository
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp && \
    chmod a+rx /usr/local/bin/yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY bun.lock* ./

# Install app dependencies
RUN bun install

# Copy app source
COPY . .

# Install entrypoint that self-updates yt-dlp on every container start
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod a+rx /usr/local/bin/docker-entrypoint.sh

# Create downloads directory
RUN mkdir -p /app/downloads

# Expose port
EXPOSE 3000

# Set Docker environment flag
ENV IS_DOCKER=true
ENV DOWNLOAD_DIR=/app/downloads

# Self-update yt-dlp on start, then launch the app
ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["bun", "src/server.ts"]
