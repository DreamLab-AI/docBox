#!/usr/bin/env bash
# Launch real Google Chrome headful in a virtual display with GPU acceleration.
# Mirrors the agentbox browsercontainer: the flags that keep it undetectable are
# the ABSENCE of --headless, real GPU (Vulkan/ANGLE), and a persistent profile.
set -euo pipefail

# Virtual display so Chrome runs headful (no --headless bot-tell).
Xvfb :2 -screen 0 1920x1080x24 -nolisten tcp &
export DISPLAY=:2
sleep 1

# Optional VNC view of the desktop for debugging (loopback in compose).
x11vnc -display :2 -forever -shared -nopw -rfbport 5903 -bg -quiet || true

CHROME_BIN="${CHROME_BIN:-/opt/google/chrome/google-chrome}"

exec "$CHROME_BIN" \
    --user-data-dir=/tmp/chrome-profile \
    --no-first-run \
    --no-default-browser-check \
    --no-sandbox \
    --disable-setuid-sandbox \
    --disable-dev-shm-usage \
    --enable-features=Vulkan,VulkanFromANGLE,DefaultANGLEVulkan,UseSkiaRenderer,WebGPU \
    --enable-unsafe-webgpu \
    --use-angle=vulkan \
    --ignore-gpu-blocklist \
    --enable-gpu-rasterization \
    --remote-debugging-port=9222 \
    --remote-debugging-address=0.0.0.0 \
    --remote-allow-origins=* \
    about:blank
