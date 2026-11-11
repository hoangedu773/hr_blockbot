import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const React = require('react');
const ReactDOMServer = require('react-dom/server');
const { transform } = require('esbuild');

const appIconSourcePath = path.resolve(here, '../src/components/ui/AppIcon.tsx');

async function loadAppIconComponent() {
  const source = fs.readFileSync(appIconSourcePath, 'utf8');
  const compiled = await transform(source, {
    loader: 'tsx',
    format: 'cjs',
    target: 'es2022',
  });
  const mod = { exports: {} };
  const fn = new Function('require', 'module', 'exports', compiled.code);
  fn((name) => (name === 'react' ? React : require(name)), mod, mod.exports);
  return mod.exports.AppIcon;
}

// Allow-listed files for the scoped UI emoji cleanup inventory
const SCOPED_INVENTORY_FILES = [
  'src/components/DelegationView.tsx',
  'src/components/EmployeeHrHistory.tsx',
  'src/components/EmployeeListView.tsx',
  'src/components/InitialReportingView.tsx',
  'src/components/LoginModal.tsx',
  'src/components/OnboardingView.tsx',
  'src/components/ProfileApprovalQueue.tsx',
  'src/components/RevenueKpiOpenCard.tsx',
  'src/components/RevenueKpiView.tsx',
  'src/components/SmAppointments.tsx',
  'src/components/WorkflowHistoryNavigation.tsx',
  'src/components/chat/ChatPageView.tsx',
  'src/components/chat/ChatWorkflowStream.tsx',
];

