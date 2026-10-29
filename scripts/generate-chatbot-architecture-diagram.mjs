/**
 * Generator script for HR BlockBot Chatbot & Agentic Architecture Diagram
 * Produces:
 *  - docs/diagrams/chatbot-architecture.json (Clean typed IR)
 *  - docs/diagrams/chatbot-architecture.svg (Vector SVG)
 *  - docs/diagrams/chatbot-architecture.html (Interactive standalone reader)
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CANVAS_W = 2440;
const CANVAS_H = 1060;

// Nodes Definition
const nodes = [
  // TẦNG TRÊN (Lane Top: y=90..360)
  {
    id: 's-omni',
    lane: 'top',
    col: 0,
    x: 80,
    y: 190,
    w: 200,
    h: 56,
    kind: 'start',
    shape: 'pill',
    family: 'start',
    label: 'Omni Gateway',
    sub: 'INGRESS',
    desc: 'Zalo OA · Telegram Bot · Tailnet sidecar webhook ingress',
    sigil: 'M5 3l8 5-8 5z'
  },
  {
    id: 's-memory',
    lane: 'top',
    col: 2,
    x: 760,
    y: 190,
    w: 210,
    h: 72,
    kind: 'subprocess',
    shape: 'card',
    family: 'service',
    label: 'Episodic Memory',
    sub: 'VECTOR STORE',
    desc: 'Qdrant vectors + SQLite markdown audit log (Roadmap v2)',
    sigil: 'M3 3h10v10H3zM6 6h4M6 8h4M6 10h2'
  },
  {
    id: 's-browser',
    lane: 'top',
    col: 4,
    x: 1460,
    y: 140,
    w: 210,
    h: 72,
    kind: 'subprocess',
    shape: 'card',
    family: 'service',
    label: 'Agent Browser',
    sub: 'PORTAL RUNNER',
    desc: 'Chrome CDP + Xvnc portal automation & export (Roadmap v2)',
    sigil: 'M3 3h10v10H3zM6 6h4M6 8h4M6 10h2'
  },
  {
    id: 's-sandbox',
    lane: 'top',
    col: 4,
    x: 1460,
    y: 250,
    w: 210,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Sandbox Runner',
    sub: 'ANALYTICS ENGINE',
    desc: 'Docker container Python analytics & report runner (Roadmap v2)',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },

  // TẦNG GIỮA (Lane Mid: y=380..730)
  {
    id: 's-chat',
    lane: 'mid',
    col: 0,
    x: 80,
    y: 520,
    w: 200,
    h: 56,
    kind: 'start',
    shape: 'pill',
    family: 'start',
    label: 'Web Chat Drawer',
    sub: 'UI CLIENT',
    desc: 'React 18 · Socket.IO client · 6 UI interactive states',
    sigil: 'M5 3l8 5-8 5z'
  },
  {
    id: 's-gateway',
    lane: 'mid',
    col: 1,
    x: 420,
    y: 512,
    w: 200,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Chat Gateway Service',
    sub: 'API GATEWAY',
    desc: 'Express 3001 · JWT Auth & user scope enforcement',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-filter',
    lane: 'mid',
    col: 2,
    x: 760,
    y: 440,
    w: 210,
    h: 72,
    kind: 'decision',
    shape: 'notch',
    family: 'decision',
    label: 'Fast Rule Gate',
    sub: 'REGEX GATEWAY',
    desc: 'Regex & greeting word-set <0.1ms instant bypass',
    sigil: 'M8 2l6 6-6 6-6-6z'
  },
  {
    id: 's-policy',
    lane: 'mid',
    col: 2,
    x: 760,
    y: 580,
    w: 210,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'In-Context Policy Store',
    sub: 'POLICY STORE',
    desc: 'Guta regulations prompt injection (ADR-019)',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-jev',
    lane: 'mid',
    col: 3,
    x: 1110,
    y: 440,
    w: 210,
    h: 72,
    kind: 'decision',
    shape: 'notch',
    family: 'decision',
    label: 'Jev AI Decision Gate',
    sub: 'DECISION GATE',
    desc: 'System One · sync key / trial key pool / degraded fallback',
    sigil: 'M8 2l6 6-6 6-6-6z'
  },
  {
    id: 's-loop',
    lane: 'mid',
    col: 3,
    x: 1110,
    y: 580,
    w: 210,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Agent Execution Loop',
    sub: 'ORCHESTRATOR',
    desc: 'Turn orchestrator · Max 5 steps safety guard loop',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-tools',
    lane: 'mid',
    col: 4,
    x: 1460,
    y: 510,
    w: 210,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Scoped Tool Runtime',
    sub: 'TOOL RUNTIME',
    desc: 'Read-only queries: shifts, punches, users, attendances',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-chain',
    lane: 'mid',
    col: 5,
    x: 1810,
    y: 510,
    w: 210,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Dynamic Provider Chain',
    sub: 'FAILOVER CHAIN',
    desc: 'Priority failover · TTL 60s cache · Provider switching',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-llm',
    lane: 'mid',
    col: 6,
    x: 2160,
    y: 460,
    w: 200,
    h: 56,
    kind: 'terminal-success',
    shape: 'pill',
    family: 'success',
    label: 'Gemini 3.8 Flash',
    sub: 'PRIMARY LLM',
    desc: 'Primary 1M context LLM · Structured JSON & citations',
    sigil: 'M3 8l3 3 7-7'
  },
  {
    id: 's-fallback',
    lane: 'mid',
    col: 6,
    x: 2160,
    y: 560,
    w: 200,
    h: 56,
    kind: 'terminal-failure',
    shape: 'pill',
    family: 'failure',
    label: 'Fallback Provider',
    sub: 'RESILIENCE',
    desc: 'Auto failover resilience degraded mode (Fake/Local LLM)',
    sigil: 'M4 4l8 8M12 4l-8 8'
  },

  // TẦNG DƯỚI (Lane Bot: y=750..990)
  {
    id: 's-admin',
    lane: 'bot',
    col: 0,
    x: 80,
    y: 830,
    w: 200,
    h: 56,
    kind: 'start',
    shape: 'pill',
    family: 'start',
    label: 'Admin Provider UI',
    sub: 'ADMIN PORTAL',
    desc: 'Runtime settings · KeyHint safe priority UI management',
    sigil: 'M5 3l8 5-8 5z'
  },
  {
    id: 's-crypto',
    lane: 'bot',
    col: 1,
    x: 420,
    y: 822,
    w: 200,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Crypto & Vault Service',
    sub: 'VAULT SERVICE',
    desc: 'AES-256-GCM secret keys & config version management',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-conv',
    lane: 'bot',
    col: 2,
    x: 760,
    y: 770,
    w: 210,
    h: 72,
    kind: 'subprocess',
    shape: 'card',
    family: 'service',
    label: 'MongoDB: conversations',
    sub: 'SESSION DB',
    desc: 'User session history capped at 50 messages per session',
    sigil: 'M3 3h10v10H3zM6 6h4M6 8h4M6 10h2'
  },
  {
    id: 's-settings',
    lane: 'bot',
    col: 2,
    x: 760,
    y: 880,
    w: 210,
    h: 72,
    kind: 'subprocess',
    shape: 'card',
    family: 'service',
    label: 'MongoDB: settings',
    sub: 'ENCRYPTED STORE',
    desc: 'Encrypted provider credentials & active schema version',
    sigil: 'M3 3h10v10H3zM6 6h4M6 8h4M6 10h2'
  },
  {
    id: 's-confirm',
    lane: 'bot',
    col: 4,
    x: 1460,
    y: 820,
    w: 210,
    h: 72,
    kind: 'wait',
    shape: 'card',
    family: 'waiting',
    label: 'Action Executor (2-Step)',
    sub: 'CONFIRM GATE',
    desc: 'Human confirmation enforced · Writes to DB only on verdict',
    sigil: 'M8 2a6 6 0 1 0 0 12A6 6 0 0 0 8 2zM8 5v3l2 2'
  },
  {
    id: 's-egress',
    lane: 'bot',
    col: 5,
    x: 1810,
    y: 760,
    w: 210,
    h: 72,
    kind: 'action',
    shape: 'card',
    family: 'process',
    label: 'Egress Key Lease',
    sub: 'ZERO-TRUST LEASE',
    desc: 'Zero-trust key lease & outbound key swap proxy (Roadmap v2)',
    sigil: 'M3 4h10M3 8h10M3 12h6'
  },
  {
    id: 's-db',
    lane: 'bot',
    col: 5,
    x: 1810,
    y: 870,
    w: 210,
    h: 72,
    kind: 'subprocess',
    shape: 'card',
    family: 'service',
    label: 'MongoDB: hr_bot Data',
    sub: 'OPERATIONAL DB',
    desc: 'Operational collections: shifts, punches, users, attendances',
    sigil: 'M3 3h10v10H3zM6 6h4M6 8h4M6 10h2'
  }
];

// Edges Definition with non-colliding orthogonal routes and clear labels
const edges = [
  // Ingress
  {
    id: 'e0',
    from: 's-omni',
    to: 's-gateway',
    label: 'Tailnet Ingress',
    step: 1,
    d: 'M280 218 L350 218 Q360 218 360 228 L360 520 Q360 530 370 530 L420 530',
    labelBox: { x: 350, y: 340, w: 98, h: 20 }
  },
  {
    id: 'e1',
    from: 's-chat',
    to: 's-gateway',
    label: 'WS chat:send',
    step: 1,
    d: 'M280 548 L420 548',
    labelBox: { x: 350, y: 536, w: 86, h: 20 }
  },
  {
    id: 'e2',
    from: 's-gateway',
    to: 's-conv',
    label: 'Save (≤50)',
    step: 2,
    d: 'M620 560 L685 560 Q695 560 695 570 L695 796 Q695 806 705 806 L760 806',
    labelBox: { x: 695, y: 670, w: 76, h: 20 }
  },
  {
    id: 'e3',
    from: 's-gateway',
    to: 's-filter',
    label: 'POST /chat',
    step: 2,
    d: 'M620 526 L685 526 Q695 526 695 516 L695 486 Q695 476 705 476 L760 476',
    labelBox: { x: 655, y: 514, w: 78, h: 20 }
  },

  // Intent & Context
  {
    id: 'e4',
    from: 's-filter',
    to: 's-jev',
    label: 'Pass',
    step: 3,
    d: 'M970 476 L1110 476',
    labelBox: { x: 1040, y: 464, w: 46, h: 20 }
  },
  {
    id: 'e5',
    from: 's-jev',
    to: 's-loop',
    label: 'Typed Intent',
    step: 4,
    d: 'M1215 512 L1215 580',
    labelBox: { x: 1215, y: 546, w: 84, h: 20 }
  },
  {
    id: 'e6',
    from: 's-policy',
    to: 's-loop',
    label: 'Inject Rules',
    step: 4,
    d: 'M970 616 L1110 616',
    labelBox: { x: 1040, y: 604, w: 82, h: 20 }
  },
  {
    id: 'e7',
    from: 's-memory',
    to: 's-loop',
    label: '[Roadmap] Recall',
    step: 4,
    d: 'M970 226 L1040 226 Q1050 226 1050 236 L1050 586 Q1050 596 1060 596 L1110 596',
    labelBox: { x: 1050, y: 360, w: 110, h: 20 }
  },

  // Execution
  {
    id: 'e8',
    from: 's-loop',
    to: 's-tools',
    label: 'Tool Call',
    step: 5,
    d: 'M1320 596 L1385 596 Q1395 596 1395 586 L1395 556 Q1395 546 1405 546 L1460 546',
    labelBox: { x: 1355, y: 584, w: 70, h: 20 }
  },
  {
    id: 'e9',
    from: 's-loop',
    to: 's-browser',
    label: '[Roadmap] Portal',
    step: 5,
    d: 'M1320 586 L1365 586 Q1375 586 1375 576 L1375 186 Q1375 176 1385 176 L1460 176',
    labelBox: { x: 1375, y: 360, w: 106, h: 20 }
  },
  {
    id: 'e10',
    from: 's-loop',
    to: 's-sandbox',
    label: '[Roadmap] Script',
    step: 5,
    d: 'M1320 606 L1410 606 Q1420 606 1420 596 L1420 296 Q1420 286 1430 286 L1460 286',
    labelBox: { x: 1420, y: 440, w: 106, h: 20 }
  },
  {
    id: 'e11',
    from: 's-loop',
    to: 's-confirm',
    label: 'Propose Draft',
    step: 5,
    d: 'M1320 626 L1385 626 Q1395 626 1395 636 L1395 846 Q1395 856 1405 856 L1460 856',
    labelBox: { x: 1395, y: 740, w: 90, h: 20 }
  },

  // Tool & Action Outputs
  {
    id: 'e12',
    from: 's-tools',
    to: 's-db',
    label: 'Read (No Write)',
    step: 6,
    d: 'M1670 566 L1735 566 Q1745 566 1745 576 L1745 896 Q1745 906 1755 906 L1810 906',
    labelBox: { x: 1745, y: 690, w: 102, h: 20 }
  },
  {
    id: 'e13',
    from: 's-confirm',
    to: 's-db',
    label: 'Write after Confirm',
    step: 6,
    d: 'M1670 856 L1735 856 Q1745 856 1745 866 L1745 876 Q1745 886 1755 886 L1810 886',
    labelBox: { x: 1705, y: 844, w: 118, h: 20 }
  },
  {
    id: 'e14',
    from: 's-tools',
    to: 's-chain',
    label: 'Generate Answer',
    step: 6,
    d: 'M1670 546 L1810 546',
    labelBox: { x: 1740, y: 534, w: 104, h: 20 }
  },

  // Inference
  {
    id: 'e15',
    from: 's-chain',
    to: 's-llm',
    label: 'Direct Call (Live)',
    step: 7,
    d: 'M2020 536 L2085 536 Q2095 536 2095 526 L2095 498 Q2095 488 2105 488 L2160 488',
    labelBox: { x: 2055, y: 524, w: 104, h: 20 }
  },
  {
    id: 'e16',
    from: 's-chain',
    to: 's-egress',
    label: '[Roadmap] Lease',
    step: 7,
    d: 'M1915 582 L1915 760',
    labelBox: { x: 1915, y: 671, w: 102, h: 20 }
  },
  {
    id: 'e17',
    from: 's-egress',
    to: 's-llm',
    label: '[Roadmap] Swapped Key',
    step: 8,
    d: 'M2020 786 L2085 786 Q2095 786 2095 776 L2095 514 Q2095 504 2105 504 L2160 504',
    labelBox: { x: 2095, y: 640, w: 138, h: 20 }
  },
  {
    id: 'e18',
    from: 's-egress',
    to: 's-fallback',
    label: '[Roadmap] Fallback',
    step: 8,
    d: 'M2020 806 L2110 806 Q2120 806 2120 796 L2120 598 Q2120 588 2130 588 L2160 588',
    labelBox: { x: 2120, y: 720, w: 114, h: 20 }
  },

  // Security
  {
    id: 'e19',
    from: 's-admin',
    to: 's-crypto',
    label: 'Save Keys',
    step: 1,
    d: 'M280 858 L420 858',
    labelBox: { x: 350, y: 846, w: 72, h: 20 }
  },
  {
    id: 'e20',
    from: 's-crypto',
    to: 's-settings',
    label: 'Store AES',
    step: 2,
    d: 'M620 868 L685 868 Q695 868 695 878 L695 906 Q695 916 705 916 L760 916',
    labelBox: { x: 655, y: 856, w: 70, h: 20 }
  }
];

// Views / Story chapters
const views = [
  {
    id: 'c1',
    title: '1. Core Realtime Chat (Tầng Giữa - Live)',
    narrative: 'Luồng tương tác chính ở Tầng Giữa: Web ChatDrawer gửi tin nhắn qua WebSocket đến Chat Gateway. Fast Rule Gate lọc lời chào <0.1ms. Jev AI Decision Gate chạy theo 3 đường có khai báo nguồn: key đồng bộ (~0,4s suy luận), pool trial xoay key (~2,5-3,7s end-to-end), fallback LLM/rule có degraded khi hết key. Agent Loop phối hợp In-Context Policy và Tool Runtime để sinh phản hồi an toàn qua Dynamic Provider Chain đến Gemini 3.8 Flash.',
    focus_nodes: ['s-chat', 's-gateway', 's-filter', 's-jev', 's-policy', 's-loop', 's-tools', 's-chain', 's-llm']
  },
  {
    id: 'c2',
    title: '2. Autonomous Sandbox & Memory (Tầng Trên - Roadmap v2)',
    narrative: 'Học hỏi từ kiến trúc Agentic Container: Tầng Trên bổ sung Omni Gateway (Zalo OA, Telegram Bot), Bộ nhớ dài hạn Episodic Memory (Qdrant vectors + SQLite audit), Headless Browser Agent (Chrome CDP) và Docker Sandbox Runner phân tích dữ liệu chuyên sâu.',
    focus_nodes: ['s-omni', 's-memory', 's-browser', 's-sandbox', 's-loop']
  },
  {
    id: 'c3',
    title: '3. Security, Human Confirmation & Persistence (Tầng Dưới)',
    narrative: 'Tầng Dưới kiểm soát an ninh nghiêm ngặt: Crypto Vault Service mã hóa secret keys AES-256-GCM zero-leak. Egress Proxy tráo token theo lượt (key-swap). Mọi hành động ghi dữ liệu nhân sự đều bị chặn bởi Action Executor 2-Step bắt buộc con người phê duyệt trước khi lưu vào MongoDB hr_bot.',
    focus_nodes: ['s-admin', 's-crypto', 's-settings', 's-conv', 's-confirm', 's-egress', 's-db']
  }
];

// Compile Clean JSON IR
const jsonIR = {
  schema_version: 1,
  diagram_type: 'workflow',
  meta: {
    title: 'HR BlockBot - Chatbot & Agentic Architecture',
    subtitle: '3 Phân Tầng Không Gian: Tầng Trên (Sandbox & Memory) · Tầng Giữa (Realtime Core) · Tầng Dưới (Security & Persistence)',
    visual_preset: 'signal-flow',
    theme: 'dark',
    animation: 'trace',
    views
  },
  lanes: [
    {
      id: 'lane-top',
      label: 'TẦNG TRÊN: AUTONOMOUS SANDBOX & LONG-TERM MEMORY (ROADMAP)',
      role: 'worker'
    },
    {
      id: 'lane-mid',
      label: 'TẦNG GIỮA: CORE REALTIME CHAT & AGENT EXECUTION LOOP (LIVE)',
      role: 'orchestrator'
    },
    {
      id: 'lane-bot',
      label: 'TẦNG DƯỚI: SECURITY, HUMAN CONFIRMATION & ENTERPRISE PERSISTENCE',
      role: 'approver'
    }
  ],
  steps: nodes.map(n => ({
    id: n.id,
    label: n.label,
    description: n.desc,
    lane: `lane-${n.lane}`,
    kind: n.kind
  })),
  transitions: edges.map(e => ({
    from: e.from,
    to: e.to,
    label: e.label
  }))
};

writeFileSync(resolve('docs/diagrams/chatbot-architecture.json'), JSON.stringify(jsonIR, null, 2), 'utf-8');
console.log('✓ Wrote docs/diagrams/chatbot-architecture.json');

// Build Deterministic Clean SVG
function generateSvg() {
  let svg = `<svg class="ak-diagram-svg" viewBox="0 0 ${CANVAS_W} ${CANVAS_H}" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="HR BlockBot - Chatbot &amp; Agentic Architecture" data-diagram-type="workflow" data-preset="signal-flow" data-theme="dark" data-animation="trace" data-motion="play">`;
  svg += `<title>HR BlockBot - Chatbot &amp; Agentic Architecture</title>`;

  // Defs & Styles
  svg += `<defs>
<style>
svg {
  --ak-bg: #021a16;
  --ak-surface: #04241d;
  --ak-surface-border: #0a4d3c;
  --ak-text-primary: #f0fdf4;
  --ak-text-secondary: #a7f3d0;
  --ak-text-muted: #34d399;
  --ak-accent: #10b981;
  --ak-accent-light: #064e3b;
  --ak-node-bg: #063c30;
  --ak-node-border: #10b981;
  --ak-edge-stroke: #34d399;
  --ak-edge-active: #6ee7b7;
  --ak-badge-bg: #064e3b;
  --ak-font-sans: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --ak-font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.ak-diagram-svg { font-family: var(--ak-font-sans); display: block; background: var(--ak-bg); }
.ak-diagram-svg text { user-select: none; }
.ak-canvas { fill: var(--ak-bg); }
.ak-grid-dot { fill: var(--ak-text-muted); opacity: 0.22; }

.ak-title { font-size: 19px; font-weight: 700; fill: var(--ak-text-primary); letter-spacing: -0.01em; }
.ak-subtitle { font-size: 12.5px; font-weight: 500; fill: var(--ak-text-secondary); }

/* Swimlanes */
.ak-frame { fill: var(--ak-surface); stroke: var(--ak-surface-border); stroke-width: 1.5; }
.ak-frame-lane { fill: rgba(4, 36, 29, 0.65); rx: 14px; }
.ak-lane-top .ak-frame-lane { stroke: #0d5543; stroke-dasharray: 6 4; }
.ak-lane-mid .ak-frame-lane { stroke: #10b981; stroke-width: 1.75; fill: rgba(5, 42, 34, 0.75); }
.ak-lane-bot .ak-frame-lane { stroke: #b45309; stroke-dasharray: 8 4; }
.ak-frame-label { font-size: 11.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; fill: var(--ak-text-secondary); }

/* Nodes */
.ak-node { cursor: pointer; outline: none; }
.ak-node-mask { fill: var(--ak-bg); }
.ak-node-card { fill: rgba(6, 60, 48, 0.85); stroke: rgba(16, 185, 129, 0.45); stroke-width: 1.5; transition: stroke-width 160ms ease, stroke 160ms ease, fill 160ms ease; }
.ak-node[data-family="start"] .ak-node-card { fill: rgba(4, 120, 87, 0.25); stroke: #10b981; stroke-width: 2; }
.ak-node[data-family="success"] .ak-node-card { fill: rgba(16, 185, 129, 0.2); stroke: #34d399; stroke-width: 2; }
.ak-node[data-family="failure"] .ak-node-card { fill: rgba(225, 29, 72, 0.15); stroke: #f43f5e; stroke-width: 1.75; }
.ak-node[data-family="decision"] .ak-node-card { fill: rgba(14, 116, 144, 0.2); stroke: #06b6d4; stroke-width: 1.75; }
.ak-node[data-family="waiting"] .ak-node-card { fill: rgba(217, 119, 6, 0.2); stroke: #f59e0b; stroke-width: 1.75; }
.ak-node[data-family="service"] .ak-node-card { fill: rgba(79, 70, 229, 0.15); stroke: #818cf8; stroke-width: 1.5; }
.ak-node[data-family="process"] .ak-node-card { fill: rgba(15, 118, 110, 0.2); stroke: #2dd4bf; stroke-width: 1.5; }

.ak-node:hover .ak-node-card, .ak-node:focus-visible .ak-node-card { stroke: #6ee7b7; stroke-width: 2.5; fill: rgba(6, 78, 59, 0.95); }
.ak-node.is-focused .ak-node-card { stroke: #34d399; stroke-width: 3; fill: rgba(6, 95, 70, 0.95); }
.ak-node.is-dimmed { opacity: 0.22; transition: opacity 200ms ease; }

.ak-node-accent { fill: #10b981; }
.ak-node[data-family="service"] .ak-node-accent { fill: #818cf8; }
.ak-node[data-family="decision"] .ak-node-accent { fill: #06b6d4; }
.ak-node[data-family="waiting"] .ak-node-accent { fill: #f59e0b; }
.ak-node[data-family="failure"] .ak-node-accent { fill: #f43f5e; }
.ak-node[data-family="start"] .ak-node-accent { fill: #10b981; }

.ak-sigil path { fill: none; stroke: #34d399; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
.ak-node[data-family="service"] .ak-sigil path { stroke: #a5b4fc; }
.ak-node[data-family="decision"] .ak-sigil path { stroke: #67e8f9; }
.ak-node[data-family="waiting"] .ak-sigil path { stroke: #fcd34d; }
.ak-node[data-family="failure"] .ak-sigil path { stroke: #fda4af; }

.ak-node-label { font-size: 13.5px; font-weight: 700; fill: var(--ak-text-primary); letter-spacing: -0.01em; }
.ak-node-sub { font-size: 9.5px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; fill: #6ee7b7; }
.ak-node[data-family="service"] .ak-node-sub { fill: #c7d2fe; }
.ak-node[data-family="decision"] .ak-node-sub { fill: #a5f3fc; }
.ak-node[data-family="waiting"] .ak-node-sub { fill: #fde68a; }
.ak-node[data-family="failure"] .ak-node-sub { fill: #fecdd3; }

.ak-node-desc { font-size: 10px; font-weight: 500; fill: #a7f3d0; opacity: 0.85; }

/* Edges */
.ak-edge-path { fill: none; stroke: var(--ak-edge-stroke); stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; transition: stroke 160ms ease, stroke-width 160ms ease; }
.ak-edge-flow { fill: none; stroke: var(--ak-edge-active); stroke-width: 2.25; stroke-linecap: round; opacity: 0; pointer-events: none; }
.ak-edge.is-highlighted .ak-edge-path { stroke: #6ee7b7; stroke-width: 2.75; }
.ak-edge.is-dimmed { opacity: 0.18; transition: opacity 200ms ease; }

.ak-edge-label-mask { fill: #021a16; stroke: rgba(16, 185, 129, 0.45); stroke-width: 1; }
.ak-edge-label text { font-size: 10.5px; font-weight: 600; fill: #a7f3d0; }

.ak-arrowhead { fill: var(--ak-edge-stroke); }
.ak-arrowhead-open { fill: none; stroke: var(--ak-edge-stroke); stroke-width: 1.25; }

/* Legend */
.ak-legend-swatch { stroke-width: 1.5; }
.ak-legend-item text { font-size: 11px; font-weight: 600; fill: var(--ak-text-secondary); }

/* Keyframe animations */
@keyframes ak-node-in {
  0% { opacity: 0; transform: scale(0.92); }
  100% { opacity: 1; transform: scale(1); }
}
@keyframes ak-edge-draw {
  0% { stroke-dashoffset: 100; }
  100% { stroke-dashoffset: 0; }
}
@keyframes ak-fade-in {
  0% { opacity: 0; }
  100% { opacity: 1; }
}
@keyframes ak-edge-flow {
  0% { stroke-dashoffset: 100; opacity: 0; }
  15% { opacity: 0.95; }
  85% { opacity: 0.95; }
  100% { stroke-dashoffset: 0; opacity: 0; }
}

[data-motion="play"] [data-animate="node"] {
  transform-box: fill-box;
  transform-origin: center;
  animation: ak-node-in 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) both;
  animation-delay: calc(var(--step, 0) * 80ms);
}
[data-motion="play"] [data-animate="edge"] .ak-edge-path {
  stroke-dasharray: 100;
  stroke-dashoffset: 100;
  animation: ak-edge-draw 0.7s cubic-bezier(0.4, 0, 0.2, 1) forwards;
  animation-delay: calc(var(--step, 0) * 80ms + 100ms);
}
[data-motion="play"] [data-animate="edge"] .ak-edge-label {
  opacity: 0;
  animation: ak-fade-in 0.4s ease forwards;
  animation-delay: calc(var(--step, 0) * 80ms + 400ms);
}
[data-motion="play"] [data-animate="frame"] {
  opacity: 0;
  animation: ak-fade-in 0.5s ease forwards;
}
[data-motion="play"] [data-animate="edge"] .ak-edge-flow {
  stroke-dasharray: 6 10;
  animation: ak-edge-flow 1.5s linear 3;
  animation-delay: calc(var(--step, 0) * 80ms + 800ms);
}
</style>
<marker id="ak-arrowhead" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path class="ak-arrowhead" d="M0 0L9 3.5L0 7z"/></marker>
<marker id="ak-arrowhead-open" markerWidth="9" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="userSpaceOnUse"><path class="ak-arrowhead-open" d="M0 0L8 3.5L0 7"/></marker>
<pattern id="ak-grid-dots" width="24" height="24" patternUnits="userSpaceOnUse"><circle class="ak-grid-dot" cx="1" cy="1" r="1"/></pattern>
</defs>`;

  // Canvas & Grid
  svg += `<rect class="ak-canvas" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}"/>`;
  svg += `<rect class="ak-canvas-grid" x="0" y="0" width="${CANVAS_W}" height="${CANVAS_H}" fill="url(#ak-grid-dots)"/>`;

  // Header
  svg += `<g class="ak-header">
<text class="ak-title" x="50" y="38">HR BlockBot - Chatbot &amp; Agentic Architecture</text>
<text class="ak-subtitle" x="50" y="60">3 Phân Tầng Không Gian: Tầng Trên (Sandbox &amp; Memory) · Tầng Giữa (Realtime Core) · Tầng Dưới (Security &amp; Persistence)</text>
</g>`;

  // Swimlanes
  const lanes = [
    {
      id: 'lane-top',
      y: 90,
      h: 270,
      title: 'TẦNG TRÊN: AUTONOMOUS SANDBOX &amp; LONG-TERM MEMORY',
      badge: 'ROADMAP · EXTENSION',
      badgeFill: 'rgba(14, 116, 144, 0.25)',
      badgeStroke: '#06b6d4',
      badgeColor: '#22d3ee'
    },
    {
      id: 'lane-mid',
      y: 380,
      h: 350,
      title: 'TẦNG GIỮA: CORE REALTIME CHAT &amp; AGENT EXECUTION LOOP',
      badge: 'PRODUCTION · LIVE',
      badgeFill: 'rgba(4, 120, 87, 0.35)',
      badgeStroke: '#10b981',
      badgeColor: '#34d399'
    },
    {
      id: 'lane-bot',
      y: 750,
      h: 250,
      title: 'TẦNG DƯỚI: SECURITY, HUMAN CONFIRMATION &amp; ENTERPRISE PERSISTENCE',
      badge: 'SECURITY &amp; STORAGE',
      badgeFill: 'rgba(180, 83, 9, 0.25)',
      badgeStroke: '#f59e0b',
      badgeColor: '#fbbf24'
    }
  ];

  for (const lane of lanes) {
    svg += `<g class="ak-lane ak-${lane.id}" data-lane-id="${lane.id}" data-animate="frame">
<rect class="ak-frame ak-frame-lane" x="50" y="${lane.y}" width="2340" height="${lane.h}" rx="14"/>
<text class="ak-frame-label" x="75" y="${lane.y + 24}">${lane.title}</text>
<g class="ak-frame-tag" transform="translate(2250, ${lane.y + 19})">
  <rect x="-80" y="-12" width="160" height="24" rx="12" fill="${lane.badgeFill}" stroke="${lane.badgeStroke}" stroke-width="1.2"/>
  <text x="0" y="4" text-anchor="middle" font-size="10.5" font-weight="700" fill="${lane.badgeColor}" letter-spacing="0.08em">${lane.badge} </text>
</g>
</g>`;
  }

  // Edges
  for (const edge of edges) {
    svg += `<g class="ak-edge" data-from="${edge.from}" data-to="${edge.to}" data-edge-id="${edge.id}" data-animate="edge" style="--step:${edge.step}">`;
    svg += `<path class="ak-edge-path" d="${edge.d}" pathLength="100" marker-end="url(#ak-arrowhead)"/>`;
    svg += `<path class="ak-edge-flow" d="${edge.d}" pathLength="100"/>`;
    const box = edge.labelBox;
    const rx = box.x - box.w / 2;
    const ry = box.y - box.h / 2;
    svg += `<g class="ak-edge-label">
<rect class="ak-edge-label-mask" x="${rx}" y="${ry}" width="${box.w}" height="${box.h}" rx="10"/>
<text x="${box.x}" y="${box.y + 4}" text-anchor="middle">${edge.label}</text>
</g>`;
    svg += `</g>`;
  }

  // Nodes
  for (const node of nodes) {
    const cy = node.y + node.h / 2;
    const rx = node.shape === 'pill' ? node.h / 2 : 10;
    const sigilY = cy - 8;

    svg += `<g class="ak-node" data-node-id="${node.id}" data-label="${node.label}" data-role="${node.kind}" data-desc="${node.desc}" data-family="${node.family}" data-shape="${node.shape}" tabindex="0" data-animate="node" style="--step:${node.col}">`;
    svg += `<rect class="ak-node-mask" x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${rx}"/>`;
    svg += `<rect class="ak-node-card" x="${node.x}" y="${node.y}" width="${node.w}" height="${node.h}" rx="${rx}"/>`;

    if (node.shape === 'card') {
      svg += `<rect class="ak-node-accent" x="${node.x + 1}" y="${node.y + 10}" width="3" height="${node.h - 20}" rx="1.5"/>`;
    }

    svg += `<g class="ak-sigil" transform="translate(${node.x + 14} ${sigilY})"><path d="${node.sigil}"/></g>`;

    if (node.shape === 'pill') {
      svg += `<text class="ak-node-sub" x="${node.x + 42}" y="${cy - 8}">${node.sub}</text>`;
      svg += `<text class="ak-node-label" x="${node.x + 42}" y="${cy + 8}">${node.label}</text>`;
    } else {
      svg += `<text class="ak-node-sub" x="${node.x + 42}" y="${cy - 16}">${node.sub}</text>`;
      svg += `<text class="ak-node-label" x="${node.x + 42}" y="${cy + 2}">${node.label}</text>`;
      svg += `<text class="ak-node-desc" x="${node.x + 42}" y="${cy + 19}">${node.desc.split(' · ')[0]}</text>`;
    }
    svg += `</g>`;
  }

  // Legend
  const legendItems = [
    { label: 'Start / UI', family: 'start', fill: 'rgba(4, 120, 87, 0.25)', stroke: '#10b981' },
    { label: 'Process / Loop', family: 'process', fill: 'rgba(15, 118, 110, 0.2)', stroke: '#2dd4bf' },
    { label: 'Decision Gate', family: 'decision', fill: 'rgba(14, 116, 144, 0.2)', stroke: '#06b6d4' },
    { label: 'Service / DB', family: 'service', fill: 'rgba(79, 70, 229, 0.15)', stroke: '#818cf8' },
    { label: 'Human Confirm', family: 'waiting', fill: 'rgba(217, 119, 6, 0.2)', stroke: '#f59e0b' },
    { label: 'Primary LLM', family: 'success', fill: 'rgba(16, 185, 129, 0.2)', stroke: '#34d399' },
    { label: 'Failover Mode', family: 'failure', fill: 'rgba(225, 29, 72, 0.15)', stroke: '#f43f5e' }
  ];

  svg += `<g class="ak-legend">`;
  let legX = 50;
  const legY = 1030;
  for (const item of legendItems) {
    svg += `<g class="ak-legend-item" data-family="${item.family}">
<rect class="ak-legend-swatch" x="${legX}" y="${legY - 6}" width="14" height="14" rx="4" fill="${item.fill}" stroke="${item.stroke}"/>
<text x="${legX + 22}" y="${legY + 5}">${item.label}</text>
</g>`;
    legX += 22 + item.label.length * 8 + 32;
  }
  svg += `</g>`;

  svg += `</svg>`;
  return svg;
}

const renderedSvg = generateSvg();
writeFileSync(resolve('docs/diagrams/chatbot-architecture.svg'), renderedSvg, 'utf-8');
console.log('✓ Wrote docs/diagrams/chatbot-architecture.svg');

// Build Self-contained HTML Reader
function generateHtml() {
  const jsonString = JSON.stringify(jsonIR);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>HR BlockBot - Chatbot &amp; Agentic Architecture</title>
  <style>
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0;
      padding: 0;
      width: 100vw;
      height: 100vh;
      overflow: hidden;
      background: #021a16;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      color: #f0fdf4;
      -webkit-font-smoothing: antialiased;
    }
    .ak-diagram-root {
      width: 100vw;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      background: #021a16;
    }
    .ak-diagram-toolbar {
      flex: 0 0 54px;
      height: 54px;
      padding: 8px 20px;
      background: rgba(4, 36, 29, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(16, 185, 129, 0.25);
      display: flex;
      align-items: center;
      justify-content: space-between;
      z-index: 100;
    }
    .ak-toolbar-left {
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 0;
    }
    .ak-diagram-title {
      margin: 0;
      font-size: 14.5px;
      font-weight: 700;
      color: #f0fdf4;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ak-diagram-title span.icon {
      font-size: 16px;
    }
    .ak-diagram-subtitle {
      font-size: 12px;
      font-weight: 500;
      color: #a7f3d0;
      opacity: 0.85;
      margin-left: 6px;
    }
    .ak-diagram-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .ak-diagram-search-input {
      background: rgba(2, 26, 22, 0.9);
      border: 1px solid rgba(16, 185, 129, 0.35);
      border-radius: 6px;
      padding: 5px 12px;
      color: #f0fdf4;
      font-size: 12px;
      outline: none;
      width: 170px;
      transition: all 160ms ease;
    }
    .ak-diagram-search-input:focus {
      border-color: #34d399;
      box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
      width: 210px;
    }
    .ak-diagram-btn {
      background: rgba(4, 44, 36, 0.8);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #a7f3d0;
      border-radius: 6px;
      padding: 5px 10px;
      font-size: 11.5px;
      font-weight: 600;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      transition: all 150ms ease;
      white-space: nowrap;
    }
    .ak-diagram-btn:hover {
      background: rgba(6, 78, 59, 0.9);
      color: #f0fdf4;
      border-color: #34d399;
    }
    .ak-chapter-controls {
      display: inline-flex;
      align-items: center;
      background: rgba(2, 26, 22, 0.8);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 6px;
      padding: 2px 4px;
      gap: 4px;
    }
    .ak-chapter-label {
      font-size: 11.5px;
      font-weight: 700;
      color: #34d399;
      padding: 0 6px;
      min-width: 40px;
      text-align: center;
    }
    .ak-zoom-controls {
      display: inline-flex;
      align-items: center;
      background: rgba(2, 26, 22, 0.8);
      border: 1px solid rgba(16, 185, 129, 0.3);
      border-radius: 6px;
      padding: 2px 4px;
      gap: 3px;
    }
    .ak-zoom-label {
      font-size: 11px;
      font-weight: 600;
      min-width: 44px;
      text-align: center;
      color: #a7f3d0;
    }

    /* Viewport Stage */
    .ak-diagram-viewport {
      flex: 1 1 auto;
      width: 100vw;
      height: calc(100vh - 54px);
      overflow: hidden;
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      background: radial-gradient(circle at 50% 50%, rgba(6, 78, 59, 0.35) 0%, #021a16 100%);
      cursor: grab;
      user-select: none;
    }
    .ak-diagram-viewport.is-dragging {
      cursor: grabbing;
    }
    .ak-diagram-stage {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      transform-origin: center center;
      transition: transform 0.08s ease-out;
      will-change: transform;
    }
    .ak-diagram-svg {
      width: 100%;
      height: 100%;
      max-width: 100%;
      max-height: 100%;
      display: block;
      object-fit: contain;
    }

    /* Narrative Card Overlay */
    .ak-narrative-card {
      position: absolute;
      bottom: 24px;
      left: 28px;
      max-width: 620px;
      background: rgba(4, 36, 29, 0.92);
      backdrop-filter: blur(14px);
      border: 1px solid rgba(16, 185, 129, 0.4);
      border-radius: 10px;
      padding: 14px 18px;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
      z-index: 50;
      transition: all 220ms ease;
      pointer-events: auto;
    }
    .ak-narrative-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }
    .ak-narrative-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #34d399;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .ak-narrative-close {
      background: transparent;
      border: none;
      color: #a7f3d0;
      font-size: 14px;
      cursor: pointer;
      opacity: 0.7;
    }
    .ak-narrative-close:hover { opacity: 1; }
    .ak-narrative-body {
      font-size: 12px;
      line-height: 1.5;
      color: #ecfdf5;
      margin: 0;
    }

    /* Node Tooltip */
    .ak-tooltip {
      position: absolute;
      background: rgba(2, 26, 22, 0.95);
      backdrop-filter: blur(8px);
      border: 1px solid #10b981;
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 11.5px;
      color: #f0fdf4;
      pointer-events: none;
      z-index: 200;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
      max-width: 300px;
      display: none;
    }
  </style>
</head>
<body>
  <div class="ak-diagram-root" data-preset="signal-flow" data-theme="dark">
    <header class="ak-diagram-toolbar">
      <div class="ak-toolbar-left">
        <h4 class="ak-diagram-title">
          <span class="icon">📊</span>
          <span>HR BlockBot - Chatbot &amp; Agentic Architecture</span>
        </h4>
        <span class="ak-diagram-subtitle">· 3 Phân Tầng Không Gian Hệ Thống</span>
      </div>
      <div class="ak-diagram-controls">
        <input type="text" class="ak-diagram-search-input" placeholder="Search (/) ..." aria-label="Search diagram nodes and descriptions" />
        <button type="button" class="ak-diagram-btn ak-btn-reach-down" title="Downstream Reach">↓ Reach</button>
        <button type="button" class="ak-diagram-btn ak-btn-reach-up" title="Upstream Reach">↑ Reach</button>
        <button type="button" class="ak-diagram-btn ak-btn-route" title="Route Inspection (R)">📍 Route</button>
        <button type="button" class="ak-diagram-btn ak-btn-lens" title="Role Lens (L)">🔍 Lens</button>
        <div class="ak-chapter-controls">
          <button type="button" class="ak-diagram-btn ak-btn-prev-chapter" title="Previous Chapter ([)">‹</button>
          <span class="ak-chapter-label">1/3</span>
          <button type="button" class="ak-diagram-btn ak-btn-next-chapter" title="Next Chapter (])">›</button>
        </div>
        <div class="ak-zoom-controls">
          <button type="button" class="ak-diagram-btn ak-btn-zoom-out" title="Thu nhỏ (Zoom -)">−</button>
          <span class="ak-zoom-label">Fit</span>
          <button type="button" class="ak-diagram-btn ak-btn-zoom-in" title="Phóng to (Zoom +)">+</button>
          <button type="button" class="ak-diagram-btn ak-btn-zoom-fit" title="Vừa khít màn hình (Fit View - 0)">Fit View</button>
          <button type="button" class="ak-diagram-btn ak-btn-zoom-100" title="Kích thước 1:1">1:1</button>
        </div>
        <button type="button" class="ak-diagram-btn ak-btn-motion" title="Replay motion (M)">▶ Replay</button>
        <button type="button" class="ak-diagram-btn ak-btn-theme" title="Toggle Light/Dark">☀️</button>
        <button type="button" class="ak-diagram-btn ak-btn-present" title="Presentation Stage (F)">⛶</button>
      </div>
    </header>

    <main class="ak-diagram-viewport">
      <div class="ak-diagram-stage">
        ${renderedSvg}
      </div>

      <div class="ak-narrative-card">
        <div class="ak-narrative-header">
          <span class="ak-narrative-title">📖 Chapter 1/3: Core Realtime Chat &amp; Agent Loop</span>
          <button type="button" class="ak-narrative-close" title="Đóng hướng dẫn">✕</button>
        </div>
        <p class="ak-narrative-body">Luồng tương tác chính ở Tầng Giữa: Web ChatDrawer gửi tin nhắn qua WebSocket đến Chat Gateway. Fast Rule Gate lọc lời chào &lt;0.1ms. Jev AI Decision Gate chạy theo 3 đường có khai báo nguồn: key đồng bộ (~0,4s suy luận), pool trial xoay key (~2,5-3,7s end-to-end), fallback LLM/rule có degraded khi hết key. Agent Loop phối hợp In-Context Policy và Tool Runtime để sinh phản hồi an toàn qua Dynamic Provider Chain đến Gemini 3.8 Flash.</p>
      </div>

      <div class="ak-tooltip" id="ak-tooltip"></div>
    </main>

    <script type="application/json" class="ak-diagram-data">${jsonString}</script>

    <script>
    (function() {
      const root = document.querySelector('.ak-diagram-root');
      const dataEl = document.querySelector('script.ak-diagram-data');
      if (!root || !dataEl) return;

      let irData;
      try {
        irData = JSON.parse(dataEl.textContent);
      } catch (e) {
        console.error('Failed to parse IR data:', e);
        return;
      }

      const svgEl = root.querySelector('.ak-diagram-svg');
      const stageEl = root.querySelector('.ak-diagram-stage');
      const viewportEl = root.querySelector('.ak-diagram-viewport');
      const nodes = Array.from(root.querySelectorAll('.ak-node'));
      const edges = Array.from(root.querySelectorAll('.ak-edge'));
      const searchInput = root.querySelector('.ak-diagram-search-input');
      const themeBtn = root.querySelector('.ak-btn-theme');
      const presentBtn = root.querySelector('.ak-btn-present');
      const motionBtn = root.querySelector('.ak-btn-motion');
      const reachDownBtn = root.querySelector('.ak-btn-reach-down');
      const reachUpBtn = root.querySelector('.ak-btn-reach-up');
      const routeBtn = root.querySelector('.ak-btn-route');
      const lensBtn = root.querySelector('.ak-btn-lens');
      const chapterPrevBtn = root.querySelector('.ak-btn-prev-chapter');
      const chapterNextBtn = root.querySelector('.ak-btn-next-chapter');
      const chapterLabel = root.querySelector('.ak-chapter-label');
      const narrativeCard = root.querySelector('.ak-narrative-card');
      const narrativeTitle = root.querySelector('.ak-narrative-title');
      const narrativeBody = root.querySelector('.ak-narrative-body');
      const narrativeClose = root.querySelector('.ak-narrative-close');
      const tooltip = document.getElementById('ak-tooltip');

      const zoomInBtn = root.querySelector('.ak-btn-zoom-in');
      const zoomOutBtn = root.querySelector('.ak-btn-zoom-out');
      const zoomFitBtn = root.querySelector('.ak-btn-zoom-fit');
      const zoom100Btn = root.querySelector('.ak-btn-zoom-100');
      const zoomLabel = root.querySelector('.ak-zoom-label');

      let currentZoom = 1.0;
      let panX = 0;
      let panY = 0;
      let isDragging = false;
      let dragStartX = 0;
      let dragStartY = 0;
      let activeChapter = 0;
      let activeLens = -1;
      let focusedNodeId = null;

      const roles = ['start', 'process', 'decision', 'service', 'waiting', 'success', 'failure'];

      // Graph Adjacency
      const outgoing = new Map();
      const incoming = new Map();
      edges.forEach(e => {
        const from = e.getAttribute('data-from');
        const to = e.getAttribute('data-to');
        if (from && to) {
          if (!outgoing.has(from)) outgoing.set(from, []);
          outgoing.get(from).push({ to, edgeEl: e });
          if (!incoming.has(to)) incoming.set(to, []);
          incoming.get(to).push({ from, edgeEl: e });
        }
      });

      function updateTransform() {
        if (stageEl) {
          stageEl.style.transform = \`translate(\${panX}px, \${panY}px) scale(\${currentZoom})\`;
        }
        if (zoomLabel) {
          if (Math.abs(currentZoom - 1.0) < 0.03 && panX === 0 && panY === 0) {
            zoomLabel.textContent = 'Fit';
          } else {
            zoomLabel.textContent = Math.round(currentZoom * 100) + '%';
          }
        }
      }

      function fitView() {
        panX = 0;
        panY = 0;
        currentZoom = 1.0;
        updateTransform();
      }

      function setZoom(newZoom) {
        currentZoom = Math.max(0.4, Math.min(3.2, Math.round(newZoom * 100) / 100));
        updateTransform();
      }

      function clearHighlights() {
        nodes.forEach(n => n.classList.remove('is-focused', 'is-dimmed'));
        edges.forEach(e => e.classList.remove('is-highlighted', 'is-dimmed'));
        focusedNodeId = null;
      }

      function focusNode(nodeId) {
        if (!nodeId) {
          clearHighlights();
          return;
        }
        focusedNodeId = nodeId;
        const connectedNodes = new Set([nodeId]);
        (outgoing.get(nodeId) || []).forEach(e => connectedNodes.add(e.to));
        (incoming.get(nodeId) || []).forEach(e => connectedNodes.add(e.from));

        nodes.forEach(n => {
          const id = n.getAttribute('data-node-id');
          if (id === nodeId) {
            n.classList.add('is-focused');
            n.classList.remove('is-dimmed');
          } else if (connectedNodes.has(id)) {
            n.classList.remove('is-focused', 'is-dimmed');
          } else {
            n.classList.add('is-dimmed');
            n.classList.remove('is-focused');
          }
        });

        edges.forEach(e => {
          const from = e.getAttribute('data-from');
          const to = e.getAttribute('data-to');
          if (from === nodeId || to === nodeId) {
            e.classList.add('is-highlighted');
            e.classList.remove('is-dimmed');
          } else {
            e.classList.add('is-dimmed');
            e.classList.remove('is-highlighted');
          }
        });
      }

      function setChapter(idx) {
        const viewsList = (irData.meta && irData.meta.views) || [];
        if (viewsList.length === 0) return;
        activeChapter = (idx + viewsList.length) % viewsList.length;
        const chap = viewsList[activeChapter];

        if (chapterLabel) chapterLabel.textContent = (activeChapter + 1) + '/' + viewsList.length;
        if (narrativeTitle) narrativeTitle.textContent = '📖 ' + chap.title;
        if (narrativeBody) narrativeBody.textContent = chap.narrative;
        if (narrativeCard) narrativeCard.style.display = 'block';

        const focusSet = new Set(chap.focus_nodes || []);
        nodes.forEach(n => {
          const id = n.getAttribute('data-node-id');
          if (focusSet.has(id)) {
            n.classList.add('is-focused');
            n.classList.remove('is-dimmed');
          } else {
            n.classList.add('is-dimmed');
            n.classList.remove('is-focused');
          }
        });

        edges.forEach(e => {
          const from = e.getAttribute('data-from');
          const to = e.getAttribute('data-to');
          if (focusSet.has(from) && focusSet.has(to)) {
            e.classList.add('is-highlighted');
            e.classList.remove('is-dimmed');
          } else {
            e.classList.add('is-dimmed');
            e.classList.remove('is-highlighted');
          }
        });
      }

      function replayMotion() {
        if (!svgEl) return;
        svgEl.removeAttribute('data-motion');
        void svgEl.getBoundingClientRect();
        svgEl.setAttribute('data-motion', 'play');
      }

      // Event Listeners
      nodes.forEach(n => {
        const id = n.getAttribute('data-node-id');
        const desc = n.getAttribute('data-desc');
        const label = n.getAttribute('data-label');

        n.addEventListener('click', (e) => {
          e.stopPropagation();
          if (focusedNodeId === id) {
            clearHighlights();
          } else {
            focusNode(id);
          }
        });

        n.addEventListener('mouseenter', (e) => {
          if (!tooltip) return;
          tooltip.innerHTML = '<strong>' + label + '</strong><br/><span style=\"opacity:0.85;\">' + desc + '</span>';
          tooltip.style.display = 'block';
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top = (e.clientY + 14) + 'px';
        });

        n.addEventListener('mousemove', (e) => {
          if (!tooltip) return;
          tooltip.style.left = (e.clientX + 14) + 'px';
          tooltip.style.top = (e.clientY + 14) + 'px';
        });

        n.addEventListener('mouseleave', () => {
          if (tooltip) tooltip.style.display = 'none';
        });
      });

      if (viewportEl) {
        viewportEl.addEventListener('click', () => {
          clearHighlights();
        });

        viewportEl.addEventListener('mousedown', (e) => {
          if (e.target.closest('.ak-node') || e.target.closest('.ak-diagram-toolbar') || e.target.closest('.ak-narrative-card')) return;
          isDragging = true;
          dragStartX = e.clientX - panX;
          dragStartY = e.clientY - panY;
          viewportEl.classList.add('is-dragging');
        });

        window.addEventListener('mousemove', (e) => {
          if (!isDragging) return;
          panX = e.clientX - dragStartX;
          panY = e.clientY - dragStartY;
          updateTransform();
        });

        window.addEventListener('mouseup', () => {
          if (isDragging) {
            isDragging = false;
            viewportEl.classList.remove('is-dragging');
          }
        });

        viewportEl.addEventListener('wheel', (e) => {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.09 : -0.09;
          setZoom(currentZoom + delta);
        }, { passive: false });
      }

      // Controls
      if (zoomInBtn) zoomInBtn.addEventListener('click', () => setZoom(currentZoom + 0.15));
      if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => setZoom(currentZoom - 0.15));
      if (zoomFitBtn) zoomFitBtn.addEventListener('click', fitView);
      if (zoom100Btn) zoom100Btn.addEventListener('click', () => {
        currentZoom = 1.0;
        panX = 0;
        panY = 0;
        updateTransform();
      });

      if (chapterPrevBtn) chapterPrevBtn.addEventListener('click', () => setChapter(activeChapter - 1));
      if (chapterNextBtn) chapterNextBtn.addEventListener('click', () => setChapter(activeChapter + 1));
      if (narrativeClose) narrativeClose.addEventListener('click', () => { narrativeCard.style.display = 'none'; });
      if (motionBtn) motionBtn.addEventListener('click', replayMotion);

      if (themeBtn) {
        themeBtn.addEventListener('click', () => {
          const cur = root.getAttribute('data-theme') || 'dark';
          const next = cur === 'dark' ? 'light' : 'dark';
          root.setAttribute('data-theme', next);
          themeBtn.textContent = next === 'dark' ? '☀️' : '🌙';
        });
      }

      if (presentBtn) {
        presentBtn.addEventListener('click', () => {
          if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
          } else {
            document.exitFullscreen().catch(() => {});
          }
        });
      }

      if (reachDownBtn) {
        reachDownBtn.addEventListener('click', () => {
          const target = focusedNodeId || 's-chat';
          clearHighlights();
          const reached = new Set([target]);
          const q = [target];
          while (q.length > 0) {
            const u = q.shift();
            (outgoing.get(u) || []).forEach(edge => {
              if (!reached.has(edge.to)) {
                reached.add(edge.to);
                q.push(edge.to);
              }
            });
          }
          nodes.forEach(n => {
            const id = n.getAttribute('data-node-id');
            if (!reached.has(id)) n.classList.add('is-dimmed');
            else n.classList.add('is-focused');
          });
          edges.forEach(e => {
            const from = e.getAttribute('data-from');
            const to = e.getAttribute('data-to');
            if (reached.has(from) && reached.has(to)) e.classList.add('is-highlighted');
            else e.classList.add('is-dimmed');
          });
        });
      }

      if (reachUpBtn) {
        reachUpBtn.addEventListener('click', () => {
          const target = focusedNodeId || 's-llm';
          clearHighlights();
          const reached = new Set([target]);
          const q = [target];
          while (q.length > 0) {
            const u = q.shift();
            (incoming.get(u) || []).forEach(edge => {
              if (!reached.has(edge.from)) {
                reached.add(edge.from);
                q.push(edge.from);
              }
            });
          }
          nodes.forEach(n => {
            const id = n.getAttribute('data-node-id');
            if (!reached.has(id)) n.classList.add('is-dimmed');
            else n.classList.add('is-focused');
          });
          edges.forEach(e => {
            const from = e.getAttribute('data-from');
            const to = e.getAttribute('data-to');
            if (reached.has(from) && reached.has(to)) e.classList.add('is-highlighted');
            else e.classList.add('is-dimmed');
          });
        });
      }

      if (lensBtn) {
        lensBtn.addEventListener('click', () => {
          activeLens = (activeLens + 1) % (roles.length + 1);
          if (activeLens === roles.length) {
            clearHighlights();
            return;
          }
          const role = roles[activeLens];
          clearHighlights();
          nodes.forEach(n => {
            if (n.getAttribute('data-family') === role) n.classList.add('is-focused');
            else n.classList.add('is-dimmed');
          });
        });
      }

      if (searchInput) {
        searchInput.addEventListener('input', (e) => {
          const q = e.target.value.trim().toLowerCase();
          if (!q) {
            clearHighlights();
            return;
          }
          clearHighlights();
          nodes.forEach(n => {
            const label = (n.getAttribute('data-label') || '').toLowerCase();
            const id = (n.getAttribute('data-node-id') || '').toLowerCase();
            const desc = (n.getAttribute('data-desc') || '').toLowerCase();
            if (label.includes(q) || id.includes(q) || desc.includes(q)) {
              n.classList.add('is-focused');
            } else {
              n.classList.add('is-dimmed');
            }
          });
        });
      }

      // Keyboard Shortcuts
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') {
          if (e.key === 'Escape') e.target.blur();
          return;
        }
        if (e.key === '/') {
          e.preventDefault();
          if (searchInput) searchInput.focus();
        } else if (e.key === '[' || e.key === '{') {
          setChapter(activeChapter - 1);
        } else if (e.key === ']' || e.key === '}') {
          setChapter(activeChapter + 1);
        } else if (e.key === 'm' || e.key === 'M') {
          replayMotion();
        } else if (e.key === '0') {
          fitView();
        } else if (e.key === '+' || e.key === '=') {
          setZoom(currentZoom + 0.15);
        } else if (e.key === '-' || e.key === '_') {
          setZoom(currentZoom - 0.15);
        } else if (e.key === 'Escape') {
          clearHighlights();
        }
      });

      // Start on Chapter 1
      setChapter(0);
    })();
    </script>
  </div>
</body>
</html>`;
}

const htmlContent = generateHtml();
writeFileSync(resolve('docs/diagrams/chatbot-architecture.html'), htmlContent, 'utf-8');
console.log('✓ Wrote docs/diagrams/chatbot-architecture.html');
