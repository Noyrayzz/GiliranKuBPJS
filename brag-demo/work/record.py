#!/usr/bin/env python3
"""Rekam pemakaian aplikasi sungguhan: CDP screencast + Input events.

Menghasilkan work/rec/rNNNNN.png (bingkai apa adanya) dan work/timeline.json
(daftar bingkai + stempel waktu, serta catatan klik/ketikan untuk audio).
"""
import base64
import json
import os
import random
import shutil
import subprocess
import sys
import threading
import time

import websocket

ROOT = "/home/kelvin/code/GiliranKuBPJS/brag-demo"
REC = os.path.join(ROOT, "work", "rec")
BASE = "http://127.0.0.1:8090"
CHROME = os.path.expanduser(
    "~/.cache/hyperframes/chrome/chrome-headless-shell/linux-152.0.7977.30/"
    "chrome-headless-shell-linux64/chrome-headless-shell")
PORT = 9455
W, H = 1920, 1080

CURSOR_JS = r"""
(function () {
  function ensure() {
    if (document.getElementById('__di_cur')) return;
    var c = document.createElement('div');
    c.id = '__di_cur';
    c.style.cssText = 'position:fixed;left:0;top:0;width:30px;height:30px;z-index:2147483647;filter:drop-shadow(0 2px 3px rgba(9,17,26,.45));' +
      'pointer-events:none;will-change:transform;transform:translate(-100px,-100px)';
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 26 26" xmlns="http://www.w3.org/2000/svg">' +
      '<path d="M4 2 L4 21.5 L9.3 16.8 L12.8 25 L16.2 23.6 L12.8 15.6 L20 15.2 Z" ' +
      'fill="#ffffff" stroke="#1d2a36" stroke-width="1.8" stroke-linejoin="round"/></svg>';
    (document.body || document.documentElement).appendChild(c);
    document.addEventListener('mousemove', function (e) {
      c.style.transform = 'translate(' + e.clientX + 'px,' + e.clientY + 'px)';
    }, true);
    document.addEventListener('mousedown', function (e) {
      var r = document.createElement('div');
      r.style.cssText = 'position:fixed;left:' + (e.clientX - 16) + 'px;top:' + (e.clientY - 16) +
        'px;width:32px;height:32px;border:3px solid #31f2bf;border-radius:50%;z-index:2147483646;' +
        'pointer-events:none;opacity:.95;transition:transform .45s ease-out,opacity .45s ease-out';
      (document.body || document.documentElement).appendChild(r);
      requestAnimationFrame(function () { r.style.transform = 'scale(2.6)'; r.style.opacity = '0'; });
      setTimeout(function () { r.remove(); }, 520);
    }, true);
  }
  if (document.body) ensure();
  else document.addEventListener('DOMContentLoaded', ensure);
})();
"""


class Client:
    """Klien CDP dengan pembaca latar agar event screencast dan respons tidak saling mengunci."""

    def __init__(self, ws_url):
        self.ws = websocket.create_connection(ws_url, timeout=120, suppress_origin=True)
        self.id = 0
        self.awaiting = set()
        self.replies = {}
        self.cv = threading.Condition()
        self.frames = []
        self.events = []
        self._stop = False
        threading.Thread(target=self._read, daemon=True).start()

    def _read(self):
        while not self._stop:
            try:
                msg = json.loads(self.ws.recv())
            except Exception:
                return
            if "id" in msg:
                with self.cv:
                    if msg["id"] in self.awaiting:
                        self.replies[msg["id"]] = msg
                        self.awaiting.discard(msg["id"])
                    self.cv.notify_all()
                continue
            method = msg.get("method", "")
            if method == "Page.screencastFrame":
                p = msg["params"]
                i = len(self.frames)
                path = os.path.join(REC, f"r{i:05d}.png")
                with open(path, "wb") as fh:
                    fh.write(base64.b64decode(p["data"]))
                self.frames.append({"file": path, "ts": p["metadata"]["timestamp"]})
                self.send("Page.screencastFrameAck", sessionId=p["sessionId"])
            else:
                self.events.append(msg)

    def send(self, method, **params):
        with self.cv:
            self.id += 1
            i = self.id
        self.ws.send(json.dumps({"id": i, "method": method, "params": params}))
        return i

    def call(self, method, **params):
        i = self.send(method, **params)
        with self.cv:
            self.awaiting.add(i)
            deadline = time.time() + 120
            while i not in self.replies:
                left = deadline - time.time()
                if left <= 0:
                    raise TimeoutError(method)
                self.cv.wait(min(left, 0.5))
            msg = self.replies.pop(i)
        if "error" in msg:
            raise RuntimeError(f"{method}: {msg['error']}")
        return msg.get("result", {})

    def eval(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, returnByValue=True, awaitPromise=True)
        if "exceptionDetails" in r:
            raise RuntimeError(json.dumps(r["exceptionDetails"])[:400])
        return r.get("result", {}).get("value")


