# YouTube to TikTok Automator 🎥 ➡️ 📱

A containerized TypeScript application designed to automate the flow of downloading content from YouTube and uploading it to TikTok. Built with **Bun**, **Fastify**, and **Docker**.

## Features

- **📺 YouTube Ingestion**: Simple web interface to accept YouTube URLs.
- **⚡️ High-Speed Download**: Uses `yt-dlp` to download videos optimized for sharing (1080p, H.264/AAC).
- **🛠 Self-Contained**: Automatically manages dependencies. No need to manually install `ffmpeg` or `yt-dlp` on your host machine when running via Bun.
- **📦 Docker Ready**: Fully containerized environment for easy deployment.
- **🔁 TikTok Integration**: Includes service hooks for TikTok's Direct Post API (requires valid credentials).
- **🔒 Safe & Stable**: Implements memory-safe logging and connection timeouts for handling long/large video files.

## High-Level Architecture

1.  **Frontend**: A lightweight HTML interface (Tailwind CSS) for inputting URLs.
2.  **Backend**: A Fastify server running on **Bun**.
    -   Validates and processes input.
    -   Spawns `yt-dlp` processes to download video/audio.
    -   Merges and optimizes media using `ffmpeg`.
    -   Saves to a local `./downloads` directory.
    -   Triggers a background upload task to TikTok.

## Prerequisites

- **Bun** (v1.0+) OR **Docker** & **Docker Compose**
- A TikTok Developer account (for API credentials)

## 🚀 Getting Started

### Option 1: Local Development (Fastest)

This project is **self-contained**. You usually do not need to install extra binaries.

1.  **Clone the repo**
2.  **Install dependencies**:
    ```bash
    bun install
    ```
3.  **Run the server**:
    ```bash
    bun start
    ```
    *Note: On the first run, it will automatically download the necessary `yt-dlp` binary to a local `./bin` folder.*

4.  **Open the UI**:
    Navigate to `http://localhost:3000`.

### Option 2: Docker (Production-like)

1.  **Build and Run**:
    ```bash
    docker-compose up --build
    ```
2.  **Open the UI**:
    Navigate to `http://localhost:8080`.
    *Note: The Docker container maps the internal `./downloads` to your host machine's configured volume.*

### 🐳 Add to your own Docker Compose

If you want to include this service as part of your existing stack, simply add the following to your `docker-compose.yml`:

```yaml
services:
  youtube-downloader:
    # If cloning the repo locally
    build: 
      context: ./path/to/youtube-downloader-repo
    # OR if you have built an image
    # image: youtube-downloader:latest
    ports:
      - "3000:3000"
    volumes:
      - ./downloads:/app/downloads
    # You can set variables here directly to override .env
    environment:
      - ENABLE_TIKTOK=true
      - TIKTOK_ACCESS_TOKEN=your_token_here
      - ENABLE_SLACK=true
      - SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
    env_file:
      - .env
    restart: unless-stopped
```

## ⚙️ Configuration

Copy `.env.example` to `.env` and configure your keys:

```bash
cp .env.example .env
```

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | Server backend port | `3000` |
| `TIKTOK_CLIENT_KEY` | TikTok API Client Key | - |
| `TIKTOK_CLIENT_SECRET`| TikTok API Client Secret | - |
| `TIKTOK_ACCESS_TOKEN` | Direct Post Access Token | - |

## 📁 Output

Videos are saved to the `./downloads` folder in the project root.
- **Format**: `.mp4` (H.264 Video / AAC Audio)
- **Resolution**: Capped at 1080p for optimal compatibility and speed.

## 🤝 Contributing

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/amazing-feature`).
3.  Commit your changes (`git commit -m 'Add some amazing feature'`).
4.  Push to the branch (`git push origin feature/amazing-feature`).
5.  Open a Pull Request.

## License

[MIT](LICENSE)
