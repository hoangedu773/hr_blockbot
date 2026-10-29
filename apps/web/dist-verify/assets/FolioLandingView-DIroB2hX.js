import{r,j as e}from"./index-BX109kYE.js";const J=({isOpen:T,isRestoringSession:v=!1,onClose:l,onLogin:C})=>{const g=r.useRef(null),[k,m]=r.useState(""),[L,s]=r.useState(""),[n,i]=r.useState(!1),[o,d]=r.useState(!1),[u,w]=r.useState(""),y=r.useRef(!1),h=o||v;if(r.useEffect(()=>{var q,b;if(!T)return;s(""),i(!1),w("");const c=document.activeElement,I=document.body.style.overflow;document.body.style.overflow="hidden",(b=(q=g.current)==null?void 0:q.querySelector('input[type="email"]'))==null||b.focus();const j=p=>{var G;if(p.key==="Escape"&&!y.current&&l(),p.key!=="Tab")return;const f=(G=g.current)==null?void 0:G.querySelectorAll("button:not(:disabled), input:not(:disabled)");if(!(f!=null&&f.length))return;const R=f[0],H=f[f.length-1];p.shiftKey&&document.activeElement===R?(p.preventDefault(),H.focus()):!p.shiftKey&&document.activeElement===H&&(p.preventDefault(),R.focus())};return document.addEventListener("keydown",j),()=>{document.removeEventListener("keydown",j),document.body.style.overflow=I,c==null||c.focus()}},[T,l]),!T)return null;const B=async c=>{if(c.preventDefault(),!(h||y.current)){y.current=!0,d(!0),w("");try{await C({email:k.trim(),password:L}),s(""),l()}catch(I){w(I instanceof Error?I.message:"Chưa thể đăng nhập. Vui lòng thử lại.")}finally{y.current=!1,d(!1)}}};return e.jsx("div",{id:"auth-modal",role:"dialog","aria-modal":"true","aria-labelledby":"auth-modal-title",onMouseDown:c=>{c.target===c.currentTarget&&!y.current&&l()},style:{position:"fixed",inset:0,zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:16,background:"rgba(0,0,0,.72)",backdropFilter:"blur(10px)"},children:e.jsxs("div",{ref:g,style:{width:"100%",maxWidth:420,maxHeight:"90dvh",overflowY:"auto",border:"1px solid #333",borderRadius:20,background:"#171717",color:"#f5f5f5",padding:24,boxShadow:"0 24px 64px rgba(0,0,0,.4)",colorScheme:"dark",fontFamily:"'Geist', system-ui, sans-serif"},children:[e.jsxs("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12},children:[e.jsx("span",{style:{fontSize:12,letterSpacing:".12em",fontWeight:600,color:"#b4b4b4"},children:"GUTA WORKSPACE"}),e.jsx("button",{type:"button","aria-label":"Đóng đăng nhập",disabled:o,onClick:l,style:{background:"transparent",color:"#b4b4b4",border:0,padding:8,minHeight:44,cursor:"pointer",fontSize:13},children:"Đóng"})]}),e.jsx("h2",{id:"auth-modal-title",style:{margin:"20px 0 8px",fontSize:24,fontWeight:600,color:"#f5f5f5"},children:"Đăng nhập Guta Workspace"}),e.jsx("p",{style:{margin:"0 0 24px",fontSize:14,lineHeight:1.6,color:"#b4b4b4"},children:"Sử dụng tài khoản được cấp để truy cập không gian làm việc."}),e.jsxs("form",{onSubmit:B,"aria-busy":h,style:{display:"flex",flexDirection:"column",gap:18},children:[u&&e.jsx("div",{id:"login-error",role:"alert",style:{padding:12,borderRadius:10,color:"#fecaca",background:"rgba(239,68,68,.1)",border:"1px solid rgba(239,68,68,.3)",fontSize:14},children:u}),e.jsxs("div",{children:[e.jsx("label",{htmlFor:"login-email",style:{display:"block",fontSize:14,marginBottom:8},children:"Email"}),e.jsx("input",{id:"login-email",name:"email",type:"email",required:!0,autoComplete:"username",maxLength:254,disabled:h,value:k,onChange:c=>{m(c.target.value),w("")},"aria-describedby":u?"login-error":void 0,style:{width:"100%",boxSizing:"border-box",border:"1px solid #404040",borderRadius:10,padding:"12px 14px",color:"#f5f5f5",background:"#111",fontSize:16}})]}),e.jsxs("div",{children:[e.jsx("label",{htmlFor:"login-password",style:{display:"block",fontSize:14,marginBottom:8},children:"Mật khẩu"}),e.jsxs("div",{style:{display:"flex",alignItems:"center",border:"1px solid #404040",borderRadius:10,background:"#111"},children:[e.jsx("input",{id:"login-password",name:"password",type:n?"text":"password",required:!0,autoComplete:"current-password",disabled:h,value:L,onChange:c=>{s(c.target.value),w("")},"aria-describedby":u?"login-error":void 0,style:{minWidth:0,flex:1,border:0,borderRadius:10,padding:"12px 14px",color:"#f5f5f5",background:"transparent",fontSize:16}}),e.jsx("button",{type:"button",disabled:h,"aria-label":n?"Ẩn mật khẩu":"Hiện mật khẩu","aria-pressed":n,onClick:()=>i(!n),style:{color:"#d4d4d4",padding:12,minHeight:44,background:"transparent",border:0,cursor:"pointer",fontSize:13},children:n?"Ẩn":"Hiện"})]})]}),e.jsx("button",{type:"submit",disabled:h,style:{width:"100%",padding:"13px 16px",border:0,borderRadius:10,color:"#171717",background:"#f5f5f5",fontWeight:600,fontSize:15,opacity:h?.65:1,cursor:h?"wait":"pointer"},children:v?"Đang kiểm tra phiên…":o?"Đang đăng nhập…":"Đăng nhập"}),e.jsx("p",{style:{margin:0,color:"#b4b4b4",fontSize:12,lineHeight:1.6},children:"Nếu chưa có tài khoản hoặc quên mật khẩu, vui lòng liên hệ quản trị viên."})]})]})})},te=({className:T="",diagramSrc:v="/diagrams/chatbot-architecture.html"})=>{const l=r.useRef(null),C=r.useRef(null),[g,k]=r.useState(!0),m=r.useCallback(i=>{l.current&&l.current.contentWindow&&l.current.contentWindow.postMessage(i,"*")},[]),L=r.useCallback(()=>{m({type:"TOGGLE_MOTION"}),k(i=>!i)},[m]),s=r.useCallback(()=>{m({type:"FIT_VIEW"})},[m]),n=r.useCallback(()=>{const i=C.current;i&&typeof i.requestFullscreen=="function"?i.requestFullscreen().catch(()=>{window.open(v,"_blank","noopener,noreferrer")}):window.open(v,"_blank","noopener,noreferrer")},[v]);return r.useEffect(()=>{const i=o=>{if(l.current&&o.source!==l.current.contentWindow)return;const d=o.data;!d||typeof d!="object"||(d.type==="DIAGRAM_MOTION_CHANGE"?typeof d.state=="string"&&k(d.state==="play"):d.type==="DIAGRAM_READY"&&m({type:"GET_STATE"}))};return window.addEventListener("message",i),()=>window.removeEventListener("message",i)},[m]),e.jsx("section",{className:`py-20 md:py-28 relative ${T}`,id:"solution",children:e.jsxs("div",{className:"guta-container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl",children:[e.jsxs("header",{className:"guta-section-head text-center max-w-3xl mx-auto mb-10",children:[e.jsx("span",{className:"inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-3",children:"KIẾN TRÚC & LUỒNG XỬ LÝ AGENTIC"}),e.jsx("h2",{className:"text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground",children:"Luồng Vận Hành Tự Động 24/7"}),e.jsx("p",{className:"mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed",children:"Hệ thống tự động điều phối luồng hội thoại từ Ingress (Zalo, Telegram, Web), qua Bộ lọc Fast Rule Gate, Phân loại Jev AI, Vòng lặp Agent đến Gemini 3.8 Flash và Cổng xác thực con người 2 bước."})]}),e.jsxs("div",{ref:C,className:"workflow-diagram-card relative border border-emerald-500/20 bg-background/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl shadow-emerald-950/20 transition-all duration-300 hover:border-emerald-500/35",children:[e.jsxs("div",{className:"workflow-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 bg-emerald-950/40 border-b border-emerald-500/20 backdrop-blur-lg",children:[e.jsx("div",{className:"flex items-center gap-2",children:e.jsx("span",{className:`workflow-status-chip inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full transition-all duration-200 ${g?"bg-emerald-500/15 text-emerald-400 border border-emerald-500/30":"bg-muted/40 text-muted-foreground border border-border"}`,children:g?e.jsxs(e.Fragment,{children:[e.jsxs("span",{className:"relative flex h-2 w-2",children:[e.jsx("span",{className:"animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"}),e.jsx("span",{className:"relative inline-flex rounded-full h-2 w-2 bg-emerald-500"})]}),e.jsx("span",{className:"workflow-status-text",children:"🟢 Luồng tín hiệu: Đang chạy liên tục (Live Loop)"})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{className:"h-2 w-2 rounded-full bg-slate-400"}),e.jsx("span",{className:"workflow-status-text",children:"⏸ Luồng tín hiệu: Đã tạm dừng"})]})})}),e.jsxs("div",{className:"flex flex-wrap items-center gap-2",children:[e.jsx("button",{type:"button",onClick:s,className:"workflow-btn-fit px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors cursor-pointer",title:"Khớp khung hình sơ đồ (Fit View)","aria-label":"Khớp khung hình sơ đồ",children:"Khớp khung hình (Fit View)"}),e.jsxs("button",{type:"button",onClick:L,className:"workflow-btn-toggle px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer",title:"Tạm dừng / Tiếp tục luồng tín hiệu (Space)","aria-label":g?"Tạm dừng luồng":"Tiếp tục luồng",children:[e.jsx("span",{className:"workflow-toggle-icon",children:g?"⏸":"▶"}),e.jsx("span",{className:"workflow-toggle-text",children:g?"Tạm dừng":"Tiếp tục"})]}),e.jsxs("button",{type:"button",onClick:n,className:"workflow-btn-fullscreen px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer",title:"Mở toàn màn hình hoặc tab mới","aria-label":"Mở toàn màn hình mới",children:[e.jsx("span",{children:"⛶"}),e.jsx("span",{children:"Mở toàn màn hình mới"})]})]})]}),e.jsx("div",{className:"workflow-iframe-wrapper relative w-full h-[480px] sm:h-[560px] lg:h-[680px] bg-[#021a16] overflow-hidden",children:e.jsx("iframe",{ref:l,id:"workflow-diagram-iframe",src:v,title:"HR BlockBot - Chatbot & Agentic Architecture",className:"w-full h-full border-0 block",loading:"lazy",allow:"fullscreen"})})]})]})})},$=`<div class="relative flex min-h-svh flex-col overflow-x-hidden bg-background text-foreground antialiased folio-preview">

<div hidden=""></div><style>
:root {
  --bprogress-color: var(--color-primary);
  --bprogress-height: 2px;
  --bprogress-spinner-size: 18px;
  --bprogress-spinner-animation-duration: 400ms;
  --bprogress-spinner-border-size: 2px;
  --bprogress-box-shadow: 0 0 10px var(--color-primary), 0 0 5px var(--color-primary);
  --bprogress-z-index: 99999;
  --bprogress-spinner-top: 15px;
  --bprogress-spinner-bottom: auto;
  --bprogress-spinner-right: 15px;
  --bprogress-spinner-left: auto;
}

.bprogress {
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: var(--bprogress-z-index);
}

.bprogress .bar {
  background: var(--bprogress-color);
  position: fixed;
  z-index: var(--bprogress-z-index);
  top: 0;
  left: 0;
  width: 100%;
  height: var(--bprogress-height);
}

/* Fancy blur effect */
.bprogress .peg {
  display: block;
  position: absolute;
  right: 0;
  width: 100px;
  height: 100%;
  box-shadow: var(--bprogress-box-shadow);
  opacity: 1.0;
  transform: rotate(3deg) translate(0px, -4px);
}

/* Remove these to get rid of the spinner */
.bprogress .spinner {
  display: block;
  position: fixed;
  z-index: var(--bprogress-z-index);
  top: var(--bprogress-spinner-top);
  bottom: var(--bprogress-spinner-bottom);
  right: var(--bprogress-spinner-right);
  left: var(--bprogress-spinner-left);
}

.bprogress .spinner-icon {
  width: var(--bprogress-spinner-size);
  height: var(--bprogress-spinner-size);
  box-sizing: border-box;
  border: solid var(--bprogress-spinner-border-size) transparent;
  border-top-color: var(--bprogress-color);
  border-left-color: var(--bprogress-color);
  border-radius: 50%;
  -webkit-animation: bprogress-spinner var(--bprogress-spinner-animation-duration) linear infinite;
  animation: bprogress-spinner var(--bprogress-spinner-animation-duration) linear infinite;
}

.bprogress-custom-parent {
  overflow: hidden;
  position: relative;
}

.bprogress-custom-parent .bprogress .spinner,
.bprogress-custom-parent .bprogress .bar {
  position: absolute;
}

.bprogress .indeterminate {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: var(--bprogress-height);
  overflow: hidden;
}

.bprogress .indeterminate .inc,
.bprogress .indeterminate .dec {
  position: absolute;
  top: 0;
  height: 100%;
  background-color: var(--bprogress-color);
}

.bprogress .indeterminate .inc {
  animation: bprogress-indeterminate-increase 2s infinite;
}

.bprogress .indeterminate .dec {
  animation: bprogress-indeterminate-decrease 2s 0.5s infinite;
}

@-webkit-keyframes bprogress-spinner {
  0%   { -webkit-transform: rotate(0deg); transform: rotate(0deg); }
  100% { -webkit-transform: rotate(360deg); transform: rotate(360deg); }
}

@keyframes bprogress-spinner {
  0%   { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes bprogress-indeterminate-increase {
  from { left: -5%; width: 5%; }
  to { left: 130%; width: 100%; }
}

@keyframes bprogress-indeterminate-decrease {
  from { left: -80%; width: 80%; }
  to { left: 110%; width: 10%; }
}
</style><!--$!--><template data-dgst="BAILOUT_TO_CLIENT_SIDE_RENDERING"></template><header vt-update="auto"><nav data-state="false" class="fixed z-20 w-full px-2"><div class="mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12"><div class="relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4"><div class="flex w-full justify-between lg:w-auto">
<a aria-label="Guta Workspace home" class="flex items-center gap-2.5" href="#">
  <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" class="size-8 object-contain" />
  <div class="flex flex-col">
    <div class="flex items-center gap-1.5 leading-none">
      <span class="font-black tracking-wider text-foreground text-base">GUTA</span>
      <span class="font-semibold tracking-tight text-foreground text-base">WORKSPACE</span>
    </div>
    <span class="text-[9px] font-medium tracking-wide text-muted-foreground uppercase mt-0.5">HR &amp; Smart Shift AI</span>
  </div>
</a>
<button type="button" aria-label="Open Menu" class="-m-2.5 -mr-4 relative z-20 block cursor-pointer p-2.5 lg:hidden"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-menu m-auto size-6 duration-200 in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0"><line x1="4" x2="20" y1="12" y2="12"></line><line x1="4" x2="20" y1="6" y2="6"></line><line x1="4" x2="20" y1="18" y2="18"></line></svg><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-x -rotate-180 absolute inset-0 m-auto size-6 scale-0 opacity-0 duration-200 in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100"><path d="M18 6 6 18"></path><path d="m6 6 12 12"></path></svg></button></div><div class="absolute inset-0 m-auto hidden size-fit lg:block"><ul class="flex gap-8 text-sm"><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#features">Nghiệp vụ</a></li><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#solution">Luồng làm việc</a></li><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#product">Trợ lý AI</a></li><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#about">Nguyên tắc</a></li></ul></div><div class="mb-6 hidden w-full flex-wrap items-stretch justify-end gap-6 rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 in-data-[state=active]:block md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:items-center lg:gap-6 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none lg:in-data-[state=active]:flex dark:shadow-none dark:lg:bg-transparent"><div class="lg:hidden"><ul class="space-y-6 text-base"><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#features">Nghiệp vụ</a></li><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#solution">Luồng làm việc</a></li><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#product">Trợ lý AI</a></li><li><a class="block text-muted-foreground duration-150 hover:text-accent-foreground" href="#about">Nguyên tắc</a></li></ul></div><div class="flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto"><div class="relative inline-flex items-center rounded-full shrink-0" data-theme-toggle="" aria-label="Toggle Theme"><button type="button" class="relative rounded-full" aria-label="Light theme" title="Chuyển chế độ sáng"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-sun"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2"></path><path d="M12 20v2"></path><path d="m4.93 4.93 1.41 1.41"></path><path d="m17.66 17.66 1.41 1.41"></path><path d="M2 12h2"></path><path d="M20 12h2"></path><path d="m6.34 17.66-1.41 1.41"></path><path d="m19.07 4.93-1.41 1.41"></path></svg></button><button type="button" class="relative rounded-full" aria-label="Dark theme" title="Chuyển chế độ tối"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-moon"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path></svg></button></div><a data-slot="button" class="inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-border dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-1.5 rounded-md px-3 has-[&gt;svg]:px-2.5 w-full sm:w-auto" href="#login" role="button" aria-label="Get Started">Đăng nhập</a><a data-slot="button" class="shrink-0 items-center justify-center whitespace-nowrap font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-8 gap-1.5 rounded-md px-3 has-[&gt;svg]:px-2.5 inline-flex" href="#guta-dashboard">Xem dashboard</a></div></div></div></div></nav></header><main class="flex min-h-screen flex-col" vt-update="auto"><div class="min-h-screen"><main class="relative z-10 overflow-hidden border-b"><section class="relative bg-background"><div class="container relative mx-auto"><div class="border-border border-dashed bg-background sm:border-x"><div class="pt-24 pb-20 md:pt-32 lg:pt-40"><div class="relative z-10 mx-auto grid max-w-5xl items-center gap-4 px-6 text-center"><div class="relative inline-flex justify-self-center"><div class="-inset-[1px] absolute overflow-hidden rounded-full"><div class="absolute inset-0 animate-spin-slow" style="background:conic-gradient(from 0deg, transparent 0%, transparent 70%, #a1a1aa 85%, #10b981 95%, transparent 100%)"></div></div><div class="relative rounded-full border border-border/50 bg-background"><a class="block" href="#"><span class="relative z-10 flex items-center gap-1 px-4 py-1.5 font-medium text-foreground text-sm">F&amp;B Workforce Intelligence — Next-Gen HR</span></a></div></div><h1 class="text-balance font-semibold text-4xl sm:text-5xl lg:text-6xl">Quản Trị Nhân Sự &amp; Phân Ca Tự Động</h1><div class="mx-auto max-w-2xl"><p class="mb-6 text-balance text-lg text-muted-foreground lg:text-xl">Guta Workspace tự động hóa xếp ca 24H, đối soát chấm công và trợ lý AI điều phối nhân sự cho chuỗi cà phê — nhanh chóng, không sai sót ca làm.</p><div class="flex items-center justify-center gap-3"><a data-slot="button" class="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3 shadow-md" href="#guta-dashboard" role="button" aria-label="Khám phá dashboard">Khám phá dashboard</a><a data-slot="button" class="inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 border bg-background hover:bg-accent hover:text-accent-foreground dark:border-border dark:bg-input/30 dark:hover:bg-input/50 h-9 px-4 py-2 has-[&gt;svg]:px-3 shadow-sm" href="#solution">Xem luồng làm việc</a></div><p class="mt-4 text-muted-foreground text-xs">Bản giới thiệu giao diện Guta Workspace · Quản trị chuỗi F&B 45 chi nhánh TP.HCM</p></div></div><div class="relative pt-12 lg:pt-20"><div class="relative mx-auto max-w-7xl px-1 md:px-0 lg:px-6"><div class="-inset-20 sm:-inset-28 lg:-inset-40 pointer-events-none absolute opacity-60" style="mask-image:linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),
                        linear-gradient(to bottom, transparent 0%, black 30%, black 100%);-webkit-mask-image:linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),
                        linear-gradient(to bottom, transparent 0%, black 30%, black 100%);mask-composite:intersect;-webkit-mask-composite:source-in"><img alt="" aria-hidden="true" fetchpriority="high" width="2000" height="1333" decoding="async" data-nimg="1" class="size-full object-cover" style="color:transparent" sizes="(max-width: 768px) 100vw, (max-width: 1280px) 1280px, 1600px" src="/assets/folio/images/dashboard-bg.jpg"></div><div class="relative z-10" style="mask-image:linear-gradient(to bottom, black 0%, black 92%, transparent 100%);-webkit-mask-image:linear-gradient(to bottom, black 0%, black 92%, transparent 100%)"><div class="guta-demo-scroll" tabindex="0" aria-label="Minh họa dashboard nhân sự 21st-CRM, cuộn ngang để xem đầy đủ" role="region" id="dashboard-preview">
  <div class="crm-app" id="guta-dashboard" role="region" aria-label="Minh họa 21st-CRM Dashboard nhân sự HR BlockBot">
    <!-- Topbar (21st-crm header) -->
    <header class="crm-topbar">
      <div class="crm-topbar-left">
        <div class="crm-brand-icon">G</div>
        <div class="crm-brand-meta">
          <span class="crm-brand-title">GUTA WORKSPACE</span>
          <span class="crm-brand-sub">Guta CRM · Quản trị Phân Ca &amp; Nhân Sự Chuỗi</span>
        </div>
      </div>
      <div class="crm-search-bar" role="search">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.3-4.3"></path></svg>
        <span>Tìm kiếm chi nhánh, barista, ca trực...</span>
        <kbd>⌘K</kbd>
      </div>
      <div class="crm-topbar-actions">
        <span class="crm-role-badge">Admin HR</span>
        <button type="button" class="crm-btn crm-btn-outline"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg> Bộ lọc</button>
        <button type="button" class="crm-btn crm-btn-primary">+ Tạo ca trực</button>
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
        <div class="crm-metric-head"><span>LỊCH TRÌNH VẬN HÀNH CA</span><span class="crm-tag-info">5 Trạng thái</span></div>
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
                <span class="crm-pill crm-pill-gray">Ca Sáng</span>
                <span class="crm-pill crm-pill-blue">SOP-01</span>
              </div>
              <h4 class="crm-card-title">Định biên nhân sự ca sáng</h4>
              <p class="crm-card-desc">Thiết lập định biên Barista và nhân sự phụ ca cho 45 cửa hàng.</p>
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
                <span class="crm-pill crm-pill-gray">SOP-04</span>
              </div>
              <h4 class="crm-card-title">Rà soát quy chế ca 24H</h4>
              <p class="crm-card-desc">Cập nhật quy định chấm công ZKTeco và phụ cấp ca đêm.</p>
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
                <span class="crm-pill crm-pill-gray">SOP-09</span>
              </div>
              <h4 class="crm-card-title">Chatbot nhắc ca &amp; chốt két</h4>
              <p class="crm-card-desc">Gửi thông báo vào ca và nhắc hạn chốt quỹ két tự động.</p>
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
            <span class="crm-stage-count">1</span>
          </div>
          <div class="crm-cards-list">
            <div class="crm-card crm-card-highlight">
              <div class="crm-card-tags">
                <span class="crm-pill crm-pill-blue">Cần đối chiếu</span>
                <span class="crm-pill crm-pill-gray">SOP-05</span>
              </div>
              <h4 class="crm-card-title">Đối soát bàn giao két ca</h4>
              <p class="crm-card-desc">Đã gửi biên bản chốt quỹ két qua Chatbot. Chờ Quản lý đối soát.</p>
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
                <span class="crm-pill crm-pill-green">Đã chốt két</span>
                <span class="crm-pill crm-pill-gray">Chuẩn 100%</span>
              </div>
              <h4 class="crm-card-title">Nghiệm thu ca làm &amp; bàn giao</h4>
              <p class="crm-card-desc">Đã đồng bộ chấm công ZKTeco và khớp dữ liệu két ca.</p>
              <div class="crm-card-meta">
                <div class="crm-avatar">DE</div>
                <span>Đặng Thu Em (Senior)</span>
              </div>
              <div class="crm-card-footer">
                <span class="crm-date">Xong: 22/10</span>
                <span class="crm-status-text">Đã chốt két</span>
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
            <p>“Làm thế nào để tôi báo cáo chốt quỹ két và đổi ca trực?”</p>
          </div>
          <div class="crm-chat-msg crm-msg-bot">
            <small>Trợ lý phản hồi (SOP-05 / Vận hành ca):</small>
            <p>Chọn ca trực phụ trách, đính kèm biên bản két và bấm xác nhận. Dữ liệu sẽ chuyển sang cột <strong>Chờ duyệt</strong> trên Dashboard của Quản lý.</p>
            <div class="crm-msg-cite">Quy định vận hành F&B: Xác nhận trước khi chốt két</div>
          </div>

          <div class="crm-recommendation-box">
            <div class="crm-rec-label">GỢI Ý PHÂN CÔNG PHOBERT</div>
            <h5>Ca trực: Tăng cường Barista giờ cao điểm</h5>
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
          <span>Minh họa 2 vai (Quản trị &amp; Barista) · Hệ thống Guta F&B</span>
        </div>
      </aside>
    </div>
  </div></div><p>Minh họa giao diện 21st-CRM HR BlockBot · Dữ liệu mô phỏng vận hành chuỗi cà phê · Cuộn ngang trên màn hình nhỏ</p></div></div></div></div></div></div></section></main><section class="py-14 sm:py-20 border-b border-border/30">
    <div class="guta-container pb-6 border-b border-border/20 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      <span class="text-primary font-bold">ĐỐI TÁC CUNG ỨNG F&B:</span>
      <div class="flex flex-wrap items-center gap-5">
        <span>Vinamilk</span>
        <span>•</span>
        <span>La Marzocco</span>
        <span>•</span>
        <span>Dalatmilk</span>
        <span>•</span>
        <span>Monin</span>
        <span>•</span>
        <span>Torani</span>
        <span>•</span>
        <span>OATLY</span>
        <span>•</span>
        <span>Rich's</span>
      </div>
    </div>
    <div class="guta-container guta-capabilities pt-6"><span class="guta-label">PHẠM VI NGHIỆP VỤ</span><div><span>Hồ sơ nhân sự</span><span>Vận hành ca trực</span><span>Chatbot tiếng Việt</span><span>Gợi ý phân công</span><span>Đánh giá KPI</span><span>Báo cáo &amp; nhắc hạn</span></div></div></section><section class="py-16 sm:py-20 md:py-28" id="features"><div class="guta-container"><header class="guta-section-head"><span class="guta-label">TỪ DỮ LIỆU ĐẾN QUYẾT ĐỊNH</span><h2>Bớt hỏi lại. Có chỗ để đối chiếu.</h2><p>Mỗi thông tin đi cùng một việc cần làm, thay vì nằm rải rác trong file và tin nhắn.</p></header><div class="guta-grid-three"><article class="guta-card"><div class="guta-mini"><span>HỒ SƠ NHÂN SỰ</span><strong>Kỹ năng → Yêu cầu công việc</strong><p>Cấp bậc là dữ liệu, không phải quyền truy cập.</p></div><h3>Biết hồ sơ nào phù hợp</h3><p>Tập hợp kỹ năng, cấp bậc và lịch sử tham gia công việc để người quản lý có cơ sở lựa chọn.</p></article><article class="guta-card"><div class="guta-mini"><span>TRẠNG THÁI CÔNG VIỆC</span><strong>Đang thực hiện → Chờ duyệt</strong><p>Giữ lịch sử, không chỉ ghi trạng thái cuối.</p></div><h3>Biết việc đang ở đâu</h3><p>Theo dõi từng bước từ mở ca đến chốt két. Báo cáo ca trực bị từ chối phải có lý do để nhân sự điều chỉnh đúng chỗ.</p></article><article class="guta-card"><div class="guta-mini"><span>CĂN CỨ ĐÁNH GIÁ</span><strong>Kết quả + Nhận xét + Lịch sử</strong><p>AI hỗ trợ; quyết định không bị giấu sau một con số.</p></div><h3>Biết vì sao ra điểm số</h3><p>Đối chiếu kết quả, nhận xét và điểm KPI. Mọi hiệu chỉnh của quản lý cần lý do và người thực hiện.</p></article></div></div></section><section class="py-20 md:py-28 relative" id="solution"><div class="guta-container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl"><header class="guta-section-head text-center max-w-3xl mx-auto mb-10"><span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-3">KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC</span><h2 class="text-3xl sm:text-4xl md:text-5xl font-extrabold tracking-tight text-foreground">Luồng Vận Hành Tự Động 24/7</h2><p class="mt-4 text-base sm:text-lg text-muted-foreground leading-relaxed">Hệ thống tự động điều phối luồng hội thoại từ Ingress (Zalo, Telegram, Web), qua Bộ lọc Fast Rule Gate, Phân loại Jev AI, Vòng lặp Agent đến Gemini 3.8 Flash và Cổng xác thực con người 2 bước.</p></header><div class="workflow-diagram-card relative border border-emerald-500/20 bg-background/80 backdrop-blur-md rounded-2xl overflow-hidden shadow-2xl shadow-emerald-950/20 transition-all duration-300 hover:border-emerald-500/35"><div class="workflow-toolbar flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 bg-emerald-950/40 border-b border-emerald-500/20 backdrop-blur-lg"><div class="flex items-center gap-2"><span class="workflow-status-chip inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"><span class="relative flex h-2 w-2"><span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span><span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span></span><span class="workflow-status-text">🟢 Luồng tín hiệu: Đang chạy liên tục (Live Loop)</span></span></div><div class="flex flex-wrap items-center gap-2"><button type="button" class="workflow-btn-fit px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors cursor-pointer" title="Khớp khung hình sơ đồ (Fit View)" aria-label="Khớp khung hình sơ đồ">Khớp khung hình (Fit View)</button><button type="button" class="workflow-btn-toggle px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer" title="Tạm dừng / Tiếp tục luồng tín hiệu (Space)" aria-label="Tạm dừng luồng"><span class="workflow-toggle-icon">⏸</span> <span class="workflow-toggle-text">Tạm dừng</span></button><a href="/diagrams/chatbot-architecture.html" target="_blank" rel="noopener noreferrer" class="workflow-btn-fullscreen px-3 py-1.5 text-xs font-medium rounded-lg border border-emerald-500/30 bg-emerald-950/40 text-emerald-300 hover:bg-emerald-900/50 hover:text-emerald-100 transition-colors inline-flex items-center gap-1.5 cursor-pointer" title="Mở toàn màn hình hoặc tab mới" aria-label="Mở toàn màn hình mới"><span>⛶</span> <span>Mở toàn màn hình mới</span></a></div></div><div class="workflow-iframe-wrapper relative w-full h-[480px] sm:h-[560px] lg:h-[680px] bg-[#021a16] overflow-hidden"><iframe id="workflow-diagram-iframe" src="/diagrams/chatbot-architecture.html" title="HR BlockBot - Chatbot &amp; Agentic Architecture" class="w-full h-full border-0 block" loading="lazy" allow="fullscreen"></iframe></div></div></div></section><section class="py-20 md:py-28" id="product"><div class="guta-container"><header class="guta-section-head"><span class="guta-label">AI CÓ VAI TRÒ CỤ THỂ</span><h2>Gợi ý có lý do. Tra cứu có ngữ cảnh.</h2><p>Hệ thống tối ưu theo quy trình chuỗi F&B thực tế, minh bạch mọi quyết định điều phối ca.</p></header><div class="guta-grid-two"><article class="guta-card"><div class="guta-mini"><span>YÊU CẦU → GỢI Ý → NGƯỜI DUYỆT</span><strong>Không tự giao việc thay quản lý.</strong></div><h3>Phân công theo kỹ năng và khối lượng việc</h3><p>PhoBERT là thành phần ngữ nghĩa trong thiết kế matching. Người quản lý xem độ phù hợp và tải công việc trước khi quyết định.</p></article><article class="guta-card"><div class="guta-mini"><span>HỎI → TRA CỨU → ĐỐI CHIẾU</span><strong>“Quy định nộp báo cáo ở đâu?”</strong></div><h3>Tra cứu chính sách bằng tiếng Việt</h3><p>Hỏi theo tình huống thay vì dò nhiều file. Thiết kế chatbot ưu tiên câu trả lời bám tài liệu; chưa đủ thông tin thì hỏi lại.</p></article></div></div></section><section class="py-20 md:py-28" id="about"><div class="guta-container"><header class="guta-section-head"><span class="guta-label">THIẾT KẾ ĐỂ KIỂM TRA ĐƯỢC</span><h2>Không cần tin một cách mù quáng.</h2><p>Quy trình điều phối chuẩn hóa, kiểm soát chặt chẽ chấm công máy ZKTeco và két ca.</p></header><div class="guta-grid-three"><article class="guta-card"><h3>Phân quyền theo vai</h3><p>Quản lý điều phối chi nhánh. Barista thao tác ca trực và đối soát két trong ca làm.</p></article><article class="guta-card"><h3>Xác nhận trước khi ghi</h3><p>Nhận ca, bàn giao quỹ két hay gửi cảnh báo đều cần xác nhận chính xác trước khi lưu.</p></article><article class="guta-card"><h3>Giữ dấu vết thay đổi</h3><p>Trạng thái điểm danh, lý do đi trễ và hiệu chỉnh công ca phải có nhật ký kiểm soát rõ ràng.</p></article></div></div></section><section class="bg-background py-16 md:py-24" id="questions"><div class="guta-container"><header class="guta-section-head"><span class="guta-label">TRƯỚC KHI TRẢI NGHIỆM</span><h2>Những điều cần rõ.</h2><p>Phạm vi và giới hạn được nói ngay trên trang.</p></header><div class="guta-faq"><details><summary>HR BlockBot giải quyết việc gì?</summary><p>Tập trung hồ sơ nhân sự, lịch phân ca 24/7, điều phối barista chéo, tra cứu quy chế, quỹ két và báo cáo trong cùng một hệ thống.</p></details><details><summary>Dashboard và chatbot có dữ liệu riêng không?</summary><p>Không. Theo thiết kế, hai giao diện chia sẻ một nguồn dữ liệu và cùng nghiệp vụ; khác nhau ở cách người dùng thao tác.</p></details><details><summary>AI có tự giao việc hay quyết định điểm KPI không?</summary><p>Thiết kế đặt AI ở vai trò hỗ trợ. Quản lý xác nhận phân công; hiệu chỉnh KPI phải có lý do và lịch sử.</p></details><details><summary>Đây có phải dữ liệu Guta đang chạy thật không?</summary><p>Không. Các công việc và hội thoại trên trang là nội dung minh họa giao diện; không phải dữ liệu vận hành hoặc kết quả AI đã đo.</p></details><details><summary>Hệ thống có xếp ca, tính lương hay duyệt nghỉ phép không?</summary><p>Hệ thống tập trung cốt lõi vào điều phối ca trực, điểm danh ZKTeco và quản trị két ca 45 chi nhánh. Các phân hệ tính lương và duyệt nghỉ phép tự động đang trong lộ trình tích hợp tiếp theo.</p></details></div></div></section></div></main><footer class="relative mt-12 overflow-hidden bg-background" vt-update="auto"><div class="guta-container guta-footer"><strong>GUTA WORKSPACE <span>· HR BlockBot</span></strong><p>Guta Workspace · Nền tảng điều hành nhân sự &amp; chuỗi cà phê F&B</p><a href="#questions">Phạm vi &amp; câu hỏi</a></div></footer><section aria-label="Notifications alt+T" tabindex="-1" aria-live="polite" aria-relevant="additions text" aria-atomic="false"></section>
<!-- AUTH MODAL -->



</div>`,ae=({onLogin:T,isAuthLoading:v=!1,onNotify:l})=>{const C=r.useRef(null),[g,k]=r.useState(!1),m=r.useCallback(()=>k(!1),[]),L=r.useRef(l);return L.current=l,r.useEffect(()=>{const s=C.current;if(!s)return;const n=s.querySelector('button[aria-label="Open Menu"]');let i=null;n&&(n.setAttribute("aria-expanded","false"),i=()=>{const t=n.closest("nav");if(!t)return;const a=t.getAttribute("data-state")!=="active";t.setAttribute("data-state",a?"active":"false"),n.setAttribute("aria-expanded",String(a))},n.addEventListener("click",i));const o=s.querySelector("nav"),d=()=>o==null?void 0:o.classList.toggle("nav-scrolled",window.scrollY>20);d(),window.addEventListener("scroll",d,{passive:!0});const u=o==null?void 0:o.querySelectorAll('a[href="#features"], a[href="#solution"], a[href="#product"], a[href="#about"]'),w=()=>{o==null||o.setAttribute("data-state","false"),n==null||n.setAttribute("aria-expanded","false")};u==null||u.forEach(t=>t.addEventListener("click",w));const y=s.querySelectorAll('a[href="#login"], a[href="#demo"], a[href="#crm"], button[data-auth-trigger]'),h=t=>{t.preventDefault(),k(!0)};y.forEach(t=>t.addEventListener("click",h));const B=s.querySelectorAll('a[href="#"], a[href=""]'),c=t=>t.preventDefault();B.forEach(t=>{var x;const a=((x=t.textContent)==null?void 0:x.trim().toLowerCase())||"";!a.includes("bắt đầu ngay")&&!a.includes("get started")&&!a.includes("xem dashboard")&&!a.includes("đăng nhập")&&t.addEventListener("click",c)}),s.querySelectorAll("button, a").forEach(t=>{var x;const a=((x=t.textContent)==null?void 0:x.trim().toLowerCase())||"";(a.includes("bắt đầu ngay")||a.includes("get started")||a.includes("xem dashboard")||a.includes("khám phá dashboard")||a.includes("đăng nhập")||t.classList.contains("crm-btn")||t.classList.contains("crm-mini-btn"))&&t.addEventListener("click",h)});const j=s.querySelectorAll('[data-slot="accordion-trigger"]'),q=t=>{const a=t.currentTarget,x=a.closest('[data-slot="accordion-item"]'),Z=x==null?void 0:x.querySelector('[data-slot="accordion-content"]');if(!Z)return;const _=a.getAttribute("aria-expanded")!=="true";a.setAttribute("aria-expanded",String(_));const A=a.querySelector("svg");A==null||A.classList.add("transition-transform","duration-200"),A==null||A.classList.toggle("rotate-180",_),Z.hidden=!_};j.forEach(t=>t.addEventListener("click",q));const b=s.querySelector('[data-theme-toggle] button[aria-label="Light theme"]'),p=s.querySelector('[data-theme-toggle] button[aria-label="Dark theme"]'),f=t=>{t.preventDefault(),document.documentElement.classList.remove("dark"),document.documentElement.classList.add("light")},R=t=>{t.preventDefault(),document.documentElement.classList.remove("light"),document.documentElement.classList.add("dark")};b==null||b.addEventListener("click",f),p==null||p.addEventListener("click",R);const H=s.querySelectorAll('a[href="#solution"]'),G=t=>{const a=s.querySelector("#solution");a&&(t.preventDefault(),a.scrollIntoView({behavior:"smooth",block:"start"}),window.history.pushState(null,"","#solution"))};H.forEach(t=>t.addEventListener("click",G));const M=s.querySelector("#workflow-diagram-iframe"),S=s.querySelector(".workflow-btn-fit"),E=s.querySelector(".workflow-btn-toggle"),N=s.querySelector(".workflow-btn-fullscreen"),P=s.querySelector(".workflow-diagram-card")||s.querySelector(".workflow-diagram-container"),O="/diagrams/chatbot-architecture.html",F=s.querySelector(".workflow-status-text"),D=s.querySelector(".workflow-status-chip"),W=s.querySelector(".workflow-toggle-icon"),V=s.querySelector(".workflow-toggle-text");let z=!0;const K=t=>{M&&M.contentWindow&&M.contentWindow.postMessage(t,"*")},U=()=>K({type:"FIT_VIEW"}),Q=()=>{K({type:"TOGGLE_MOTION"})},Y=t=>{t.preventDefault(),P&&typeof P.requestFullscreen=="function"?P.requestFullscreen().catch(()=>{window.open(O,"_blank","noopener,noreferrer")}):window.open(O,"_blank","noopener,noreferrer")};S==null||S.addEventListener("click",U),E==null||E.addEventListener("click",Q),N==null||N.addEventListener("click",Y);const X=t=>{if(M&&t.source!==M.contentWindow)return;const a=t.data;!a||typeof a!="object"||(a.type==="DIAGRAM_MOTION_CHANGE"?(typeof a.state=="string"&&(z=a.state==="play"),F&&(F.textContent=z?"🟢 Luồng tín hiệu: Đang chạy liên tục (Live Loop)":"⏸ Luồng tín hiệu: Đã tạm dừng"),W&&(W.textContent=z?"⏸":"▶"),V&&(V.textContent=z?"Tạm dừng":"Tiếp tục"),D&&(z?D.className="workflow-status-chip inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30":D.className="workflow-status-chip inline-flex items-center gap-2 px-3 py-1 text-xs font-semibold rounded-full bg-muted/40 text-muted-foreground border border-border")):a.type==="DIAGRAM_READY"&&K({type:"GET_STATE"}))};return window.addEventListener("message",X),()=>{window.removeEventListener("scroll",d),u==null||u.forEach(t=>t.removeEventListener("click",w)),i&&n&&n.removeEventListener("click",i),y.forEach(t=>t.removeEventListener("click",h)),B.forEach(t=>t.removeEventListener("click",c)),j.forEach(t=>t.removeEventListener("click",q)),b==null||b.removeEventListener("click",f),p==null||p.removeEventListener("click",R),H.forEach(t=>t.removeEventListener("click",G)),S==null||S.removeEventListener("click",U),E==null||E.removeEventListener("click",Q),N==null||N.removeEventListener("click",Y),window.removeEventListener("message",X)}},[]),e.jsxs("div",{className:"folio-view-container relative min-h-screen",children:[e.jsx("div",{ref:C,dangerouslySetInnerHTML:{__html:$}}),e.jsx("style",{children:'button:focus-visible, a[role="button"]:focus-visible, a[data-slot="button"]:focus-visible { outline: none; box-shadow: 0 0 0 2px #71717a; }'}),e.jsx(J,{isOpen:g,isRestoringSession:v,onClose:m,onLogin:T})]})};export{ae as FolioLandingView,te as WorkflowSection};
