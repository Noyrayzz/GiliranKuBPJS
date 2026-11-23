#!/usr/bin/env python3
"""Bakar takarir singkat ke video (tanpa suara) dan pasang poster."""
import json
import os
import re
import shutil
import subprocess

ROOT = "/home/kelvin/code/GiliranKuBPJS/brag-demo"
WORK = os.path.join(ROOT, "work")
FONT = os.path.join(WORK, "Inter.ttf")
caps = json.load(open(os.path.join(WORK, "captions.json")))

def esc(t):
    return t.replace("\\", "\\\\").replace(":", "\\:").replace("'", "\u2019").replace("%", "\\%")

filters = []
for c in caps:
    a, b = c["start"], c["end"]
    fade = 0.28
    alpha = (f"if(lt(t,{a + fade:.2f}),(t-{a:.2f})/{fade},"
             f"if(gt(t,{b - fade:.2f}),({b:.2f}-t)/{fade},1))")
    filters.append(
        f"drawtext=fontfile={FONT}:text='{esc(c['text'])}':fontsize=34:fontcolor=white:"
        f"box=1:boxcolor=0x0f1b26@0.72:boxborderw=18:x=48:y=h-104:"
        f"alpha='{alpha}':enable='between(t,{a:.2f},{b:.2f})'")

tmp = os.path.join(WORK, "video_caps.mp4")
r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", os.path.join(WORK, "video.mp4"),
                    "-vf", ",".join(filters), "-c:v", "libx264", "-preset", "slow", "-crf", "20",
                    "-pix_fmt", "yuv420p", "-movflags", "+faststart", tmp], capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-2000:])
    raise SystemExit("gagal membakar takarir")

out = os.path.join(ROOT, "demo.mp4")
dur = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                            "-of", "default=nw=1:nk=1", tmp], capture_output=True, text=True).stdout)
poster = os.path.join(ROOT, "demo.jpg")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-ss", f"{max(dur - 2.4, 0):.2f}", "-i", tmp,
                "-frames:v", "1", "-q:v", "2", poster], check=True)
baked = os.path.join(WORK, "baked.mp4")
subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", tmp, "-loop", "1", "-i", poster,
                "-filter_complex", "[0:v][1:v]overlay=enable='eq(n,0)':shortest=1[v]", "-map", "[v]",
                "-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p",
                "-an", "-movflags", "+faststart", baked], check=True)
shutil.move(baked, out)

ssim = subprocess.run(["ffmpeg", "-hide_banner", "-i", out, "-i", poster, "-filter_complex",
                       "[0:v]select=eq(n\\,0)[a];[a][1:v]ssim", "-frames:v", "1", "-f", "null", "-"],
                      capture_output=True, text=True).stderr
m = re.search(r"All:([\d.]+)", ssim)
info = subprocess.run(["ffprobe", "-v", "error", "-show_entries",
                       "format=duration,size:stream=codec_type,codec_name,width,height",
                       "-of", "default=nw=1", out], capture_output=True, text=True).stdout
print(f"durasi {dur:.2f}s | SSIM bingkai 0 vs poster {m.group(1) if m else '?'}")
print(info)
