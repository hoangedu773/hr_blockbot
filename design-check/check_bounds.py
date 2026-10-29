import re

with open('design-check/test_smooth.svg', 'r') as f:
    text = f.read()

m = re.search(r'd="([^"]+)"', text)
d = m.group(1)
numbers = [float(x) for x in re.findall(r'[-+]?\d*\.?\d+', d)]
xs = numbers[0::2]
ys = numbers[1::2]
min_x, max_x = min(xs), max(xs)
min_y, max_y = min(ys), max(ys)
print(f"X bounds: {min_x:.1f} .. {max_x:.1f} (width: {max_x - min_x:.1f})")
print(f"Y bounds: {min_y:.1f} .. {max_y:.1f} (height: {max_y - min_y:.1f})")
print(f"Center: ({(min_x + max_x) / 2:.1f}, {(min_y + max_y) / 2:.1f})")
