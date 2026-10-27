#!/usr/bin/env python3
"""Install the booth as user systemd units on AILAB-spark-remote (aarch64, no Docker).

Same components, ports and settings as the simx `booth-stability-*` deployment;
only paths and the Paper launcher differ. Requires systemd-logind and linger.
"""
import json
import shlex
import subprocess
import sys
from pathlib import Path

ROOT = Path('/home/user/Workspace/Minecraft_Agent')
BOOTH = ROOT / 'booth'
NODE = ROOT / 'tools/node/bin/node'
JAVA = ROOT / 'tools/jdk/bin/java'
UNITS = Path.home() / '.config/systemd/user'

SETTINGS = json.loads((BOOTH / 'ops/spark-settings.json').read_text())


def env(**values):
    return '\n'.join(f'Environment={shlex.quote(f"{k}={v}")}' for k, v in values.items())


def service(name, description, workdir, command, extra='', after=''):
    after_lines = f'After={after}\nRequires={after}\n' if after else ''
    return name, f"""[Unit]
Description={description}
StartLimitIntervalSec=0
{after_lines}
[Service]
WorkingDirectory={workdir}
ExecStart={command}
Restart=always
RestartSec=5
TimeoutStopSec=20
KillMode=control-group
{extra}

[Install]
WantedBy=default.target
"""


UNIT_FILES = [
    service('booth-mc', 'Booth Paper 1.21.4 server (loopback 25571, RCON 25581)', BOOTH / 'mc-data',
            f'{JAVA} -Xms2G -Xmx2G -jar paper-1.21.4-232.jar --nogui', extra='StandardInput=null'),
    service('booth-vllm-30b', 'Booth LLM (vLLM, Qwen3-30B-A3B FP8, 127.0.0.1:8011)', ROOT,
            f'{ROOT}/vllm-env/bin/vllm serve Qwen/Qwen3-30B-A3B-Instruct-2507-FP8 --host 127.0.0.1 --port 8011 '
            '--gpu-memory-utilization 0.42 --max-model-len 8192 --enable-prefix-caching',
            # Triton compiles a small C helper at startup and needs Python.h; the headers come from the
            # python3.12-dev / libpython3.12-dev debs unpacked under tools/pyheaders (no root needed).
            extra=env(HF_HUB_OFFLINE='1', VLLM_USE_FLASHINFER_SAMPLER='0', VLLM_USE_DEEP_GEMM='0',
                      CPATH=f'{ROOT}/tools/pyheaders/root/usr/include/python3.12:{ROOT}/tools/pyheaders/root/usr/include')),
    service('booth-stability-xvfb', 'Booth virtual display :95', BOOTH,
            '/usr/bin/Xvfb :95 -screen 0 854x480x24 -nolisten tcp'),
    service('booth-stability-client', 'Booth spectator client (Viewer)', BOOTH,
            f'{ROOT}/mc-launcher/bin/portablemc --main-dir {BOOTH}/mc-client start --jvm {JAVA} --lwjgl 3.3.3 '
            '1.21.4 -u Viewer -s 127.0.0.1 -p 25571 --resolution 854x480',
            # portablemc extracts natives into a fresh bin/<id> per launch and never removes them.
            extra=env(DISPLAY=':95', LIBGL_ALWAYS_SOFTWARE='1') +
            f"\nExecStartPre=/usr/bin/find {BOOTH}/mc-client/bin -mindepth 1 -maxdepth 1 -mmin +2 -exec rm -rf {{}} +"
            f'\nExecStartPost=/usr/bin/python3 {BOOTH}/ops/third-person.py',
            after='booth-stability-xvfb.service'),
    service('booth-stability-mindcraft', 'Booth Mindcraft agent', BOOTH / 'mindcraft', f'{NODE} main.js',
            extra=env(SETTINGS_JSON=json.dumps(SETTINGS, ensure_ascii=False))),
    service('booth-stability-gateway', 'Booth gateway (127.0.0.1:8772)', BOOTH / 'gateway', f'{NODE} server.js',
            extra=env(BOOTH_PORT='8772', BOOTH_MINDSERVER='http://127.0.0.1:8086', BOOTH_RCON_PORT='25581',
                      BOOTH_CAPTURE_DISPLAY=':95', BOOTH_MODEL_LABEL='Qwen3-30B + verified actions',
                      BOOTH_KOREAN_PYTHON=f'{BOOTH}/korean-env/bin/python',
                      PATH=f'{ROOT}/tools/node/bin:/usr/local/bin:/usr/bin:/bin')),
]

WATCHDOG = {
    'booth-stability-watchdog.service':
        f'[Unit]\nDescription=Minecraft booth recovery check\n[Service]\nType=oneshot\n'
        f'ExecStart=/usr/bin/python3 {BOOTH}/ops/watchdog.py\n',
    'booth-stability-watchdog.timer':
        '[Unit]\nDescription=Minecraft booth recovery timer\n[Timer]\nOnBootSec=120\nOnUnitActiveSec=20\nAccuracySec=1s\n'
        '[Install]\nWantedBy=timers.target\n',
}


def main():
    UNITS.mkdir(parents=True, exist_ok=True)
    for name, text in UNIT_FILES:
        (UNITS / f'{name}.service').write_text(text)
    for name, text in WATCHDOG.items():
        (UNITS / name).write_text(text)
    names = [name for name, _ in UNIT_FILES]
    if '--write-only' in sys.argv:
        print('Wrote', len(names) + 2, 'unit files to', UNITS)
        return
    subprocess.run(['systemctl', '--user', 'daemon-reload'], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', *names], check=True)
    subprocess.run(['systemctl', '--user', 'enable', '--now', 'booth-stability-watchdog.timer'], check=True)
    print('Enabled:', ', '.join(names), '+ watchdog timer')


if __name__ == '__main__':
    main()
