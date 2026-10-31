"""Generates public/diagrams/chatbot-architecture.html.

The diagram is data, not hand-placed SVG: node boxes, edge routes and edge
labels are computed here so a geometry change cannot silently overlap. Run with
`node` unavailable? This file is Python; execute it from apps/web:

    python scripts/build-diagram.py

Layout contract:
  * canvas aspect (~1.93) matches the landing iframe (680px tall), so the
    browser does not letterbox the SVG down to unreadable type;
  * edges route through column gutters, never through a node box;
  * edge labels are placed by search against node boxes and already-taken
    labels, so two labels never sit on top of each other.
"""
from __future__ import annotations

import html as htmlmod
import itertools
import pathlib
import re

CW, CH = 1940, 940
NW, NH = 268, 86
COLS = [24, 432, 840, 1248, 1656]
ROWY = dict(r1=148, r2=310, r3=446, r4=560, r5=700, r6=806)
GUT = [372, 780, 1188, 1596]
OUTER = 1926

# Every lane reserves a 58px header band for its label and tag; node rows start
# below it. Without that reservation the label ran through the first row.
LANES = [
    dict(id="top", y=84, h=172, label="TẦNG TRÊN · SANDBOX TỰ TRỊ & BỘ NHỚ DÀI HẠN", tag="ROADMAP · EXTENSION"),
    dict(id="mid", y=252, h=390, label="TẦNG GIỮA · LÕI REALTIME & VÒNG LẶP THỰC THI AGENT", tag="PRODUCTION · LIVE"),
    dict(id="bot", y=656, h=248, label="TẦNG DƯỚI · BẢO MẬT, XÁC NHẬN NGƯỜI & LƯU TRỮ", tag="SECURITY & STORAGE"),
]

SPEC = [
    ("s-memory", "VECTOR STORE", "Episodic Memory", "service", 2, "r1", "Qdrant vectors + SQLite markdown audit log (Roadmap v2)"),
    ("s-browser", "PORTAL RUNNER", "Agent Browser", "service", 4, "r1", "Headless portal automation for legacy operator screens (Roadmap)"),
    ("s-sandbox", "ANALYTICS ENGINE", "Sandbox Runner", "process", 5, "r1", "Isolated script execution for ad-hoc workforce analytics (Roadmap)"),
    ("s-omni", "INGRESS", "Omni Gateway", "start", 1, "r2", "Zalo OA · Telegram Bot · Tailnet sidecar webhook ingress"),
    ("s-chat", "UI CLIENT", "Web Chat Drawer", "start", 2, "r2", "React chat surface: composer, citations, confirm-before-write cards"),
    ("s-gateway", "API GATEWAY", "Chat Gateway Service", "process", 3, "r2", "Authenticates the session, persists the turn, fans out to the rule gate"),
    ("s-filter", "REGEX GATEWAY", "Fast Rule Gate", "decision", 4, "r2", "Deterministic filter for greetings and canned intents in under 0.1 ms"),
    ("s-jev", "INTENT ROUTER", "Jev AI Decision Gate", "decision", 5, "r2", "Typed intent classification with a declared provider route"),
    ("s-policy", "POLICY STORE", "In-Context Policy Store", "process", 2, "r3", "Retrieved Guta policy chunks injected as grounding context"),
    ("s-loop", "ORCHESTRATOR", "Agent Execution Loop", "process", 4, "r3", "Plans tool calls, checks policy, proposes writes for human confirmation"),
    ("s-tools", "TOOL RUNTIME", "Scoped Tool Runtime", "process", 5, "r3", "Allowlisted read tools; every write is drafted, never executed inline"),
    ("s-chain", "FAILOVER CHAIN", "Dynamic Provider Chain", "process", 3, "r4", "Ordered provider ladder with per-key health and degraded fallback"),
    ("s-llm", "PRIMARY LLM", "Gemini 3 Flash Preview", "success", 4, "r4", "Primary generation path; answers are grounded in the injected context"),
    ("s-fallback", "RESILIENCE", "Fallback Provider", "failure", 5, "r4", "Degraded answer path when every primary key is exhausted"),
    ("s-admin", "ADMIN PORTAL", "Admin Provider UI", "start", 1, "r5", "Admin-only screen for provider keys and runtime model settings"),
    ("s-crypto", "VAULT SERVICE", "Crypto & Vault Service", "process", 2, "r5", "Envelope encryption for provider credentials at rest"),
    ("s-settings", "ENCRYPTED STORE", "MongoDB: settings", "service", 3, "r5", "Ciphertext-only settings documents; plaintext never leaves the vault"),
    ("s-egress", "ZERO-TRUST LEASE", "Egress Key Lease", "process", 4, "r5", "Short-lived credential lease for outbound provider calls (Roadmap)"),
    ("s-conv", "SESSION DB", "MongoDB: conversations", "service", 2, "r6", "Rolling conversation window, capped at 50 turns per session"),
    ("s-db", "OPERATIONAL DB", "MongoDB: hr_bot Data", "service", 3, "r6", "Stores, employees, schedules and cash counts read by the tools"),
    ("s-confirm", "CONFIRM GATE", "Action Executor (2-Step)", "waiting", 4, "r6", "Human approval gate: nothing is written until the operator confirms"),
]

