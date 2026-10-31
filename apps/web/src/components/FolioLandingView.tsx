import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { LoginRequest } from '@hr-blockbot/contracts';
import { AccountLoginModal } from './AccountLoginModal';
import type { NotifyFn } from './Toast';
import { TaglineReveal, TAGLINE_COPY } from './landing/TaglineReveal';
import { ORG_CHART_SVG } from './landing/org-chart-svg';

export interface FolioLandingViewProps {
  onLogin: (credentials: LoginRequest) => Promise<void>;
  isAuthLoading?: boolean;
  onNotify?: NotifyFn;
}
export { WorkflowSection } from './landing/WorkflowSection';

const ENTRY_OBSERVER_OPTIONS: IntersectionObserverInit = { rootMargin: '0px 0px -12% 0px', threshold: 0.1 };

/* Static marketing markup. No interpolation: every byte here is authored, never
 * derived from user input, so dangerouslySetInnerHTML cannot carry a payload.
 *
 * Motion contract (see folio-layout.css §9):
 *   [data-line] / [data-load] / [data-open]  hero appear, one signature
 *   [data-enter]                             section entrance, manner per content type
 *   [data-loop]                              bento story, paused while off-screen */
const FOLIO_HTML = `
<div class="relative flex min-h-svh flex-col overflow-x-hidden bg-background text-foreground antialiased folio-preview">
<header>
  <nav data-state="false" aria-label="Điều hướng chính">
    <div class="folio-nav">
      <a class="folio-nav-brand" href="#" aria-label="Guta Workspace home">
        <span class="folio-nav-logo" aria-hidden="true"></span>
        <span class="folio-nav-wordmark">
          <span class="folio-nav-name"><b>GUTA</b> WORKSPACE</span>
          <span class="folio-nav-sub">HR &amp; Smart Shift AI</span>
        </span>
      </a>
      <button type="button" aria-label="Open Menu" aria-expanded="false" class="folio-nav-burger">
        <svg class="folio-nav-icon-menu" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>
        <svg class="folio-nav-icon-close" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"></path></svg>
      </button>
      <ul class="folio-nav-links">
        <li><a href="#features">Nghiệp vụ</a></li>
        <li><a href="#solution">Luồng làm việc</a></li>
        <li><a href="#product">Trợ lý AI</a></li>
        <li><a href="#about">Nguyên tắc</a></li>
      </ul>
      <div class="folio-nav-actions">
        <div class="folio-theme" data-theme-toggle aria-label="Toggle Theme">
          <button type="button" aria-label="Light theme" title="Chuyển chế độ sáng">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
          </button>
          <button type="button" aria-label="Dark theme" title="Chuyển chế độ tối">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg>
          </button>
        </div>
        <a class="folio-btn folio-btn-quiet" href="#login" role="button" aria-label="Get Started">Đăng nhập</a>
        <a class="folio-btn folio-btn-solid" href="#guta-dashboard">Xem dashboard</a>
      </div>
    </div>
  </nav>
</header>

<main class="folio-main">
  <section class="folio-hero">
    <div class="folio-hero-inner">
      <h1 class="folio-display"><span class="line"><span data-line style="--i:0">Quản Trị Nhân Sự &amp;</span></span> <span class="line"><span data-line style="--i:1">Phân Ca Tự Động</span></span></h1>
      <p class="hero-sub" data-load style="--d:420ms">Guta Workspace tự động hóa xếp ca 24H, đối soát chấm công và trợ lý AI điều phối nhân sự cho chuỗi cà phê — nhanh, không sót ca.</p>
      <div class="hero-actions" data-load style="--d:480ms">
        <a class="hero-cta" href="#guta-dashboard" role="button" aria-label="Khám phá dashboard">Khám phá dashboard</a>
        <a class="hero-cta-secondary" href="#solution">Xem luồng làm việc</a>
      </div>
      <p class="hero-status" data-load style="--d:540ms"><span class="hero-status-dot" aria-hidden="true"></span>F&amp;B Workforce Intelligence · Quản trị chuỗi 45 chi nhánh TP.HCM</p>
    </div>

    <div class="hero-stage">
      <div class="hero-plate" aria-hidden="true">
        <img src="/assets/folio/images/dashboard-bg.jpg" alt="" width="1600" height="1067" decoding="async" fetchpriority="high" class="hero-plate-img" />
      </div>
      <div class="hero-stage-frame" data-open>
        <div class="hero-stage-crop">
          <div class="guta-demo-scroll" tabindex="0" aria-label="Minh họa dashboard nhân sự 21st-CRM, cuộn ngang để xem đầy đủ" role="region" id="dashboard-preview" data-ui>
            <div class="crm-app" id="guta-dashboard" role="region" aria-label="Minh họa 21st-CRM Dashboard nhân sự HR BlockBot">
              <header class="crm-topbar">
                <div class="crm-topbar-left">
                  <div class="crm-brand-icon">G</div>
                  <div class="crm-brand-meta">
                    <span class="crm-brand-title">Guta Workspace</span>
                    <span class="crm-brand-sub">Guta CRM · Quản trị phân ca &amp; nhân sự chuỗi</span>
                  </div>
                </div>
                <div class="crm-search-bar" role="search">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
                  <span>Tìm kiếm chi nhánh, barista, ca trực...</span>
                  <kbd>⌘K</kbd>
                </div>
                <div class="crm-topbar-actions">
                  <span class="crm-role-badge">Admin HR</span>
                  <button type="button" class="crm-btn crm-btn-outline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Bộ lọc</button>
                  <button type="button" class="crm-btn crm-btn-primary">Tạo ca trực</button>
                </div>
              </header>

              <div class="crm-metrics-grid">
                <div class="crm-metric-box">
                  <div class="crm-metric-head"><span>Tổng nhân sự</span><span class="crm-tag-neutral">34 chi nhánh</span></div>
                  <div class="crm-metric-value">2.439 <small>nhân sự</small></div>
                  <div class="crm-metric-foot">Chuẩn hóa 5 cấp bậc (Intern → Lead)</div>
                </div>
                <div class="crm-metric-box">
                  <div class="crm-metric-head"><span>Lịch trình vận hành ca</span><span class="crm-tag-info">5 trạng thái</span></div>
                  <div class="crm-metric-value">18 <small>đang quản lý</small></div>
                  <div class="crm-metric-foot">Khởi tạo → Giao → Làm → Duyệt → Xong</div>
                </div>
                <div class="crm-metric-box">
                  <div class="crm-metric-head"><span>Hàng đợi duyệt</span><span class="crm-tag-neutral">4 chờ duyệt</span></div>
                  <div class="crm-metric-value">04 <small>báo cáo mới</small></div>
                  <div class="crm-metric-foot">Cần Admin đối chiếu &amp; xác nhận</div>
                </div>
                <div class="crm-metric-box">
                  <div class="crm-metric-head"><span>Gợi ý PhoBERT</span><span class="crm-tag-success">Semantic match</span></div>
                  <div class="crm-metric-value">94.2% <small>độ tương đồng</small></div>
                  <div class="crm-metric-foot">Khớp kỹ năng hồ sơ với yêu cầu việc</div>
                </div>
              </div>

              <div class="crm-workspace-body">
                <div class="crm-pipeline-container">
                  <div class="crm-stage-col" data-enter="col" style="--i:0">
                    <div class="crm-stage-header"><span class="crm-stage-name">1. Khởi tạo</span><span class="crm-stage-count">1</span></div>
                    <div class="crm-cards-list">
                      <div class="crm-card" data-enter="card-in-col" style="--i:0">
                        <div class="crm-card-tags"><span class="crm-pill crm-pill-gray">Ca sáng</span><span class="crm-pill crm-pill-blue">SOP-01</span></div>
                        <h4 class="crm-card-title">Định biên nhân sự ca sáng</h4>
                        <p class="crm-card-desc">Thiết lập định biên Barista và nhân sự phụ ca cho 45 cửa hàng.</p>
                        <div class="crm-card-meta"><div class="crm-avatar">HR</div><span>Phòng nhân sự</span></div>
                        <div class="crm-card-footer"><span class="crm-date">Hạn: 30/10</span><span class="crm-status-text">Chưa mở kỳ</span></div>
                      </div>
                    </div>
                  </div>
                  <div class="crm-stage-col" data-enter="col" style="--i:1">
                    <div class="crm-stage-header"><span class="crm-stage-name">2. Đã giao</span><span class="crm-stage-count">1</span></div>
                    <div class="crm-cards-list">
                      <div class="crm-card" data-enter="card-in-col" style="--i:0">
                        <div class="crm-card-tags"><span class="crm-pill crm-pill-green">PhoBERT 95%</span><span class="crm-pill crm-pill-gray">SOP-04</span></div>
                        <h4 class="crm-card-title">Rà soát quy chế ca 24H</h4>
                        <p class="crm-card-desc">Cập nhật quy định chấm công ZKTeco và phụ cấp ca đêm.</p>
                        <div class="crm-card-meta"><div class="crm-avatar">VA</div><span>Nguyễn Văn An (Senior)</span></div>
                        <div class="crm-card-footer"><span class="crm-date">Giao: 20/10</span><span class="crm-status-text">Đã gửi qua Bot</span></div>
                      </div>
                    </div>
                  </div>
                  <div class="crm-stage-col" data-enter="col" style="--i:2">
                    <div class="crm-stage-header"><span class="crm-stage-name">3. Đang thực hiện</span><span class="crm-stage-count">2</span></div>
                    <div class="crm-cards-list">
                      <div class="crm-card" data-enter="card-in-col" style="--i:0">
                        <div class="crm-card-tags"><span class="crm-pill crm-pill-blue">Hồ sơ &amp; kỹ năng</span></div>
                        <h4 class="crm-card-title">Chuẩn hóa hồ sơ nhân sự</h4>
                        <p class="crm-card-desc">Phân loại kỹ năng pha chế, quản lý kho theo chuẩn Guta.</p>
                        <div class="crm-progress-bar"><div class="crm-progress-fill" style="width:60%"></div></div>
                        <div class="crm-card-meta"><div class="crm-avatar">TB</div><span>Trần Thị Bình (Middle)</span></div>
                        <div class="crm-card-footer"><span class="crm-date">Tiến độ: 60%</span><span class="crm-status-text">Đang cập nhật</span></div>
                      </div>
                      <div class="crm-card" data-enter="card-in-col" style="--i:1">
                        <div class="crm-card-tags"><span class="crm-pill crm-pill-purple">Socket.IO</span><span class="crm-pill crm-pill-gray">SOP-09</span></div>
                        <h4 class="crm-card-title">Chatbot nhắc ca &amp; chốt két</h4>
                        <p class="crm-card-desc">Gửi thông báo vào ca và nhắc hạn chốt quỹ két tự động.</p>
                        <div class="crm-progress-bar"><div class="crm-progress-fill" style="width:85%"></div></div>
                        <div class="crm-card-meta"><div class="crm-avatar">LC</div><span>Lê Hoàng Cường (Lead)</span></div>
                        <div class="crm-card-footer"><span class="crm-date">Tiến độ: 85%</span><span class="crm-status-text">Test luồng chat</span></div>
                      </div>
                    </div>
                  </div>
                  <div class="crm-stage-col" data-enter="col" style="--i:3">
                    <div class="crm-stage-header"><span class="crm-stage-name">4. Chờ duyệt</span><span class="crm-stage-count">1</span></div>
                    <div class="crm-cards-list">
                      <div class="crm-card crm-card-highlight" data-enter="card-in-col" style="--i:0">
                        <div class="crm-card-tags"><span class="crm-pill crm-pill-blue">Cần đối chiếu</span><span class="crm-pill crm-pill-gray">SOP-05</span></div>
                        <h4 class="crm-card-title">Đối soát bàn giao két ca</h4>
                        <p class="crm-card-desc">Đã gửi biên bản chốt quỹ két qua Chatbot. Chờ quản lý đối soát.</p>
                        <div class="crm-card-meta"><div class="crm-avatar">PD</div><span>Phạm Minh Dũng (Junior)</span></div>
                        <div class="crm-card-actions">
                          <button type="button" class="crm-mini-btn crm-btn-confirm">Phê duyệt</button>
                          <button type="button" class="crm-mini-btn crm-btn-secondary">Trả lại</button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div class="crm-stage-col" data-enter="col" style="--i:4">
                    <div class="crm-stage-header"><span class="crm-stage-name">5. Hoàn thành</span><span class="crm-stage-count">1</span></div>
                    <div class="crm-cards-list">
                      <div class="crm-card" data-enter="card-in-col" style="--i:0">
                        <div class="crm-card-tags"><span class="crm-pill crm-pill-green">Đã chốt két</span><span class="crm-pill crm-pill-gray">Chuẩn 100%</span></div>
                        <h4 class="crm-card-title">Nghiệm thu ca làm &amp; bàn giao</h4>
                        <p class="crm-card-desc">Đã đồng bộ chấm công ZKTeco và khớp dữ liệu két ca.</p>
                        <div class="crm-card-meta"><div class="crm-avatar">DE</div><span>Đặng Thu Em (Senior)</span></div>
                        <div class="crm-card-footer"><span class="crm-date">Xong: 22/10</span><span class="crm-status-text">Đã chốt két</span></div>
                      </div>
                    </div>
                  </div>
                </div>

                <aside class="crm-assistant-panel">
                  <div class="crm-assistant-head">
                    <div class="crm-bot-status"><span class="crm-dot" aria-hidden="true"></span><strong>Trợ lý HR BlockBot</strong></div>
                    <span class="crm-tag-xs">Trợ lý</span>
                  </div>
                  <div class="crm-assistant-body">
                    <div class="crm-chat-msg crm-msg-user">
                      <small>Nhân viên hỏi qua chatbot</small>
                      <p>“Làm thế nào để tôi báo cáo chốt quỹ két và đổi ca trực?”</p>
                    </div>
                    <div class="crm-chat-msg crm-msg-bot">
                      <small>Trợ lý phản hồi · SOP-05 / Vận hành ca</small>
                      <p>Chọn ca trực phụ trách, đính kèm biên bản két và bấm xác nhận. Dữ liệu sẽ chuyển sang cột <strong>Chờ duyệt</strong> trên dashboard của quản lý.</p>
                      <div class="crm-msg-cite">Quy định vận hành F&amp;B: xác nhận trước khi chốt két</div>
                    </div>
                    <div class="crm-recommendation-box">
                      <div class="crm-rec-label">Gợi ý phân công PhoBERT</div>
                      <h5>Ca trực: tăng cường barista giờ cao điểm</h5>
                      <div class="crm-rec-candidate">
                        <div class="crm-avatar-sm">LC</div>
                        <div>
                          <strong>Lê Hoàng Cường</strong> · Lead
                          <small>Điểm tương đồng kỹ năng: <strong>96%</strong> · Tải việc: 1/3</small>
                        </div>
                      </div>
                      <div class="crm-rec-action">
                        <button type="button" class="crm-btn crm-btn-primary crm-btn-block">Chấp thuận phân công</button>
                      </div>
                      <span class="crm-rec-note">Admin giữ quyền quyết định cuối cùng.</span>
                    </div>
                  </div>
                  <div class="crm-assistant-foot">Minh họa 2 vai (quản trị &amp; barista) · Hệ thống Guta F&amp;B</div>
                </aside>
              </div>
            </div>
          </div>
          <p class="demo-caption">Minh họa giao diện 21st-CRM HR BlockBot · Dữ liệu mô phỏng vận hành chuỗi cà phê · Cuộn ngang trên màn hình nhỏ</p>
        </div>
      </div>
    </div>
  </section>

  <section class="folio-partners" aria-label="Đối tác cung ứng">
    <div class="guta-container">
      <div class="partners-row">
        <span class="partners-lead">Đối tác cung ứng F&amp;B</span>
        <span>Vinamilk</span><span aria-hidden="true">·</span>
        <span>La Marzocco</span><span aria-hidden="true">·</span>
        <span>Dalatmilk</span><span aria-hidden="true">·</span>
        <span>Monin</span><span aria-hidden="true">·</span>
        <span>Torani</span><span aria-hidden="true">·</span>
        <span>OATLY</span><span aria-hidden="true">·</span>
        <span>Rich's</span>
      </div>
    </div>
  </section>

  <section class="folio-section" id="features">
    <div class="guta-container">
      <header class="guta-section-head">
        
        <h2>Bớt hỏi lại. Có chỗ để đối chiếu.</h2>
        <span class="guta-label">Từ dữ liệu đến quyết định</span>
        <p>Mỗi thông tin đi cùng một việc cần làm, thay vì nằm rải rác trong file và tin nhắn.</p>
      </header>
      <div class="bento-grid">
        <article class="bento-card" data-enter="card" style="--i:0">
          <header>
            <h3>Phân công theo kỹ năng</h3>
            <p>Barista mới vào ca tối được xếp đúng ô trống; điểm PhoBERT và tải việc hiện ngay cạnh tên.</p>
          </header>
          <div class="story story--assign" data-loop data-ui aria-hidden="true">
            <div class="story-top"><span class="story-cap">Ca tăng cường · 17:00–21:00</span><span class="story-cap">Điểm PhoBERT</span></div>
            <ul class="assign-list">
              <li class="assign-row-wrap">
                <span class="assign-slot story-anim">Ô trống — chờ xếp người</span>
                <span class="assign-row assign-row--new story-anim">
                  <span class="assign-av">MT</span>
                  <span class="assign-name">Mai Trâm <em>· Barista mới</em></span>
                  <span class="assign-score">
                    <span class="odo"><span class="odo-strip story-anim" style="--end:-112px"><b>0</b><b>12</b><b>24</b><b>36</b><b>48</b><b>60</b><b>72</b><b>84</b><b>94</b></span></span>
                    <span class="odo-pct">.2%</span>
                  </span>
                </span>
              </li>
              <li class="assign-row assign-row--rank story-anim">
                <span class="assign-av">LC</span>
                <span class="assign-name">Lê Hoàng Cường <em>· Lead</em></span>
                <span class="assign-score-static">91.4%</span>
              </li>
            </ul>
            <p class="bento-note">Quản lý xem độ phù hợp trước khi chốt.</p>
          </div>
        </article>

        <article class="bento-card" data-enter="card" style="--i:1">
          <header>
            <h3>Đối soát két tiền mặt</h3>
            <p>Dòng lệch được đánh dấu khi quét; số chênh lệch hiện ra thay vì phải tự trừ.</p>
          </header>
          <div class="story story--cash" data-loop data-ui aria-hidden="true">
            <div class="story-top"><span class="story-cap">Két ca sáng · 30/10</span><span class="story-cap">POS và két</span></div>
            <div class="cash-table">
              <span class="cash-scan story-anim" aria-hidden="true"></span>
              <div class="cash-row"><span>Tiền mặt đầu ca</span><span>2.000.000</span><span>2.000.000</span></div>
              <div class="cash-row"><span>Thu bán ca sáng</span><span>4.320.000</span><span>4.300.000</span><span class="cash-mark story-anim" aria-hidden="true"></span></div>
              <div class="cash-row"><span>Chi hoàn khách</span><span>120.000</span><span>120.000</span></div>
              <div class="cash-row"><span>Nộp két ca chiều</span><span>1.500.000</span><span>1.500.000</span></div>
              <div class="cash-row"><span>Tồn két cuối ca</span><span>4.700.000</span><span>4.680.000</span></div>
            </div>
            <div class="cash-delta story-anim">
              <span>Chênh lệch</span>
              <span class="cash-delta-value">
                <span class="odo"><span class="odo-strip story-anim" style="--end:-98px"><b>0</b><b>3</b><b>6</b><b>9</b><b>12</b><b>15</b><b>18</b><b>20</b></span></span>
                <span class="odo-pct">.000 ₫</span>
              </span>
            </div>
          </div>
        </article>

        <article class="bento-card" data-enter="card" style="--i:2">
          <header>
            <h3>Tra cứu chính sách</h3>
            <p>Hỏi bằng tiếng Việt, nhận câu trả lời kèm nguồn — chưa đủ dữ liệu thì hệ thống hỏi lại.</p>
          </header>
          <div class="story story--policy" data-loop data-ui aria-hidden="true">
            <div class="story-top"><span class="story-cap">Trợ lý chính sách</span><span class="story-cap">SOP-05</span></div>
            <div class="policy-prompt">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
              <span class="policy-typed story-anim">Báo cáo chốt quỹ két ở đâu?</span>
            </div>
            <div class="policy-chips">
              <span class="policy-chip story-anim">Quy chế vận hành ca</span>
              <span class="policy-chip story-anim">Biểu mẫu chốt két</span>
              <span class="policy-chip story-anim">SOP-05 · Bàn giao</span>
            </div>
            <p class="policy-answer story-anim">Mở <strong>Ca trực → Chốt quỹ két</strong>, đính kèm biên bản và xác nhận. Hệ thống ghi lại người duyệt.</p>
          </div>
        </article>

        <article class="bento-card" data-enter="card" style="--i:3">
          <header>
            <h3>Phân ca 24H</h3>
            <p>Một ca trượt từ “Chờ” sang “Đã giao” ngay khi người nhận xác nhận trong chatbot.</p>
          </header>
          <div class="story story--shift" data-loop data-ui aria-hidden="true">
            <div class="story-top"><span class="story-cap">Ca 24H · 06:00–14:00</span><span class="story-cap">Điều phối</span></div>
            <div class="shift-cols">
              <div class="shift-col">
                <span class="shift-cap">Đã giao</span>
                <div class="shift-card story-anim">
                  <div class="shift-card-top">
                    <span>06:00–14:00</span>
                    <span class="shift-badge-slot">
                      <span class="shift-badge shift-badge--wait story-anim">Chờ</span>
                      <span class="shift-badge shift-badge--done story-anim">Đã giao</span>
                    </span>
                  </div>
                  <span class="shift-meta">Nguyễn Văn An · Barista</span>
                </div>
              </div>
              <div class="shift-col">
                <span class="shift-cap">Chờ điều phối</span>
                <div class="shift-drop"></div>
              </div>
            </div>
          </div>
        </article>
      </div>
    </div>
  </section>

  <div data-tagline-slot></div>

  <section class="folio-section" id="solution">
    <div class="guta-container">
      <header class="guta-section-head">
        
        <h2>Luồng Vận Hành Tự Động 24/7</h2>
        <span class="guta-label">Kiến trúc &amp; luồng xử lý agentic</span>
        <p>Hệ thống tự động điều phối luồng hội thoại từ Ingress (Zalo, Telegram, Web), qua Bộ lọc Fast Rule Gate, Phân loại Jev AI, Vòng lặp Agent đến Gemini 3.8 Flash và Cổng xác thực con người 2 bước.</p>
      </header>
      <div class="workflow-diagram-card" data-ui>
        <div class="workflow-toolbar">
          <span class="workflow-status-chip" data-state="play">
            <span class="workflow-dot" aria-hidden="true"></span>
            <span class="workflow-status-text">Luồng tín hiệu: đang chạy liên tục (Live Loop)</span>
          </span>
          <a href="/diagrams/chatbot-architecture.html" target="_blank" rel="noopener noreferrer" class="workflow-btn-fullscreen" title="Mở sơ đồ ở tab mới" aria-label="Mở sơ đồ ở tab mới">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
            <span>Mở tab mới</span>
          </a>
        </div>
        <div class="workflow-iframe-wrapper">
          <iframe id="workflow-diagram-iframe" src="/diagrams/chatbot-architecture.html" title="HR BlockBot - Chatbot &amp; Agentic Architecture" class="workflow-iframe" loading="lazy" allow="fullscreen"></iframe>
        </div>
      </div>
    </div>
  </section>

  <section class="folio-section" id="product">
    <div class="guta-container">
      <header class="guta-section-head">
        
        <h2>Gợi ý có lý do. Tra cứu có ngữ cảnh.</h2>
        <span class="guta-label">AI có vai trò cụ thể</span>
        <p>Hệ thống tối ưu theo quy trình chuỗi F&amp;B thực tế, minh bạch mọi quyết định điều phối ca.</p>
      </header>
      <div class="guta-grid-two">
        <article class="guta-card" data-enter="card" style="--i:0">
          <span class="guta-card-kicker">Yêu cầu → gợi ý → người duyệt</span>
          <h3>Không tự giao việc thay quản lý</h3>
          <p>PhoBERT là thành phần ngữ nghĩa trong thiết kế matching. Người quản lý xem độ phù hợp và tải công việc trước khi quyết định.</p>
        </article>
        <article class="guta-card" data-enter="card" style="--i:1">
          <span class="guta-card-kicker">Hỏi → tra cứu → đối chiếu</span>
          <h3>“Quy định nộp báo cáo ở đâu?”</h3>
          <p>Hỏi theo tình huống thay vì dò nhiều file. Thiết kế chatbot ưu tiên câu trả lời bám tài liệu; chưa đủ thông tin thì hỏi lại.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="folio-section" id="about">
    <div class="guta-container">
      <header class="guta-section-head">
        
        <h2>Không cần tin một cách mù quáng.</h2>
        <span class="guta-label">Thiết kế để kiểm tra được</span>
        <p>Quy trình điều phối chuẩn hóa, kiểm soát chặt chẽ chấm công máy ZKTeco và két ca.</p>
      </header>
      <div class="guta-grid-three">
        <article class="guta-card" data-enter="card" style="--i:0">
          <h3>Phân quyền theo vai</h3>
          <p>Quản lý điều phối chi nhánh. Barista thao tác ca trực và đối soát két trong ca làm.</p>
        </article>
        <article class="guta-card" data-enter="card" style="--i:1">
          <h3>Xác nhận trước khi ghi</h3>
          <p>Nhận ca, bàn giao quỹ két hay gửi cảnh báo đều cần xác nhận chính xác trước khi lưu.</p>
        </article>
        <article class="guta-card" data-enter="card" style="--i:2">
          <h3>Giữ dấu vết thay đổi</h3>
          <p>Trạng thái điểm danh, lý do đi trễ và hiệu chỉnh công ca phải có nhật ký kiểm soát rõ ràng.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="folio-section folio-org" id="org">
    <div class="guta-container">
      <header class="guta-section-head">
        <h2>Ai quyết việc gì.</h2>
        <span class="guta-label">Cơ cấu tổ chức</span>
        <p>Năm bậc quyền hạn, hai hệ thống vận hành. Mọi phân quyền trong sản phẩm bám theo sơ đồ này, không tự đặt thêm cấp.</p>
      </header>

      <div class="org-figure" data-ui>
        <div class="org-scroll" tabindex="0" role="region" aria-label="Sơ đồ cơ cấu tổ chức, cuộn ngang để xem đầy đủ">
          ${ORG_CHART_SVG}
        </div>
        <p class="org-caption">Sơ đồ theo vai trò. Tên cá nhân không hiển thị trên trang công khai.</p>
      </div>
    </div>
  </section>

  <section class="folio-section" id="questions">
    <div class="guta-container">
      <header class="guta-section-head">
        
        <h2>Những điều cần rõ.</h2>
        <span class="guta-label">Trước khi trải nghiệm</span>
        <p>Phạm vi và giới hạn được nói ngay trên trang.</p>
      </header>
      <div class="guta-faq">
        <details data-enter="faq" style="--i:0"><summary>HR BlockBot giải quyết việc gì?</summary><p>Tập trung hồ sơ nhân sự, lịch phân ca 24/7, điều phối barista chéo, tra cứu quy chế, quỹ két và báo cáo trong cùng một hệ thống.</p></details>
        <details data-enter="faq" style="--i:1"><summary>Dashboard và chatbot có dữ liệu riêng không?</summary><p>Không. Theo thiết kế, hai giao diện chia sẻ một nguồn dữ liệu và cùng nghiệp vụ; khác nhau ở cách người dùng thao tác.</p></details>
        <details data-enter="faq" style="--i:2"><summary>AI có tự giao việc hay quyết định điểm KPI không?</summary><p>Thiết kế đặt AI ở vai trò hỗ trợ. Quản lý xác nhận phân công; hiệu chỉnh KPI phải có lý do và lịch sử.</p></details>
        <details data-enter="faq" style="--i:3"><summary>Đây có phải dữ liệu Guta đang chạy thật không?</summary><p>Không. Các công việc và hội thoại trên trang là nội dung minh họa giao diện; không phải dữ liệu vận hành hoặc kết quả AI đã đo.</p></details>
        <details data-enter="faq" style="--i:4"><summary>Hệ thống có xếp ca, tính lương hay duyệt nghỉ phép không?</summary><p>Hệ thống tập trung cốt lõi vào điều phối ca trực, điểm danh ZKTeco và quản trị két ca 45 chi nhánh. Các phân hệ tính lương và duyệt nghỉ phép tự động đang trong lộ trình tích hợp tiếp theo.</p></details>
      </div>
    </div>
  </section>
</main>

<footer class="folio-footer">
  <div class="guta-container guta-footer">
    <strong>GUTA WORKSPACE <span>· HR BlockBot</span></strong>
    <p>Guta Workspace · Nền tảng điều hành nhân sự &amp; chuỗi cà phê F&amp;B</p>
    <a href="#questions">Phạm vi &amp; câu hỏi</a>
  </div>
</footer>
<section aria-label="Notifications alt+T" tabindex="-1" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></section>
</div>`;

