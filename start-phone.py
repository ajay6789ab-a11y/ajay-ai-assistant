#!/usr/bin/env python3
"""
Ajay AI Assistant — "phone pe chalao" launcher.

Ye script:
  1. Aapke computer ka WiFi (LAN) IP dhoondhta hai
  2. Phone ke liye URL banata hai
  3. QR code dikhata hai (agar `qrcode` installed ho) — phone se scan karo
  4. Backend ko 0.0.0.0 pe start karta hai taaki phone connect kar sake

Chalane ke liye:
    python start-phone.py

Zaroori: phone aur computer DONO ek hi WiFi pe hone chahiye.
"""

from __future__ import annotations

import ipaddress
import shutil
import socket
import subprocess
import sys
from pathlib import Path

PORT = 8000
BACKEND = Path(__file__).parent / "backend"

# ANSI colours; disabled automatically when output is piped to a file.
_tty = sys.stdout.isatty()
C = {
    "reset": "\033[0m" if _tty else "",
    "bold": "\033[1m" if _tty else "",
    "cyan": "\033[36m" if _tty else "",
    "green": "\033[32m" if _tty else "",
    "yellow": "\033[33m" if _tty else "",
    "red": "\033[31m" if _tty else "",
    "dim": "\033[2m" if _tty else "",
}


def lan_ip() -> str | None:
    """Find this machine's address on the local network.

    Opens a UDP socket toward a public IP. Nothing is actually sent — the OS
    just picks the interface it *would* use, which is the LAN interface.
    """
    candidates: list[str] = []

    for probe in ("8.8.8.8", "1.1.1.1"):
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect((probe, 80))
            candidates.append(s.getsockname()[0])
        except OSError:
            pass
        finally:
            s.close()

    # Fallback: whatever the hostname resolves to.
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            candidates.append(info[4][0])
    except OSError:
        pass

    for ip in candidates:
        try:
            addr = ipaddress.IPv4Address(ip)
        except ValueError:
            continue
        if addr.is_private and not addr.is_loopback and not addr.is_link_local:
            return ip
    return None


def show_qr(url: str) -> bool:
    """Print a scannable QR code in the terminal. Optional dependency."""
    try:
        import qrcode  # type: ignore
    except ImportError:
        return False

    qr = qrcode.QRCode(border=1)
    qr.add_data(url)
    qr.make(fit=True)
    m = qr.get_matrix()

    # Two vertical pixels per character using half-block glyphs, so the code
    # stays square-ish and fits in a normal terminal window.
    print()
    for y in range(0, len(m), 2):
        line = []
        for x in range(len(m[y])):
            top = m[y][x]
            bottom = m[y + 1][x] if y + 1 < len(m) else False
            if top and bottom:
                line.append("\u2588")
            elif top:
                line.append("\u2580")
            elif bottom:
                line.append("\u2584")
            else:
                line.append(" ")
        print("  " + "".join(line))
    print()
    return True


def deps_installed() -> bool:
    try:
        import fastapi  # noqa: F401
        import uvicorn  # noqa: F401
    except ImportError:
        return False
    return True


def main() -> int:
    print()
    print(f"{C['bold']}{C['cyan']}  Ajay AI Assistant — Phone Mode{C['reset']}")
    print(f"{C['dim']}  {'=' * 44}{C['reset']}")

    if not BACKEND.exists():
        print(f"\n{C['red']}  ERROR:{C['reset']} 'backend' folder nahi mila.")
        print("  Ye script project ke root folder se chalao.\n")
        return 1

    if not deps_installed():
        print(f"\n{C['yellow']}  Dependencies missing.{C['reset']} Pehle ye chalao:\n")
        print(f"      cd backend")
        print(f"      pip install -r requirements.txt\n")
        return 1

    ip = lan_ip()
    if not ip:
        print(f"\n{C['yellow']}  WiFi IP nahi mila.{C['reset']}")
        print("  WiFi se connect ho? Ethernet/WiFi off to nahi hai?")
        print(f"  Phir bhi server chalu kar raha hoon — computer pe")
        print(f"  http://localhost:{PORT} kaam karega.\n")
        url = f"http://localhost:{PORT}"
    else:
        url = f"http://{ip}:{PORT}"

        print(f"\n{C['green']}{C['bold']}  Phone pe ye URL kholo:{C['reset']}\n")
        print(f"      {C['bold']}{C['cyan']}{url}{C['reset']}\n")

        if show_qr(url):
            print(f"{C['dim']}  (ya upar wala QR code phone ke camera se scan karo){C['reset']}\n")
        else:
            print(f"{C['dim']}  Tip: QR code dekhna hai to `pip install qrcode` karo{C['reset']}\n")

        print(f"{C['bold']}  Zaroori baatein:{C['reset']}")
        print("    1. Phone aur computer EK HI WiFi pe hone chahiye")
        print("    2. Phone me Chrome use karo (voice ke liye)")
        print("    3. Agar na khule to computer ka firewall band karke dekho")
        print(f"    4. Mic tabhi chalega jab aap 'Add to Home Screen' karke")
        print(f"       kholein, ya HTTPS use karein — {C['dim']}details DEPLOY.md me{C['reset']}")

    print(f"\n{C['dim']}  Server chalu ho raha hai... (band karne ke liye Ctrl+C){C['reset']}")
    print(f"{C['dim']}  {'-' * 44}{C['reset']}\n")

    uvicorn_bin = shutil.which("uvicorn")
    cmd = (
        [uvicorn_bin, "app.main:app", "--host", "0.0.0.0", "--port", str(PORT)]
        if uvicorn_bin
        else [sys.executable, "-m", "uvicorn", "app.main:app",
              "--host", "0.0.0.0", "--port", str(PORT)]
    )

    try:
        return subprocess.call(cmd, cwd=BACKEND)
    except KeyboardInterrupt:
        print(f"\n\n{C['dim']}  Server band kar diya. Bye!{C['reset']}\n")
        return 0


if __name__ == "__main__":
    sys.exit(main())
