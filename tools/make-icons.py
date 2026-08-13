#!/usr/bin/env python3
"""Generate the extension's PNG icons.

A rounded teal tile with three white bars — a drawer of tools. Kept as a script
so the mark can be tweaked and regenerated without a design tool in the loop.

    python3 tools/make-icons.py
"""

import struct
import zlib
from pathlib import Path

ACCENT = (13, 124, 116)
WHITE = (255, 255, 255)
SIZES = (16, 32, 48, 128)
OUT_DIR = Path(__file__).resolve().parent.parent / "icons"

# Supersampling factor. Renders large, then box-filters down, which is what
# gives the rounded corners and bar edges clean antialiasing.
SS = 4


def rounded_tile(size):
    """RGBA pixel grid for one icon, rendered at `size` after supersampling."""
    big = size * SS
    radius = big * 0.22
    bar_h = big * 0.10
    bar_x0 = big * 0.22
    bar_x1 = big * 0.78
    bar_ys = [big * 0.28, big * 0.45, big * 0.62]

    # Accumulate coverage at high resolution.
    acc = [[[0, 0, 0, 0] for _ in range(size)] for _ in range(size)]

    for y in range(big):
        for x in range(big):
            if not _inside_rounded(x + 0.5, y + 0.5, big, radius):
                continue

            color = ACCENT
            for bar_y in bar_ys:
                if bar_x0 <= x < bar_x1 and bar_y <= y < bar_y + bar_h:
                    color = WHITE
                    break

            cell = acc[y // SS][x // SS]
            cell[0] += color[0]
            cell[1] += color[1]
            cell[2] += color[2]
            cell[3] += 255

    samples = SS * SS
    rows = []
    for row in acc:
        out = bytearray()
        for r, g, b, a in row:
            if a == 0:
                out += bytes((0, 0, 0, 0))
                continue
            # Average the colour over covered samples only, so edge pixels keep
            # their hue instead of fading toward black.
            covered = a // 255
            out += bytes((r // covered, g // covered, b // covered, a // samples))
        rows.append(bytes(out))
    return rows


def _inside_rounded(x, y, size, radius):
    if x < radius and y < radius:
        return (x - radius) ** 2 + (y - radius) ** 2 <= radius**2
    if x > size - radius and y < radius:
        return (x - (size - radius)) ** 2 + (y - radius) ** 2 <= radius**2
    if x < radius and y > size - radius:
        return (x - radius) ** 2 + (y - (size - radius)) ** 2 <= radius**2
    if x > size - radius and y > size - radius:
        return (x - (size - radius)) ** 2 + (y - (size - radius)) ** 2 <= radius**2
    return True


def write_png(path, rows, size):
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, data):
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)


def main():
    OUT_DIR.mkdir(exist_ok=True)
    for size in SIZES:
        write_png(OUT_DIR / f"icon{size}.png", rounded_tile(size), size)
        print(f"icons/icon{size}.png")


if __name__ == "__main__":
    main()
