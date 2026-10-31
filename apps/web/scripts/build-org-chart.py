"""Generates src/components/landing/org-chart-svg.ts.

The reference was a low-resolution bitmap of a real org chart. Redrawing it as
SVG makes it crisp at any width and lets it inherit the landing's theme tokens.

Two deliberate departures from the reference:

  * role titles only, no personal names. The bitmap carries real employee names;
    a public marketing page is not the place for them.
  * five authority tiers are encoded by one hue at five opacities, not five
    unrelated blues, so the ramp reads as hierarchy rather than decoration.

Run from apps/web:  python scripts/build-org-chart.py
The script asserts no card overlap and no label overflow before writing.
"""
from __future__ import annotations

import html as htmlmod
import itertools
import pathlib

W, H = 2400, 960

INK = "var(--folio-ink)"
MUTED = "var(--folio-muted)"
BORDER = "var(--folio-border)"
SURFACE = "var(--folio-surface)"
CANVAS = "var(--folio-canvas)"
ACCENT = "var(--folio-accent)"

# Tier → (fill, stroke, text) expressed as theme-aware CSS.
TIERS = {
    0: dict(fill="var(--folio-ink)", stroke="var(--folio-ink)", text="var(--folio-canvas)", weight=650, size=19),
    1: dict(fill="color-mix(in oklab, var(--folio-accent) 26%, var(--folio-surface))",
            stroke="color-mix(in oklab, var(--folio-accent) 55%, var(--folio-border))",
            text=INK, weight=600, size=16),
    2: dict(fill="color-mix(in oklab, var(--folio-accent) 15%, var(--folio-surface))",
            stroke="color-mix(in oklab, var(--folio-accent) 38%, var(--folio-border))",
            text=INK, weight=600, size=15),
    3: dict(fill="color-mix(in oklab, var(--folio-accent) 7%, var(--folio-surface))",
            stroke=BORDER, text=INK, weight=500, size=14),
    4: dict(fill="transparent", stroke="color-mix(in oklab, var(--folio-muted) 45%, transparent)",
            text=MUTED, weight=500, size=13.5),
}

CARDS: list[dict] = []


def card(key, label, tier, cx, y, w, h=None, dashed=False, tag=None):
    lines = wrap(label, w)
    height = h or 30 + 21 * len(lines)
    CARDS.append(dict(key=key, label=label, tier=tier, cx=cx, y=y, w=w, h=height,
                      lines=lines, dashed=dashed, tag=tag,
                      x=cx - w / 2, r=cx + w / 2, b=y + height))
    return CARDS[-1]


def wrap(text: str, width: float) -> list[str]:
    """Greedy wrap on a per-character budget derived from the card width."""
    budget = max(8, int((width - 26) / 8.4))
    words, lines, current = text.split(), [], ""
    for word in words:
        candidate = f"{current} {word}".strip()
        if len(candidate) <= budget or not current:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ---------------------------------------------------------------- leadership
card("t0", "GIÁM ĐỐC ĐIỀU HÀNH", 0, 1200, 32, 380, h=48)
card("t1a", "TRỢ LÝ GIÁM ĐỐC", 1, 950, 132, 320, h=44)
card("t1b", "TRỢ LÝ GIÁM ĐỐC", 1, 1450, 132, 320, h=44)
card("t2", "GIÁM ĐỐC VẬN HÀNH", 0, 1200, 230, 330, h=56)

# ------------------------------------------------------------------ guta cafe
GUTA = dict(x=40, y=352, w=1084, h=520)
card("g1", "TRƯỞNG PHÒNG KINH DOANH", 2, 152, 428, 200)
card("g2", "TRƯỞNG PHÒNG NHÂN SỰ", 2, 368, 428, 200)
card("g3", "TRƯỞNG PHÒNG VẬN HÀNH", 2, 584, 428, 200)
card("g4", "TRỢ LÝ VẬN HÀNH", 3, 800, 428, 200)
card("g5", "TRỢ LÝ VẬN HÀNH", 3, 1016, 428, 200)

GUTA_CHILDREN = {
    "g1": ["PHÁT TRIỂN DOANH NGHIỆP", "PHÁT TRIỂN THƯƠNG HIỆU", "TRƯỞNG NHÓM MARKETING"],
    "g2": ["C&B · LƯƠNG THƯỞNG"],
}
for parent_key, labels in GUTA_CHILDREN.items():
    parent = next(c for c in CARDS if c["key"] == parent_key)
    for j, label in enumerate(labels):
        card(f"{parent_key}-c{j}", label, 4, parent["cx"], 596 + j * 62, 196, h=48)

