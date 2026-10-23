// Source: docs/00-vision-scope.md F1–F7; docs/10-ui-ux-spec.md; design-check/dashboard-DESIGN.md (21st-crm).
module.exports = function applyGutaContent() {
  const root = document.querySelector('.folio-preview');
  if (!root) return;
  const sections = Array.from(root.querySelectorAll('section'));
  const card = (title, text, visual = '') => `<article class="guta-card">${visual}<h3>${title}</h3><p>${text}</p></article>`;
  const label = text => `<span class="guta-label">${text}</span>`;
  const flow = ['Khởi tạo', 'Đã giao', 'Đang thực hiện', 'Chờ duyệt', 'Hoàn thành'];
  const section = (eyebrow, title, intro, body) => `<div class="guta-container"><header class="guta-section-head">${label(eyebrow)}<h2>${title}</h2><p>${intro}</p></header>${body}</div>`;

  // Hero section
  const h1 = root.querySelector('h1');
  if (h1) h1.textContent = 'Quản Trị Nhân Sự & Phân Ca Tự Động';
  const hero = h1?.nextElementSibling;
  if (hero) {
    const heroP = hero.querySelector('p');
    if (heroP) heroP.textContent = 'Guta Workspace tự động hóa xếp ca 24H, đối soát chấm công và trợ lý AI điều phối nhân sự cho chuỗi cà phê — nhanh chóng, không sai sót ca làm.';
    const heroLinks = hero.querySelectorAll('a[data-slot="button"]');
    if (heroLinks[0]) {
      heroLinks[0].textContent = 'Khám phá dashboard';
      heroLinks[0].setAttribute('aria-label', 'Khám phá dashboard');
      heroLinks[0].href = '#guta-dashboard';
    }
    if (heroLinks[1]) {
      heroLinks[1].textContent = 'Xem luồng làm việc';
      heroLinks[1].href = '#solution';
    }
    const heroBadge = sections[0]?.querySelector('a > span');
    if (heroBadge) heroBadge.textContent = 'F&B Workforce Intelligence — Next-Gen HR';
    const lastP = hero.querySelector('p:last-child');
    if (lastP) lastP.textContent = 'Bản giới thiệu giao diện 21st-CRM · Nghiệp vụ theo tài liệu dự án KLCN133';
  }

  // Dashboard HTML following design-check/dashboard-DESIGN.md (21st-crm)
  const dashboard = `
  <div class="crm-app" id="guta-dashboard" role="region" aria-label="Minh họa 21st-CRM Dashboard nhân sự HR BlockBot">
    <!-- Topbar (21st-crm header) -->
    <header class="crm-topbar">
      <div class="crm-topbar-left">
        <div class="crm-brand-icon">G</div>
        <div class="crm-brand-meta">
          <span class="crm-brand-title">GUTA WORKSPACE</span>
          <span class="crm-brand-sub">21st-CRM · Quản trị Đề tài &amp; Nhân sự</span>
        </div>
      </div>
      <div class="crm-search-bar" role="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        <span>Tìm kiếm đề tài, kỹ năng, nhân viên...</span>
        <kbd>⌘K</kbd>
      </div>
      <div class="crm-topbar-actions">
        <span class="crm-role-badge">Admin HR</span>
        <button type="button" class="crm-btn crm-btn-outline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg> Bộ lọc</button>
        <button type="button" class="crm-btn crm-btn-primary">+ Tạo đề tài</button>
      </div>
    </header>

    <!-- Stats Ribbon (21st-crm metric cards with rounded.sm: 10px) -->
    <div class="crm-metrics-grid">
      <div class="crm-metric-box">
        <div class="crm-metric-head"><span>TỔNG NHÂN SỰ</span><span class="crm-tag-neutral">34 Chi nhánh</span></div>
        <div class="crm-metric-value">2.439 <small>nhân sự</small></div>
        <div class="crm-metric-foot">Chuẩn hóa 5 cấp bậc (Intern → Lead)</div>
      </div>
      <div class="crm-metric-box">
        <div class="crm-metric-head"><span>VÒNG ĐỜI ĐỀ TÀI</span><span class="crm-tag-info">5 Trạng thái</span></div>
        <div class="crm-metric-value">18 <small>đang quản lý</small></div>
        <div class="crm-metric-foot">Khởi tạo → Giao → Làm → Duyệt → Xong</div>
      </div>
      <div class="crm-metric-box">
        <div class="crm-metric-head"><span>HÀNG ĐỢI DUYỆT</span><span class="crm-tag-warning">4 Chờ duyệt</span></div>
        <div class="crm-metric-value">04 <small>báo cáo mới</small></div>
        <div class="crm-metric-foot">Cần Admin đối chiếu &amp; xác nhận</div>
      </div>
      <div class="crm-metric-box">
        <div class="crm-metric-head"><span>GỢI Ý PHOBERT AI</span><span class="crm-tag-success">Semantic Match</span></div>
        <div class="crm-metric-value">94.2% <small>độ tương đồng</small></div>
        <div class="crm-metric-foot">Khớp kỹ năng hồ sơ với yêu cầu việc</div>
      </div>
    </div>

    <!-- Main Workspace (Pipeline Stage Kanban Columns + AI Assistant Panel) -->
    <div class="crm-workspace-body">
      <!-- 5-Stage Pipeline Columns -->
      <div class="crm-pipeline-container">
        <!-- Stage 1 -->
        <div class="crm-stage-col">
          <div class="crm-stage-header">
            <span class="crm-stage-name">1. Khởi tạo</span>
            <span class="crm-stage-count">1</span>
          </div>
          <div class="crm-cards-list">
            <div class="crm-card">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-gray">KPI Q3</span>
                <span class="crm-pill crm-pill-blue">UF-05</span>
              </div>
              <h4 class="crm-card-title">Đánh giá kết quả theo kỳ</h4>
              <p class="crm-card-desc">Thiết lập tiêu chí đánh giá KPI quý và bảng trọng số.</p>
              <div class="crm-card-meta">
                <div class="crm-avatar">HR</div>
                <span>Phòng Nhân sự</span>
              </div>
              <div class="crm-card-footer">
                <span class="crm-date">Hạn: 30/10</span>
                <span class="crm-status-text">Chưa mở kỳ</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Stage 2 -->
        <div class="crm-stage-col">
          <div class="crm-stage-header">
            <span class="crm-stage-name">2. Đã giao</span>
            <span class="crm-stage-count">1</span>
          </div>
          <div class="crm-cards-list">
            <div class="crm-card">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-green">PhoBERT 95%</span>
                <span class="crm-pill crm-pill-gray">UF-04</span>
              </div>
              <h4 class="crm-card-title">Rà soát chính sách nội bộ</h4>
              <p class="crm-card-desc">Cập nhật quy định chấm công và hỗ trợ ca làm 24H.</p>
              <div class="crm-card-meta">
                <div class="crm-avatar">VA</div>
                <span>Nguyễn Văn An (Senior)</span>
              </div>
              <div class="crm-card-footer">
                <span class="crm-date">Giao: 20/10</span>
                <span class="crm-status-text">Đã gửi qua Bot</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Stage 3 -->
        <div class="crm-stage-col">
          <div class="crm-stage-header">
            <span class="crm-stage-name">3. Đang thực hiện</span>
            <span class="crm-stage-count">2</span>
          </div>
          <div class="crm-cards-list">
            <div class="crm-card">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-blue">Hồ sơ &amp; Kỹ năng</span>
              </div>
              <h4 class="crm-card-title">Chuẩn hóa hồ sơ nhân sự</h4>
              <p class="crm-card-desc">Phân loại kỹ năng pha chế, quản lý kho theo chuẩn Guta.</p>
              <div class="crm-progress-bar"><div class="crm-progress-fill" style="width: 60%"></div></div>
              <div class="crm-card-meta">
                <div class="crm-avatar">TB</div>
                <span>Trần Thị Bình (Middle)</span>
              </div>
              <div class="crm-card-footer">
                <span class="crm-date">Tiến độ: 60%</span>
                <span class="crm-status-text">Đang cập nhật</span>
              </div>
            </div>

            <div class="crm-card">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-purple">Socket.IO</span>
                <span class="crm-pill crm-pill-gray">UF-09</span>
              </div>
              <h4 class="crm-card-title">Tích hợp Chatbot nhắc việc</h4>
              <p class="crm-card-desc">Gửi thông báo tiến độ và nhắc hạn báo cáo tự động.</p>
              <div class="crm-progress-bar"><div class="crm-progress-fill" style="width: 85%"></div></div>
              <div class="crm-card-meta">
                <div class="crm-avatar">LC</div>
                <span>Lê Hoàng Cường (Lead)</span>
              </div>
              <div class="crm-card-footer">
                <span class="crm-date">Tiến độ: 85%</span>
                <span class="crm-status-text">Test luồng chat</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Stage 4 -->
        <div class="crm-stage-col">
          <div class="crm-stage-header">
            <span class="crm-stage-name">4. Chờ duyệt</span>
            <span class="crm-stage-count crm-count-alert">1</span>
          </div>
          <div class="crm-cards-list">
            <div class="crm-card crm-card-highlight">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-amber">Cần đối chiếu</span>
                <span class="crm-pill crm-pill-gray">UF-05</span>
              </div>
              <h4 class="crm-card-title">Tổng hợp báo cáo công việc</h4>
              <p class="crm-card-desc">Đã gửi file nghiệm thu qua Chatbot. Chờ Admin duyệt kết quả.</p>
              <div class="crm-card-meta">
                <div class="crm-avatar">PD</div>
                <span>Phạm Minh Dũng (Junior)</span>
              </div>
              <div class="crm-card-actions">
                <button type="button" class="crm-mini-btn crm-btn-confirm">Phê duyệt</button>
                <button type="button" class="crm-mini-btn crm-btn-secondary">Trả lại (lý do)</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Stage 5 -->
        <div class="crm-stage-col">
          <div class="crm-stage-header">
            <span class="crm-stage-name">5. Hoàn thành</span>
            <span class="crm-stage-count">1</span>
          </div>
          <div class="crm-cards-list">
            <div class="crm-card">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-green">Đã nghiệm thu</span>
                <span class="crm-pill crm-pill-gray">+15 KPI</span>
              </div>
              <h4 class="crm-card-title">Hoàn thiện danh mục kỹ năng</h4>
              <p class="crm-card-desc">Đã lưu vết audit, đồng bộ vào kho dữ liệu nhân sự.</p>
              <div class="crm-card-meta">
                <div class="crm-avatar">DE</div>
                <span>Đặng Thu Em (Senior)</span>
              </div>
              <div class="crm-card-footer">
                <span class="crm-date">Xong: 22/10</span>
                <span class="crm-status-text">Đã chốt điểm</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Side: AI Assistant & Matching Card (21st-crm side panel) -->
      <aside class="crm-assistant-panel">
        <div class="crm-assistant-head">
          <div class="crm-bot-status"><span class="crm-dot"></span><strong>TRỢ LÝ HR BLOCKBOT</strong></div>
          <span class="crm-tag-xs">AI Copilot</span>
        </div>
        
        <div class="crm-assistant-body">
          <div class="crm-chat-msg crm-msg-user">
            <small>Nhân viên hỏi qua Chatbot:</small>
            <p>“Làm thế nào để tôi nộp báo cáo nghiệm thu đề tài?”</p>
          </div>
          <div class="crm-chat-msg crm-msg-bot">
            <small>Trợ lý phản hồi (UF-05 / UF-09):</small>
            <p>Chọn đề tài được giao, đính kèm kết quả và bấm xác nhận. Dữ liệu sẽ chuyển sang cột <strong>Chờ duyệt</strong> trên Dashboard của Quản lý.</p>
            <div class="crm-msg-cite">Quy tắc BR-11: Xác nhận trước khi ghi dữ liệu</div>
          </div>

          <div class="crm-recommendation-box">
            <div class="crm-rec-label">GỢI Ý PHÂN CÔNG PHOBERT</div>
            <h5>Đề tài: Tích hợp Chatbot nhắc việc</h5>
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
        <div class="crm-assistant-foot">
          <span>Minh họa 2 vai (Admin &amp; Employee) · Khóa luận KLCN133</span>
        </div>
      </aside>
    </div>
  </div>`;

  const oldDemo = root.querySelector('[data-folio-demo]') || root.querySelector('.guta-demo-scroll');
  if (oldDemo) {
    oldDemo.removeAttribute('data-folio-demo');
    oldDemo.className = 'guta-demo-scroll';
    oldDemo.id = 'dashboard-preview';
    oldDemo.setAttribute('tabindex', '0');
    oldDemo.setAttribute('aria-label', 'Minh họa dashboard nhân sự 21st-CRM, cuộn ngang để xem đầy đủ');
    oldDemo.setAttribute('role', 'region');
    oldDemo.innerHTML = dashboard;
    if (oldDemo.nextElementSibling) {
      oldDemo.nextElementSibling.textContent = 'Minh họa giao diện 21st-CRM HR BlockBot · Nội dung mẫu theo tài liệu dự án · Cuộn ngang trên màn hình nhỏ';
    }
  }

  // Section 1: Capabilities tags
  if (sections[1]) {
    sections[1].innerHTML = `<div class="guta-container guta-capabilities">${label('PHẠM VI NGHIỆP VỤ')}<div><span>Hồ sơ nhân sự</span><span>Vòng đời đề tài</span><span>Chatbot tiếng Việt</span><span>Gợi ý phân công</span><span>Đánh giá KPI</span><span>Báo cáo &amp; nhắc hạn</span></div></div>`;
  }

  // Section 2: Features
  if (sections[2]) {
    sections[2].id = 'features';
    sections[2].innerHTML = section('TỪ DỮ LIỆU ĐẾN QUYẾT ĐỊNH', 'Bớt hỏi lại. Có chỗ để đối chiếu.', 'Mỗi thông tin đi cùng một việc cần làm, thay vì nằm rải rác trong file và tin nhắn.', `<div class="guta-grid-three">${card('Biết hồ sơ nào phù hợp', 'Tập hợp kỹ năng, cấp bậc và lịch sử tham gia công việc để người quản lý có cơ sở lựa chọn.', `<div class="guta-mini"><span>HỒ SƠ NHÂN SỰ</span><strong>Kỹ năng → Yêu cầu công việc</strong><p>Cấp bậc là dữ liệu, không phải quyền truy cập.</p></div>`)}${card('Biết việc đang ở đâu', 'Theo dõi từng bước từ giao việc đến nghiệm thu. Báo cáo bị từ chối phải có lý do để người thực hiện sửa đúng chỗ.', `<div class="guta-mini"><span>TRẠNG THÁI CÔNG VIỆC</span><strong>Đang thực hiện → Chờ duyệt</strong><p>Giữ lịch sử, không chỉ ghi trạng thái cuối.</p></div>`)}${card('Biết vì sao ra điểm số', 'Đối chiếu kết quả, nhận xét và điểm KPI. Mọi hiệu chỉnh của quản lý cần lý do và người thực hiện.', `<div class="guta-mini"><span>CĂN CỨ ĐÁNH GIÁ</span><strong>Kết quả + Nhận xét + Lịch sử</strong><p>AI hỗ trợ; quyết định không bị giấu sau một con số.</p></div>`)}</div>`);
  }

  // Section 3: Solution
  if (sections[3]) {
    sections[3].id = 'solution';
    sections[3].innerHTML = section('MỘT VÒNG VIỆC, HAI CỬA VÀO', 'Từ giao việc đến nghiệm thu.', 'Dashboard giữ góc nhìn quản lý. Chatbot đưa việc tra cứu và báo cáo về cuộc hội thoại hằng ngày.', `<div class="guta-flow">${flow.map((s,i)=>`<div><span>0${i+1}</span><strong>${s}</strong></div>`).join('')}</div><div class="guta-grid-two">${card('Quản lý trên dashboard', 'Tạo đề tài, xác định kỹ năng, xem gợi ý phân công. Khi nhận báo cáo, đối chiếu kết quả rồi duyệt hoặc trả lại kèm lý do.', `<div class="guta-mini"><span>ĐIỂM KIỂM SOÁT</span><strong>Đúng người. Đúng trạng thái.</strong></div>`)}${card('Nhân viên làm việc qua chat', 'Tra cứu hồ sơ của mình, hỏi chính sách, xem KPI và gửi báo cáo. Thao tác ghi dữ liệu cần bước xác nhận.', `<div class="guta-mini"><span>VÍ DỤ CÂU HỎI</span><strong>“Tôi đang được giao những việc nào?”</strong></div>`)}</div>`);
  }

  // Section 4: Product / AI
  if (sections[4]) {
    sections[4].id = 'product';
    sections[4].innerHTML = section('AI CÓ VAI TRÒ CỤ THỂ', 'Gợi ý có lý do. Tra cứu có ngữ cảnh.', 'Đây là hướng thiết kế của dự án, không phải lời cam kết rằng mọi mô hình đã được kiểm chứng.', `<div class="guta-grid-two">${card('Phân công theo kỹ năng và khối lượng việc', 'PhoBERT là thành phần ngữ nghĩa trong thiết kế matching. Người quản lý xem độ phù hợp và tải công việc trước khi quyết định.', `<div class="guta-mini"><span>YÊU CẦU → GỢI Ý → NGƯỜI DUYỆT</span><strong>Không tự giao việc thay quản lý.</strong></div>`)}${card('Tra cứu chính sách bằng tiếng Việt', 'Hỏi theo tình huống thay vì dò nhiều file. Thiết kế chatbot ưu tiên câu trả lời bám tài liệu; chưa đủ thông tin thì hỏi lại.', `<div class="guta-mini"><span>HỎI → TRA CỨU → ĐỐI CHIẾU</span><strong>“Quy định nộp báo cáo ở đâu?”</strong></div>`)}</div>`);
  }

  // Section 5: Principles
  if (sections[5]) {
    sections[5].id = 'about';
    sections[5].innerHTML = section('THIẾT KẾ ĐỂ KIỂM TRA ĐƯỢC', 'Không cần tin một cách mù quáng.', 'Thay lời chứng thực chưa có bằng những nguyên tắc đã được ghi trong phạm vi dự án.', `<div class="guta-grid-three">${card('Phân quyền theo vai', 'Admin quản lý và phê duyệt. Employee làm việc với dữ liệu trong phạm vi được phép.')}${card('Xác nhận trước khi ghi', 'Giao việc, cập nhật hay gửi báo cáo đều cần người dùng kiểm tra trước khi xác nhận.')}${card('Giữ dấu vết thay đổi', 'Trạng thái đề tài, lý do từ chối và hiệu chỉnh KPI phải có căn cứ để truy lại.')}</div>`);
  }

  // Section 6: FAQs
  if (sections[6]) {
    sections[6].id = 'questions';
    const faqs = [
      ['HR BlockBot giải quyết việc gì?', 'Tập trung hồ sơ nhân sự, vòng đời đề tài, gợi ý phân công, tra cứu chính sách, KPI và báo cáo trong cùng một hệ thống.'],
      ['Dashboard và chatbot có dữ liệu riêng không?', 'Không. Theo thiết kế, hai giao diện chia sẻ một nguồn dữ liệu và cùng nghiệp vụ; khác nhau ở cách người dùng thao tác.'],
      ['AI có tự giao việc hay quyết định điểm KPI không?', 'Thiết kế đặt AI ở vai trò hỗ trợ. Quản lý xác nhận phân công; hiệu chỉnh KPI phải có lý do và lịch sử.'],
      ['Đây có phải dữ liệu Guta đang chạy thật không?', 'Không. Các công việc và hội thoại trên trang là nội dung minh họa giao diện; không phải dữ liệu vận hành hoặc kết quả AI đã đo.'],
      ['Hệ thống có xếp ca, tính lương hay duyệt nghỉ phép không?', 'Những nghiệp vụ đó không nằm trong phạm vi F1–F7 của khóa luận hiện tại. Trang này không giới thiệu chúng như chức năng đã có.'],
    ];
    sections[6].innerHTML = section('TRƯỚC KHI TRẢI NGHIỆM', 'Những điều cần rõ.', 'Phạm vi và giới hạn được nói ngay trên trang.', `<div class="guta-faq">${faqs.map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>`);
  }

  // CTA
  const ctaHeading = Array.from(root.querySelectorAll('h2')).find(h => h.textContent.includes('Stop waiting'));
  if (ctaHeading) {
    const wrapper = ctaHeading.parentElement;
    wrapper.innerHTML = `${label('HR BLOCKBOT × GUTA')}<h2>Đưa cuộc trao đổi<br>về đúng công việc.</h2><p class="guta-cta-copy">Xem cách hồ sơ, tiến độ và căn cứ đánh giá được đặt cạnh nhau.</p><a class="guta-cta" href="#guta-dashboard">Xem dashboard minh họa</a>`;
  }

  // Footer
  const footer = root.querySelector('footer');
  if (footer) {
    footer.innerHTML = `<div class="guta-container guta-footer"><strong>GUTA WORKSPACE <span>· HR BlockBot</span></strong><p>Dự án KLCN133 · Chatbot chuyển đổi số quản lý nhân sự</p><a href="#questions">Phạm vi &amp; câu hỏi</a></div>`;
  }

  // Navigation Links & Action Buttons (Folio gốc chỉ có đúng 2 nút: Login + Get Started)
  // Xóa nút thứ 3 ("Sign Up" / "Trải nghiệm") bị thừa làm chật navbar và đè chữ lên menu
  const navActionButtons = Array.from(root.querySelectorAll('header nav div.flex.w-full.flex-col a[data-slot="button"]'));
  if (navActionButtons.length >= 3) {
    // Nút ở giữa là Sign Up/Trải nghiệm
    navActionButtons[1].remove();
  }

  const navNames = {Features:'Nghiệp vụ', Solution:'Luồng làm việc', Pricing:'Trợ lý AI', About:'Nguyên tắc', Login:'Đăng nhập', 'Get Started':'Xem dashboard'};
  root.querySelectorAll('header nav a').forEach(a => {
    const text = a.textContent.trim();
    if (navNames[text]) a.textContent = navNames[text];
    if (a.getAttribute('href') === '#pricing') a.href = '#product';
    if (text === 'Get Started' || text === 'Xem dashboard') a.href = '#guta-dashboard';
  });

  // Clean up data-theme-toggle structure & icons
  const toggle = root.querySelector('[data-theme-toggle]');
  if (toggle) {
    toggle.className = 'relative inline-flex items-center rounded-full shrink-0';
    toggle.innerHTML = `<button type="button" class="relative rounded-full" aria-label="Light theme" title="Chuyển chế độ sáng"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg></button><button type="button" class="relative rounded-full" aria-label="Dark theme" title="Chuyển chế độ tối"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg></button>`;
  }
};
