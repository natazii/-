#!/usr/bin/env python3
"""Extract the supplied reference's decorative artwork, not its live city labels/prices.
Requires Pillow, numpy, OpenCV. Run from any directory; reference.png is bundled.
Generated PNGs are normal runtime assets, so playing the game needs no Python packages.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
import cv2

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'assets/board'
SOURCE = Image.open(DEST / 'reference.png').convert('RGB')
ORIGIN = (10, 7)
SIZE = 747
RATIO = 1.5295
SHORT = SIZE / (11 + 2 * RATIO)
LONG = SHORT * RATIO

def bounds(n):
    if n == 1: return 0, LONG
    if n == 13: return SIZE - LONG, SIZE
    return LONG + (n - 2) * SHORT, LONG + (n - 1) * SHORT

def tile(r, c):
    x0, x1 = bounds(c); y0, y1 = bounds(r)
    box = (ORIGIN[0] + x0, ORIGIN[1] + y0, ORIGIN[0] + x1, ORIGIN[1] + y1)
    dims = (81 if c in (1,13) else 53, 81 if r in (1,13) else 53)
    im = SOURCE.transform(dims, Image.Transform.EXTENT, box, Image.Resampling.BICUBIC)
    if r not in (1,13):
        # Normalize both sides to the upright bottom-row face; CSS rotates the whole face back.
        im = im.transpose(Image.Transpose.ROTATE_90 if c == 1 else Image.Transpose.ROTATE_270)
    return im

def cleaned(im, rectangles, flag_at=None):
    mask = Image.new('L', im.size)
    d = ImageDraw.Draw(mask)
    for box in rectangles: d.rectangle(box, fill=255)
    if flag_at is not None:
        cx, cy = flag_at
        d.ellipse((cx-14,cy-14,cx+14,cy+14), fill=255)
    # Reconstruct erased low-frequency background from the unobstructed side
    # strips. Unlike unconstrained inpainting, this cannot drag a bright icon
    # or a white letter down into the newly cleared caption/price slot.
    src = np.array(im).astype(np.float32)
    h,w = src.shape[:2]
    edges = []
    for cols in [(2,6),(w-6,w-2)]:
        rows=[]
        for y in range(h):
            pixels=src[max(0,y-4):min(h,y+5),cols[0]:cols[1]].reshape(-1,3)
            lum=pixels @ np.array([.299,.587,.114])
            dark=pixels[lum < 140]
            rows.append(np.median(dark if len(dark) else pixels,axis=0))
        edges.append(cv2.GaussianBlur(np.array(rows).reshape(h,1,3),(1,9),2).reshape(h,3))
    x=np.linspace(0,1,w)[None,:,None]
    background=edges[0][:,None,:]*(1-x)+edges[1][:,None,:]*x
    holes=np.array(mask)>0
    filled=src.copy();filled[holes]=background[holes]
    softened=cv2.GaussianBlur(filled,(3,3),.7)
    filled[holes]=softened[holes]
    return Image.fromarray(np.clip(filled,0,255).astype('uint8'))

def save(im, name):
    im.save(DEST / 'art' / (name + '.png'), optimize=True)

countries = {
    'BR': (1,2), 'IL': (1,6), 'IN': (1,11), 'IT': (2,13), 'DE': (8,13),
    'JO': (13,8), 'FR': (13,5), 'JP': (13,2), 'GB': (8,1), 'US': (2,1)
}
for group, (r,c) in countries.items():
    im = tile(r,c)
    if r == 1:
        rects=[(5,3,47,24),(0,47,52,67)]; flag=(26.5,81)
    else:
        rects=[(0,13,52,35),(5,58,47,79)]; flag=(26.5,0)
    save(cleaned(im,rects,flag), 'city-' + group.lower())

# Type-specific reference artwork; text and all monetary amounts are rendered in the DOM.
artwork = {
    'treasure-top': ((1,3), [(0,10,52,30)]),
    'treasure-bottom': ((13,9), [(0,52,52,80)]),
    'surprise-top': ((1,10), [(0,10,52,31)]),
    'surprise-bottom': ((13,11), [(0,53,52,80)]),
    'airport-top': ((1,7), [(5,3,48,24),(0,33,52,53)]),
    'airport-bottom': ((13,7), [(0,28,52,55),(5,58,48,80)]),
    'power': ((4,13), [(0,24,52,56),(5,58,48,80)]),
    'gas': ((11,13), [(0,23,52,55),(5,58,48,80)]),
    'water': ((13,4), [(0,25,52,57),(5,58,48,80)]),
    'earnings-tax': ((1,5), [(0,9,52,31),(5,60,48,79)]),
    'premium-tax': ((3,1), [(0,55,52,80),(8,32,46,53)])
}
for name, (rc, masks) in artwork.items(): save(cleaned(tile(*rc), masks), name)

# These four emblems include their original decorative lettering. They have no editable prices.
for name,rc in {'start':(1,1),'jail':(1,13),'vacation':(13,13),'gotojail':(13,1)}.items(): save(tile(*rc),name)

# Round country badges, unrotated here. Side-face rotation reproduces the reference:
# Italy appears red/white/green horizontally on the right, Germany vertically.
for group,(r,c) in countries.items():
    x0,x1=bounds(c); y0,y1=bounds(r)
    if r == 1: center=(ORIGIN[0]+(x0+x1)/2,ORIGIN[1]+y1)
    elif r == 13: center=(ORIGIN[0]+(x0+x1)/2,ORIGIN[1]+y0)
    elif c == 1: center=(ORIGIN[0]+x1,ORIGIN[1]+(y0+y1)/2)
    else: center=(ORIGIN[0]+x0,ORIGIN[1]+(y0+y1)/2)
    cx,cy=center
    badge=SOURCE.transform((100,100),Image.Transform.EXTENT,(cx-12.5,cy-12.5,cx+12.5,cy+12.5),Image.Resampling.BICUBIC).convert('RGBA')
    if c==1 and r not in (1,13): badge=badge.transpose(Image.Transpose.ROTATE_90)
    elif c==13 and r not in (1,13): badge=badge.transpose(Image.Transpose.ROTATE_270)
    mask=Image.new('L',(400,400));ImageDraw.Draw(mask).ellipse((0,0,399,399),fill=255)
    badge.putalpha(mask.resize((100,100),Image.Resampling.LANCZOS))
    badge.save(DEST/'flags'/(group.lower()+'.png'),optimize=True)

# The waiting-state dice match the supplied artwork; live rolls still use the real 3D dice.
SOURCE.crop((290,185,477,291)).save(DEST/'art'/'waiting-dice.png',optimize=True)
print('Reference artwork exported:', len(list((DEST/'art').glob('*.png'))), 'faces / dice, 10 flags')