card("g6", "AM · QUẢN LÝ KHU VỰC", 3, 584, 596, 200, h=48)
card("g7", "AM · QUẢN LÝ KHU VỰC", 3, 800, 596, 200, h=48)
card("g8", "AM · QUẢN LÝ KHU VỰC", 3, 1016, 596, 200, h=48)

card("g9", "SM · CỬA HÀNG TRƯỞNG", 4, 584, 700, 200, h=48)
card("g10", "SM · CỬA HÀNG TRƯỞNG", 4, 800, 700, 200, h=48)
card("g11", "SM · CỬA HÀNG TRƯỞNG", 4, 1016, 700, 200, h=48)

card("g12", "NHÂN VIÊN CỬA HÀNG", 4, 584, 804, 200, h=46)
card("g13", "NHÂN VIÊN CỬA HÀNG", 4, 800, 804, 200, h=46)
card("g14", "NHÂN VIÊN CỬA HÀNG", 4, 1016, 804, 200, h=46)

# ---------------------------------------------------------------------- finta
FINTA = dict(x=1148, y=352, w=1212, h=520)
FINTA_LEADS = [
    ("f0", "PHỤ TRÁCH DỰ ÁN", ["NHÂN VIÊN CỬA HÀNG"]),
    ("f1", "TRƯỞNG PHÒNG DỰ ÁN QC", ["TRƯỞNG NHÓM QC", "TRƯỞNG NHÓM 2D"]),
    ("f2", "TRƯỞNG PHÒNG IT DEV", ["TRƯỞNG NHÓM IT", "QUẢN LÝ DỰ ÁN"]),
    ("f3", "TRƯỞNG PHÒNG THIẾT KẾ & ĐÀO TẠO", ["TRƯỞNG NHÓM NỘI DUNG", "TRƯỞNG NHÓM BÁO TRỢ"]),
    ("f4", "TRƯỞNG PHÒNG MARKETING", ["TRƯỞNG NHÓM SETUP"]),
    ("f5", "TRƯỞNG PHÒNG CHIẾN LƯỢC NHÂN SỰ", ["QUẢN LÝ KHO"]),
    ("f6", "TRƯỞNG PHÒNG KẾ TOÁN", []),
]
LEAD_W, LEAD_GAP, LEAD_START = 162, 10, 1162
# Children stack vertically under their lead, as in the reference. Side-by-side
# would need a 300px column per lead and still collide at this canvas width.
for i, (key, label, children) in enumerate(FINTA_LEADS):
    cx = LEAD_START + i * (LEAD_W + LEAD_GAP) + LEAD_W / 2
    card(key, label, 2, cx, 428, LEAD_W)
    for j, child in enumerate(children):
        card(f"{key}-c{j}", child, 4, cx, 600 + j * 62, 150, h=48)

# --------------------------------------------------------------------- audit
overlaps = [
    (a["key"], b["key"])
    for a, b in itertools.combinations(CARDS, 2)
    if a["x"] < b["r"] and b["x"] < a["r"] and a["y"] < b["b"] and b["y"] < a["b"]
]
assert not overlaps, f"card overlap: {overlaps}"

for c in CARDS:
    budget = max(8, int((c["w"] - 26) / 8.4))
    for line in c["lines"]:
        assert len(line) <= budget + 1, f"{c['key']} line overflows: {line!r}"

# cards must sit inside their system frame
for c in CARDS:
    if c["key"].startswith("g"):
        assert GUTA["x"] < c["x"] and c["r"] < GUTA["x"] + GUTA["w"], c["key"]
        assert c["b"] < GUTA["y"] + GUTA["h"], c["key"]
    if c["key"].startswith("f"):
        assert FINTA["x"] < c["x"] and c["r"] < FINTA["x"] + FINTA["w"], c["key"]
        assert c["b"] < FINTA["y"] + FINTA["h"], c["key"]


def esc(value):
    return htmlmod.escape(value, quote=True)


by_key = {c["key"]: c for c in CARDS}
out: list[str] = []