# ---------------------------------------------------------------- interaksi
marks = []          # (waktu, jenis) untuk audio
phases = []         # (waktu, nama) untuk takarir
cx, cy = 720, 450   # posisi kursor


def mark(kind):
    marks.append({"t": time.time(), "kind": kind})


def phase(name):
    phases.append((time.time(), name))
    print("  fase:", name)


def ease(t):
    return 4 * t * t * t if t < 0.5 else 1 - pow(-2 * t + 2, 3) / 2


def move(x, y, dur=0.32, steps=10):
    global cx, cy
    x0, y0 = cx, cy
    for i in range(1, steps + 1):
        e = ease(i / steps)
        page.call("Input.dispatchMouseEvent", type="mouseMoved",
                  x=x0 + (x - x0) * e, y=y0 + (y - y0) * e, buttons=0)
        time.sleep(dur / steps)
    cx, cy = x, y


def click_at(x, y):
    move(x, y)
    time.sleep(0.10)
    page.call("Input.dispatchMouseEvent", type="mousePressed", x=x, y=y, button="left", clickCount=1, buttons=1)
    time.sleep(0.07)
    page.call("Input.dispatchMouseEvent", type="mouseReleased", x=x, y=y, button="left", clickCount=1, buttons=0)
    mark("click")


def center(sel, n=0):
    """Pusat elemen (digulir halus lebih dulu bila di luar layar)."""
    r = page.eval(f"""(() => {{
      const els = document.querySelectorAll({json.dumps(sel)});
      const e = els[{n}]; if (!e) return null;
      const b = e.getBoundingClientRect();
      return {{x: b.left + b.width / 2, y: b.top + b.height / 2, top: b.top, bottom: b.bottom, h: b.height, w: b.width}};
    }})()""")
    if r is None:
        raise RuntimeError(f"elemen tidak ada: {sel}[{n}]")
    if r["bottom"] > H - 80 or r["top"] < 90:
        delta = r["y"] - H / 2
        wheel(max(-420, min(420, delta)))
        time.sleep(0.35)
        r = page.eval(f"""(() => {{
          const e = document.querySelectorAll({json.dumps(sel)})[{n}]; if (!e) return null;
          const b = e.getBoundingClientRect();
          return {{x: b.left + b.width / 2, y: b.top + b.height / 2}};
        }})()""")
    return r["x"], r["y"]


def wheel(dy, steps=6):
    for _ in range(steps):
        page.call("Input.dispatchMouseEvent", type="mouseWheel", x=cx, y=cy, deltaX=0, deltaY=dy / steps)
        time.sleep(0.045)
    mark("scroll")


def click(sel, n=0):
    x, y = center(sel, n)
    click_at(x, y)


def click_text(tag, text):
    idx = page.eval(f"""(() => {{
      const els = [...document.querySelectorAll({json.dumps(tag)})];
      return els.findIndex(e => e.innerText.trim().toLowerCase().includes({json.dumps(text.lower())}));
    }})()""")
    if idx is None or idx < 0:
        raise RuntimeError(f"tombol tidak ditemukan: {tag} '{text}'")
    click(tag, idx)


