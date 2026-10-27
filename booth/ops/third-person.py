"""Select Minecraft's rear third-person camera once after Viewer startup."""
import ctypes, os, subprocess, time
os.environ.setdefault('DISPLAY', ':95')
for _ in range(75):
    windows = subprocess.check_output(['xwininfo', '-root', '-tree'], text=True)
    if 'Minecraft 1.21.4 - Multiplayer' in windows:
        break
    time.sleep(1)
else:
    raise RuntimeError('Viewer did not enter multiplayer')
time.sleep(3)
x = ctypes.CDLL('libX11.so.6')
t = ctypes.CDLL('libXtst.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]; x.XOpenDisplay.restype = ctypes.c_void_p
x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]; x.XKeysymToKeycode.restype = ctypes.c_uint
x.XFlush.argtypes = [ctypes.c_void_p]; x.XCloseDisplay.argtypes = [ctypes.c_void_p]
t.XTestFakeKeyEvent.argtypes = [ctypes.c_void_p, ctypes.c_uint, ctypes.c_int, ctypes.c_ulong]
d = x.XOpenDisplay(None)
if not d:
    raise RuntimeError('Viewer display unavailable')
try:
    code = x.XKeysymToKeycode(d, 0xffc2)  # F5: first person -> rear third person
    t.XTestFakeKeyEvent(d, code, 1, 0); x.XFlush(d)
    time.sleep(.1)
    t.XTestFakeKeyEvent(d, code, 0, 0); x.XFlush(d)
finally:
    x.XCloseDisplay(d)
print('Selected rear third-person camera', flush=True)
