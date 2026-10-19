# --- Build the web UI --------------------------------------------------------
FROM oven/bun:1-alpine AS web
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# --- Runtime ------------------------------------------------------------------
FROM oven/bun:1-alpine

# python3 runs yt-dlp, ffmpeg does conversion and merging,
# nodejs solves YouTube's JavaScript challenges (--js-runtimes node).
RUN apk add --no-cache python3 py3-pip ffmpeg ca-certificates nodejs

# yt-dlp from PyPI so its extras come along: [default] brings the YouTube
# challenge solver scripts, curl_cffi enables browser impersonation (Vimeo and
# others). Each image build pulls the latest release.
RUN pip install --no-cache-dir --break-system-packages "yt-dlp[default]" \
 && (pip install --no-cache-dir --break-system-packages curl_cffi \
     || echo "curl_cffi unavailable; sites that need impersonation will fail")

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src ./src
COPY shared ./shared
COPY --from=web /app/dist/web ./dist/web

ENV IS_DOCKER=true
ENV DOWNLOAD_DIR=/app/downloads
RUN mkdir -p /app/downloads

EXPOSE 3000
CMD ["bun", "src/server.ts"]
