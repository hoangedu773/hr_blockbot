import re
import os

with open('design-check/test_smooth_opt.svg', 'r') as f:
    opt_svg = f.read()

m = re.search(r'd="([^"]+)"', opt_svg)
if not m:
    print("Could not find path d!")
    exit(1)

path_d = m.group(1)
print(f"Path d extracted! Length: {len(path_d)}")

# Create logos directory
logos_dir = 'apps/web/public/assets/logos'
os.makedirs(logos_dir, exist_ok=True)
os.makedirs('design-check/logos', exist_ok=True)

# 10 Logo Variations
templates = {
    "01-electric-sapphire": {
        "title": "Mẫu 1: Electric Sapphire (Pure Brand)",
        "tag": "Primary Brand • Default",
        "desc": "Màu xanh Sapphire đặc trưng của UI (#2563eb / #3b82f6) trên nền tối, tối giản, sắc sảo.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <radialGradient id="glow-01" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sapphire-01" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#090d16" />
  <circle cx="512" cy="512" r="420" fill="url(#glow-01)"/>
  <path d="{path_d}" fill="url(#sapphire-01)" fill-rule="evenodd" filter="drop-shadow(0 8px 24px rgba(37,99,235,0.4))"/>
</svg>'''
    },
    "02-cyber-cyan": {
        "title": "Mẫu 2: Cyber Gradient (Sapphire to Cyan)",
        "tag": "Tech Forward • Cloud AI",
        "desc": "Chuyển sắc mượt mà từ Sapphire #2563eb sang Cyan #06b6d4, hiện đại chuẩn phong cách tech SaaS.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="cyber-02" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="50%" stop-color="#2563eb"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
    <radialGradient id="glow-02" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#06b6d4" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#06b6d4" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#0b1120"/>
  <circle cx="512" cy="512" r="420" fill="url(#glow-02)"/>
  <path d="{path_d}" fill="url(#cyber-02)" fill-rule="evenodd" filter="drop-shadow(0 12px 30px rgba(6,182,212,0.35))"/>
</svg>'''
    },
    "03-ai-aurora": {
        "title": "Mẫu 3: AI Copilot Aurora (Purple Sapphire)",
        "tag": "Copilot • Intelligence",
        "desc": "Dải màu huyền ảo từ Sapphire sang Tím AI (#8b5cf6) và Hồng Neon (#ec4899), đồng điệu tính năng AI Copilot.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="aurora-03" x1="15%" y1="10%" x2="85%" y2="90%">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="45%" stop-color="#8b5cf6"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <radialGradient id="glow-03" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.35"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#090d16"/>
  <circle cx="512" cy="512" r="400" fill="url(#glow-03)"/>
  <path d="{path_d}" fill="url(#aurora-03)" fill-rule="evenodd" filter="drop-shadow(0 14px 32px rgba(168,85,247,0.4))"/>
</svg>'''
    },
    "04-obsidian-titanium": {
        "title": "Mẫu 4: Obsidian Titanium Glass (Dark Luxe)",
        "tag": "Enterprise • Premium",
        "desc": "Huy hiệu Squircle Obsidian cao cấp với viền kính phản xạ ánh sáng và logo mạ kim loại Titanium trắng sáng.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="titanium-04" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="40%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
    <linearGradient id="card-border-04" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.25)"/>
      <stop offset="50%" stop-color="rgba(59,130,246,0.4)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0.05)"/>
    </linearGradient>
    <linearGradient id="card-bg-04" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#161f36"/>
      <stop offset="100%" stop-color="#0a0f1d"/>
    </linearGradient>
  </defs>
  <rect x="24" y="24" width="976" height="976" rx="240" fill="url(#card-bg-04)" stroke="url(#card-border-04)" stroke-width="6"/>
  <path d="{path_d}" fill="url(#titanium-04)" fill-rule="evenodd" filter="drop-shadow(0 16px 32px rgba(0,0,0,0.6)) drop-shadow(0 2px 4px rgba(255,255,255,0.3))"/>
</svg>'''
    },
    "05-neon-pulse": {
        "title": "Mẫu 5: Neon Pulse Glow (Cybernetic Tube)",
        "tag": "Vibrant • Glowing",
        "desc": "Hiệu ứng ống Neon xanh phát sáng rực rỡ trong bóng đêm với đa tầng feGaussianBlur, rất nổi bật cho Dark UI.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <filter id="neon-glow-05" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="36" result="blur1"/>
      <feGaussianBlur stdDeviation="16" result="blur2"/>
      <feGaussianBlur stdDeviation="4" result="blur3"/>
      <feMerge>
        <feMergeNode in="blur1"/>
        <feMergeNode in="blur2"/>
        <feMergeNode in="blur3"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#040711"/>
  <path d="{path_d}" fill="#38bdf8" fill-rule="evenodd" filter="url(#neon-glow-05)"/>
  <path d="{path_d}" fill="#ffffff" fill-rule="evenodd" opacity="0.85"/>
</svg>'''
    },
    "06-emerald-ops": {
        "title": "Mẫu 6: Emerald Workforce Ops (Active)",
        "tag": "Status Active • Operations",
        "desc": "Màu xanh ngọc Emerald (#10b981 / #059669) tượng trưng cho ca trực hoạt động (Active), hiệu suất và tăng trưởng.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="emerald-06" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399"/>
      <stop offset="60%" stop-color="#10b981"/>
      <stop offset="100%" stop-color="#047857"/>
    </linearGradient>
    <radialGradient id="glow-06" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#10b981" stop-opacity="0.32"/>
      <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#061210"/>
  <circle cx="512" cy="512" r="420" fill="url(#glow-06)"/>
  <path d="{path_d}" fill="url(#emerald-06)" fill-rule="evenodd" filter="drop-shadow(0 12px 28px rgba(16,185,129,0.4))"/>
</svg>'''
    },
    "07-dual-tone-blueprint": {
        "title": "Mẫu 7: Dual-Tone Blueprint (Precision)",
        "tag": "Precision • Architectural",
        "desc": "Kết cấu Blueprint hiện đại: Lớp fill xanh mờ kết hợp đường viền sắc nét Cyan Tech, thể hiện cấu trúc chặt chẽ.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="stroke-07" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#60a5fa"/>
      <stop offset="100%" stop-color="#06b6d4"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#0a0f1d"/>
  <!-- Subtle grid pattern -->
  <path d="M0 256 H1024 M0 512 H1024 M0 768 H1024 M256 0 V1024 M512 0 V1024 M768 0 V1024" stroke="rgba(37,99,235,0.12)" stroke-width="2"/>
  <path d="{path_d}" fill="rgba(37, 99, 235, 0.28)" stroke="url(#stroke-07)" stroke-width="12" fill-rule="evenodd" filter="drop-shadow(0 8px 24px rgba(37,99,235,0.3))"/>
</svg>'''
    },
    "08-horizontal-lockup": {
        "title": "Mẫu 8: Guta Full Lockup (Icon + Typography)",
        "tag": "Navbar • Complete Brand",
        "desc": "Phối hợp biểu tượng vector cùng kiểu chữ hiện đại GUTA WORKSPACE và phụ đề Workforce Command Center.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 512" width="100%" height="100%">
  <defs>
    <linearGradient id="lockup-grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#3b82f6"/>
      <stop offset="100%" stop-color="#1d4ed8"/>
    </linearGradient>
    <radialGradient id="lockup-glow" cx="256" cy="256" r="240" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#2563eb" stop-opacity="0.3"/>
      <stop offset="100%" stop-color="#2563eb" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <circle cx="256" cy="256" r="220" fill="url(#lockup-glow)"/>
  <!-- Scaled logo mark -->
  <g transform="translate(64, 64) scale(0.375)">
    <path d="{path_d}" fill="url(#lockup-grad)" fill-rule="evenodd" filter="drop-shadow(0 12px 28px rgba(37,99,235,0.45))"/>
  </g>
  <!-- Brand text -->
  <text x="520" y="240" font-family="'Inter', -apple-system, sans-serif" font-weight="900" font-size="124" fill="#f8fafc" letter-spacing="-2">GUTA</text>
  <text x="880" y="240" font-family="'Inter', -apple-system, sans-serif" font-weight="700" font-size="124" fill="#3b82f6" letter-spacing="-1">WORKSPACE</text>
  <rect x="524" y="280" width="132" height="34" rx="17" fill="rgba(37,99,235,0.18)" stroke="rgba(37,99,235,0.4)" stroke-width="2"/>
  <text x="590" y="303" font-family="'JetBrains Mono', monospace" font-weight="700" font-size="16" fill="#60a5fa" text-anchor="middle" letter-spacing="1">F&amp;B CRM</text>
  <text x="680" y="304" font-family="'JetBrains Mono', monospace" font-weight="500" font-size="18" fill="#94a3b8" letter-spacing="2">PRECISION WORKFORCE COMMAND CENTER</text>
</svg>'''
    },
    "09-monochrome-adaptive": {
        "title": "Mẫu 9: Minimal Monochrome (Adaptive)",
        "tag": "Clean • Favicon & Docs",
        "desc": "Phiên bản trắng thuần khiết chuẩn mực, cực kỳ sắc nét ở kích thước nhỏ (16px, 24px, 32px), ứng dụng mọi nơi.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <rect width="1024" height="1024" rx="224" fill="#090d16"/>
  <path d="{path_d}" fill="#f8fafc" fill-rule="evenodd"/>
</svg>'''
    },
    "10-holographic-prism": {
        "title": "Mẫu 10: Holographic Foil (Prism Spectrum)",
        "tag": "Next-Gen • Shimmer",
        "desc": "Hiệu ứng ánh kim Hologram quang phổ nhiều sắc độ (Sapphire, Violet, Teal, Gold), sang trọng và bắt mắt.",
        "svg": f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <defs>
    <linearGradient id="prism-10" x1="0%" y1="100%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#2563eb"/>
      <stop offset="25%" stop-color="#06b6d4"/>
      <stop offset="50%" stop-color="#a855f7"/>
      <stop offset="75%" stop-color="#f59e0b"/>
      <stop offset="100%" stop-color="#ec4899"/>
    </linearGradient>
    <radialGradient id="glow-10" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="#a855f7" stop-opacity="0.25"/>
      <stop offset="100%" stop-color="#a855f7" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="#0b0f19"/>
  <circle cx="512" cy="512" r="420" fill="url(#glow-10)"/>
  <path d="{path_d}" fill="url(#prism-10)" fill-rule="evenodd" filter="drop-shadow(0 14px 34px rgba(168,85,247,0.45))"/>
</svg>'''
    }
}

# Write each SVG
for key, data in templates.items():
    svg_path = f"{logos_dir}/{key}.svg"
    with open(svg_path, 'w', encoding='utf-8') as f:
        f.write(data["svg"])
    # Also save to design-check/logos
    with open(f"design-check/logos/{key}.svg", 'w', encoding='utf-8') as f:
        f.write(data["svg"])
    print(f"Saved: {key}.svg")

# Also write pure standalone vector marks (without background container) for embedding
pure_mark_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="100%" height="100%">
  <path d="{path_d}" fill="currentColor" fill-rule="evenodd"/>
</svg>'''
with open(f"{logos_dir}/guta-mark-pure.svg", 'w', encoding='utf-8') as f:
    f.write(pure_mark_svg)
with open("design-check/logos/guta-mark-pure.svg", 'w', encoding='utf-8') as f:
    f.write(pure_mark_svg)

print("All 10 SVGs successfully generated!")
