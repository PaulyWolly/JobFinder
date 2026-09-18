from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
from pathlib import Path

from watchfiles import DefaultFilter, watch

BACKEND = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = os.environ.get("JOB_FINDER_API_PORT", "8000")


class PythonFilter(DefaultFilter):
    def __call__(self, change: object, path: str) -> bool:
        if Path(path).name == "dev.py":
            return False
        return super().__call__(change, path) and path.endswith(".py")


def port_free() -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex((HOST, int(PORT))) != 0


def pids_on_port() -> list[int]:
    try:
        output = subprocess.check_output(["netstat", "-ano", "-p", "tcp"], text=True, errors="ignore")
    except Exception:
        return []
    pids: list[int] = []
    needle = f":{PORT}"
    for line in output.splitlines():
        if "LISTENING" not in line.upper() or needle not in line:
            continue
        pid = line.split()[-1]
        if pid.isdigit() and int(pid) not in pids:
            pids.append(int(pid))
    return pids


def wait_for_port(timeout: float = 12.0) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if port_free():
            return True
        time.sleep(0.25)
    return port_free()


def kill_port() -> None:
    for pid in pids_on_port():
        if pid == os.getpid():
            continue
        subprocess.run(["taskkill", "/PID", str(pid), "/F"], capture_output=True, check=False)


def start() -> subprocess.Popen[bytes]:
    if not wait_for_port():
        kill_port()
        wait_for_port()
    return subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            HOST,
            "--port",
            PORT,
        ],
        cwd=BACKEND,
    )


def stop(proc: subprocess.Popen[bytes]) -> None:
    if proc.poll() is None:
        proc.terminate()
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            proc.kill()
            proc.wait(timeout=5)
    if not wait_for_port():
        kill_port()
        wait_for_port()


if __name__ == "__main__":
    print(f"Watching {BACKEND} and serving http://{HOST}:{PORT}", flush=True)
    proc = start()
    try:
        for _ in watch(BACKEND, watch_filter=PythonFilter(), force_polling=True, poll_delay_ms=400):
            print("Python file changed, restarting API...", flush=True)
            stop(proc)
            proc = start()
    except KeyboardInterrupt:
        pass
    finally:
        stop(proc)
