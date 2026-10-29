import numpy as np
from PIL import Image
from scipy import ndimage
from shapely.geometry import Polygon

img = Image.open('apps/web/public/assets/folio/logo.png')
alpha = (np.array(img.split()[-1]) > 128).astype(np.uint8)
inv = 1 - alpha
bg_labeled, num_bg = ndimage.label(inv)

DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]

def trace_loop(mask):
    sy, sx = np.argwhere(mask == 1)[0]
    path = [(sx, sy)]
    curr = (sy, sx)
    back_dir = 4
    for _ in range(30000):
        found = False
        for i in range(8):
            d = (back_dir + 1 + i) % 8
            ny = curr[0] + DIRS[d][0]
            nx = curr[1] + DIRS[d][1]
            if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] == 1:
                curr = (ny, nx)
                path.append((nx, ny))
                back_dir = (d + 4) % 8
                found = True
                break
        if not found or (curr == (sy, sx) and len(path) > 2):
            break
    return path

sy, sx = np.argwhere(alpha == 1)[0]
outer = trace_loop(alpha)

holes = []
for i in range(1, num_bg + 1):
    mask = (bg_labeled == i).astype(np.uint8)
    if not (np.any(mask[0, :]) or np.any(mask[-1, :]) or np.any(mask[:, 0]) or np.any(mask[:, -1])):
        holes.append(trace_loop(mask))

poly = Polygon(outer, holes).simplify(1.0, preserve_topology=True)

def ring_to_d(coords):
    pts = list(coords)
    if len(pts) == 0: return ''
    d = f'M {pts[0][0]:.1f} {pts[0][1]:.1f}'
    for p in pts[1:]:
        d += f' L {p[0]:.1f} {p[1]:.1f}'
    d += ' Z'
    return d

d = ring_to_d(poly.exterior.coords)
for h in poly.interiors:
    d += ' ' + ring_to_d(h.coords)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="512" height="512">
  <path d="{d}" fill="#2563eb" fill-rule="evenodd" />
</svg>'''

with open('design-check/test_raw.svg', 'w', encoding='utf-8') as f:
    f.write(svg)

print('Success! Exterior pts:', len(poly.exterior.coords), 'Holes:', len(poly.interiors))
