import json

with open('design-check/generate_10_logos.py', 'r', encoding='utf-8') as f:
    code = f.read()

# Let's import templates from generate_10_logos
import sys
sys.path.append('design-check')
from generate_10_logos import templates, logos_dir

cards_html = []
for idx, (key, data) in enumerate(templates.items(), 1):
    svg_code = data["svg"]
    # Escape quotes for js copy
    title = data["title"]
    tag = data["tag"]
    desc = data["desc"]
    
    card = f'''
    <div class="logo-card" id="card-{key}">
      <div class="card-badge">{tag}</div>
      <div class="preview-stage">
        <div class="svg-wrapper" style="width: 180px; height: 180px;">
          {svg_code}
        </div>
      </div>
      <div class="card-info">
        <h3 class="card-title">{title}</h3>
        <p class="card-desc">{desc}</p>
        
        <div class="size-test-row">
          <span class="size-label">Kích thước thực tế:</span>
          <div class="size-items">
            <div class="size-item" title="16px (Favicon)">
              <div style="width: 16px; height: 16px;">{svg_code}</div>
              <span>16</span>
            </div>
            <div class="size-item" title="24px (Navbar)">
              <div style="width: 24px; height: 24px;">{svg_code}</div>
              <span>24</span>
            </div>
            <div class="size-item" title="32px (Sidebar)">
              <div style="width: 32px; height: 32px;">{svg_code}</div>
              <span>32</span>
            </div>
            <div class="size-item" title="48px (App Icon)">
              <div style="width: 48px; height: 48px;">{svg_code}</div>
              <span>48</span>
            </div>
          </div>
        </div>

        <div class="card-actions">
          <button class="btn btn-primary" onclick="copySvg('{key}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Sao Chép SVG
          </button>
          <a class="btn btn-secondary" href="/assets/logos/{key}.svg" download="{key}.svg">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Tải SVG
          </a>
        </div>
      </div>
    </div>
    '''
    cards_html.append(card)

# Build pure JS object for copying SVGs
svg_json = json.dumps({k: v["svg"] for k, v in templates.items()})

