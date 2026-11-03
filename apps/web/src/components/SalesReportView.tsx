import { useEffect, useRef, useState } from 'react';
import { SalesReportSchema, type SalesReport, type SalesReportQuery } from '@hr-blockbot/contracts';
import { requestJson } from '../services/api';
import { useAuthorization } from '../context/useAuthorization';
import './sales-report.css';

const channelNames: Record<string, string> = { IN_STORE: 'Tại cửa hàng', APP: 'Ứng dụng', SHOPEEFOOD: 'ShopeeFood', PARTNER: 'Đối tác' };
const paymentNames: Record<string, string> = { CASH: 'Tiền mặt', CARD: 'Thẻ', MOMO: 'MoMo', ZALOPAY: 'ZaloPay', VNPAY: 'VNPay' };
const statusNames: Record<string, string> = { COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy', REFUNDED: 'Đã hoàn tiền' };
const colors = ['#1788ef', '#16b99a', '#f5b334', '#ee7084', '#9376d9'];
const money = (n: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
const number = (n: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n);
const dateTime = (s: string) => new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(s));
const todayVn = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const shiftDay = (s: string, days: number) => new Date(Date.parse(s + 'T12:00:00Z') + days * 86400000).toISOString().slice(0, 10);
type Filters = Omit<SalesReportQuery, 'page'>;
const initial = (): Filters => ({ from: todayVn(), to: todayVn(), preset: 'today' });

function HourChart({ rows, average = false }: { rows: SalesReport['hourly']; average?: boolean }) {
  const [focus, setFocus] = useState<number | null>(null);
  const W = 700, H = 260, left = 62, top = 26, plotW = 568, plotH = 178, step = plotW / 24;
  const bars = rows.map(r => average ? r.averageOrderVnd ?? 0 : r.revenueVnd);
  const lines = rows.map(r => average ? r.averageItems ?? 0 : r.orders);
  const maxBar = Math.max(1, ...bars), maxLine = Math.max(1, ...lines);
  const segments: string[][] = [[]];
  rows.forEach((r, i) => { if (average && r.averageItems === null) { if (segments[segments.length - 1].length) segments.push([]); } else segments[segments.length - 1].push(`${left + step * (i + 0.5)},${top + plotH * (1 - lines[i] / maxLine)}`); });
  const selected = rows.find(r => r.hour === focus);
  return <div className="sales-hour-chart">
    <div className="sales-chart-legend"><span><i style={{ background: colors[0] }} />{average ? 'Giá trị đơn (đ)' : 'Doanh thu (đ)'}</span><span><i style={{ background: colors[1] }} />{average ? 'Số món / đơn' : 'Số đơn'}</span></div>
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={average ? 'Giá trị đơn và số món trung bình theo giờ Việt Nam' : 'Doanh thu và số đơn theo giờ Việt Nam'}>
      {[0, 1, 2, 3, 4].map(i => <g key={i}><line x1={left} x2={left + plotW} y1={top + plotH * i / 4} y2={top + plotH * i / 4} className="sales-grid-line" />
        <text x={left - 9} y={top + plotH * i / 4 + 4} textAnchor="end">{new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 }).format(maxBar * (1 - i / 4))}</text>
        <text x={left + plotW + 9} y={top + plotH * i / 4 + 4}>{number(maxLine * (1 - i / 4))}</text></g>)}
      {rows.map((r, i) => <g key={r.hour} tabIndex={0} role="group" aria-label={`${r.hour} giờ: ${average ? (r.averageOrderVnd === null ? 'chưa có đơn bán' : money(r.averageOrderVnd) + ', ' + number(r.averageItems ?? 0) + ' món mỗi đơn') : money(r.revenueVnd) + ', ' + r.orders + ' đơn'}`}
        onFocus={() => setFocus(r.hour)} onBlur={() => setFocus(null)} onMouseEnter={() => setFocus(r.hour)} onMouseLeave={() => setFocus(null)}>
        <rect x={left + step * i} y={top} width={step} height={plotH} fill={focus === r.hour ? 'var(--sales-hover)' : 'transparent'} />
        <rect x={left + step * i + 3} y={top + plotH * (1 - bars[i] / maxBar)} width={step - 6} height={plotH * bars[i] / maxBar} rx={2} fill={colors[0]} />
        {i % 3 === 0 && <text x={left + step * (i + 0.5)} y={top + plotH + 23} textAnchor="middle">{r.hour}h</text>}
      </g>)}
      {segments.filter(s => s.length).map((s, i) => <polyline key={i} points={s.join(' ')} fill="none" stroke={colors[1]} strokeWidth={2.5} pointerEvents="none" />)}
      {rows.map((r, i) => (!average || r.averageItems !== null) && <circle key={r.hour} cx={left + step * (i + 0.5)} cy={top + plotH * (1 - lines[i] / maxLine)} r={focus === r.hour ? 5 : 3} fill={colors[1]} pointerEvents="none" />)}
    </svg>
    <p className="sales-chart-readout" aria-live="polite">{selected ? <><strong>{selected.hour}:00–{selected.hour}:59</strong> · {average ? selected.averageOrderVnd === null ? 'Chưa có đơn bán trong giờ này' : `${money(selected.averageOrderVnd)} / đơn · ${number(selected.averageItems ?? 0)} món / đơn` : `${money(selected.revenueVnd)} · ${selected.orders} đơn`}</> : 'Di chuột hoặc dùng phím Tab để xem từng giờ · Giờ Việt Nam'}</p>
  </div>;
}