NODES = {}
for nid, sub, label, fam, col, row, desc in SPEC:
    x, y = COLS[col - 1], ROWY[row]
    NODES[nid] = dict(sub=sub, label=label, family=fam, row=row, desc=desc,
                      x=x, y=y, w=NW, h=NH, r=x + NW, b=y + NH,
                      cx=x + NW / 2, cy=y + NH / 2)


def n(nid):
    return NODES[nid]


# Horizontal channels that no node occupies: the gap below row 4 and below row 6.
CHANNEL_45 = (ROWY["r4"] + NH + ROWY["r5"]) // 2
CHANNEL_56 = (ROWY["r5"] + NH + ROWY["r6"]) // 2


def straight(a, b):
    return f"M{n(a)['r']} {n(a)['cy']:.0f} L{n(b)['x']} {n(b)['cy']:.0f}"


def gutter_drop(a, b, gx):
    return (f"M{n(a)['x']} {n(a)['cy']:.0f} L{gx} {n(a)['cy']:.0f} "
            f"L{gx} {n(b)['cy']:.0f} L{n(b)['r']} {n(b)['cy']:.0f}")


ROUTES = {
    ("s-omni", "s-chat"): straight("s-omni", "s-chat"),
    ("s-chat", "s-gateway"): straight("s-chat", "s-gateway"),
    ("s-gateway", "s-filter"): straight("s-gateway", "s-filter"),
    ("s-filter", "s-jev"): straight("s-filter", "s-jev"),
    ("s-policy", "s-loop"): straight("s-policy", "s-loop"),
    ("s-loop", "s-tools"): straight("s-loop", "s-tools"),
    ("s-chain", "s-llm"): straight("s-chain", "s-llm"),
    ("s-admin", "s-crypto"): straight("s-admin", "s-crypto"),
    ("s-crypto", "s-settings"): straight("s-crypto", "s-settings"),
    ("s-gateway", "s-conv"): gutter_drop("s-gateway", "s-conv", GUT[1]),
    ("s-jev", "s-loop"): gutter_drop("s-jev", "s-loop", GUT[3] - 14),
    ("s-memory", "s-loop"): gutter_drop("s-memory", "s-loop", GUT[1]),
    ("s-loop", "s-browser"): gutter_drop("s-loop", "s-browser", GUT[3]),
    ("s-loop", "s-sandbox"): gutter_drop("s-loop", "s-sandbox", GUT[3] + 18),
    ("s-loop", "s-confirm"): gutter_drop("s-loop", "s-confirm", GUT[2] - 40),
    ("s-chain", "s-egress"): gutter_drop("s-chain", "s-egress", GUT[2] + 34),
    ("s-egress", "s-fallback"): gutter_drop("s-egress", "s-fallback", GUT[3] - 14),
    # Out of the tool runtime's left edge, down the column-4/5 gutter, then left
    # along the free channel between rows 4 and 5. Dropping from the node's own
    # centre would cut straight through Fallback Provider.
    # Right edge, down the outermost gutter (clear of every row), then back along
    # the free channel between rows 4 and 5. A centre drop would cut the loop and
    # the LLM node.
    ("s-tools", "s-chain"): (
        f"M{n('s-tools')['r']} {n('s-tools')['cy']:.0f} L1926 {n('s-tools')['cy']:.0f} "
        f"L1926 {CHANNEL_45} L{n('s-chain')['cx']:.0f} {CHANNEL_45} L{n('s-chain')['cx']:.0f} {n('s-chain')['y']}"),
    ("s-egress", "s-llm"): f"M{n('s-egress')['cx']:.0f} {n('s-egress')['y']} L{n('s-egress')['cx']:.0f} {n('s-llm')['b']}",
    ("s-tools", "s-db"): (
        f"M{n('s-tools')['r']} {n('s-tools')['cy']:.0f} L{OUTER} {n('s-tools')['cy']:.0f} "
        f"L{OUTER} {CHANNEL_56} L{n('s-db')['cx']:.0f} {CHANNEL_56} L{n('s-db')['cx']:.0f} {n('s-db')['b']}"),
    ("s-confirm", "s-db"): (
        f"M{n('s-confirm')['x']} {n('s-confirm')['cy']:.0f} L{n('s-db')['r']} {n('s-db')['cy']:.0f}"),
}