describe('UI Emoji Pictogram Cleanup & AppIcon SVG Specimen Suite', () => {
  describe('AppIcon real React render via esbuild and ReactDOMServer', () => {
    let AppIcon;

    it('loads and compiles AppIcon through esbuild and React runtime', async () => {
      AppIcon = await loadAppIconComponent();
      assert.equal(typeof AppIcon, 'function');
    });

    it('renders 18px label inline SVG with currentColor and rounded stroke', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AppIcon, { name: 'store', size: 18 })
      );
      assert.match(html, /^<svg/);
      assert.match(html, /viewBox="0 0 24 24"/);
      assert.match(html, /width="18"/);
      assert.match(html, /height="18"/);
      assert.match(html, /fill="none"/);
      assert.match(html, /stroke="currentColor"/);
      assert.match(html, /stroke-width="1.75"/);
      assert.match(html, /stroke-linecap="round"/);
      assert.match(html, /stroke-linejoin="round"/);
      assert.match(html, /aria-hidden="true"/);
      assert.match(html, /focusable="false"/);
      // Verify no emoji in rendered SVG
      const emojiMatch = html.match(/\p{Emoji_Presentation}/gu);
      assert.equal(emojiMatch, null);
    });

    it('renders 16px inline SVG by default when size prop is omitted', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AppIcon, { name: 'user' })
      );
      assert.match(html, /width="16"/);
      assert.match(html, /height="16"/);
      assert.match(html, /stroke="currentColor"/);
    });

    it('renders multiple icon variants without emoji presentation', () => {
      const variants = [
        'store',
        'user',
        'calendar',
        'document',
        'shieldCheck',
        'alert',
        'checkCircle',
        'xCircle',
        'search',
        'filter',
        'trend',
        'revenue',
        'export',
        'allocation',
        'lock',
        'options',
        'target',
        'zap',
        'clock',
        'sparkles',
        'message',
        'table',
        'cards',
        'plus',
        'edit',
        'phone',
        'mail',
        'link',
        'chain',
        'building',
        'crown',
        'tie',
        'clipboard',
        'handshake',
        'coffee',
        'bulb',
        'download',
        'map',
        'close',
      ];
      for (const variant of variants) {
        const html = ReactDOMServer.renderToStaticMarkup(
          React.createElement(AppIcon, { name: variant, size: 16 })
        );
        assert.match(html, /^<svg/, `Expected SVG for variant ${variant}`);
        assert.equal(html.match(/\p{Emoji_Presentation}/gu), null);
      }
    });

    it('returns null for unknown icon name', () => {
      const html = ReactDOMServer.renderToStaticMarkup(
        React.createElement(AppIcon, { name: 'unknown_icon_xyz' })
      );
      assert.equal(html, '');
    });
  });

  describe('Scoped inventory audit: no app-authored emoji pictograms remain', () => {
    for (const relPath of SCOPED_INVENTORY_FILES) {
      it(`verifies no app-authored Emoji_Presentation or pictographs in ${relPath}`, () => {
        const fullPath = path.resolve(here, '..', relPath);
        assert.equal(fs.existsSync(fullPath), true, `File must exist: ${relPath}`);
        const content = fs.readFileSync(fullPath, 'utf8');

        // Check for Unicode Emoji_Presentation characters
        const emojiMatches = content.match(/\p{Emoji_Presentation}/gu);
        assert.equal(
          emojiMatches,
          null,
          `Found unexpected Emoji_Presentation in ${relPath}: ${JSON.stringify(emojiMatches)}`
        );

        // Check for Extended_Pictographic characters excluding plain allowed symbols
        const ALLOWED_SYMBOLS = new Set(['✓', '✕', '➔', '▶', '▼', '▲', '↔', '↗', '→', '×', '⌘']);
        const allPictographs = content.match(/\p{Extended_Pictographic}/gu) || [];
        const disallowed = allPictographs.filter((glyph) => !ALLOWED_SYMBOLS.has(glyph));
        assert.deepEqual(
          disallowed,
          [],
          `Found disallowed pictographs in ${relPath}: ${JSON.stringify(disallowed)}`
        );
      });
    }

    it('verifies native select option in ProfileApprovalQueue has no emoji glyph but preserves text', () => {
      const content = fs.readFileSync(
        path.resolve(here, '../src/components/ProfileApprovalQueue.tsx'),
        'utf8'
      );
      assert.match(content, /<option value="PENDING">Chờ duyệt<\/option>/);
      assert.doesNotMatch(content, /<option value="PENDING">⏳/);
    });

    it('preserves plain check and cross symbols in labeled action buttons and statuses', () => {
      const delegation = fs.readFileSync(
        path.resolve(here, '../src/components/DelegationView.tsx'),
        'utf8'
      );
      assert.match(delegation, /✕ Từ chối ủy quyền/);
      assert.match(delegation, /✓ Duyệt ủy quyền/);

      const profileQueue = fs.readFileSync(
        path.resolve(here, '../src/components/ProfileApprovalQueue.tsx'),
        'utf8'
      );
      assert.match(profileQueue, /✕ Từ chối thay đổi hồ sơ/);
      assert.match(profileQueue, /✓ Xác nhận duyệt hồ sơ/);

      const onboarding = fs.readFileSync(
        path.resolve(here, '../src/components/OnboardingView.tsx'),
        'utf8'
      );
      assert.match(onboarding, /✕ Từ chối đề nghị/);
      assert.match(onboarding, /✓ Phê duyệt tiếp nhận/);

      const initialRep = fs.readFileSync(
        path.resolve(here, '../src/components/InitialReportingView.tsx'),
        'utf8'
      );
      assert.match(initialRep, /✓ Phê duyệt quan hệ ban đầu/);

      const smApp = fs.readFileSync(
        path.resolve(here, '../src/components/SmAppointments.tsx'),
        'utf8'
      );
      assert.match(smApp, /✓ Xác nhận phân công/);
      assert.match(smApp, /✕ Từ chối đề nghị/);
    });

    it('preserves surrounding Vietnamese copy across updated component views', () => {
      const hrHistory = fs.readFileSync(
        path.resolve(here, '../src/components/EmployeeHrHistory.tsx'),
        'utf8'
      );
      assert.match(hrHistory, /Lịch sử cập nhật hồ sơ HR/);

      const loginModal = fs.readFileSync(
        path.resolve(here, '../src/components/LoginModal.tsx'),
        'utf8'
      );
      assert.match(loginModal, /Chính sách bảo mật:/);

      const revenueView = fs.readFileSync(
        path.resolve(here, '../src/components/RevenueKpiView.tsx'),
        'utf8'
      );
      assert.match(revenueView, /Doanh thu theo Cửa hàng \(SM\)/);
      assert.match(revenueView, /Doanh thu theo Khu vực \(AM\)/);
      assert.match(revenueView, /Tiến độ phân công/);
      assert.match(revenueView, /Xuất Excel/);
      assert.match(revenueView, /Dạng bảng/);
      assert.match(revenueView, /Dạng thẻ/);
      assert.match(revenueView, /Cần kiểm tra người phụ trách/);
      assert.match(revenueView, /Hướng dẫn:/);
    });

    it('verifies Toast close button uses AppIcon with accessible aria-label', () => {
      const toast = fs.readFileSync(
        path.resolve(here, '../src/components/Toast.tsx'),
        'utf8'
      );
      assert.match(toast, /aria-label="Đóng"/);
      assert.match(toast, /<AppIcon name="close" size=\{14\} \/>/);
    });
    it('preserves Vietnamese copy in assistant chat guidance and status messages', () => {
      const panel = fs.readFileSync(path.resolve(here, '../src/components/ChatPanel.tsx'), 'utf8');
      assert.match(panel, /<AppIcon name="document" size=\{14\}/);
      assert.match(panel, /\{citation\.document\} · \{citation\.version\} · Điều \{citation\.article\}/);
      const lifecycle = fs.readFileSync(path.resolve(here, '../src/components/chat/ChatLifecycle.tsx'), 'utf8');
      assert.match(lifecycle, /`✅ Cửa hàng \*\*\$\{storeName\(storeId\)\}\*\* đã xác nhận đồng ý điều chuyển/);
      assert.match(lifecycle, /`✅ \*\*Đã gửi yêu cầu bổ sung \$\{quantity\} nhân sự/);
      assert.match(lifecycle, /`✅ HR đã \*\*\$\{decision/);

      const revActions = fs.readFileSync(path.resolve(here, '../src/components/chat/revenue-chat-actions.ts'), 'utf8');
      assert.match(revActions, /\u{1f4a1} Gợi ý: Bạn có thể nhắn “khởi tạo mục tiêu cơ sở kỳ/u);

      const opChat = fs.readFileSync(path.resolve(here, '../src/components/chat/useOperationsAndHrChat.ts'), 'utf8');
      assert.match(opChat, /'\u23f3 Chờ cấp trên duyệt \(PENDING\)'/);
      assert.match(opChat, /\u{1f6e1}\ufe0f Hợp lệ \(VALID_LOCAL_CHAIN\)/u);

      const schedChat = fs.readFileSync(path.resolve(here, '../src/components/chat/useScheduleChat.ts'), 'utf8');
      assert.match(schedChat, /'\u23f3 Chờ quản lý duyệt'/);
      assert.match(schedChat, /'\u23f3 Chờ nhân viên xác nhận'/);
      assert.match(schedChat, /\u{1f512} Đã công bố/u);
      assert.match(schedChat, /\u{1f4a1} Tuần \$\{targetWeek\} đã công bố/u);
    });
  });
});