def click_in_card(ticket_no, action, timeout=12.0):
    """Klik tombol aksi pada kartu 'Sedang ditangani' milik tiket tertentu."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        info = page.eval(f"""(() => {{
          const cards = [...document.querySelectorAll('[data-testid=work-card]')];
          const card = cards.find(c => c.innerText.includes({json.dumps(ticket_no)}));
          const board = cards.map(c => {{
            const b = c.querySelector('[data-action]');
            return c.innerText.split('\\n')[0] + (b ? ':' + b.getAttribute('data-action') : ':');
          }});
          if (!card) return {{ok: false, board}};
          const btn = card.querySelector('[data-action={json.dumps(action)}]');
          if (!btn) return {{ok: false, board, actions: [...card.querySelectorAll('[data-action]')].map(b => b.getAttribute('data-action'))}};
          btn.scrollIntoView({{block: 'center'}});
          const r = btn.getBoundingClientRect();
          return {{ok: true, x: r.left + r.width / 2, y: r.top + r.height / 2}};
        }})()""")
        if info.get("ok"):
            time.sleep(0.35)
            pt = page.eval(f"""(() => {{
              const card = [...document.querySelectorAll('[data-testid=work-card]')]
                .find(c => c.innerText.includes({json.dumps(ticket_no)}));
              const btn = card && card.querySelector('[data-action={json.dumps(action)}]');
              if (!btn) return null;
              const r = btn.getBoundingClientRect();
              return {{x: r.left + r.width / 2, y: r.top + r.height / 2}};
            }})()""")
            if pt:
                click_at(pt["x"], pt["y"])
                return
        time.sleep(0.4)
    raise RuntimeError(f"aksi {action} untuk {ticket_no} tidak muncul; papan: {info}")


def screencast(on):
    if on:
        page.call("Page.startScreencast", format="png", quality=100, maxWidth=W, maxHeight=H, everyNthFrame=1)
    else:
        try:
            page.call("Page.stopScreencast")
        except Exception:
            pass


def login_as(role, path="/petugas", extra=0.5):
    """Masuk sebagai petugas tanpa direkam: logout lewat API, pilih akun demo, masuk."""
    goto(BASE + "/petugas", 0.05)
    page.eval("fetch('/api/v1/staff-auth/logout', {method:'POST', credentials:'same-origin'}).then(()=>true)")
    time.sleep(0.7)
    goto(BASE + "/masuk", 0.1)
    wait_for(".demo-accounts button", 12, 0.2)
    click_text(".demo-accounts button", role)
    settle(0.15)
    click('form[aria-label="Masuk petugas"] button[type=submit]')
    wait_path(path, 15, extra)


def wait_for(sel, timeout=12.0, extra=0.25):
    """Tunggu elemen muncul (bukan menebak lewat jeda tetap)."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        if page.eval(f"!!document.querySelector({json.dumps(sel)})"):
            time.sleep(extra)
            return True
        time.sleep(0.12)
    raise RuntimeError("elemen tidak muncul: " + sel)


def wait_path(prefix, timeout=15.0, extra=0.5):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if (page.eval("location.pathname") or "").startswith(prefix):
            time.sleep(extra)
            return True
        time.sleep(0.1)
    raise RuntimeError("tidak pindah ke " + prefix)


def wait_text(tag, text, timeout=15.0, extra=0.3):
    deadline = time.time() + timeout
    while time.time() < deadline:
        if page.eval(f"""(() => [...document.querySelectorAll({json.dumps(tag)})]
              .some(e => e.innerText.trim().toLowerCase().includes({json.dumps(text.lower())})))()"""):
            time.sleep(extra)
            return True
        time.sleep(0.12)
    raise RuntimeError(f"tombol '{text}' tidak muncul")


def type_text(text, lo=0.035, hi=0.075):
    for ch in text:
        page.call("Input.insertText", text=ch)
        mark("key")
        time.sleep(random.uniform(lo, hi))


