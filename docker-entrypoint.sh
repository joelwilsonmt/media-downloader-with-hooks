#!/bin/sh
# Keep yt-dlp fresh on every container start.
#
# The binary is baked into the image at build time (see Dockerfile), so it
# drifts out of date between image rebuilds. SoundCloud/YouTube extractors
# break frequently, so a stale binary means downloads silently stall or fail.
# Self-updating on boot means a simple container restart always pulls the
# latest yt-dlp, without waiting for an image rebuild.
#
# Non-fatal: if GitHub is unreachable at boot we keep the baked-in version.
echo "[entrypoint] Updating yt-dlp to latest..."
yt-dlp -U 2>&1 || echo "[entrypoint] yt-dlp self-update failed; continuing with baked-in version"
echo "[entrypoint] yt-dlp version: $(yt-dlp --version 2>/dev/null)"

exec "$@"