function Donut({ rows, names, label, onFilter }: { rows: { key: string; count: number }[]; names: Record<string, string>; label: string; onFilter: (key: string) => void }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  let cursor = 0;
  const stops = rows.map((r, i) => { const start = cursor; cursor += total ? r.count / total * 100 : 0; return `${colors[i % colors.length]} ${start}% ${cursor}%`; });
  return <div className="sales-distribution">
    <div className="sales-donut" role="img" aria-label={`${label}: ${rows.map(r => `${names[r.key]} ${r.count} đơn`).join(', ') || 'chưa có đơn bán'}`} style={{ background: total ? `conic-gradient(${stops.join(',')})` : 'var(--sales-line)' }}><div><strong>{number(total)}</strong><span>đơn bán</span></div></div>
    <ul>{rows.map((r, i) => <li key={r.key}><button type="button" onClick={() => onFilter(r.key)} title={`Lọc ${names[r.key]}`}><i style={{ background: colors[i % colors.length] }} /><span>{names[r.key]}</span><strong>{number(r.count)}</strong><small>{number(total ? r.count / total * 100 : 0)}%</small></button></li>)}</ul>
    {!total && <p>Chưa có đơn hoàn tất hoặc hoàn tiền.</p>}
  </div>;
}

export function SalesReportView() {
  const { can, summary: authorization } = useAuthorization();
  const [filters, setFilters] = useState<Filters>(initial), [dates, setDates] = useState(() => ({ from: todayVn(), to: todayVn() }));
  const [preset, setPreset] = useState('today'), [page, setPage] = useState(1), [reload, setReload] = useState(0);
  const [report, setReport] = useState<SalesReport | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<SalesReport['orders'][number] | null>(null);
  const dialog = useRef<HTMLDialogElement>(null), orderTrigger = useRef<HTMLButtonElement | null>(null);
  const [storeOptions, setStoreOptions] = useState<SalesReport['stores']>([]);
  const authKey = JSON.stringify(authorization), queryKey = JSON.stringify({ ...filters, page });
  useEffect(() => { setStoreOptions([]); }, [authKey]);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError(''); setLoading(true); setSelected(null);
    if (!can('dashboard.read')) { setStoreOptions([]); setLoading(false); setError('Bạn chưa có quyền xem báo cáo bán hàng.'); return; }
    const q = new URLSearchParams(Object.entries({ ...filters, page }).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]));
    requestJson<unknown>('/dashboard/sales?' + q, { signal: controller.signal }).then(raw => {
      if (controller.signal.aborted) return;
      const r = SalesReportSchema.parse(raw); setReport(r); setStoreOptions(r.stores);
    }).catch(e => { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Không tải được báo cáo.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [queryKey, reload, authKey]);
  useEffect(() => {
    if (selected && dialog.current && !dialog.current.open) dialog.current.showModal();
    if (!selected && dialog.current?.open) dialog.current.close();
  }, [selected]);
  const update = (patch: Partial<Filters>) => { setFilters(f => ({ ...f, ...patch })); setPage(1); };
  const choosePreset = (key: string) => {
    const today = todayVn(); let from = today, to = today;
    if (key === 'yesterday') from = to = shiftDay(today, -1);
    if (key === 'week') from = shiftDay(today, -((new Date(today + 'T12:00:00Z').getUTCDay() + 6) % 7));
    if (key === 'month') from = today.slice(0, 8) + '01';
    setPreset(key); setDates({ from, to }); update({ from, to, preset: key as Filters['preset'] });
  };
  const closeOrder = () => { dialog.current?.close(); setSelected(null); orderTrigger.current?.focus(); };
  const cards = report?.summary ? [
    { key: 'totalOrders', label: 'Tổng đơn hàng', value: number(report.summary.totalOrders), sub: 'Tất cả trạng thái', icon: '▤' },
    { key: 'cancelledOrders', label: 'Đơn hủy', value: number(report.summary.cancelledOrders), sub: `${number(report.summary.totalOrders ? report.summary.cancelledOrders / report.summary.totalOrders * 100 : 0)}% tổng đơn`, icon: '×' },
    { key: 'externalOrders', label: 'Đơn App & đối tác', value: number(report.summary.externalOrders), sub: 'Ứng dụng, ShopeeFood, đối tác', icon: '↗' },
    { key: 'revenueVnd', label: 'Doanh thu thuần', value: money(report.summary.revenueVnd), sub: 'Sau giảm giá và hoàn tiền', icon: '₫' },
  ] as const : [];
  return <section className="sales-report" aria-labelledby="sales-title" aria-busy={loading}>
    <header className="sales-heading"><div><p className="sales-eyebrow">GUTA · BÁO CÁO VẬN HÀNH</p><h1 id="sales-title">Báo cáo bán hàng</h1><p>Theo dõi đơn hàng và doanh thu của cửa hàng.</p></div>
      <button className="sales-refresh" type="button" onClick={() => setReload(r => r + 1)} disabled={loading}>↻ <span>Cập nhật</span></button></header>
    <div className="sales-filter-bar">
      <label className="sales-store-label">Cửa hàng<select aria-label="Cửa hàng báo cáo" value={filters.storeId ?? ''} onChange={e => update({ storeId: e.target.value || undefined })}>
        <option value="">{storeOptions.length === 1 ? storeOptions[0].name : 'Tất cả cửa hàng được cấp'}</option>
        {storeOptions.length !== 1 && storeOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select></label>
      <form className="sales-date-form" onSubmit={e => { e.preventDefault(); setPreset('custom'); update({ from: dates.from, to: dates.to, preset: 'custom' }); }}>
        <label>Từ ngày<input aria-label="Từ ngày" type="date" value={dates.from} required max={todayVn()} onChange={e => setDates(d => ({ ...d, from: e.target.value }))} /></label><span aria-hidden="true">→</span>
        <label>Đến ngày<input aria-label="Đến ngày" type="date" value={dates.to} required min={dates.from} max={todayVn()} onChange={e => setDates(d => ({ ...d, to: e.target.value }))} /></label>
        <button type="submit">Áp dụng</button>
      </form>
    </div>
    <div className="sales-period-tabs" role="group" aria-label="Khoảng thời gian báo cáo">{[['yesterday', 'Hôm qua'], ['today', 'Hôm nay'], ['week', 'Tuần này'], ['month', 'Tháng này']].map(([key, label]) => <button key={key} type="button" aria-pressed={preset === key} onClick={() => choosePreset(key)}>{label}</button>)}<span>Giờ Việt Nam</span></div>
    <div className="sales-order-filters">
      <label>Kênh bán<select aria-label="Lọc kênh bán" value={filters.channel ?? ''} onChange={e => update({ channel: e.target.value as Filters['channel'] || undefined })}><option value="">Tất cả kênh bán</option>{Object.entries(channelNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Thanh toán<select aria-label="Lọc thanh toán" value={filters.paymentMethod ?? ''} onChange={e => update({ paymentMethod: e.target.value as Filters['paymentMethod'] || undefined })}><option value="">Tất cả thanh toán</option>{Object.entries(paymentNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      <label>Trạng thái<select aria-label="Lọc trạng thái" value={filters.status ?? ''} onChange={e => update({ status: e.target.value as Filters['status'] || undefined })}><option value="">Tất cả trạng thái</option>{Object.entries(statusNames).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      {(filters.channel || filters.paymentMethod || filters.status) && <button type="button" className="sales-text-button" onClick={() => update({ channel: undefined, paymentMethod: undefined, status: undefined })}>Bỏ lọc đơn hàng</button>}
    </div>
    {loading && <div className="sales-empty" role="status"><span className="sales-loading-dot" />Đang tổng hợp báo cáo…</div>}
    {error && <div className="sales-error" role="alert">{error}<button type="button" onClick={() => setReload(r => r + 1)}>Thử lại</button></div>}
    {!loading && !error && report && !report.summary && <div className="sales-empty" role="status"><strong>Chưa có số liệu báo cáo</strong><p>{report.reason}</p><p>Chọn ngày hoặc điều chỉnh bộ lọc để xem dữ liệu.</p></div>}
    {!loading && !error && report?.summary && <>
      <div className="sales-cards">{cards.map(c => { const delta = report.comparison.changes[c.key], good = delta !== null && (c.key === 'cancelledOrders' ? delta <= 0 : delta >= 0);
        return <article className="sales-card" key={c.key}><div><span>{c.label}</span><i aria-hidden="true">{c.icon}</i></div><strong data-testid={'sales-' + c.key}>{c.value}</strong><footer><span className={delta === null ? 'sales-muted' : good ? 'sales-positive' : 'sales-negative'}>{delta === null ? 'Chưa có tỷ lệ so sánh' : `${delta > 0 ? '↑' : delta < 0 ? '↓' : '→'} ${number(Math.abs(delta))}%`}</span><small>{c.sub}</small></footer></article>; })}</div>
      <p className="sales-comparison-note">So với {dateTime(report.comparison.fromAt)} – {dateTime(report.comparison.toAt)} · {preset === 'week' ? 'Cùng thời điểm tuần trước' : preset === 'month' ? 'Cùng thời điểm tháng trước' : 'Khoảng liền trước cùng độ dài'}{!report.comparison.available && ' · Chưa có dữ liệu đối chiếu'}.</p>
      <div className="sales-chart-grid">
        <article className="sales-panel"><div className="sales-panel-heading"><h2>Doanh thu theo giờ</h2><span>{money(report.summary.revenueVnd)}</span></div><HourChart rows={report.hourly} /></article>
        <article className="sales-panel"><div className="sales-panel-heading"><h2>Giá trị trung bình</h2><span>{report.summary.averageOrderVnd === null ? '—' : money(report.summary.averageOrderVnd) + ' / đơn'}</span></div><HourChart rows={report.hourly} average /><p className="sales-footnote">Tính trên đơn hoàn tất và hoàn tiền; không gồm đơn hủy.</p></article>
        <article className="sales-panel"><div className="sales-panel-heading"><h2>Phân loại đơn theo kênh</h2><span>Bấm chú giải để lọc</span></div><Donut rows={report.channels} names={channelNames} label="Kênh bán" onFilter={k => update({ channel: k as Filters['channel'] })} /><p className="sales-footnote">Đơn hoàn tất và hoàn tiền, không gồm đơn hủy.</p></article>
        <article className="sales-panel"><div className="sales-panel-heading"><h2>Phương thức thanh toán</h2><span>Bấm chú giải để lọc</span></div><Donut rows={report.payments} names={paymentNames} label="Thanh toán" onFilter={k => update({ paymentMethod: k as Filters['paymentMethod'] })} /><p className="sales-footnote">Số đơn theo phương thức ghi nhận, không phải số tiền đã đối soát.</p></article>
      </div>
      <details className="sales-hour-data sales-panel"><summary>Xem bảng số liệu theo giờ</summary><div className="sales-table-scroll"><table><thead><tr><th>Giờ</th><th>Số đơn</th><th>Doanh thu</th><th>Trung bình / đơn</th><th>Món / đơn</th></tr></thead><tbody>{report.hourly.map(r => <tr key={r.hour}><td>{r.hour}:00–{r.hour}:59</td><td>{number(r.orders)}</td><td>{money(r.revenueVnd)}</td><td>{r.averageOrderVnd === null ? '—' : money(r.averageOrderVnd)}</td><td>{r.averageItems === null ? '—' : number(r.averageItems)}</td></tr>)}</tbody></table></div></details>
      <article className="sales-panel sales-orders"><div className="sales-panel-heading"><div><h2>Danh sách đơn hàng</h2><p>{number(report.paging.totalItems)} đơn trong bộ lọc hiện tại</p></div><span>Giảm giá: {money(report.summary.discountVnd)} · Hoàn tiền: {money(report.summary.refundVnd)}</span></div>
        <div className="sales-table-scroll"><table><thead><tr><th>Đơn hàng / Thời gian</th><th>Cửa hàng</th><th>Kênh bán</th><th>Thanh toán</th><th>Trạng thái</th><th>Doanh thu thuần</th></tr></thead><tbody>{report.orders.map(o => <tr key={o.id}><td><button type="button" className="sales-order-link" onClick={e => { orderTrigger.current = e.currentTarget; setSelected(o); }}>{o.orderId}</button><small>{dateTime(o.orderedAt)}</small></td><td>{o.storeName}</td><td>{channelNames[o.channel]}</td><td>{paymentNames[o.paymentMethod]}</td><td><span className={'sales-status sales-status-' + o.status.toLowerCase()}>{statusNames[o.status]}</span></td><td className="sales-amount">{money(o.netRevenueVnd)}</td></tr>)}</tbody></table></div>
        <nav className="sales-pagination" aria-label="Trang đơn hàng"><span>Trang {page} / {Math.max(1, report.paging.totalPages)}</span><button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Trước</button><button type="button" disabled={page >= report.paging.totalPages} onClick={() => setPage(p => p + 1)}>Sau →</button></nav>
      </article>
      <p className="sales-updated">Cập nhật lúc {dateTime(report.asOf)} · Doanh thu thuần không bao gồm đơn hủy.</p>
    </>}
    <dialog ref={dialog} className="sales-order-dialog" aria-labelledby="sales-order-title" onCancel={e => { e.preventDefault(); closeOrder(); }} onClick={e => { if (e.target === e.currentTarget) { const r = e.currentTarget.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) closeOrder(); } }}>
      {selected && <><header><div><p>CHI TIẾT ĐƠN HÀNG</p><h2 id="sales-order-title">{selected.orderId}</h2></div><button type="button" onClick={closeOrder} aria-label="Đóng chi tiết đơn hàng">×</button></header>
        <p>{selected.storeName}</p><p>{dateTime(selected.orderedAt)} · {statusNames[selected.status]}</p><p>{channelNames[selected.channel]} · {paymentNames[selected.paymentMethod]}</p>
        <div className="sales-table-scroll"><table><thead><tr><th>Món</th><th>SL</th><th>Đơn giá</th><th>Thành tiền</th></tr></thead><tbody>{selected.items.map((item, i) => <tr key={i}><td>{item.productName}</td><td>{item.quantity}</td><td>{money(item.unitPriceVnd)}</td><td>{money(item.lineTotalVnd)}</td></tr>)}</tbody></table></div>
        <dl><div><dt>Tạm tính</dt><dd>{money(selected.subtotalVnd)}</dd></div><div><dt>Giảm giá</dt><dd>−{money(selected.discountVnd)}</dd></div><div><dt>Hoàn tiền</dt><dd>−{money(selected.refundVnd)}</dd></div><div><dt>Doanh thu thuần{selected.status === 'CANCELLED' ? ' (đơn hủy)' : ''}</dt><dd>{money(selected.netRevenueVnd)}</dd></div></dl>
        <button className="sales-dialog-close" type="button" onClick={closeOrder}>Đóng</button></>}
    </dialog>
  </section>;
}
