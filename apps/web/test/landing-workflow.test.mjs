import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');

describe('Landing Page Workflow Architecture: Continuous Flow & Acceptance Verification', () => {
  it('apps/web/public/diagrams/chatbot-architecture.html tồn tại và cấu hình infinite animation', () => {
    const diagramPath = path.join(webRoot, 'public/diagrams/chatbot-architecture.html');
    assert.equal(fs.existsSync(diagramPath), true, 'File chatbot-architecture.html phải tồn tại trong public/diagrams/');

    const diagramHtml = fs.readFileSync(diagramPath, 'utf-8');

    // Kiểm tra cấu hình chuyển động vô hạn infinite trên .ak-edge-flow
    assert.match(
      diagramHtml,
      /\.ak-edge-flow[\s\S]*?animation:\s*ak-edge-flow[\s\S]*?infinite/i,
      'Cần cấu hình animation: ak-edge-flow vô hạn infinite trên .ak-edge-flow',
    );

    // Kiểm tra hiệu ứng breathing pulse trên node
    assert.match(
      diagramHtml,
      /ak-node-pulse[\s\S]*?infinite/i,
      'Cần có hiệu ứng pulse tuần hoàn ak-node-pulse lặp vô hạn trên node',
    );

    // Kiểm tra data-motion="play" mặc định khi tải trang
    assert.match(
      diagramHtml,
      /data-motion=["']play["']/,
      'Sơ đồ cần mặc định ở trạng thái data-motion="play" khi tải trang',
    );

    // Kiểm tra nút toggle Pause/Resume trong toolbar
    assert.match(
      diagramHtml,
      /ak-btn-motion[\s\S]*?Tạm dừng/i,
      'Cần có nút điều khiển chuyển động Pause / Resume trên toolbar',
    );

    // Kiểm tra cơ chế giao tiếp postMessage với parent iframe
    assert.equal(diagramHtml.includes('TOGGLE_MOTION'), true, 'Cần hỗ trợ lệnh postMessage TOGGLE_MOTION');
    assert.equal(diagramHtml.includes('FIT_VIEW'), true, 'Cần hỗ trợ lệnh postMessage FIT_VIEW');
    assert.equal(diagramHtml.includes('DIAGRAM_MOTION_CHANGE'), true, 'Cần bắn thông báo DIAGRAM_MOTION_CHANGE');
    assert.equal(diagramHtml.includes('DIAGRAM_READY'), true, 'Cần bắn thông báo DIAGRAM_READY');

    // Kiểm tra responsive toolbar CSS cho màn hình hẹp (320px)
    assert.match(
      diagramHtml,
      /\.ak-diagram-toolbar[\s\S]*?overflow-x:\s*auto/,
      'Toolbar cần overflow-x: auto để cuộn mượt trên mobile',
    );
    assert.match(
      diagramHtml,
      /@media\s*\(\s*max-width:\s*768px\s*\)[\s\S]*?\.ak-diagram-search-input\s*\{[^}]*display:\s*none/,
      'Toolbar cần ẩn search-input trên mobile',
    );

    // Kiểm tra wheel event: tránh scroll-jacking, chỉ zoom khi có ctrlKey hoặc metaKey
    assert.match(
      diagramHtml,
      /e\.ctrlKey\s*\|\|\s*e\.metaKey/,
      'Wheel event chỉ zoom khi giữ Ctrl hoặc Meta để không chặn cuộn trang tự nhiên',
    );

    // Tuyệt đối không chứa mã màu vàng/amber cấm (0 pixel vàng cấm)
    assert.equal(diagramHtml.includes('#b45309'), false, 'Không được dùng màu vàng #b45309');
    assert.equal(diagramHtml.includes('#fdd663'), false, 'Không được dùng màu vàng #fdd663');
    assert.equal(diagramHtml.includes('#f59e0b'), false, 'Không được dùng màu vàng #f59e0b (tuân thủ Dark Emerald)');
    assert.equal(diagramHtml.includes('#fbbf24'), false, 'Không được dùng màu vàng #fbbf24 (tuân thủ Dark Emerald)');
    assert.equal(diagramHtml.includes('rgba(217, 119, 6'), false, 'Không được dùng màu vàng rgba(217, 119, 6)');
  });

  it('apps/web/src/components/landing/WorkflowSection.tsx tồn tại và cung cấp đầy đủ controls', () => {
    const componentPath = path.join(webRoot, 'src/components/landing/WorkflowSection.tsx');
    assert.equal(fs.existsSync(componentPath), true, 'Component WorkflowSection.tsx phải tồn tại');

    const code = fs.readFileSync(componentPath, 'utf-8');

    // Kiểm tra id="solution"
    assert.match(code, /id=["']solution["']/, 'WorkflowSection phải có id="solution"');

    // Kiểm tra tiêu đề và badge
    assert.match(code, /kiến trúc\s*&(?:amp;)?\s*luồng xử lý agentic/i, 'Phải có badge kiến trúc');
    assert.match(code, /Luồng Vận Hành Tự Động 24\/7/, 'Phải có tiêu đề H2 luồng vận hành');

    // Kiểm tra iframe container và controls
    assert.match(code, /chatbot-architecture\.html/, 'Phải nhúng iframe chatbot-architecture.html');
    assert.match(code, /workflow-status-chip/, 'Phải có status chip hiển thị trạng thái luồng');
    assert.match(code, /Fit View/i, 'Phải có nút Fit View');
    assert.match(code, /Tạm dừng|Tiếp tục/, 'Phải có nút Pause / Resume');

    // Kiểm tra postMessage validation & type guards
    assert.match(
      code,
      /event\.source\s*!==\s*iframeRef\.current\.contentWindow/,
      'WorkflowSection phải kiểm tra event.source từ iframe',
    );
    assert.match(
      code,
      /typeof\s+data\.state\s*===\s*['"]string['"]/,
      'WorkflowSection phải kiểm tra chặt chẽ type của data.state',
    );

    // Kiểm tra iOS Safari feature-detection cho Fullscreen
    assert.match(
      code,
      /typeof\s+container\.requestFullscreen\s*===\s*['"]function['"]/,
      'WorkflowSection phải feature-detection requestFullscreen trước khi gọi',
    );
  });

  it('apps/web/src/components/FolioLandingView.tsx chứa section #solution cao cấp với iframe kiến trúc', () => {
    const landingPath = path.join(webRoot, 'src/components/FolioLandingView.tsx');
    const landingCode = fs.readFileSync(landingPath, 'utf-8');

    // Kiểm tra section #solution trong landing view
    assert.match(landingCode, /id=\\"solution\\"|id="solution"/, 'Landing page phải có section id="solution"');

    // Kiểm tra badge và tiêu đề H2 theo yêu cầu
    assert.match(landingCode, /kiến trúc\s*&(?:amp;)?\s*luồng xử lý agentic/i, 'Phải có badge Kiến trúc & luồng xử lý agentic');
    assert.match(landingCode, /Luồng Vận Hành Tự Động 24\/7/, 'Phải có title H2 Luồng Vận Hành Tự Động 24/7');

    // Kiểm tra paragraph mô tả luồng
    assert.match(landingCode, /Fast Rule Gate[\s\S]*?Jev AI[\s\S]*?Gemini 3\.8 Flash/, 'Phải có mô tả luồng chi tiết');

    // Kiểm tra iframe và chip trạng thái
    assert.match(landingCode, /\/diagrams\/chatbot-architecture\.html/, 'Phải nhúng iframe chatbot-architecture.html');
    assert.match(landingCode, /Live Loop/, 'Phải có chip trạng thái Live Loop');

    // Kiểm tra export WorkflowSection
    assert.match(landingCode, /export \{ WorkflowSection \}/, 'FolioLandingView phải re-export WorkflowSection');
    // Kiểm tra smooth scroll cho anchor link #solution
    assert.match(landingCode, /a\[href="#solution"\]/, 'Phải xử lý smooth scroll cho link #solution');

    // Kiểm tra không dùng bất kỳ token/class nào liên quan tới amber hoặc #fdd663
    assert.equal(landingCode.includes('crm-pill-amber'), false, 'FolioLandingView không được chứa token/class crm-pill-amber');
    assert.equal(landingCode.includes('#fdd663'), false, 'FolioLandingView không được chứa mã màu #fdd663');
    assert.equal(landingCode.includes('#b45309'), false, 'FolioLandingView không được chứa mã màu #b45309');

    // Kiểm tra postMessage validation & type guards trong FolioLandingView
    assert.match(
      landingCode,
      /event\.source\s*!==\s*iframe\.contentWindow/,
      'FolioLandingView phải kiểm tra event.source từ iframe',
    );
    assert.match(
      landingCode,
      /typeof\s+data\.state\s*===\s*['"]string['"]/,
      'FolioLandingView phải kiểm tra chặt chẽ typeof data.state === "string"',
    );

    // Kiểm tra iOS Safari feature-detection cho Fullscreen trong FolioLandingView
    assert.match(
      landingCode,
      /typeof\s+container\.requestFullscreen\s*===\s*['"]function['"]/,
      'FolioLandingView phải feature-detection requestFullscreen trước khi gọi',
    );
  });

  it('apps/web/src/styles/ cấu hình smooth scrolling cho html', () => {
    const stylesDir = path.join(webRoot, 'src/styles');
    const css = ['index', 'tokens', 'base', 'product', 'brand']
      .map((name) => fs.readFileSync(path.join(stylesDir, `${name}.css`), 'utf-8'))
      .join('\n');

    assert.match(css, /html\s*\{[^}]*scroll-behavior:\s*smooth;?[^}]*\}/, 'index.css phải cấu hình scroll-behavior: smooth');
  });
});