def line(x1, y1, x2, y2, dashed=False):
    style = ' stroke-dasharray="4 4"' if dashed else ""
    out.append(f'<path class="oc-link" d="M{x1:.0f} {y1:.0f} L{x2:.0f} {y2:.0f}"{style}/>')


# ------------------------------------------------------------------ connectors
line(1200, 80, 1200, 110)
line(950, 110, 1450, 110)
line(950, 110, 950, 132)
line(1450, 110, 1450, 132)

line(950, 176, 950, 200)
line(1450, 176, 1450, 200)
line(950, 200, 1450, 200)
line(1200, 200, 1200, 230)

# Director of operations feeds both system frames.
line(1200, 286, 1200, 320)
line(584, 320, 1720, 320)
line(584, 320, 584, 352)
line(1720, 320, 1720, 352)

# Guta row A bus sits in the frame's header gutter, clear of the title text.
line(152, 402, 1016, 402)
line(584, 352, 584, 402)
for key in ("g1", "g2", "g3", "g4", "g5"):
    line(by_key[key]["cx"], 402, by_key[key]["cx"], 428)

# guta: TP Kinh doanh / TP Nhân sự → their sub-units
for parent_key, labels in GUTA_CHILDREN.items():
    parent = by_key[parent_key]
    for j in range(len(labels)):
        child = by_key[f"{parent_key}-c{j}"]
        line(parent["cx"], parent["b"] if j == 0 else child["y"] - 62, child["cx"], child["y"])

# guta vertical chain: TP Vận hành + 2 trợ lý → AM → SM → NV
for parent, child in (("g3", "g6"), ("g4", "g7"), ("g5", "g8"),
                      ("g6", "g9"), ("g7", "g10"), ("g8", "g11"),
                      ("g9", "g12"), ("g10", "g13"), ("g11", "g14")):
    p, c = by_key[parent], by_key[child]
    line(p["cx"], p["b"], c["cx"], c["y"])

# finta row A bus
line(1243, 402, 2279, 402)
line(1720, 352, 1720, 402)
for key, _label, _kids in FINTA_LEADS:
    line(by_key[key]["cx"], 402, by_key[key]["cx"], 428)

# finta children
for key, _label, kids in FINTA_LEADS:
    if not kids:
        continue
    parent = by_key[key]
    children = [by_key[f"{key}-c{j}"] for j in range(len(kids))]
    # Vertical spine, one stub per child.
    for child in children:
        line(parent["cx"], parent["b"] if child is children[0] else child["y"] - 62, child["cx"], child["y"])

# ---------------------------------------------------------------------- cards
card_svg: list[str] = []
for c in CARDS:
    tier = TIERS[c["tier"]]
    dash = ' stroke-dasharray="5 4"' if c["dashed"] else ""
    card_svg.append(
        f'<g class="oc-card oc-tier-{c["tier"]}" style="--t:{c["tier"]}">'
        f'<rect x="{c["x"]:.0f}" y="{c["y"]}" width="{c["w"]}" height="{c["h"]}" rx="7" '
        f'fill="{tier["fill"]}" stroke="{tier["stroke"]}" stroke-width="1"{dash}/>'
    )
    if c["tier"] == 0:
        card_svg.append(
            f'<rect x="{c["x"]:.0f}" y="{c["y"] + 1}" width="3" height="{c["h"] - 2}" rx="1.5" '
            f'fill="var(--folio-accent)"/>'
        )
    total = len(c["lines"])
    first = c["y"] + c["h"] / 2 - (total - 1) * 10.5 + 5
    for i, text in enumerate(c["lines"]):
        card_svg.append(
            f'<text class="oc-label" x="{c["cx"]:.0f}" y="{first + i * 21:.0f}" text-anchor="middle" '
            f'fill="{tier["text"]}" font-size="{tier["size"]}" font-weight="{tier["weight"]}">{esc(text)}</text>'
        )
    card_svg.append("</g>")

# --------------------------------------------------------------------- frames
def frame(box, title, subtitle, dashed=False):
    dash = ' stroke-dasharray="6 5"' if dashed else ""
    return (
        f'<g class="oc-frame"><rect x="{box["x"]}" y="{box["y"]}" width="{box["w"]}" height="{box["h"]}" rx="14" '
        f'fill="color-mix(in oklab, {SURFACE} 70%, transparent)" stroke="{BORDER}" stroke-width="1"{dash}/>'
        f'<text class="oc-frame-title" x="{box["x"] + 24}" y="{box["y"] + 26}">{esc(title)}</text>'
        f'<text class="oc-frame-sub" x="{box["x"] + 24}" y="{box["y"] + 42}">{esc(subtitle)}</text></g>'
    )


