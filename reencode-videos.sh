#!/usr/bin/env bash
# Re-encode all display videos to a kiosk-friendly profile:
#   - 1080p max (scaled down, aspect kept, even dimensions; 4K -> 1080p)
#   - H.264 Main@4.0, yuv420p (widely decodable on old Android TV-box WebViews)
#   - CRF 23 capped at 5 Mbps (smooth on weak hardware, much smaller files)
#   - AAC 128k audio, +faststart (moov at front = instant play, no blank wait)
# Originals are MOVED to videos-backup/ (not deleted). Idempotent: a file whose
# original already exists in the backup is skipped, so the script can be re-run.
set -u
export PATH="$PATH:/c/ProgramData/chocolatey/bin"

VID="/c/Users/Administrator/Documents/Custom Application/auib-qms/public/videos"
BAK="/c/Users/Administrator/Documents/Custom Application/auib-qms/videos-backup"
TMP="__tmp_reencode.mp4"
LOG="$BAK/_reencode.log"

mkdir -p "$BAK"
cd "$VID" || { echo "videos dir not found"; exit 1; }
shopt -s nullglob

echo "=== re-encode run $(date) ===" >> "$LOG"
for f in *.mp4; do
  [ "$f" = "$TMP" ] && continue
  if [ -f "$BAK/$f" ]; then echo "SKIP (already done): $f"; continue; fi
  echo "ENCODING: $f"
  ffmpeg -y -nostdin -i "$f" \
    -vf "scale='min(1920,iw)':'min(1080,ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2" \
    -c:v libx264 -profile:v main -level 4.0 -pix_fmt yuv420p \
    -preset medium -crf 23 -maxrate 5M -bufsize 10M \
    -c:a aac -b:a 128k -ac 2 \
    -movflags +faststart \
    "$TMP" >>"$LOG" 2>&1
  if [ $? -eq 0 ] && [ -s "$TMP" ]; then
    mv "$f" "$BAK/$f"
    mv "$TMP" "$f"
    echo "DONE: $f -> $(du -h "$f" | cut -f1)"
  else
    echo "FAILED: $f (see $LOG)"
    rm -f "$TMP"
  fi
done
echo "=== ALL DONE $(date) ==="
