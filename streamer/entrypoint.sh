#!/usr/bin/env bash
# Orchestrates Xvfb → PulseAudio → Chromium → ffmpeg into a single long-lived
# streaming pipeline. ffmpeg runs inside a restart loop so a transient RTMP
# disconnect (YouTube re-establishing, brief network blip) does not take the
# stream down — the container only dies if the orchestrator itself is killed.
set -euo pipefail

: "${YOUTUBE_STREAM_KEY:?YOUTUBE_STREAM_KEY must be set}"

STREAM_URL="${STREAM_URL:-https://h-track-production.up.railway.app/?broadcast=1}"
WIDTH="${WIDTH:-1920}"
HEIGHT="${HEIGHT:-1080}"
FPS="${FPS:-30}"
VIDEO_BITRATE="${VIDEO_BITRATE:-4500k}"
AUDIO_BITRATE="${AUDIO_BITRATE:-128k}"
YOUTUBE_RTMP="${YOUTUBE_RTMP:-rtmp://a.rtmp.youtube.com/live2}"

mkdir -p "$XDG_RUNTIME_DIR"
chmod 700 "$XDG_RUNTIME_DIR"

CHILD_PIDS=()

cleanup() {
  echo "[streamer] shutdown signal received — terminating children"
  for pid in "${CHILD_PIDS[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  exit 0
}
trap cleanup TERM INT

echo "[streamer] starting Xvfb on ${DISPLAY} @ ${WIDTH}x${HEIGHT}x24"
Xvfb "$DISPLAY" -screen 0 "${WIDTH}x${HEIGHT}x24" -nolisten tcp +extension RANDR &
CHILD_PIDS+=($!)

# Wait until Xvfb actually accepts X11 connections — otherwise chromium
# can race and crash with "cannot open display".
for i in $(seq 1 30); do
  if xdpyinfo -display "$DISPLAY" >/dev/null 2>&1; then
    echo "[streamer] Xvfb ready"
    break
  fi
  if [ "$i" = 30 ]; then
    echo "[streamer] FATAL: Xvfb did not become ready" >&2
    exit 1
  fi
  sleep 0.2
done

echo "[streamer] starting pulseaudio"
pulseaudio --start --log-target=stderr --exit-idle-time=-1 --disallow-exit

for i in $(seq 1 30); do
  if pactl info >/dev/null 2>&1; then
    echo "[streamer] pulseaudio ready"
    break
  fi
  if [ "$i" = 30 ]; then
    echo "[streamer] FATAL: pulseaudio did not become ready" >&2
    exit 1
  fi
  sleep 0.2
done

# A null sink gives us a monitor source ffmpeg can read from without any
# real hardware. Chromium will play into the default sink → we capture the
# monitor in ffmpeg. Volume of the sink stays at 100%; the page itself
# already mixes the music at 35%.
pactl load-module module-null-sink \
  sink_name=stream_sink \
  sink_properties=device.description=StreamSink >/dev/null
pactl set-default-sink stream_sink

echo "[streamer] launching chromium → ${STREAM_URL}"
rm -rf /tmp/chromium-profile
mkdir -p /tmp/chromium-profile
chromium \
  --no-sandbox \
  --kiosk \
  --no-first-run \
  --no-default-browser-check \
  --noerrdialogs \
  --disable-translate \
  --disable-infobars \
  --disable-session-crashed-bubble \
  --disable-component-update \
  --disable-features=TranslateUI,Translate \
  --autoplay-policy=no-user-gesture-required \
  --hide-scrollbars \
  --disable-dev-shm-usage \
  --window-position=0,0 \
  --window-size="${WIDTH},${HEIGHT}" \
  --user-data-dir=/tmp/chromium-profile \
  "$STREAM_URL" \
  >/tmp/chromium.log 2>&1 &
CHILD_PIDS+=($!)

# Let the dashboard fully hydrate + start polling /api/cases before ffmpeg
# captures the first frame. Otherwise the broadcast starts with a blank
# canvas for ~5 seconds.
echo "[streamer] waiting 10s for dashboard load"
sleep 10

BUFSIZE_K=$(( ${VIDEO_BITRATE%k} * 2 ))

while true; do
  echo "[streamer] starting ffmpeg → ${YOUTUBE_RTMP}/<key>"
  ffmpeg -hide_banner -loglevel warning \
      -f x11grab -framerate "$FPS" -video_size "${WIDTH}x${HEIGHT}" -i "$DISPLAY" \
      -f pulse -i stream_sink.monitor \
      -c:v libx264 -preset veryfast -pix_fmt yuv420p \
      -g $((FPS * 2)) -keyint_min $((FPS * 2)) -sc_threshold 0 \
      -b:v "$VIDEO_BITRATE" -maxrate "$VIDEO_BITRATE" -bufsize "${BUFSIZE_K}k" \
      -c:a aac -b:a "$AUDIO_BITRATE" -ar 44100 -ac 2 \
      -f flv "${YOUTUBE_RTMP}/${YOUTUBE_STREAM_KEY}" \
    || echo "[streamer] ffmpeg exited $? — retrying in 5s"
  sleep 5
done
