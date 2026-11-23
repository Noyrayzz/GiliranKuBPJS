#!/usr/bin/env python3
"""Susun rekaman jadi video: potong per adegan, sambung dengan fade, beri napas di akhir adegan."""
import json
import os
import shutil
import subprocess
import sys

ROOT = "/home/kelvin/code/GiliranKuBPJS/brag-demo"
WORK = os.path.join(ROOT, "work")
CAP = 0.80        # jeda diam dalam satu adegan dipendekkan ke ini
END_HOLD = 1.00   # tahan keadaan akhir tiap adegan (biar tidak dipotong tepat setelah selesai)
CUT_GAP = 1.20    # celah lebih besar dari ini = titik potong (login di luar rekaman)
SPEED = 1.30      # percepatan keseluruhan (tanpa audio)
FADE = 0.16       # durasi fade di tiap sisi potongan

tl = json.load(open(os.path.join(WORK, "timeline.json")))
frames, t0 = tl["frames"], tl["t0"]
if not frames:
    sys.exit("tidak ada bingkai")
rel = [f["ts"] - t0 for f in frames]

# --- bagi menjadi adegan pada celah panjang
cuts = [i for i in range(len(frames) - 1) if rel[i + 1] - rel[i] > CUT_GAP]
bounds, prev = [], 0
for c in cuts:
    bounds.append((prev, c))
    prev = c + 1
bounds.append((prev, len(frames) - 1))
print(f"bingkai {len(frames)} | adegan {len(bounds)} | potongan {len(cuts)}")

# --- waktu lokal per adegan (dipangkas + tahan di akhir), lalu dipercepat
seg_frames, seg_raw, seg_graw, seg_out, offsets = [], [], [], [], []
offset = 0.0
for (i0, i1) in bounds:
    raw, acc = [], 0.0
    for i in range(i0, i1 + 1):
        raw.append(acc)
        delta = (rel[i + 1] - rel[i]) if i + 1 <= i1 else END_HOLD
        acc += min(max(delta, 1e-3), CAP if i + 1 <= i1 else END_HOLD)
    out = [x / SPEED for x in raw]
    dur = (acc / SPEED)
    seg_frames.append(list(range(i0, i1 + 1)))
    seg_raw.append(raw)
    seg_graw.append([rel[i0] + x for x in raw])   # waktu rekaman global, untuk memetakan fase
    seg_out.append(out)
    offsets.append(offset)
    offset += dur
total = offset
print(f"durasi total {total:.2f}s")

# --- render tiap adegan
TMP = os.path.join(WORK, "segs")
shutil.rmtree(TMP, ignore_errors=True)
os.makedirs(TMP, exist_ok=True)
files = []
for k, idxs in enumerate(seg_frames):
    d = os.path.join(TMP, f"s{k}")
    os.makedirs(d, exist_ok=True)
    out = seg_out[k]
    # durasi adegan = slot terakhir + tahan akhir
    dur = out[-1] + END_HOLD / SPEED
    N = max(2, int(round(dur * 30)))
    dur = N / 30.0   # pakai durasi berkas yang sebenarnya, supaya fade-out pasti terlihat
    j = 0
    for n in range(N):
        t = n / 30.0
        while j + 1 < len(out) and out[j + 1] <= t:
            j += 1
        src = frames[idxs[min(j, len(idxs) - 1)]]["file"]
        os.symlink(os.path.abspath(src), os.path.join(d, f"f{n:05d}.png"))
    vf = []
    if k > 0:
        vf.append(f"fade=t=in:st=0:d={FADE}")
    if k < len(seg_frames) - 1:
        vf.append(f"fade=t=out:st={max(dur - FADE, 0):.3f}:d={FADE}")
    vf.append("format=yuv420p")
    mp4 = os.path.join(TMP, f"s{k}.mp4")
    r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "30",
                        "-i", os.path.join(d, "f%05d.png"), "-vf", ",".join(vf),
                        "-c:v", "libx264", "-preset", "slow", "-crf", "20", mp4],
                       capture_output=True, text=True)
    if r.returncode != 0:
        print(r.stderr[-1500:])
        sys.exit(f"gagal encode adegan {k}")
    files.append(mp4)
    print(f"  adegan {k}: {dur:5.2f}s  ({len(idxs)} bingkai)")

lst = os.path.join(TMP, "list.txt")
open(lst, "w").write("\n".join(f"file '{f}'" for f in files) + "\n")
silent = os.path.join(WORK, "video.mp4")
r = subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0",
                    "-i", lst, "-c", "copy", "-movflags", "+faststart", silent],
                   capture_output=True, text=True)
if r.returncode != 0:
    print(r.stderr[-1500:])
    sys.exit("gagal menggabungkan adegan")
real = float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                             "-of", "default=nw=1:nk=1", silent], capture_output=True, text=True).stdout)
print(f"video senyap: {real:.2f}s")


# --- peta waktu rekaman -> waktu video
def out_time(t):
    r = t - t0
    for k, raw in enumerate(seg_graw):
        if raw[0] <= r <= raw[-1] or k == len(seg_graw) - 1:
            lo, hi = 0, len(raw) - 1
            while lo < hi:
                mid = (lo + hi + 1) // 2
                if raw[mid] <= r:
                    lo = mid
                else:
                    hi = mid - 1
            return offsets[k] + seg_out[k][lo]
    return total


TEXT = {
    "form": "Pasien mendaftar dari web",
    "ticket": "Tiket terbit: posisi antrean dan status terbaca",
    "daftar": "Petugas memanggil lalu menyelesaikan",
    "ticket2": "Status pasien ikut berubah",
    "poli": "Poli memproses tiket yang sama",
    "farmasi": "Farmasi menandai obat siap diambil",
    "pickup": "Obat siap diambil",
}
phs = tl.get("phases", [])
caps = []
for i, ph in enumerate(phs):
    a = out_time(ph["t"])
    b = out_time(phs[i + 1]["t"]) if i + 1 < len(phs) else total
    caps.append({"start": round(a + 0.12, 2), "end": round(b - 0.02, 2), "text": TEXT.get(ph["name"], ph["name"])})
json.dump(caps, open(os.path.join(WORK, "captions.json"), "w"), indent=1, ensure_ascii=False)
for c in caps:
    print(f"  takarir {c['start']:5.1f}-{c['end']:5.1f}  {c['text']}")
json.dump({"total": total}, open(os.path.join(WORK, "duration.json"), "w"))
print("video siap:", silent)
