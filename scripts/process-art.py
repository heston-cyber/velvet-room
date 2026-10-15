"""Turn a generated character PNG (transparent background) into the site's two images:
  public/art/<key>.webp        the full figure, cropped to the drawing, 1100px tall
  public/art/faces/<key>.webp  a 320px square head-and-shoulders crop on the velvet background
  python3 scripts/process-art.py [--isolate] <key>=<path.png> [<key>=<path.png> ...]
Some generations come back with a faint paper haze over the transparent area; alpha under ~48 is
dropped and the soft band above it is stretched back to full, so edges stay smooth.
A few come back with a heavy, blotchy haze. --isolate keeps only the solid figure (plus a thin
soft edge) and clears everything else; don't use it on drawings with loose smoke wisps."""
import os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ART = os.path.join(ROOT, "public", "art")
BG = (54, 15, 26, 255)
LO, HI = 48, 200


def clean(im: Image.Image) -> Image.Image:
    a = np.asarray(im.getchannel("A")).astype(np.float32)
    a = np.clip((a - LO) * 255.0 / (HI - LO), 0, 255).astype(np.uint8)
    out = im.copy()
    out.putalpha(Image.fromarray(a))
    return out


def isolate(im: Image.Image, edge: int = 6) -> Image.Image:
    """Keep the big solid shapes (the figure) and a thin band around them; clear the rest."""
    a = np.asarray(im.getchannel("A"))
    core = ndimage.binary_opening(a >= 230, iterations=2)
    labels, n = ndimage.label(core)
    if n == 0:
        return im
    sizes = ndimage.sum(core, labels, range(1, n + 1))
    keep = np.isin(labels, 1 + np.flatnonzero(sizes >= 0.02 * sizes.max()))
    near = ndimage.binary_dilation(keep, iterations=edge)
    out = im.copy()
    out.putalpha(Image.fromarray(np.where(near, a, 0).astype(np.uint8)))
    return out


def figure(im: Image.Image, iso: bool = False) -> Image.Image:
    im = im.convert("RGBA")
    if iso:
        im = isolate(im)
    im = clean(im)
    im = im.crop(im.getchannel("A").getbbox())
    h = 1100
    return im.resize((round(im.width * h / im.height), h), Image.LANCZOS)


def face(im: Image.Image) -> Image.Image:
    """Square from the top of the figure, side = 0.2 x its height, centred on the head."""
    H = im.height
    side = round(0.2 * H)
    a = np.asarray(im.getchannel("A"))
    _, xs = np.nonzero(a[: int(0.15 * H)] > 128)
    cx = int(np.median(xs))
    pad = side * 2
    bg = Image.new("RGBA", (im.width + 2 * pad, im.height + 2 * pad), BG)
    bg.alpha_composite(im, (pad, pad))
    x0 = cx - side // 2 + pad
    return bg.crop((x0, pad, x0 + side, pad + side)).convert("RGB").resize((320, 320), Image.LANCZOS)


if __name__ == "__main__":
    args = sys.argv[1:]
    iso = "--isolate" in args
    for arg in (a for a in args if a != "--isolate"):
        key, path = arg.split("=", 1)
        fig = figure(Image.open(path), iso)
        fig.save(os.path.join(ART, f"{key}.webp"), quality=84, method=6)
        face(fig).save(os.path.join(ART, "faces", f"{key}.webp"), quality=82, method=6)
        print(f"{key}: {fig.width}x{fig.height}")
