#!/usr/bin/env python3
"""Build the new country tile backgrounds (v24 board).

Replaces the old reference-extracted city faces (US/China/…) with artwork for
the new countries (Morocco, Syria, Egypt, …). Each face is the country flag,
heavily blurred and darkened so the DOM-rendered name and price stay readable
on top of it — matching the look requested with the blurred-flag reference.

Requires only Pillow + numpy. Output PNGs are normal runtime assets.
"""
from pathlib import Path
from PIL import Image, ImageEnhance, ImageFilter
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FLAGS = ROOT / 'assets' / 'flags'
DEST = ROOT / 'assets' / 'board' / 'art'
W, H = 106, 162  # 2x the 53x81 face for crisp HiDPI rendering

# iso code -> bundled HD flag
COUNTRIES = {
    'ma': 'ma_hd.png',  # Morocco
    'sy': 'sy_hd.png',  # Syria
    'eg': 'eg_hd.png',  # Egypt
    'tn': 'tn_hd.png',  # Tunisia
    'jo': 'jo_hd.png',  # Jordan
    'sa': 'sa_hd.png',  # Saudi Arabia
    'bh': 'bh_hd.png',  # Bahrain
    'qa': 'qa_hd.png',  # Qatar
    'ae': 'ae_hd.png',  # United Arab Emirates
    'kw': 'kw_hd.png',  # Kuwait
    'iq': 'iq_hd.png',  # Iraq
    'ps': 'ps_hd.png',  # Palestine
}


def cover(im, w, h):
    """Center-crop the flag to the tall tile aspect ratio."""
    s = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * s), round(im.height * s)), Image.Resampling.LANCZOS)
    l = (im.width - w) // 2
    t = (im.height - h) // 2
    return im.crop((l, t, l + w, t + h))


def face(iso, flag_file):
    im = cover(Image.open(FLAGS / flag_file).convert('RGB'), W, H)
    # Strong blur: the flag reads as a colour mood, never as sharp stripes.
    im = im.filter(ImageFilter.GaussianBlur(14))
    # v24.3 — middle ground between v24.1 (too dark) and v24.2 (too washed).
    im = ImageEnhance.Color(im).enhance(0.6)         # moderate saturation
    im = ImageEnhance.Brightness(im).enhance(0.95)
    a = np.array(im).astype(np.float32) / 255.0
    # Quarter blend toward a light neutral: open but still colourful.
    a = a * 0.75 + 0.25 * np.array([0.80, 0.80, 0.84])[None, None, :]
    # Soft-knee highlight compression keeps white flag stripes below ~200 so
    # the white captions still separate from the surface.
    lum = a @ np.array([0.299, 0.587, 0.114])
    over = np.clip(lum - 0.72, 0, None)
    a -= over[..., None] * 0.6
    # Mild vertical shade; surface stays open but not flat.
    y = np.linspace(0.0, 1.0, H)
    alpha = 0.24 - 0.11 * np.sin(np.pi * np.clip((y - 0.28) / 0.44, 0, 1))
    a *= (1.0 - alpha)[:, None, None]
    out = np.clip(a * 255, 0, 255).astype('uint8')
    return Image.fromarray(out)


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    for iso, flag_file in COUNTRIES.items():
        im = face(iso, flag_file)
        im.save(DEST / f'city-{iso}.png', optimize=True)
        lum = (np.array(im).astype(float) @ [0.299, 0.587, 0.114])
        print(f'city-{iso}.png  lum max {lum.max():5.1f}  mean {lum.mean():5.1f}')


if __name__ == '__main__':
    main()
