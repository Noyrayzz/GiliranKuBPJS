#!/usr/bin/env bash
set -euo pipefail

case "${1:-start}" in
  start)
    docker rm -f giliranku-tunnel 2>/dev/null || true
    docker run -d --name giliranku-tunnel --net=host cloudflare/cloudflared:latest tunnel --no-autoupdate --url http://127.0.0.1:8090
    echo "Menunggu URL tunnel dari Cloudflare..."
    URL=""
    for i in {1..15}; do
      sleep 1
      URL=$(docker logs giliranku-tunnel 2>&1 | grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' | head -n 1 || true)
      if [ -n "$URL" ]; then
        break
      fi
    done
    if [ -n "$URL" ]; then
      echo "Tunnel aktif:"
      echo "$URL"
    else
      echo "Gagal mengambil URL dalam 15 detik. Periksa log dengan: docker logs giliranku-tunnel"
    fi
    ;;
  stop)
    docker rm -f giliranku-tunnel 2>/dev/null || true
    echo "Tunnel dihentikan."
    ;;
  status|url)
    docker logs giliranku-tunnel 2>&1 | grep -o 'https://[a-zA-Z0-9.-]*\.trycloudflare\.com' | head -n 1
    ;;
  *)
    echo "Penggunaan: $0 {start|stop|url}"
    exit 1
    ;;
esac
