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

# Boot-time updates don't help a container that stays up for weeks: a yt-dlp
# release that lands mid-uptime (e.g. the 2026.08.19 YouTube 403 fix) leaves
# downloads broken until someone restarts the container. Re-check daily in the
# background so a running container heals itself within a day of a release.
(
  while sleep 86400; do
    echo "[entrypoint] Daily yt-dlp update check..."
    yt-dlp -U 2>&1 || echo "[entrypoint] Daily yt-dlp update failed; retrying in 24h"
  done
) &

exec "$@"