# Only the request path is captioned. Roadmap and security edges are encoded by
# stroke (dashed / muted) and named in the legend; captioning all 21 edges in a
# three-lane diagram produced more label collisions than information.
LABELS = {
    ("s-omni", "s-chat"): "Ingress",
    ("s-chat", "s-gateway"): "WS chat:send",
    ("s-gateway", "s-filter"): "POST /chat",
    ("s-filter", "s-jev"): "Pass",
    ("s-jev", "s-loop"): "Typed Intent",
    ("s-loop", "s-tools"): "Tool Call",
    ("s-tools", "s-chain"): "Generate",
    ("s-chain", "s-llm"): "Direct Call",
    ("s-loop", "s-confirm"): "Propose Draft",
}

KIND = {k: "live" for k in ROUTES}
KIND.update({
    ("s-memory", "s-loop"): "roadmap",
    ("s-loop", "s-browser"): "roadmap",
    ("s-loop", "s-sandbox"): "roadmap",
    ("s-chain", "s-egress"): "roadmap",
    ("s-egress", "s-llm"): "roadmap",
    ("s-egress", "s-fallback"): "roadmap",
    ("s-gateway", "s-conv"): "security",
    ("s-loop", "s-confirm"): "security",
    ("s-tools", "s-db"): "security",
    ("s-confirm", "s-db"): "security",
    ("s-admin", "s-crypto"): "security",
    ("s-crypto", "s-settings"): "security",
})

FAMILY = {
    "start": ("fam-start", "Khởi nguồn / UI"),
    "process": ("fam-process", "Xử lý / Vòng lặp"),
    "decision": ("fam-decision", "Cổng quyết định"),
    "service": ("fam-service", "Dịch vụ / Lưu trữ"),
    "waiting": ("fam-waiting", "Xác nhận con người"),
    "success": ("fam-success", "LLM chính"),
    "failure": ("fam-failure", "Dự phòng / suy giảm"),
}


def esc(value):
    return htmlmod.escape(value, quote=True)


