#!/bin/sh
# Keep yt-dlp fresh on every container start, and daily while it runs.
#
# yt-dlp is baked into the image at build time (see Dockerfile), so it drifts
# out of date between image rebuilds. SoundCloud/YouTube extractors break
# frequently, so a stale copy means downloads silently stall or fail.
#
# It is installed with pip (to get the [default] extras and curl_cffi), so it
# updates through pip; `yt-dlp -U` refuses to touch a pip install.
#
# Non-fatal: if PyPI is unreachable we keep the version we have.
update_ytdlp() {
  pip install --quiet --no-cache-dir --break-system-packages --root-user-action=ignore --upgrade "yt-dlp[default]" 2>&1 \
    || echo "[entrypoint] yt-dlp update failed; continuing with $(yt-dlp --version 2>/dev/null)"
}

echo "[entrypoint] Updating yt-dlp to latest..."
update_ytdlp
echo "[entrypoint] yt-dlp version: $(yt-dlp --version 2>/dev/null)"

# Boot-time updates don't help a container that stays up for weeks: a yt-dlp
# release that lands mid-uptime (e.g. the 2026.08.19 YouTube 403 fix) leaves
# downloads broken until someone restarts the container. Re-check daily in the
# background so a running container heals itself within a day of a release.
(
  while sleep 86400; do
    echo "[entrypoint] Daily yt-dlp update check..."
    update_ytdlp
    echo "[entrypoint] yt-dlp version: $(yt-dlp --version 2>/dev/null)"
  done
) &

exec "$@"