export const FolioLandingView: React.FC<FolioLandingViewProps> = ({ onLogin, isAuthLoading = false, onNotify }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [taglineSlot, setTaglineSlot] = useState<HTMLElement | null>(null);
  const closeAuth = useCallback(() => setIsAuthOpen(false), []);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    setTaglineSlot(root.querySelector<HTMLElement>('[data-tagline-slot]'));

    // 1. Mobile Menu Toggle
    const toggle = root.querySelector('button[aria-label="Open Menu"]');
    let handleToggle: (() => void) | null = null;
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      handleToggle = () => {
        const nav = toggle.closest('nav');
        if (!nav) return;
        const open = nav.getAttribute('data-state') !== 'active';
        nav.setAttribute('data-state', open ? 'active' : 'false');
        toggle.setAttribute('aria-expanded', String(open));
      };
      toggle.addEventListener('click', handleToggle);
    }
    const nav = root.querySelector('nav');
    // Threshold matching folio-topaz reference: enter at 50px, leave at 20px.
    // 30px hysteresis buffer prevents any flickering on trackpad inertia.
    const NAV_ENTER_AT = 50;
    const NAV_LEAVE_AT = 20;
    let navScrolled = false;
    const syncScrolledNav = () => {
      const y = window.scrollY;
      const next = navScrolled ? y > NAV_LEAVE_AT : y > NAV_ENTER_AT;
      if (next === navScrolled) return;
      navScrolled = next;
      nav?.classList.toggle('nav-scrolled', next);
    };
    syncScrolledNav();
    window.addEventListener('scroll', syncScrolledNav, { passive: true });
    const navLinks = nav?.querySelectorAll('a[href="#features"], a[href="#solution"], a[href="#product"], a[href="#about"]');
    const closeMobileMenu = () => {
      nav?.setAttribute('data-state', 'false');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    navLinks?.forEach((link) => link.addEventListener('click', closeMobileMenu));

    // 2. Open account authentication from all workspace entry points.
    const loginTriggers = root.querySelectorAll('a[href="#login"], a[href="#demo"], a[href="#crm"], button[data-auth-trigger]');
    const handleLoginClick = (e: Event) => {
      e.preventDefault();
      setIsAuthOpen(true);
    };
    loginTriggers.forEach((el) => el.addEventListener('click', handleLoginClick));

    // Hero badge links are decorative; prevent navigation without showing an unavailable-feature notice.
    const deadLinks = root.querySelectorAll('a[href="#"], a[href=""]');
    const preventDeadLink = (event: Event) => event.preventDefault();
    deadLinks.forEach((link) => {
      const text = link.textContent?.trim().toLowerCase() || '';
      if (!text.includes('bắt đầu ngay') && !text.includes('get started') && !text.includes('xem dashboard') && !text.includes('đăng nhập')) {
        link.addEventListener('click', preventDeadLink);
      }
    });

    // Also attach to buttons with text "Bắt đầu", "Get Started", "Đăng nhập", "Xem dashboard", "Khám phá dashboard" or CRM preview controls
    const allButtonsAndLinks = root.querySelectorAll('button, a');
    allButtonsAndLinks.forEach((el) => {
      const text = el.textContent?.trim().toLowerCase() || '';
      if (
        text.includes('bắt đầu ngay') ||
        text.includes('get started') ||
        text.includes('xem dashboard') ||
        text.includes('khám phá dashboard') ||
        text.includes('đăng nhập') ||
        el.classList.contains('crm-btn') ||
        el.classList.contains('crm-mini-btn')
      ) {
        el.addEventListener('click', handleLoginClick);
      }
    });

    // 3. Accordion FAQ
    const triggers = root.querySelectorAll('[data-slot="accordion-trigger"]');
    const handleAccordion = (e: Event) => {
      const trigger = e.currentTarget as HTMLElement;
      const item = trigger.closest('[data-slot="accordion-item"]');
      const content = item?.querySelector('[data-slot="accordion-content"]') as HTMLElement | null;
      if (!content) return;
      const open = trigger.getAttribute('aria-expanded') !== 'true';
      trigger.setAttribute('aria-expanded', String(open));
      const icon = trigger.querySelector('svg');
      icon?.classList.add('transition-transform', 'duration-200');
      icon?.classList.toggle('rotate-180', open);
      content.hidden = !open;
    };
    triggers.forEach((t) => t.addEventListener('click', handleAccordion));

    // 4. Dark / Light Theme Toggle
    const lightBtn = root.querySelector('[data-theme-toggle] button[aria-label="Light theme"]');
    const darkBtn = root.querySelector('[data-theme-toggle] button[aria-label="Dark theme"]');
    const setLight = (e: Event) => {
      e.preventDefault();
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    };
    const setDark = (e: Event) => {
      e.preventDefault();
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    };
    lightBtn?.addEventListener('click', setLight);
    darkBtn?.addEventListener('click', setDark);

    // 5. Smooth scroll for solution anchor links
    const solutionLinks = root.querySelectorAll('a[href="#solution"]');
    const handleSolutionClick = (e: Event) => {
      const solEl = root.querySelector('#solution');
      if (solEl) {
        e.preventDefault();
        solEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.history.pushState(null, '', '#solution');
      }
    };
    solutionLinks.forEach((link) => link.addEventListener('click', handleSolutionClick));

    // 6. The diagram runs on its own loop. The only outer control is the
    // "open in a new tab" link: pause/fit buttons duplicated the diagram's own
    // affordances and gave the toolbar a second place to break.
    const iframe = root.querySelector('#workflow-diagram-iframe') as HTMLIFrameElement | null;
    const statusText = root.querySelector('.workflow-status-text');
    const statusChip = root.querySelector('.workflow-status-chip');

    const handleDiagramMessage = (event: MessageEvent) => {
      if (iframe && event.source !== iframe.contentWindow) return;
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      // The diagram reports its own state (including a reduced-motion pause);
      // the chip mirrors it so the copy never claims a loop that is not running.
      if (data.type === 'DIAGRAM_MOTION_CHANGE' && typeof data.state === 'string') {
        const playing = data.state === 'play';
        if (statusText) {
          statusText.textContent = playing
            ? 'Luồng tín hiệu: đang chạy liên tục (Live Loop)'
            : 'Luồng tín hiệu: tạm dừng theo tuỳ chọn giảm chuyển động';
        }
        statusChip?.setAttribute('data-state', playing ? 'play' : 'paused');
      }
    };
    window.addEventListener('message', handleDiagramMessage);

    // 7. Section entrances: one observer, fire once, unobserve. No scroll listener.
    // The org chart joins the same observer so it reveals once, in view, and
    // never animates while off-screen.
    const orgSection = root.querySelector<HTMLElement>('.folio-org');
    if (orgSection) orgSection.setAttribute('data-enter', 'org');
    const enterTargets = root.querySelectorAll<HTMLElement>('[data-enter]');
    const entranceObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries, observer) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            entry.target.classList.add('is-in');
            observer.unobserve(entry.target);
          }
        }, ENTRY_OBSERVER_OPTIONS)
      : null;
    if (entranceObserver) {
      enterTargets.forEach((el) => entranceObserver.observe(el));
    } else {
      enterTargets.forEach((el) => el.classList.add('is-in'));
    }

    // 8. Bento stories pause off-screen; the loop restarts from its design frame on re-entry.
    const loops = root.querySelectorAll<HTMLElement>('[data-loop]');
    const loopObserver = 'IntersectionObserver' in window
      ? new IntersectionObserver((entries) => {
          for (const entry of entries) entry.target.classList.toggle('is-paused', !entry.isIntersecting);
        }, { threshold: 0 })
      : null;
    if (loopObserver) loops.forEach((el) => loopObserver.observe(el));

    return () => {
      window.removeEventListener('scroll', syncScrolledNav);
      window.removeEventListener('message', handleDiagramMessage);
      navLinks?.forEach((link) => link.removeEventListener('click', closeMobileMenu));
      if (handleToggle && toggle) toggle.removeEventListener('click', handleToggle);
      loginTriggers.forEach((el) => el.removeEventListener('click', handleLoginClick));
      deadLinks.forEach((link) => link.removeEventListener('click', preventDeadLink));
      triggers.forEach((t) => t.removeEventListener('click', handleAccordion));
      lightBtn?.removeEventListener('click', setLight);
      darkBtn?.removeEventListener('click', setDark);
      solutionLinks.forEach((link) => link.removeEventListener('click', handleSolutionClick));
      window.removeEventListener('message', handleDiagramMessage);
      entranceObserver?.disconnect();
      loopObserver?.disconnect();
    };
  }, []);

  return (
    <div className="folio-view-container relative min-h-screen">
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: FOLIO_HTML }} />
      {taglineSlot
        ? createPortal(<TaglineReveal copy={TAGLINE_COPY} />, taglineSlot)
        : null}
      <style>{`button:focus-visible, a[role="button"]:focus-visible, a[data-slot="button"]:focus-visible { outline: none; box-shadow: 0 0 0 2px #71717a; }`}</style>

      <AccountLoginModal isOpen={isAuthOpen} isRestoringSession={isAuthLoading} onClose={closeAuth} onLogin={onLogin} />
    </div>
  );
};
