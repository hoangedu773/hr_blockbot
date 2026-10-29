import numpy as np
from PIL import Image
from scipy import ndimage, interpolate

def trace_boundary_pixels(mask):
    sy, sx = np.argwhere(mask == 1)[0]
    path = [(float(sx), float(sy))]
    curr = (sy, sx)
    back_dir = 4
    DIRS = [(0, 1), (1, 1), (1, 0), (1, -1), (0, -1), (-1, -1), (-1, 0), (-1, 1)]
    for _ in range(40000):
        found = False
        for i in range(8):
            d = (back_dir + 1 + i) % 8
            ny = curr[0] + DIRS[d][0]
            nx = curr[1] + DIRS[d][1]
            if 0 <= ny < mask.shape[0] and 0 <= nx < mask.shape[1] and mask[ny, nx] == 1:
                curr = (ny, nx)
                path.append((float(nx), float(ny)))
                back_dir = (d + 4) % 8
                found = True
                break
        if not found or (curr == (sy, sx) and len(path) > 2):
            break
    return np.array(path)

def smooth_loop(pts, num_samples, s_factor=0.3):
    # Subsample slightly to avoid 1px staircase
    step = max(1, len(pts) // (num_samples * 2))
    sub = pts[::step]
    if sub[0][0] != sub[-1][0] or sub[0][1] != sub[-1][1]:
        sub = np.vstack([sub, sub[0:1]])
    
    tck, u = interpolate.splprep([sub[:,0], sub[:,1]], s=len(sub)*s_factor, per=True)
    u_new = np.linspace(0, 1, num_samples, endpoint=False)
    xs, ys = interpolate.splev(u_new, tck)
    return np.column_stack([xs, ys])

def catmull_rom_to_bezier(pts):
    n = len(pts)
    d = f"M {pts[0][0]:.2f} {pts[0][1]:.2f}"
    for i in range(n):
        p0 = pts[(i - 1) % n]
        p1 = pts[i]
        p2 = pts[(i + 1) % n]
        p3 = pts[(i + 2) % n]
        
        c1x = p1[0] + (p2[0] - p0[0]) / 6.0
        c1y = p1[1] + (p2[1] - p0[1]) / 6.0
        c2x = p2[0] - (p3[0] - p1[0]) / 6.0
        c2y = p2[1] - (p3[1] - p1[1]) / 6.0
        
        d += f" C {c1x:.2f} {c1y:.2f}, {c2x:.2f} {c2y:.2f}, {p2[0]:.2f} {p2[1]:.2f}"
    d += " Z"
    return d

img = Image.open('apps/web/public/assets/folio/logo.png')
alpha = (np.array(img.split()[-1]) > 128).astype(np.uint8)
inv = 1 - alpha
bg_labeled, num_bg = ndimage.label(inv)

outer_raw = trace_boundary_pixels(alpha)
outer_smooth = smooth_loop(outer_raw, num_samples=180, s_factor=0.25)
d_outer = catmull_rom_to_bezier(outer_smooth)

holes_d = []
for i in range(1, num_bg + 1):
    mask = (bg_labeled == i).astype(np.uint8)
    if not (np.any(mask[0, :]) or np.any(mask[-1, :]) or np.any(mask[:, 0]) or np.any(mask[:, -1])):
        h_raw = trace_boundary_pixels(mask)
        samples = max(24, int(len(h_raw) / 15))
        h_smooth = smooth_loop(h_raw, num_samples=samples, s_factor=0.2)
        holes_d.append(catmull_rom_to_bezier(h_smooth))

full_d = d_outer + " " + " ".join(holes_d)

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="512" height="512">
  <path d="{full_d}" fill="#2563eb" fill-rule="evenodd" />
</svg>'''

with open('design-check/test_smooth.svg', 'w', encoding='utf-8') as f:
    f.write(svg)

print("Generated design-check/test_smooth.svg! Size:", len(svg))
