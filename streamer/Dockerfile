# Headless Chromium + ffmpeg streamer for 24/7 YouTube Live broadcast.
# Built to run on a small Linux VPS (Hetzner CPX21 / CX32 class) — does
# software H.264 encoding of an Xvfb-rendered Chromium window and pushes
# it to YouTube's RTMP ingest.

FROM debian:bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
      ffmpeg \
      xvfb \
      x11-utils \
      pulseaudio \
      pulseaudio-utils \
      dbus-x11 \
      fonts-liberation \
      fonts-noto-color-emoji \
      ca-certificates \
      procps \
      tini \
    && rm -rf /var/lib/apt/lists/*

# Non-root user. Chromium itself runs with --no-sandbox (sandbox needs
# userns / CAP_SYS_ADMIN we don't want to grant); running as UID 1001
# still limits blast radius if the page is ever compromised.
RUN useradd -m -u 1001 -s /bin/bash streamer \
    && mkdir -p /tmp/runtime-streamer \
    && chown -R streamer:streamer /tmp/runtime-streamer \
    && chmod 700 /tmp/runtime-streamer

COPY --chown=streamer:streamer entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

USER streamer
WORKDIR /home/streamer

ENV DISPLAY=:99 \
    XDG_RUNTIME_DIR=/tmp/runtime-streamer \
    STREAM_URL=https://h-track-production.up.railway.app/?broadcast=1 \
    WIDTH=1920 \
    HEIGHT=1080 \
    FPS=30 \
    VIDEO_BITRATE=4500k \
    AUDIO_BITRATE=128k \
    YOUTUBE_RTMP=rtmp://a.rtmp.youtube.com/live2

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/entrypoint.sh"]
