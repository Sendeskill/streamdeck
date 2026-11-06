"""Split src/assets/miner.gif (3x2 sprite sheet animation) into one transparent GIF per
miner, plus 144x144 key frames for the Stream Deck plugin.

Usage: python scripts/split-miner.py
Requires Pillow.
"""

import json
import os
import shutil

from PIL import Image, ImageSequence

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "src", "assets", "miner.gif")
GIF_DIR = os.path.join(ROOT, "src", "assets", "miners")
KEY_DIR = os.path.join(ROOT, "com.sendeskill.devdeck.sdPlugin", "imgs", "miner")

# Sheet order: top row left to right, then bottom row.
NAMES = ["parado", "golpe", "golpe-cima", "estocada", "dano", "morte"]
BACKGROUND = {(72, 68, 86), (91, 87, 104)}
KEY_SIZE = 144
KEY_BG = (24, 23, 32)
FEET_Y = 136
PAD = 4
KEY_COLOR = (255, 0, 255)


def load_frames():
    im = Image.open(SRC)
    frames, durations = [], []
    for f in ImageSequence.Iterator(im):
        rgba = f.convert("RGBA")
        px = rgba.load()
        for y in range(rgba.height):
            for x in range(rgba.width):
                if px[x, y][:3] in BACKGROUND:
                    px[x, y] = (0, 0, 0, 0)
        frames.append(rgba)
        durations.append(f.info.get("duration", 100))
    return frames, durations


def spans(flags, min_gap=6):
    out, start, gap, end = [], None, 0, 0
    for i, f in enumerate(flags):
        if f:
            start = i if start is None else start
            gap, end = 0, i
        elif start is not None:
            gap += 1
            if gap >= min_gap:
                out.append((start, end + 1))
                start = None
    if start is not None:
        out.append((start, end + 1))
    return out


def union_alpha(frames):
    union = Image.new("L", frames[0].size, 0)
    for f in frames:
        union.paste(255, mask=f.getchannel("A"))
    return union


def save_gif(path, frames, durations):
    """Save RGBA frames as a GIF with one shared palette and a transparent index."""
    keyed = []
    for f in frames:
        base = Image.new("RGB", f.size, KEY_COLOR)
        base.paste(f, mask=f.getchannel("A"))
        keyed.append(base)
    strip = Image.new("RGB", (frames[0].width * len(keyed), frames[0].height))
    for i, k in enumerate(keyed):
        strip.paste(k, (i * frames[0].width, 0))
    palette = strip.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = palette.getpalette()[: 256 * 3]
    colors = [tuple(pal[i : i + 3]) for i in range(0, len(pal), 3)]
    transparent = min(range(len(colors)), key=lambda i: sum((a - b) ** 2 for a, b in zip(colors[i], KEY_COLOR)))
    out = [k.quantize(palette=palette, dither=Image.Dither.NONE) for k in keyed]
    out[0].save(path, save_all=True, append_images=out[1:], duration=durations, loop=0, disposal=2, transparency=transparent, optimize=False)


def main():
    frames, durations = load_frames()
    union = union_alpha(frames)
    w, h = union.size
    upx = union.load()
    xs = spans([any(upx[x, y] for y in range(h)) for x in range(w)])
    ys = spans([any(upx[x, y] for x in range(w)) for y in range(h)])
    cells = [(x0, y0, x1, y1) for (y0, y1) in ys for (x0, x1) in xs]
    assert len(cells) == len(NAMES), f"expected {len(NAMES)} miners, found {len(cells)}"

    # Anchor every animation on the standing pose of frame 0 so switching keys does not jump,
    # then shift all of them by the same amount so the widest one fits the key.
    anchors = []
    for x0, y0, x1, y1 in cells:
        bx0, _, bx1, by1 = frames[0].crop((x0, y0, x1, y1)).getbbox()
        anchors.append((KEY_SIZE // 2 - (bx0 + bx1) // 2, FEET_Y - by1))
    right = max(ox + (x1 - x0) for (ox, _), (x0, _, x1, _) in zip(anchors, cells))
    shift = max(0, right - KEY_SIZE)
    assert min(ox for ox, _ in anchors) - shift >= 0, "miners do not fit the key width"

    os.makedirs(GIF_DIR, exist_ok=True)
    shutil.rmtree(KEY_DIR, ignore_errors=True)
    manifest = {}
    for name, (x0, y0, x1, y1), (ox, oy) in zip(NAMES, cells, anchors):
        ox -= shift
        crops = [f.crop((x0, y0, x1, y1)) for f in frames]

        padded = []
        for c in crops:
            p = Image.new("RGBA", (c.width + 2 * PAD, c.height + 2 * PAD), (0, 0, 0, 0))
            p.paste(c, (PAD, PAD))
            padded.append(p)
        save_gif(os.path.join(GIF_DIR, f"{name}.gif"), padded, durations)

        clipped = ox < 0 or oy < 0 or ox + crops[0].width > KEY_SIZE or oy + crops[0].height > KEY_SIZE
        key_dir = os.path.join(KEY_DIR, name)
        os.makedirs(key_dir, exist_ok=True)
        for i, c in enumerate(crops):
            key = Image.new("RGBA", (KEY_SIZE, KEY_SIZE), KEY_BG + (255,))
            key.alpha_composite(c, (ox, oy))
            key.convert("RGB").save(os.path.join(key_dir, f"{i:02d}.png"), optimize=True)
        manifest[name] = {"frames": len(crops), "durations": durations}
        print(f"{name:11s} cell={x1 - x0}x{y1 - y0} offset=({ox},{oy}){' CLIPPED' if clipped else ''}")

    with open(os.path.join(KEY_DIR, "animations.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)


if __name__ == "__main__":
    main()