def key(name, code=None, keyid=None):
    code = code or name
    keyid = keyid or {"ArrowDown": 40, "Enter": 13, "Tab": 9, "Escape": 27}.get(name, 0)
    base = {"key": name, "code": code, "windowsVirtualKeyCode": keyid, "nativeVirtualKeyCode": keyid}
    page.call("Input.dispatchKeyEvent", type="keyDown", **base)
    time.sleep(0.05)
    page.call("Input.dispatchKeyEvent", type="keyUp", **base)
    mark("click")


def goto(url, settle=1.1):
    page.call("Page.navigate", url=url)
    for _ in range(200):
        if page.eval("document.readyState") == "complete":
            break
        time.sleep(0.05)
    time.sleep(settle)
    mark("nav")


def settle(seconds):
    """Tunggu, lalu posisikan lagi kursor pada dokumen yang baru dimuat.

    Lapisan kursor dibuat ulang setiap navigasi, jadi tanpa ini penunjuk menghilang
    sampai pengguna menggerakkan mouse lagi.
    """
    time.sleep(seconds)
    try:
        page.call("Input.dispatchMouseEvent", type="mouseMoved", x=cx, y=cy, buttons=0)
    except Exception:
        pass
    time.sleep(0.05)


# ---------------------------------------------------------------- persiapan
def drain_queue():
    """Persiapan di luar rekaman: tutup semua tahap hari ini supaya tiap klik
    'Panggil berikutnya' di depan kamera memanggil tiket pasien yang baru dibuat."""
    sql = """
    update ticket_stages ts
       set status = case when su.type = 'pharmacy' then 'diserahkan' else 'selesai' end,
           called_at = coalesce(ts.called_at, now()),
           started_at = coalesce(ts.started_at, now()),
           completed_at = coalesce(ts.completed_at, now())
      from service_stages ss
      join service_units su on su.id = ss.service_unit_id
     where ss.id = ts.service_stage_id
       and ts.queue_date = current_date
       and ts.status in ('menunggu','dipanggil','sedang_dilayani','siap_diambil');
    """
    r = subprocess.run(["docker", "exec", "-i", "giliranku-db", "psql", "-U", "giliranku", "-d", "giliranku",
                        "-v", "ON_ERROR_STOP=1", "-q"], input=sql, capture_output=True, text=True)
    if r.returncode != 0:
        sys.exit("persiapan gagal: " + r.stderr[-500:])
    cek = subprocess.run(["docker", "exec", "giliranku-db", "psql", "-U", "giliranku", "-d", "giliranku", "-tAc",
                          "select status, count(*) from ticket_stages where queue_date = current_date group by status order by status"],
                         capture_output=True, text=True)
    print("status tahap setelah persiapan:", " ".join(cek.stdout.split()))