html_content = f'''<!DOCTYPE html>
<html lang="vi" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Guta Workspace — 10 Mẫu Thiết Kế SVG Logo Previews</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
  <style>
    :root {{
      --bg-base: #090d16;
      --bg-surface: #0f172a;
      --bg-elevated: #1e293b;
      --border-subtle: rgba(255, 255, 255, 0.08);
      --border-highlight: rgba(59, 130, 246, 0.35);
      --text-main: #f8fafc;
      --text-muted: #94a3b8;
      --accent-sapphire: #2563eb;
      --accent-cyan: #06b6d4;
      --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }}

    [data-theme="navy"] {{
      --bg-base: #0f172a;
      --bg-surface: #1e293b;
      --bg-elevated: #334155;
    }}

    [data-theme="black"] {{
      --bg-base: #000000;
      --bg-surface: #0a0a0a;
      --bg-elevated: #171717;
    }}

    [data-theme="light"] {{
      --bg-base: #f8fafc;
      --bg-surface: #ffffff;
      --bg-elevated: #f1f5f9;
      --border-subtle: rgba(15, 23, 42, 0.1);
      --border-highlight: rgba(37, 99, 235, 0.25);
      --text-main: #0f172a;
      --text-muted: #64748b;
    }}

    * {{ box-sizing: border-box; margin: 0; padding: 0; }}

    body {{
      font-family: var(--font-sans);
      background-color: var(--bg-base);
      color: var(--text-main);
      line-height: 1.5;
      padding: 40px 24px 80px;
      transition: background-color 0.25s ease, color 0.25s ease;
    }}

    .container {{
      max-width: 1380px;
      margin: 0 auto;
    }}

    /* Header */
    .header {{
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 40px;
      border-bottom: 1px solid var(--border-subtle);
      padding-bottom: 32px;
    }}

    .header-top {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      flex-wrap: wrap;
      gap: 20px;
    }}

    .badge-pill {{
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: var(--font-mono);
      font-size: 11px;
      font-weight: 700;
      padding: 4px 10px;
      border-radius: 9999px;
      background: rgba(37, 99, 235, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(37, 99, 235, 0.3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 8px;
    }}

    .title {{
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.03em;
    }}

    .subtitle {{
      color: var(--text-muted);
      font-size: 14px;
      max-width: 680px;
      margin-top: 4px;
    }}

    /* Theme Controls */
    .theme-bar {{
      display: flex;
      align-items: center;
      gap: 10px;
      background: var(--bg-surface);
      padding: 6px 10px;
      border-radius: 12px;
      border: 1px solid var(--border-subtle);
    }}

    .theme-label {{
      font-size: 12px;
      font-weight: 600;
      color: var(--text-muted);
      margin-right: 4px;
    }}

    .theme-btn {{
      padding: 6px 14px;
      font-size: 12px;
      font-weight: 600;
      border-radius: 8px;
      border: 1px solid transparent;
      cursor: pointer;
      background: transparent;
      color: var(--text-muted);
      transition: all 0.15s ease;
    }}

    .theme-btn.active {{
      background: var(--bg-elevated);
      color: var(--text-main);
      border-color: var(--border-highlight);
    }}

    /* Grid */
    .logo-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 24px;
    }}

    .logo-card {{
      background: var(--bg-surface);
      border: 1px solid var(--border-subtle);
      border-radius: 18px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
      position: relative;
      transition: transform 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
    }}

    .logo-card:hover {{
      transform: translateY(-3px);
      border-color: var(--border-highlight);
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.4);
    }}

    .card-badge {{
      position: absolute;
      top: 14px;
      right: 14px;
      font-family: var(--font-mono);
      font-size: 10px;
      font-weight: 700;
      padding: 3px 8px;
      border-radius: 6px;
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-muted);
      border: 1px solid var(--border-subtle);
      backdrop-filter: blur(8px);
      z-index: 2;
    }}

    .preview-stage {{
      padding: 36px 20px 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: radial-gradient(circle at center, rgba(37,99,235,0.06) 0%, transparent 70%);
      min-height: 220px;
    }}

    .card-info {{
      padding: 20px;
      border-top: 1px solid var(--border-subtle);
      display: flex;
      flex-direction: column;
      gap: 14px;
      flex: 1;
    }}

    .card-title {{
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }}

    .card-desc {{
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.5;
    }}

    /* Size test */
    .size-test-row {{
      background: var(--bg-elevated);
      border-radius: 10px;
      padding: 10px 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }}

    .size-label {{
      font-size: 11px;
      font-weight: 600;
      color: var(--text-muted);
      font-family: var(--font-mono);
    }}

    .size-items {{
      display: flex;
      align-items: center;
      gap: 14px;
    }}

    .size-item {{
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }}

    .size-item span {{
      font-size: 9px;
      font-family: var(--font-mono);
      color: var(--text-muted);
    }}

    /* Actions */
    .card-actions {{
      display: flex;
      gap: 10px;
      margin-top: auto;
      padding-top: 6px;
    }}

    .btn {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 14px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s ease;
      flex: 1;
    }}

    .btn-primary {{
      background: #2563eb;
      color: #ffffff;
      border: 1px solid rgba(255, 255, 255, 0.15);
    }}

    .btn-primary:hover {{
      background: #1d4ed8;
      box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
    }}

    .btn-secondary {{
      background: var(--bg-elevated);
      color: var(--text-main);
      border: 1px solid var(--border-subtle);
    }}

    .btn-secondary:hover {{
      border-color: var(--border-highlight);
    }}

    /* Toast */
    #toast {{
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: #10b981;
      color: #ffffff;
      padding: 10px 18px;
      border-radius: 10px;
      font-size: 13px;
      font-weight: 600;
      box-shadow: 0 10px 25px rgba(0,0,0,0.4);
      display: none;
      align-items: center;
      gap: 8px;
      z-index: 999;
      animation: slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }}

    @keyframes slideUp {{
      from {{ transform: translateY(20px); opacity: 0; }}
      to {{ transform: translateY(0); opacity: 1; }}
    }}
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="header-top">
        <div>
          <div class="badge-pill">Guta Workspace • Design Tokens Aligned</div>
          <h1 class="title">10 Mẫu Thiết Kế SVG Logo (Guta / Folio UI)</h1>
          <p class="subtitle">Được vector hóa từ biểu tượng gốc <code>logo.webp</code> (64×64) và master artwork (1024×1024), đồng bộ 100% với hệ màu UI Electric Sapphire, Obsidian, Neon Cyan và Emerald.</p>
        </div>
        <div class="theme-bar">
          <span class="theme-label">Nền xem:</span>
          <button class="theme-btn active" onclick="setTheme('dark')">Obsidian</button>
          <button class="theme-btn" onclick="setTheme('navy')">Navy CRM</button>
          <button class="theme-btn" onclick="setTheme('black')">Pure Black</button>
          <button class="theme-btn" onclick="setTheme('light')">Light UI</button>
        </div>
      </div>
    </header>

    <main class="logo-grid">
      {''.join(cards_html)}
    </main>
  </div>

  <div id="toast">✓ Đã sao chép mã SVG vào bộ nhớ tạm!</div>

  <script>
    const svgMap = {svg_json};

    function setTheme(theme) {{
      document.documentElement.setAttribute('data-theme', theme);
      document.querySelectorAll('.theme-btn').forEach(btn => {{
        btn.classList.toggle('active', btn.getAttribute('onclick').includes(theme));
      }});
    }}

    function copySvg(key) {{
      const svg = svgMap[key];
      navigator.clipboard.writeText(svg).then(() => {{
        const toast = document.getElementById('toast');
        toast.style.display = 'flex';
        setTimeout(() => {{
          toast.style.display = 'none';
        }}, 2200);
      }});
    }}
  </script>
</body>
</html>
'''

with open('apps/web/previews/logo-previews.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

with open('design-check/logo-previews.html', 'w', encoding='utf-8') as f:
    f.write(html_content)

print("Generated preview pages at apps/web/previews/logo-previews.html and design-check/logo-previews.html!")