frames = (
    frame(GUTA, "HỆ THỐNG GUTA CAFE", "Vận hành chuỗi · 45 chi nhánh")
    + frame(FINTA, "HỆ THỐNG FINTA", "Dự án, công nghệ và back-office", dashed=True)
)

# --------------------------------------------------------------------- legend
LEGEND = [
    (0, "Giám đốc điều hành"),
    (1, "Giám đốc chuyên môn"),
    (2, "Cấp trưởng phòng"),
    (3, "Chuyên viên · giám sát"),
    (4, "Cấp nhân viên"),
]
legend_svg = ['<g class="oc-legend">']
legend_svg.append(f'<text class="oc-legend-title" x="40" y="{H - 66}">THANG BẬC QUYỀN HẠN</text>')
# Legend spacing measured from the 15px type, not a guessed per-character
# constant: the previous estimate overlapped "Giám đốc chuyên môn" with
# "Cấp trưởng phòng" as soon as the labels grew.
LEGEND_CHAR_W = 8.4
LEGEND_SWATCH = 16
LEGEND_GAP = 26
x = 40
for tier_id, label in LEGEND:
    tier = TIERS[tier_id]
    legend_svg.append(
        f'<rect x="{x}" y="{H - 52}" width="16" height="16" rx="3" fill="{tier["fill"]}" '
        f'stroke="{tier["stroke"]}" stroke-width="1"/>'
        f'<text class="oc-legend-item" x="{x + LEGEND_SWATCH + 8}" y="{H - 39}">{esc(label)}</text>'
    )
    x += LEGEND_SWATCH + 8 + len(label) * LEGEND_CHAR_W + LEGEND_GAP
assert x < W - 40, f"legend overflows the canvas: ends at {x:.0f}px of {W}px"
legend_svg.append("</g>")

SVG = f'''<svg class="org-chart" viewBox="0 0 {W} {H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="oc-title oc-desc" preserveAspectRatio="xMidYMid meet">
<title id="oc-title">Cơ cấu tổ chức Guta Workspace</title>
<desc id="oc-desc">Sơ đồ năm bậc quyền hạn: giám đốc điều hành, giám đốc chuyên môn, cấp trưởng phòng, chuyên viên và giám sát, cấp nhân viên; chia hai hệ thống Guta Cafe và Finta, với chuỗi vận hành từ quản lý khu vực đến cửa hàng trưởng và nhân viên cửa hàng.</desc>
<style>
  .org-chart {{ display: block; width: 100%; height: auto; font-family: var(--folio-body); }}
  .org-chart text {{ user-select: none; }}
  .oc-link {{ fill: none; stroke: color-mix(in oklab, {MUTED} 42%, transparent); stroke-width: 1.2; stroke-linecap: round; }}
  .oc-frame-title {{ font-size: 17px; font-weight: 700; letter-spacing: 0.11em; fill: {INK}; }}
  .oc-frame-sub {{ font-size: 14.5px; font-weight: 450; fill: {MUTED}; }}
  .oc-label {{ letter-spacing: 0.01em; }}
  .oc-legend-title {{ font-size: 14px; font-weight: 650; letter-spacing: 0.13em; fill: {MUTED}; }}
  .oc-legend-item {{ font-size: 15px; font-weight: 450; fill: {MUTED}; }}
</style>
{frames}
<g class="oc-links">{"".join(out)}</g>
{"".join(card_svg)}
{"".join(legend_svg)}
</svg>'''

target = pathlib.Path(__file__).resolve().parent.parent / "src" / "components" / "landing" / "org-chart-svg.ts"
safe_svg = SVG.replace("`", "\\`").replace("${", "\\${")
target.write_text(
    "// Generated by scripts/build-org-chart.py — do not edit by hand.\n"
    "// Role titles only; the reference bitmap's personal names are deliberately omitted.\n"
    "export const ORG_CHART_SVG = `" + safe_svg + "`;\n",
    encoding="utf-8",
)
print(f"wrote {target} — {len(CARDS)} cards, canvas {W}x{H}")