# ---------------------------------------------------------------- jalan
def main():
    shutil.rmtree(REC, ignore_errors=True)
    os.makedirs(REC, exist_ok=True)
    drain_queue()

    profile = os.path.join(ROOT, "work", "chrome-profile")
    shutil.rmtree(profile, ignore_errors=True)
    os.makedirs(profile, exist_ok=True)
    proc = subprocess.Popen(
        [CHROME, "--headless=new", f"--remote-debugging-port={PORT}", f"--user-data-dir={profile}",
         "--no-first-run", "--no-default-browser-check", "--disable-gpu", "--hide-scrollbars",
         "--force-device-scale-factor=1", "--remote-allow-origins=*", f"--window-size={W},{H}", "about:blank"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    ws_url = None
    for _ in range(120):
        try:
            import urllib.request as u
            ws_url = json.load(u.urlopen(f"http://127.0.0.1:{PORT}/json/version", timeout=1))["webSocketDebuggerUrl"]
            break
        except Exception:
            time.sleep(0.15)
    if not ws_url:
        proc.kill()
        sys.exit("chrome tidak mau jalan")

    global page
    browser = Client(ws_url)
    target = browser.call("Target.createTarget", url="about:blank")["targetId"]
    page = Client(f"ws://127.0.0.1:{PORT}/devtools/page/{target}")
    page.call("Page.enable")
    page.call("Runtime.enable")
    page.call("Emulation.setDeviceMetricsOverride", width=W, height=H, deviceScaleFactor=1, mobile=False)
    page.call("Page.addScriptToEvaluateOnNewDocument", source=CURSOR_JS)

    # --- mulai langsung di formulir
    goto(BASE + "/daftar", 0.6)
    print("mulai merekam")
    screencast(True)
    time.sleep(0.8)

    phase("form")
    wait_for("#nik", 10, 0.3)
    click("#nik"); settle(0.10); type_text("3515050505910007", 0.016, 0.030)
    click("#nama"); settle(0.08); type_text("Nadia Puspita", 0.016, 0.028)
    click("#mrn"); settle(0.08); type_text("RM-004120", 0.016, 0.028)
    click("#poli"); settle(0.22); key("ArrowDown"); settle(0.10); key("Enter"); settle(0.18)
    click('form[aria-label^="Formulir pendaftaran"] button[type=submit]')
    wait_path("/tiket/", 15, 0.5)
    ticket_url = page.eval("location.href")
    ticket_no = None
    for _ in range(40):
        ticket_no = page.eval("""(() => {
          const txt = (document.body.innerText || '') + ' ' + (document.body.textContent || '');
          const m = txt.match(/[A-Z]-\\d{3}/);
          return m ? m[0] : null;
        })()""")
        if ticket_no:
            break
        time.sleep(0.2)
    if not ticket_no:
        raise RuntimeError("nomor tiket tidak terbaca")
    print("  tiket:", ticket_no)

    phase("ticket")
    settle(0.8)
    wheel(190); settle(0.6); wheel(-100); settle(0.4)

    # --- papan pendaftaran (login di luar rekaman)
    settle(0.4)
    screencast(False)
    login_as("petugas pendaftaran")
    screencast(True)
    time.sleep(0.4)
    phase("daftar")
    wait_for('[data-testid="call-next"]', 10, 0.3)
    click('[data-testid="call-next"]'); wait_for('[data-testid="work-card"]', 12, 0.7)
    click_in_card(ticket_no, "start"); settle(0.6)
    click_in_card(ticket_no, "complete"); settle(1.1)   # biarkan kartu tujuan bergerak dulu

    # --- tiket pasien ikut berubah
    goto(ticket_url, 0.5)
    phase("ticket2")
    wheel(140); settle(0.55)

    # --- papan poli
    settle(0.3)
    screencast(False)
    login_as("petugas poli")
    screencast(True)
    time.sleep(0.4)
    phase("poli")
    wait_for('[data-testid="call-next"]', 10, 0.3)
    click('[data-testid="call-next"]'); wait_for('[data-testid="work-card"]', 12, 0.7)
    click_in_card(ticket_no, "start"); settle(0.6)
    click_in_card(ticket_no, "complete"); settle(1.1)

    # --- papan farmasi
    settle(0.3)
    screencast(False)
    login_as("petugas farmasi")
    screencast(True)
    time.sleep(0.4)
    phase("farmasi")
    wait_for('[data-testid="call-next"]', 10, 0.3)
    click('[data-testid="call-next"]'); wait_for('[data-testid="work-card"]', 12, 0.7)
    click_in_card(ticket_no, "start"); settle(0.6)
    click_in_card(ticket_no, "ready_for_pickup"); settle(1.1)

    # --- tiket akhir: obat siap diambil
    goto(ticket_url, 0.5)
    phase("pickup")
    settle(1.8)

    screencast(False)
    time.sleep(0.3)
    browser.call("Browser.close")
    proc.terminate()
    try:
        proc.wait(timeout=10)
    except subprocess.TimeoutExpired:
        proc.kill()
    shutil.rmtree(profile, ignore_errors=True)

    t0 = page.frames[0]["ts"] if page.frames else 0
    json.dump({"frames": page.frames, "marks": marks, "t0": t0,
               "phases": [{"t": t, "name": n} for t, n in phases]},
              open(os.path.join(ROOT, "work", "timeline.json"), "w"), indent=1)
    dur = page.frames[-1]["ts"] - t0 if page.frames else 0
    print(f"selesai: {len(page.frames)} bingkai, {dur:.1f} detik (di luar rekaman: {len([p for p in phases])} fase)")


if __name__ == "__main__":
    main()