# --------------------------------------------------------------------------
# geometry audits — a failure here means the drawing would be wrong
# --------------------------------------------------------------------------
def sample_points(d, step=2):
    pts, cur = [], None
    for cmd in re.findall(r"[ML]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?", d):
        x, y = map(float, cmd[1:].split())
        if cmd[0] == "M":
            cur = (x, y)
            pts.append(cur)
            continue
        x0, y0 = cur
        count = int(max(abs(x - x0), abs(y - y0)) // step) + 1
        pts += [(x0 + (x - x0) * i / count, y0 + (y - y0) * i / count) for i in range(1, count + 1)]
        cur = (x, y)
    return pts


overlaps = [(a, b) for a, b in itertools.combinations(NODES, 2)
            if NODES[a]["x"] < NODES[b]["r"] and NODES[b]["x"] < NODES[a]["r"]
            and NODES[a]["y"] < NODES[b]["b"] and NODES[b]["y"] < NODES[a]["b"]]
assert not overlaps, f"node overlap: {overlaps}"

crossings = []
for (a, b), d in ROUTES.items():
    for x, y in sample_points(d):
        for nid, box in NODES.items():
            if nid in (a, b):
                continue
            if box["x"] + 3 < x < box["r"] - 3 and box["y"] + 3 < y < box["b"] - 3:
                crossings.append((a, b, nid))
assert not crossings, f"edge crosses node: {sorted(set(crossings))}"

for lane in LANES:
    inside = [k for k, box in NODES.items() if lane["y"] + 36 <= box["y"] and box["b"] <= lane["y"] + lane["h"] - 10]
    assert inside, f"lane {lane['id']} holds no nodes"


# --------------------------------------------------------------------------
# label placement
# --------------------------------------------------------------------------
def segments(d):
    out, cur = [], None
    for cmd in re.findall(r"[ML]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?", d):
        x, y = map(float, cmd[1:].split())
        if cmd[0] == "M":
            cur = (x, y)
            continue
        out.append((cur, (x, y)))
        cur = (x, y)
    return out


def label_width(text):
    return max(60, len(text) * 6.8 + 20)


def path_points(d, step=6):
    """Points along the route, ordered from start to end."""
    pts, cur = [], None
    for cmd in re.findall(r"[ML]\s*-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?", d):
        x, y = map(float, cmd[1:].split())
        if cmd[0] == "M":
            cur = (x, y)
            pts.append(cur)
            continue
        x0, y0 = cur
        count = max(1, int(max(abs(x - x0), abs(y - y0)) // step))
        pts += [(x0 + (x - x0) * i / count, y0 + (y - y0) * i / count) for i in range(1, count + 1)]
        cur = (x, y)
    return pts


def candidates(d):
    """Label anchors along the route, nearest-to-middle first.

    Labels sit *on* their own edge with an opaque mask behind the text, which is
    the standard flowchart convention: the line is interrupted for the caption
    instead of the caption being exiled to a far-away free patch.
    """
    pts = path_points(d)
    if not pts:
        return []
    mid = len(pts) // 2
    order = sorted(range(len(pts)), key=lambda i: abs(i - mid))
    # First pass: exactly on the line. Second: nudged above/below so a crowded
    # gutter still gets a caption adjacent to its own edge rather than far away.
    anchors = []
    for i in order:
        x, y = pts[i]
        for dx, dy in ((0, 0), (0, -20), (0, 20), (0, -32), (0, 32), (-40, 0), (40, 0)):
            anchors.append((x + dx, y + dy))
    return anchors


def fits(key, lx, ly, taken):
    w, h = label_width(LABELS[key]), 26
    box = (lx - w / 2, ly - h / 2, lx + w / 2, ly + h / 2)
    if box[0] < 6 or box[2] > CW - 6 or box[1] < 6 or box[3] > CH - 6:
        return None
    for b in NODES.values():
        # 2px clearance: captions in a 140px gutter must be allowed to sit close
        # to the boxes they connect, or no label fits at all.
        if b["x"] - 2 < box[2] and box[0] < b["r"] + 2 and b["y"] - 2 < box[3] and box[1] < b["b"] + 2:
            return None
    # Lane headers and the legend row carry their own text.
    for lane in LANES:
        if box[1] < lane["y"] + 56 and box[3] > lane["y"] and box[0] < CW - 28 and box[2] > 28:
            return None
    if box[3] > CH - 40:
        return None
    for t in taken:
        if not (box[2] < t[0] or t[2] < box[0] or box[3] < t[1] or t[3] < box[1]):
            return None
    return box


placements, taken = {}, []
for key in sorted((k for k in ROUTES if k in LABELS), key=lambda k: -len(segments(ROUTES[k]))):
    for lx, ly in candidates(ROUTES[key]):
        box = fits(key, lx, ly, taken)
        if box:
            placements[key] = (lx, ly)
            taken.append(box)
            break
    else:
        d = ROUTES[key]
        pts = path_points(d)
        raise AssertionError(
            f"no room for label {key} width={label_width(LABELS[key])} "
            f"route={d} sample={pts[len(pts)//2] if pts else None}")


# --------------------------------------------------------------------------
# emit
# --------------------------------------------------------------------------
node_svg = []
for i, (nid, box) in enumerate(NODES.items()):
    x, y = box["x"], box["y"]
    node_svg.append(
        f'<g class="ak-node {FAMILY[box["family"]][0]}" data-node-id="{nid}" '
        f'data-label="{esc(box["label"])}" data-family="{box["family"]}" '
        f'data-desc="{esc(box["desc"])}" tabindex="0" role="button" data-animate="node" style="--step:{i}">'
        f'<rect class="ak-node-card" x="{x}" y="{y}" width="{NW}" height="{NH}" rx="10"/>'
        f'<rect class="ak-node-rail" x="{x}" y="{y + 1}" width="3" height="{NH - 2}" rx="1.5"/>'
        f'<text class="ak-node-sub" x="{x + 20}" y="{y + 34}">{esc(box["sub"])}</text>'
        f'<text class="ak-node-label" x="{x + 20}" y="{y + 65}">{esc(box["label"])}</text>'
        f"</g>"
    )

edge_svg = []
for i, (key, d) in enumerate(ROUTES.items()):
    tag = ""
    if key in placements:
        lx, ly = placements[key]
        lw = label_width(LABELS[key])
        tag = (f'<g class="ak-edge-tag"><rect x="{lx - lw / 2:.0f}" y="{ly - 11:.0f}" width="{lw:.0f}" height="22" rx="11"/>'
               f'<text x="{lx:.0f}" y="{ly + 4:.0f}" text-anchor="middle">{esc(LABELS[key])}</text></g>')
    edge_svg.append(
        f'<g class="ak-edge edge-{KIND[key]}" data-from="{key[0]}" data-to="{key[1]}" '
        f'data-kind="{KIND[key]}" data-animate="edge" style="--step:{i}">'
        f'<path class="ak-edge-hit" d="{d}"/>'
        f'<path class="ak-edge-path" d="{d}" pathLength="100" marker-end="url(#ak-arrow)"/>'
        f'<path class="ak-edge-flow" d="{d}" pathLength="100"/>'
        f'{tag}'
        f"</g>"
    )

lane_svg = "".join(
    f'<g class="ak-lane lane-{lane["id"]}">'
    f'<rect class="ak-lane-frame" x="14" y="{lane["y"]}" width="{CW - 28}" height="{lane["h"]}" rx="16"/>'
    f'<text class="ak-lane-label" x="40" y="{lane["y"] + 26}">{esc(lane["label"])}</text>'
    f'<g class="ak-lane-tag"><rect x="{CW - 224}" y="{lane["y"] + 12}" width="184" height="24" rx="12"/>'
    f'<text x="{CW - 132}" y="{lane["y"] + 28}" text-anchor="middle">{esc(lane["tag"])}</text></g>'
    f"</g>"
    for lane in LANES
)

legend_svg = "".join(
    f'<g class="ak-legend-item"><rect x="{40 + i * 196}" y="{CH - 30}" width="12" height="12" rx="3" class="{FAMILY[k][0]}"/>'
    f'<text x="{40 + i * 196 + 21}" y="{CH - 17}">{esc(v[1])}</text></g>'
    for i, (k, v) in enumerate(FAMILY.items())
)

SVG = f'''<svg class="ak-diagram-svg" viewBox="0 0 {CW} {CH}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="ak-title ak-desc" data-motion="play">
<title id="ak-title">HR BlockBot — kiến trúc chatbot và agentic, ba phân tầng</title>
<desc id="ak-desc">Luồng vận hành 24/7: ingress đa kênh, cổng chat, bộ lọc luật nhanh, cổng quyết định Jev AI, vòng lặp agent, runtime công cụ, chuỗi nhà cung cấp LLM, cùng tầng bảo mật với cổng xác nhận hai bước và lưu trữ MongoDB.</desc>
<defs>
<marker id="ak-arrow" viewBox="0 0 10 8" refX="9" refY="4" markerWidth="7" markerHeight="6" orient="auto-start-reverse"><path class="ak-arrowhead" d="M0 0 L10 4 L0 8 z"/></marker>
<pattern id="ak-grid" width="32" height="32" patternUnits="userSpaceOnUse"><circle class="ak-grid-dot" cx="1" cy="1" r="1"/></pattern>
</defs>
<rect class="ak-canvas" width="{CW}" height="{CH}"/>
<rect class="ak-canvas-grid" width="{CW}" height="{CH}" fill="url(#ak-grid)"/>
<g class="ak-head">
<text class="ak-title" x="24" y="40">HR BlockBot · Chatbot &amp; Agentic Architecture</text>
<text class="ak-subtitle" x="24" y="62">Ba phân tầng không gian: sandbox &amp; bộ nhớ dài hạn · lõi realtime · bảo mật và lưu trữ</text>
</g>
{lane_svg}
<g class="ak-edges">{"".join(edge_svg)}</g>
<g class="ak-nodes">{"".join(node_svg)}</g>
<g class="ak-legend">{legend_svg}</g>
</svg>'''


def stack_block():
    lane_of = {"r1": "top", "r2": "mid", "r3": "mid", "r4": "mid", "r5": "bot", "r6": "bot"}
    outgoing = {}
    for a, b in ROUTES:
        outgoing.setdefault(a, []).append((b, LABELS.get((a, b), "→")))
    by_id = {row[0]: row for row in SPEC}
    blocks = []
    for lane in LANES:
        ids = sorted((nid for nid in by_id if lane_of[by_id[nid][5]] == lane["id"]),
                     key=lambda nid: (by_id[nid][5], by_id[nid][4]))
        rows = []
        for nid in ids:
            _, sub, label, fam, _col, _row, desc = by_id[nid]
            flows = "".join(
                f'<li><span class="m-arrow" aria-hidden="true">→</span>'
                f'<span class="m-edge-label">{esc(lbl)}</span>'
                f'<span class="m-edge-target">{esc(by_id[b][2])}</span></li>'
                for b, lbl in outgoing.get(nid, [])
            )
            rows.append(
                f'<li class="m-node m-{fam}">'
                f'<div class="m-node-head"><span class="m-dot" aria-hidden="true"></span>'
                f'<span class="m-sub">{esc(sub)}</span></div>'
                f'<p class="m-label">{esc(label)}</p>'
                f'<p class="m-desc">{esc(desc)}</p>'
                + (f'<ul class="m-flows">{flows}</ul>' if flows else "")
                + "</li>"
            )
        blocks.append(
            f'<section class="m-lane"><header><span class="m-lane-tag">{esc(lane["tag"])}</span>'
            f'<h3>{esc(lane["label"].split("·")[0].strip().title())}</h3>'
            f'<p>{esc(lane["label"].split("·", 1)[1].strip())}</p></header>'
            f'<ol class="m-nodes">{"".join(rows)}</ol></section>'
        )
    return "".join(blocks)


out = pathlib.Path(__file__).resolve().parent.parent / "public" / "diagrams" / "chatbot-architecture.html"
page = out.read_text(encoding="utf-8")
page = re.sub(r'<svg class="ak-diagram-svg".*?</svg>', SVG, page, count=1, flags=re.S)
page = re.sub(r'(<div class="ak-stack"[^>]*>\s*<div class="ak-stack-head">.*?</div>\s*)(.*?)(\s*</div>\s*<div class="ak-tooltip")',
              lambda m: m.group(1) + stack_block() + m.group(3), page, count=1, flags=re.S)
out.write_text(page, encoding="utf-8")
print(f"wrote {out} — {len(NODES)} nodes, {len(ROUTES)} edges, canvas {CW}x{CH}")
