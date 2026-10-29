var Be=Object.defineProperty;var Ve=(t,i,d)=>i in t?Be(t,i,{enumerable:!0,configurable:!0,writable:!0,value:d}):t[i]=d;var ke=(t,i,d)=>Ve(t,typeof i!="symbol"?i+"":i,d);import{a as ze,A as Me,u as Re,r as o,j as e,b as _e}from"./index-BX109kYE.js";class ee extends Error{constructor(d,h,N="UNKNOWN"){super(d);ke(this,"status");ke(this,"code");this.name="ApiError",this.status=h,this.code=N}}function ve(){var i,d;return((d=(i=globalThis.crypto)==null?void 0:i.randomUUID)==null?void 0:d.call(i))??`${Date.now().toString(36)}-${Math.random().toString(36).slice(2,10)}`}async function Fe(t,i){var N,T;let d=i,h="UNKNOWN";try{const w=await t.json();typeof((N=w==null?void 0:w.error)==null?void 0:N.message)=="string"&&w.error.message.length>0&&(d=w.error.message),typeof((T=w==null?void 0:w.error)==null?void 0:T.code)=="string"&&w.error.code.length>0&&(h=w.error.code)}catch{}return new ee(d,t.status,h)}async function J(t,i){const d=await ze(`${Me}${t}`,i);if(!d.ok)throw await Fe(d,`Yêu cầu ${t} thất bại (HTTP ${d.status})`);if(d.status!==204)return await d.json()}function ue(t){return{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}}function Oe(t){return{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}}async function qe(){return J("/auth/me")}function We(t){return typeof t.employeeCode=="string"}async function Te(t){const i=new URLSearchParams;t!=null&&t.departmentId&&i.set("departmentId",t.departmentId),t!=null&&t.level&&i.set("level",t.level),t!=null&&t.status&&i.set("status",t.status),t!=null&&t.q&&i.set("q",t.q),t!=null&&t.page&&i.set("page",String(t.page)),t!=null&&t.limit&&i.set("limit",String(t.limit));const d=i.toString(),h=await J(`/employees${d?`?${d}`:""}`);if(!Array.isArray(h.items)||!h.paging)throw new ee("Phản hồi danh sách nhân sự sai hợp đồng (thiếu items/paging)",500,"INVALID_RESPONSE");return h}async function Ke(t){return J(`/employees/${encodeURIComponent(t)}`)}async function Ue(t){const i=new URLSearchParams;t!=null&&t.status&&i.set("status",t.status),t!=null&&t.overdue&&i.set("overdue","true"),t!=null&&t.page&&i.set("page",String(t.page)),i.set("limit",String(t.limit));const d=i.toString(),h=await J(`/projects${d?`?${d}`:""}`);if(!Array.isArray(h.items)||!h.paging)throw new ee("Phản hồi danh sách đề tài sai hợp đồng (thiếu items/paging)",500,"INVALID_RESPONSE");return h}async function Qe(t){return J("/projects",ue({...t,clientMessageId:ve()}))}async function $e(t,i){return J(`/projects/${encodeURIComponent(t)}/assign`,ue({...i,clientMessageId:ve()}))}async function Le(t,i){return J(`/projects/${encodeURIComponent(t)}/transition`,ue({...i,clientMessageId:ve()}))}async function Je(t,i){return J(`/projects/${encodeURIComponent(t)}/progress`,ue({...i,clientMessageId:i.clientMessageId??ve()}))}async function Xe(t,i){return J("/reports",ue({projectId:t,content:i.content,attachments:i.attachments??[],expectedVersion:i.expectedVersion}))}async function Ce(){const t=await J("/admin/llm-providers");if(!Array.isArray(t.providers))throw new ee("Phản hồi cấu hình provider thiếu mảng providers",500,"INVALID_RESPONSE");return{configVersion:t.configVersion??0,providers:t.providers}}async function Ze(t){const i=await ze(`${Me}/admin/llm-providers`,Oe(t));if(!i.ok)throw await Fe(i,`Lưu cấu hình provider thất bại (HTTP ${i.status})`);if(i.status===204)return Ce();const d=await i.json();return Array.isArray(d.providers)?{configVersion:d.configVersion??0,providers:d.providers}:Ce()}async function Ye(t){return J(`/admin/llm-providers/${encodeURIComponent(t)}/test`,ue({}))}const Ie={editingId:null,name:"",type:"openai_compatible",baseUrl:"",model:"",maxTokens:"1024",timeoutMs:"30000",priority:"1",enabled:!0,apiKey:""},et=["openai_compatible","gemini","anthropic"];function Ge(t){return{editingId:t.id,name:t.name,type:t.type,baseUrl:t.baseUrl,model:t.model,maxTokens:String(t.maxTokens),timeoutMs:String(t.timeoutMs),priority:String(t.priority),enabled:t.enabled,apiKey:""}}function He(t,i){const d=Number.parseInt(t.maxTokens,10),h=Number.parseInt(t.timeoutMs,10),N=Number.parseInt(t.priority,10),T=t.name.trim(),w=t.baseUrl.trim(),A=t.model.trim();if(T.length===0||w.length===0||A.length===0||!Number.isFinite(d)||d<=0||!Number.isFinite(h)||h<=0||!Number.isFinite(N)||N<=0)return null;const S={id:(i==null?void 0:i.id)??ve(),name:T,type:t.type,baseUrl:w,model:A,maxTokens:d,timeoutMs:h,priority:N,enabled:t.enabled},f=t.apiKey.trim();return f.length>0&&(S.apiKey=f),S}function tt(t,i){return t.map(d=>{const h=He(Ge(d),d);if(!h)throw new ee(`Provider "${d.name}" có trường không hợp lệ`,400,"VALIDATION_FAILED");const N=i[d.id];return N&&(h.apiKey=N),h})}const nt=({onNotify:t})=>{const{user:i}=Re(),[d,h]=o.useState([]),[N,T]=o.useState(0),[w,A]=o.useState(!0),[S,f]=o.useState(""),[u,y]=o.useState(null),[z,I]=o.useState(""),[E,M]=o.useState(!1),[_,W]=o.useState(""),[x,P]=o.useState({}),[F,p]=o.useState(""),R=o.useRef({}),g=(i==null?void 0:i.role)==="Admin",m=o.useCallback(async()=>{A(!0),f("");try{const s=await Ce();h(s.providers),T(s.configVersion)}catch(s){f(s instanceof Error?s.message:"Không tải được cấu hình provider")}finally{A(!1)}},[]);o.useEffect(()=>{g&&m()},[g,m]);const j=async(s,c,l)=>{M(!0),I("");try{const v=tt(s,c),C=await Ze({providers:v});h(C.providers),T(C.configVersion),s.forEach(K=>{delete c[K.id]}),y(null),t(l,"success","Đã lưu cấu hình")}catch(v){const C=v instanceof Error?v.message:"Lưu cấu hình provider thất bại";I(C),t(C,"error","Lỗi lưu cấu hình")}finally{M(!1)}},k=async()=>{if(!u)return;const s=u.editingId?d.find(K=>K.id===u.editingId):void 0,c=He(u,s);if(!c){I("Điền đủ tên, baseUrl, model và các số dương (maxTokens/timeoutMs/priority).");return}if(!s&&u.apiKey.trim().length===0){I("Provider mới bắt buộc phải nhập API key.");return}const l={id:c.id,name:c.name,type:c.type,baseUrl:c.baseUrl,model:c.model,maxTokens:c.maxTokens,timeoutMs:c.timeoutMs,priority:c.priority,enabled:c.enabled,keyHint:s==null?void 0:s.keyHint,lastTestAt:(s==null?void 0:s.lastTestAt)??null,lastTestOk:(s==null?void 0:s.lastTestOk)??null,lastTestError:(s==null?void 0:s.lastTestError)??null},v=s?d.map(K=>K.id===s.id?l:K):[...d,l],C=u.apiKey.trim();C.length>0&&(R.current[c.id]=C),h(v),await j(v,R.current,s?"Đã cập nhật provider.":"Đã thêm provider mới.")},O=async s=>{if(F!==s.id){p(s.id);return}p("");const c=d.filter(l=>l.id!==s.id);h(c),await j(c,R.current,`Đã xoá provider "${s.name}".`)},q=async s=>{W(s.id);try{const c=await Ye(s.id);P(l=>({...l,[s.id]:c})),t(c.ok?`Test OK · ${c.latencyMs}ms · model ${c.model}`:`Test thất bại: ${c.error??"không rõ nguyên nhân"}`,c.ok?"success":"error","Test connection")}catch(c){const l=c instanceof Error?c.message:"Không gọi được endpoint test provider";P(v=>({...v,[s.id]:{ok:!1,latencyMs:0,model:s.model,error:l}})),t(l,"error","Test connection")}finally{W("")}};return g?w?e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"10px"},children:[e.jsx("div",{className:"skeleton",style:{height:"22px",width:"260px"}}),e.jsx("div",{className:"skeleton",style:{height:"64px"}}),e.jsx("div",{className:"skeleton",style:{height:"64px"}}),e.jsx("div",{className:"skeleton",style:{height:"64px"}})]}):e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"16px"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px",flexWrap:"wrap"},children:[e.jsxs("div",{children:[e.jsx("h2",{style:{fontSize:"16px",fontWeight:700,color:"#f8fafc"},children:"Cấu Hình LLM Provider"}),e.jsxs("p",{style:{fontSize:"11px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:["ADR-017 · configVersion ",N," · key mã hoá AES-256-GCM, client chỉ thấy keyHint"]})]}),e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("button",{type:"button",className:"btn",onClick:()=>void m(),disabled:E,children:"Tải lại"}),e.jsx("button",{type:"button",className:"btn btn--primary",onClick:()=>{y({...Ie,priority:String(d.length+1)}),I("")},disabled:E,children:"+ Thêm provider"})]})]}),S&&e.jsxs("div",{className:"banner banner--error",role:"alert",children:[e.jsxs("span",{children:["Không tải được cấu hình: ",S]}),e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>void m(),children:"Thử lại"})]}),e.jsx("div",{className:"banner",style:{background:"rgba(255,255,255,0.03)"},children:e.jsxs("span",{children:["API key chỉ được ghi một chiều. Sau khi lưu, máy chủ chỉ trả về ",e.jsx("code",{style:{fontFamily:"var(--mono)"},children:"keyHint"})," (4 ký tự cuối) — giao diện không bao giờ hiển thị key thật hay bản mã."]})}),d.length===0&&!S&&e.jsxs("div",{className:"empty",children:[e.jsx("div",{style:{fontSize:"13px",fontWeight:600,color:"var(--text)"},children:"Chưa cấu hình provider nào"}),e.jsx("p",{children:"Thêm provider đầu tiên (ví dụ endpoint OpenAI-compatible) để bật trả lời bằng LLM. Không có provider, trợ lý chạy ở chế độ degraded."}),e.jsx("button",{type:"button",className:"btn btn--primary",onClick:()=>{y({...Ie,priority:"1"}),I("")},children:"Thêm provider"})]}),d.length>0&&e.jsx("div",{className:"card table-wrap",style:{overflow:"hidden"},children:e.jsxs("table",{className:"table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Provider"}),e.jsx("th",{children:"Loại"}),e.jsx("th",{children:"Model"}),e.jsx("th",{children:"Ưu tiên"}),e.jsx("th",{children:"Key"}),e.jsx("th",{children:"Test gần nhất"}),e.jsx("th",{children:"Trạng thái"}),e.jsx("th",{style:{textAlign:"right"},children:"Hành động"})]})}),e.jsx("tbody",{children:[...d].sort((s,c)=>s.priority-c.priority).map(s=>{const c=x[s.id],l=c?c.ok:s.lastTestOk,v=s.lastTestAt??null,C=(c==null?void 0:c.error)??s.lastTestError??"";return e.jsxs("tr",{children:[e.jsxs("td",{children:[e.jsx("div",{style:{fontWeight:600,color:"#f8fafc"},children:s.name}),e.jsx("div",{style:{fontSize:"10px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:s.baseUrl})]}),e.jsx("td",{children:e.jsx("span",{className:"chip chip--info",children:s.type})}),e.jsx("td",{style:{fontFamily:"var(--mono)",color:"var(--text-muted)"},children:s.model}),e.jsx("td",{style:{fontFamily:"var(--mono)"},children:s.priority}),e.jsx("td",{children:e.jsxs("span",{className:"chip",title:"Chỉ 4 ký tự cuối",children:["••••",s.keyHint??"????"]})}),e.jsxs("td",{children:[c?e.jsx("span",{className:`chip ${c.ok?"chip--ok":"chip--err"}`,children:c.ok?`${c.latencyMs}ms`:"lỗi"}):l===!0?e.jsx("span",{className:"chip chip--ok",children:"OK"}):l===!1?e.jsx("span",{className:"chip chip--err",title:C,children:"lỗi"}):e.jsx("span",{className:"chip",children:"chưa test"}),v&&e.jsx("div",{style:{fontSize:"10px",color:"var(--text-faint)",marginTop:"4px",fontFamily:"var(--mono)"},children:new Date(v).toLocaleString("vi-VN")}),((c==null?void 0:c.error)||C)&&e.jsx("div",{style:{fontSize:"10px",color:"#fda4af",maxWidth:"220px"},children:(c==null?void 0:c.error)||C})]}),e.jsx("td",{children:e.jsx("span",{className:`chip ${s.enabled?"chip--ok":"chip--warn"}`,children:s.enabled?"enabled":"disabled"})}),e.jsx("td",{children:e.jsxs("div",{style:{display:"flex",gap:"6px",justifyContent:"flex-end",flexWrap:"wrap"},children:[e.jsxs("button",{type:"button",className:"btn btn--sm",onClick:()=>void q(s),disabled:_===s.id||E,"aria-busy":_===s.id,children:[_===s.id?e.jsx("span",{className:"spinner"}):null,"Test connection"]}),e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>{y(Ge(s)),I("")},disabled:E,children:"Sửa"}),e.jsx("button",{type:"button",className:`btn btn--sm ${F===s.id?"btn--danger":"btn--ghost"}`,onClick:()=>void O(s),disabled:E,children:F===s.id?"Xác nhận xoá":"Xoá"})]})})]},s.id)})})]})}),u&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Biểu mẫu provider",onClick:()=>y(null),children:e.jsxs("div",{className:"sheet",onClick:s=>s.stopPropagation(),children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"10px"},children:[e.jsx("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:u.editingId?"Sửa provider":"Thêm provider"}),e.jsx("button",{type:"button",className:"btn btn--ghost btn--sm",onClick:()=>y(null),children:"Đóng"})]}),e.jsxs("div",{style:{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(220px, 1fr))",gap:"12px",marginTop:"14px"},children:[e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-name",children:"Tên hiển thị"}),e.jsx("input",{id:"provider-name",className:"input",value:u.name,onChange:s=>y({...u,name:s.target.value}),placeholder:"Ví dụ: Primary OpenAI-compatible"})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-type",children:"Loại"}),e.jsx("select",{id:"provider-type",className:"select",value:u.type,onChange:s=>y({...u,type:s.target.value}),children:et.map(s=>e.jsx("option",{value:s,children:s},s))})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-base-url",children:"Base URL"}),e.jsx("input",{id:"provider-base-url",className:"input",value:u.baseUrl,onChange:s=>y({...u,baseUrl:s.target.value}),placeholder:"https://…/v1"})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-model",children:"Model"}),e.jsx("input",{id:"provider-model",className:"input",value:u.model,onChange:s=>y({...u,model:s.target.value}),placeholder:"Tên model do provider công bố"})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-max-tokens",children:"maxTokens"}),e.jsx("input",{id:"provider-max-tokens",className:"input",inputMode:"numeric",value:u.maxTokens,onChange:s=>y({...u,maxTokens:s.target.value})})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-timeout",children:"timeoutMs"}),e.jsx("input",{id:"provider-timeout",className:"input",inputMode:"numeric",value:u.timeoutMs,onChange:s=>y({...u,timeoutMs:s.target.value})})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"provider-priority",children:"priority (1 = chính)"}),e.jsx("input",{id:"provider-priority",className:"input",inputMode:"numeric",value:u.priority,onChange:s=>y({...u,priority:s.target.value})})]}),e.jsxs("div",{className:"field",children:[e.jsxs("label",{className:"field__label",htmlFor:"provider-api-key",children:["API key ",u.editingId?"(để trống = giữ key cũ)":"(bắt buộc)"]}),e.jsx("input",{id:"provider-api-key",className:"input",type:"password",autoComplete:"new-password",value:u.apiKey,onChange:s=>y({...u,apiKey:s.target.value}),placeholder:u.editingId?"Không hiển thị key đã lưu":"Chỉ ghi, không bao giờ đọc lại"})]})]}),e.jsxs("label",{style:{display:"flex",alignItems:"center",gap:"8px",marginTop:"12px",fontSize:"12px"},children:[e.jsx("input",{type:"checkbox",checked:u.enabled,onChange:s=>y({...u,enabled:s.target.checked})}),"Bật provider này trong danh sách fallback"]}),z&&e.jsx("div",{className:"banner banner--error",role:"alert",style:{marginTop:"12px"},children:e.jsx("span",{children:z})}),e.jsxs("div",{style:{display:"flex",gap:"8px",marginTop:"16px",justifyContent:"flex-end"},children:[e.jsx("button",{type:"button",className:"btn btn--ghost",onClick:()=>y(null),disabled:E,children:"Huỷ"}),e.jsxs("button",{type:"button",className:"btn btn--primary",onClick:()=>void k(),disabled:E,"aria-busy":E,children:[E?e.jsx("span",{className:"spinner"}):null,E?"Đang lưu…":"Lưu provider"]})]})]})})]}):e.jsxs("div",{className:"empty",role:"alert",children:[e.jsx("div",{style:{fontSize:"18px",fontWeight:800,color:"#fda4af"},children:"403 — RBAC_DENIED"}),e.jsxs("p",{children:["Chỉ tài khoản Admin được xem cấu hình LLM provider. Tài khoản hiện tại: ",(i==null?void 0:i.role)??"chưa đăng nhập","."]})]})},st=()=>{const[t,i]=o.useState([]),[d,h]=o.useState(!0),[N,T]=o.useState(null),[w,A]=o.useState(""),S=async()=>{h(!0),T(null);try{const f=await Te({q:w});i(f.items)}catch(f){const u=f instanceof Error?f.message:"Lỗi tải danh sách nhân sự";T(u)}finally{h(!1)}};return o.useEffect(()=>{S()},[w]),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"16px"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:"10px"},children:[e.jsxs("div",{children:[e.jsx("h2",{style:{fontSize:"16px",fontWeight:700,color:"#fff"},children:"Danh Sách Nhân Sự Điểm Bán (Allowlist Only)"}),e.jsx("p",{style:{fontSize:"11px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:"Theo hợp đồng DTO tối thiểu: Không chứa PII nhạy cảm (bank, CCCD, lương)"})]}),e.jsxs("div",{style:{display:"flex",gap:"8px"},children:[e.jsx("input",{type:"text",value:w,onChange:f=>A(f.target.value),placeholder:"Tìm theo tên, mã NV...",style:{background:"var(--surface)",border:"1px solid var(--border)",color:"#fff",padding:"6px 12px",borderRadius:"6px",fontSize:"12px",outline:"none"}}),e.jsx("button",{onClick:S,style:{padding:"6px 12px",background:"var(--surface-card)",border:"1px solid var(--border)",color:"var(--text)",borderRadius:"6px",fontSize:"12px",cursor:"pointer"},children:"Làm Mới"})]})]}),d&&e.jsx("div",{style:{padding:"32px",textAlign:"center",color:"var(--text-muted)"},children:"Đang tải danh sách nhân sự từ API..."}),N&&e.jsxs("div",{style:{padding:"16px",background:"rgba(244, 63, 94, 0.1)",border:"1px solid rgba(244, 63, 94, 0.3)",borderRadius:"8px",color:"#fca5a5",fontSize:"12px"},children:["⚠️ ",N]}),!d&&!N&&t.length===0&&e.jsx("div",{style:{padding:"32px",textAlign:"center",color:"var(--text-muted)",background:"var(--surface)",borderRadius:"8px"},children:"Không tìm thấy nhân sự nào phù hợp với bộ lọc."}),!d&&t.length>0&&e.jsx("div",{style:{background:"var(--surface)",border:"1px solid var(--border)",borderRadius:"10px",overflow:"hidden"},children:e.jsxs("table",{style:{width:"100%",borderCollapse:"collapse",textAlign:"left",fontSize:"12px"},children:[e.jsx("thead",{children:e.jsxs("tr",{style:{background:"rgba(14, 18, 27, 0.8)",borderBottom:"1px solid var(--border)",color:"var(--text-faint)",fontFamily:"var(--mono)"},children:[e.jsx("th",{style:{padding:"10px 14px"},children:"MÃ NV / HỌ TÊN"}),e.jsx("th",{style:{padding:"10px 14px"},children:"CẤP BẬC"}),e.jsx("th",{style:{padding:"10px 14px"},children:"ĐIỂM BÁN / PHÒNG BAN"}),e.jsx("th",{style:{padding:"10px 14px"},children:"KỸ NĂNG"}),e.jsx("th",{style:{padding:"10px 14px"},children:"TRẠNG THÁI"})]})}),e.jsx("tbody",{children:t.map(f=>e.jsxs("tr",{style:{borderBottom:"1px solid rgba(255, 255, 255, 0.04)"},children:[e.jsxs("td",{style:{padding:"12px 14px"},children:[e.jsx("div",{style:{fontWeight:600,color:"#fff"},children:f.fullName}),e.jsx("div",{style:{fontSize:"10px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:f.employeeId})]}),e.jsx("td",{style:{padding:"12px 14px"},children:e.jsx("span",{style:{color:"var(--accent-primary)",fontWeight:600},children:f.level})}),e.jsx("td",{style:{padding:"12px 14px",color:"var(--text-muted)"},children:f.department}),e.jsx("td",{style:{padding:"12px 14px"},children:e.jsx("div",{style:{display:"flex",flexWrap:"wrap",gap:"4px"},children:f.skills.slice(0,3).map((u,y)=>e.jsx("span",{style:{fontSize:"10px",background:"rgba(255, 255, 255, 0.06)",padding:"2px 6px",borderRadius:"3px",color:"#cbd5e1"},children:u},y))})}),e.jsx("td",{style:{padding:"12px 14px"},children:e.jsxs("span",{style:{color:f.status==="active"?"var(--emerald)":"var(--rose)",fontWeight:600},children:["● ",f.status==="active"?"Hoạt động":"Tạm dừng"]})})]},f.employeeId))})]})})]})},rt=["DRAFT","ASSIGNED","IN_PROGRESS","PENDING_REVIEW","COMPLETED"],it={DRAFT:"",ASSIGNED:"chip--info",IN_PROGRESS:"chip--warn",PENDING_REVIEW:"chip--warn",COMPLETED:"chip--ok"},Pe={DRAFT:"DRAFT",ASSIGNED:"ASSIGNED",IN_PROGRESS:"IN_PROGRESS",PENDING_REVIEW:"PENDING_REVIEW",COMPLETED:"COMPLETED"};function at(t){return!t.dueDate||t.status==="COMPLETED"?!1:new Date(t.dueDate).getTime()<Date.now()}const ot=({onNotify:t})=>{const{user:i}=Re(),d=(i==null?void 0:i.role)==="Admin",[h,N]=o.useState(null),[T,w]=o.useState(!0),[A,S]=o.useState(""),[f,u]=o.useState(""),[y,z]=o.useState(!1),[I,E]=o.useState(1),[M,_]=o.useState(null),[W,x]=o.useState([]),[P,F]=o.useState(""),[p,R]=o.useState(null),[g,m]=o.useState(!1),[j,k]=o.useState(""),[O,q]=o.useState(""),[s,c]=o.useState(""),[l,v]=o.useState(""),[C,K]=o.useState(""),[te,de]=o.useState("50"),[X,U]=o.useState(""),[Q,ce]=o.useState(""),G=o.useCallback(async()=>{w(!0),S("");try{const n=await Ue({status:f||void 0,overdue:y||void 0,page:I,limit:20});N(n)}catch(n){const b=n instanceof ee?`${n.code}: ${n.message}`:n instanceof Error?n.message:"Lỗi tải danh sách đề tài";S(b),t(b,"error","Không tải được đề tài")}finally{w(!1)}},[f,y,I,t]);o.useEffect(()=>{G()},[G]),o.useEffect(()=>{let n=!1;return(async()=>{try{const b=await qe();n||_(b)}catch{n||_(null)}})(),()=>{n=!0}},[]);const ne=async()=>{if(!(W.length>0))try{const n=await Te({limit:100});x(n.items),F("")}catch(n){F(n instanceof Error?n.message:"Không tải được danh sách nhân sự để giao việc")}},D=()=>{R(null),k("")},Z=(n,b)=>{const Y=n instanceof ee?`${n.code}: ${n.message}${n.status===409?" — dữ liệu đã đổi, đang tải lại danh sách.":""}`:n instanceof Error?n.message:b;k(Y),t(Y,"error",b),n instanceof ee&&n.status===409&&G()},se=async()=>{if(!(M!=null&&M.departmentId)){k("Tài khoản Admin chưa được gán departmentId nên không thể tạo đề tài (server cần phạm vi phòng ban).");return}if(O.trim().length===0){k("Tiêu đề đề tài là bắt buộc.");return}m(!0),k("");try{await Qe({title:O.trim(),description:s.trim()||void 0,departmentId:M.departmentId,dueDate:l?new Date(l).toISOString():void 0}),t("Đã tạo đề tài ở trạng thái DRAFT.","success","Tạo đề tài"),D(),q(""),c(""),v(""),await G()}catch(n){Z(n,"Lỗi tạo đề tài")}finally{m(!1)}},pe=async n=>{if(!C){k("Chọn một nhân sự để giao việc.");return}m(!0),k("");try{await $e(n.id,{assigneeId:C,expectedVersion:n.version}),t("Đã giao việc cho nhân sự.","success","Giao việc"),D(),K(""),await G()}catch(b){Z(b,"Lỗi giao việc")}finally{m(!1)}},we=async n=>{m(!0);try{await Le(n.id,{targetStatus:"IN_PROGRESS",expectedVersion:n.version}),t("Đề tài chuyển sang IN_PROGRESS.","success","Cập nhật trạng thái"),await G()}catch(b){Z(b,"Lỗi chuyển trạng thái")}finally{m(!1)}},me=async n=>{const b=Number.parseInt(te,10);if(!Number.isFinite(b)||b<0||b>100){k("Tiến độ phải là số nguyên 0..100.");return}m(!0),k("");try{await Je(n.id,{progress:b}),t(`Đã cập nhật tiến độ ${b}%.`,"success","Cập nhật tiến độ"),D(),await G()}catch(Y){Z(Y,"Lỗi cập nhật tiến độ")}finally{m(!1)}},$=async n=>{if(X.trim().length===0){k("Nội dung báo cáo là bắt buộc.");return}m(!0),k("");try{await Xe(n.id,{content:X.trim(),attachments:[],expectedVersion:n.version}),t("Đã nộp báo cáo — đề tài chuyển PENDING_REVIEW.","success","Nộp báo cáo"),D(),U(""),await G()}catch(b){Z(b,"Lỗi nộp báo cáo")}finally{m(!1)}},ge=async(n,b)=>{if(b==="REJECT"&&Q.trim().length===0){k("Bắt buộc nhập lý do khi từ chối.");return}m(!0),k("");try{await Le(n.id,{targetStatus:b==="APPROVE"?"COMPLETED":"IN_PROGRESS",expectedVersion:n.version,...Q.trim()?{reason:Q.trim()}:{}}),t(b==="APPROVE"?"Đề tài đã COMPLETED.":"Đề tài trả về IN_PROGRESS kèm lý do.","success",b==="APPROVE"?"Duyệt báo cáo":"Từ chối báo cáo"),D(),ce(""),await G()}catch(Y){Z(Y,"Lỗi duyệt báo cáo")}finally{m(!1)}},re=(h==null?void 0:h.items)??[],V=h==null?void 0:h.paging,je=n=>{const b=[];return d&&n.status==="DRAFT"&&b.push(e.jsx("button",{type:"button",className:"btn btn--sm btn--primary",onClick:()=>{R({kind:"assign",project:n}),k(""),ne()},children:"Giao việc"},"assign")),!d&&n.status==="ASSIGNED"&&b.push(e.jsx("button",{type:"button",className:"btn btn--sm btn--primary",disabled:g,onClick:()=>void we(n),children:"Bắt đầu"},"start")),!d&&n.status==="IN_PROGRESS"&&b.push(e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>{R({kind:"progress",project:n}),de(String(n.progress)),k("")},children:"Tiến độ"},"progress"),e.jsx("button",{type:"button",className:"btn btn--sm btn--primary",onClick:()=>{R({kind:"report",project:n}),U(""),k("")},children:"Nộp báo cáo"},"report")),d&&n.status==="PENDING_REVIEW"&&b.push(e.jsx("button",{type:"button",className:"btn btn--sm btn--primary",onClick:()=>{R({kind:"review",project:n,action:"APPROVE"}),ce(""),k("")},children:"Duyệt"},"approve"),e.jsx("button",{type:"button",className:"btn btn--sm btn--danger",onClick:()=>{R({kind:"review",project:n,action:"REJECT"}),ce(""),k("")},children:"Từ chối"},"reject")),b.length===0?e.jsx("span",{style:{fontSize:"11px",color:"var(--text-faint)"},children:"—"}):e.jsx("div",{style:{display:"flex",gap:"6px",justifyContent:"flex-end",flexWrap:"wrap"},children:b})};return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"16px"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px",flexWrap:"wrap"},children:[e.jsxs("div",{children:[e.jsx("h2",{style:{fontSize:"16px",fontWeight:700,color:"#f8fafc"},children:"Vòng Đời Đề Tài (F2)"}),e.jsx("p",{style:{fontSize:"11px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:"DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED · optimistic lock theo version"})]}),d&&e.jsx("button",{type:"button",className:"btn btn--primary",onClick:()=>{R({kind:"create"}),k(""),q(""),c(""),v("")},children:"+ Tạo đề tài"})]}),e.jsxs("div",{style:{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"flex-end"},children:[e.jsxs("div",{className:"field",style:{minWidth:"170px"},children:[e.jsx("label",{className:"field__label",htmlFor:"project-status",children:"Trạng thái"}),e.jsxs("select",{id:"project-status",className:"select",value:f,onChange:n=>{E(1),u(n.target.value)},children:[e.jsx("option",{value:"",children:"Tất cả"}),rt.map(n=>e.jsx("option",{value:n,children:Pe[n]},n))]})]}),e.jsxs("label",{style:{display:"flex",alignItems:"center",gap:"8px",fontSize:"12px",paddingBottom:"8px"},children:[e.jsx("input",{type:"checkbox",checked:y,onChange:n=>{E(1),z(n.target.checked)}}),"Chỉ đề tài quá hạn (dueDate < now, chưa COMPLETED)"]}),e.jsx("button",{type:"button",className:"btn",onClick:()=>void G(),disabled:T,children:"Làm mới"})]}),T&&e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[0,1,2,3].map(n=>e.jsx("div",{className:"skeleton",style:{height:"52px"}},n))}),!T&&A&&e.jsxs("div",{className:"banner banner--error",role:"alert",children:[e.jsxs("span",{children:["Không tải được danh sách đề tài: ",A]}),e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>void G(),children:"Thử lại"})]}),!T&&!A&&re.length===0&&e.jsxs("div",{className:"empty",children:[e.jsx("div",{style:{fontSize:"13px",fontWeight:600,color:"var(--text)"},children:f||y?"Không có đề tài khớp bộ lọc":"Chưa có đề tài nào"}),e.jsx("p",{children:f||y?"Thử xoá bộ lọc trạng thái / quá hạn.":"Tạo đề tài DRAFT để bắt đầu vòng đời, hoặc chờ Admin giao việc."}),(f||y)&&e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>{u(""),z(!1),E(1)},children:"Xoá bộ lọc"})]}),!T&&!A&&re.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{style:{fontSize:"11px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:[(V==null?void 0:V.totalItems)??re.length," đề tài · trang ",(V==null?void 0:V.page)??1,"/",(V==null?void 0:V.totalPages)??1]}),e.jsx("div",{className:"card table-wrap",style:{overflow:"hidden"},children:e.jsxs("table",{className:"table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Đề tài"}),e.jsx("th",{children:"Trạng thái"}),e.jsx("th",{children:"Tiến độ"}),e.jsx("th",{children:"Hạn"}),e.jsx("th",{children:"Version"}),e.jsx("th",{style:{textAlign:"right"},children:"Hành động"})]})}),e.jsx("tbody",{children:re.map(n=>e.jsxs("tr",{children:[e.jsxs("td",{children:[e.jsx("div",{style:{fontWeight:600,color:"#f8fafc"},children:n.title}),n.description&&e.jsx("div",{style:{fontSize:"11px",color:"var(--text-muted)",maxWidth:"360px"},children:n.description})]}),e.jsx("td",{children:e.jsx("span",{className:`chip ${it[n.status]}`,children:Pe[n.status]})}),e.jsxs("td",{style:{minWidth:"120px"},children:[e.jsx("div",{className:"progress","aria-hidden":"true",children:e.jsx("div",{className:"progress__bar",style:{width:`${n.progress}%`}})}),e.jsxs("span",{style:{fontSize:"10px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:[n.progress,"%"]})]}),e.jsxs("td",{style:{fontFamily:"var(--mono)",fontSize:"11px"},children:[n.dueDate?new Date(n.dueDate).toLocaleDateString("vi-VN"):"—",at(n)&&e.jsx("div",{children:e.jsx("span",{className:"chip chip--err",children:"quá hạn"})})]}),e.jsxs("td",{style:{fontFamily:"var(--mono)",fontSize:"11px"},children:["v",n.version]}),e.jsx("td",{children:je(n)})]},n.id))})]})}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end"},children:[e.jsx("button",{type:"button",className:"btn btn--sm",disabled:I<=1,onClick:()=>E(n=>Math.max(1,n-1)),children:"Trang trước"}),e.jsx("button",{type:"button",className:"btn btn--sm",disabled:!V||I>=V.totalPages,onClick:()=>E(n=>n+1),children:"Trang sau"})]})]}),(p==null?void 0:p.kind)==="create"&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Tạo đề tài",onClick:D,children:e.jsxs("div",{className:"sheet",onClick:n=>n.stopPropagation(),children:[e.jsx("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:"Tạo đề tài (DRAFT)"}),e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"12px",marginTop:"14px"},children:[e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"project-title",children:"Tiêu đề (bắt buộc)"}),e.jsx("input",{id:"project-title",className:"input",value:O,onChange:n=>q(n.target.value)})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"project-description",children:"Mô tả"}),e.jsx("textarea",{id:"project-description",className:"textarea",value:s,onChange:n=>c(n.target.value)})]}),e.jsxs("div",{className:"field",children:[e.jsx("label",{className:"field__label",htmlFor:"project-due",children:"Hạn hoàn thành"}),e.jsx("input",{id:"project-due",className:"input",type:"date",value:l,onChange:n=>v(n.target.value)})]}),e.jsxs("div",{className:"field__hint",children:["departmentId lấy từ phiên đăng nhập: ",(M==null?void 0:M.departmentId)??"chưa có (server sẽ từ chối)"]}),j&&e.jsx("div",{className:"banner banner--error",role:"alert",children:j}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end"},children:[e.jsx("button",{type:"button",className:"btn btn--ghost",onClick:D,disabled:g,children:"Huỷ"}),e.jsxs("button",{type:"button",className:"btn btn--primary",onClick:()=>void se(),disabled:g,"aria-busy":g,children:[g?e.jsx("span",{className:"spinner"}):null,"Tạo đề tài"]})]})]})]})}),(p==null?void 0:p.kind)==="assign"&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Giao việc",onClick:D,children:e.jsxs("div",{className:"sheet",onClick:n=>n.stopPropagation(),children:[e.jsxs("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:["Giao việc · ",p.project.title]}),e.jsxs("div",{className:"field",style:{marginTop:"12px"},children:[e.jsx("label",{className:"field__label",htmlFor:"assign-assignee",children:"Nhân sự nhận việc"}),e.jsxs("select",{id:"assign-assignee",className:"select",value:C,onChange:n=>K(n.target.value),children:[e.jsx("option",{value:"",children:"Chọn nhân sự…"}),W.map(n=>e.jsxs("option",{value:n.employeeId,children:[n.fullName," — ",n.level]},n.employeeId))]}),P&&e.jsx("span",{className:"field__error",children:P})]}),j&&e.jsx("div",{className:"banner banner--error",role:"alert",style:{marginTop:"12px"},children:j}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"16px"},children:[e.jsx("button",{type:"button",className:"btn btn--ghost",onClick:D,disabled:g,children:"Huỷ"}),e.jsxs("button",{type:"button",className:"btn btn--primary",onClick:()=>void pe(p.project),disabled:g,"aria-busy":g,children:[g?e.jsx("span",{className:"spinner"}):null,"Xác nhận giao việc"]})]})]})}),(p==null?void 0:p.kind)==="progress"&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Cập nhật tiến độ",onClick:D,children:e.jsxs("div",{className:"sheet",onClick:n=>n.stopPropagation(),children:[e.jsxs("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:["Cập nhật tiến độ · ",p.project.title]}),e.jsxs("div",{className:"field",style:{marginTop:"12px"},children:[e.jsx("label",{className:"field__label",htmlFor:"progress-value",children:"Tiến độ (%)"}),e.jsx("input",{id:"progress-value",className:"input",inputMode:"numeric",value:te,"aria-invalid":!(Number(te)>=0&&Number(te)<=100),onChange:n=>de(n.target.value)})]}),j&&e.jsx("div",{className:"banner banner--error",role:"alert",style:{marginTop:"12px"},children:j}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"16px"},children:[e.jsx("button",{type:"button",className:"btn btn--ghost",onClick:D,disabled:g,children:"Huỷ"}),e.jsxs("button",{type:"button",className:"btn btn--primary",onClick:()=>void me(p.project),disabled:g,"aria-busy":g,children:[g?e.jsx("span",{className:"spinner"}):null,"Lưu tiến độ"]})]})]})}),(p==null?void 0:p.kind)==="report"&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Nộp báo cáo",onClick:D,children:e.jsxs("div",{className:"sheet",onClick:n=>n.stopPropagation(),children:[e.jsxs("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:["Nộp báo cáo · ",p.project.title]}),e.jsxs("div",{className:"field",style:{marginTop:"12px"},children:[e.jsx("label",{className:"field__label",htmlFor:"report-content",children:"Nội dung báo cáo (bắt buộc)"}),e.jsx("textarea",{id:"report-content",className:"textarea",value:X,onChange:n=>U(n.target.value)})]}),e.jsxs("p",{style:{fontSize:"11px",color:"var(--text-faint)",marginTop:"8px"},children:["Nộp báo cáo sẽ chuyển đề tài sang PENDING_REVIEW (expectedVersion v",p.project.version,")."]}),j&&e.jsx("div",{className:"banner banner--error",role:"alert",style:{marginTop:"12px"},children:j}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"16px"},children:[e.jsx("button",{type:"button",className:"btn btn--ghost",onClick:D,disabled:g,children:"Huỷ"}),e.jsxs("button",{type:"button",className:"btn btn--primary",onClick:()=>void $(p.project),disabled:g,"aria-busy":g,children:[g?e.jsx("span",{className:"spinner"}):null,"Nộp báo cáo"]})]})]})}),(p==null?void 0:p.kind)==="review"&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Duyệt báo cáo",onClick:D,children:e.jsxs("div",{className:"sheet",onClick:n=>n.stopPropagation(),children:[e.jsxs("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:[p.action==="APPROVE"?"Duyệt báo cáo":"Từ chối báo cáo"," · ",p.project.title]}),e.jsxs("div",{className:"field",style:{marginTop:"12px"},children:[e.jsx("label",{className:"field__label",htmlFor:"review-reason",children:p.action==="REJECT"?"Lý do từ chối (bắt buộc)":"Ghi chú (tuỳ chọn)"}),e.jsx("textarea",{id:"review-reason",className:"textarea",value:Q,"aria-invalid":p.action==="REJECT"&&Q.trim().length===0,onChange:n=>ce(n.target.value)})]}),e.jsxs("p",{style:{fontSize:"11px",color:"var(--text-faint)",marginTop:"8px"},children:["Duyệt qua transition đề tài (PENDING_REVIEW → ",p.action==="APPROVE"?"COMPLETED":"IN_PROGRESS","). Endpoint review báo cáo theo reportId tồn tại nhưng API chưa có endpoint danh sách báo cáo để lấy reportId."]}),j&&e.jsx("div",{className:"banner banner--error",role:"alert",style:{marginTop:"12px"},children:j}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end",marginTop:"16px"},children:[e.jsx("button",{type:"button",className:"btn btn--ghost",onClick:D,disabled:g,children:"Huỷ"}),e.jsxs("button",{type:"button",className:`btn ${p.action==="REJECT"?"btn--danger":"btn--primary"}`,onClick:()=>void ge(p.project,p.action),disabled:g||p.action==="REJECT"&&Q.trim().length===0,"aria-busy":g,children:[g?e.jsx("span",{className:"spinner"}):null,p.action==="REJECT"?"Xác nhận từ chối":"Xác nhận duyệt"]})]})]})})]})},lt=["Intern","Junior","Middle","Senior","Lead"],dt=({onNotify:t})=>{const[i,d]=o.useState("roster"),[h,N]=o.useState(""),[T,w]=o.useState(""),[A,S]=o.useState(""),[f,u]=o.useState(""),[y,z]=o.useState(1),[I,E]=o.useState([]),[M,_]=o.useState(0),[W,x]=o.useState(1),[P,F]=o.useState(!0),[p,R]=o.useState(""),[g,m]=o.useState(null),[j,k]=o.useState(!1),[O,q]=o.useState(""),s=o.useCallback(async()=>{F(!0),R("");try{const l=await Te({q:T||void 0,level:A||void 0,status:f==="active"||f==="inactive"?f:void 0,page:y,limit:20});E(l.items),_(l.paging.totalItems),x(l.paging.totalPages||1)}catch(l){const v=l instanceof ee?`${l.code}: ${l.message}`:l instanceof Error?l.message:"Lỗi tải danh sách nhân sự";R(v),t(v,"error","Không tải được danh sách nhân sự")}finally{F(!1)}},[T,A,y,f,t]);o.useEffect(()=>{s()},[s]);const c=async l=>{k(!0),q(""),m(null);try{const v=await Ke(l);m(v)}catch(v){const C=v instanceof Error?v.message:"Lỗi tải hồ sơ nhân sự";q(C)}finally{k(!1)}};return e.jsxs("div",{style:{display:"flex",flexDirection:"column",gap:"16px"},children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:"12px",flexWrap:"wrap"},children:[e.jsxs("div",{children:[e.jsx("h2",{style:{fontSize:"16px",fontWeight:700,color:"#f8fafc"},children:"Hồ Sơ Nhân Sự (F1)"}),e.jsx("p",{style:{fontSize:"11px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:"Allowlist DTO · phạm vi phòng ban do máy chủ quyết định theo JWT · không thấy CCCD/bank/lương"})]}),e.jsxs("div",{className:"tabs",role:"tablist","aria-label":"Chế độ xem F1",children:[e.jsx("button",{type:"button",role:"tab",className:"tab","aria-selected":i==="roster",onClick:()=>d("roster"),children:"Danh sách"}),e.jsx("button",{type:"button",role:"tab",className:"tab","aria-selected":i==="queue",onClick:()=>d("queue"),children:"Hàng đợi duyệt"})]})]}),i==="roster"&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{style:{display:"flex",gap:"8px",flexWrap:"wrap",alignItems:"flex-end"},children:[e.jsxs("div",{className:"field",style:{minWidth:"220px",flex:"1 1 220px"},children:[e.jsx("label",{className:"field__label",htmlFor:"roster-query",children:"Tìm theo tên / mã NV"}),e.jsx("input",{id:"roster-query",className:"input",value:h,placeholder:"Tên hoặc mã nhân viên…",onChange:l=>N(l.target.value),onKeyDown:l=>{l.key==="Enter"&&(z(1),w(h.trim()))}})]}),e.jsxs("div",{className:"field",style:{minWidth:"150px"},children:[e.jsx("label",{className:"field__label",htmlFor:"roster-level",children:"Cấp bậc"}),e.jsxs("select",{id:"roster-level",className:"select",value:A,onChange:l=>{z(1),S(l.target.value)},children:[e.jsx("option",{value:"",children:"Tất cả"}),lt.map(l=>e.jsx("option",{value:l,children:l},l))]})]}),e.jsxs("div",{className:"field",style:{minWidth:"150px"},children:[e.jsx("label",{className:"field__label",htmlFor:"roster-status",children:"Trạng thái"}),e.jsxs("select",{id:"roster-status",className:"select",value:f,onChange:l=>{z(1),u(l.target.value)},children:[e.jsx("option",{value:"",children:"Tất cả"}),e.jsx("option",{value:"active",children:"Đang hoạt động"}),e.jsx("option",{value:"inactive",children:"Tạm dừng"})]})]}),e.jsx("button",{type:"button",className:"btn btn--primary",onClick:()=>{z(1),w(h.trim())},children:"Lọc"}),e.jsx("button",{type:"button",className:"btn",onClick:()=>void s(),disabled:P,children:"Làm mới"})]}),P&&e.jsx("div",{style:{display:"flex",flexDirection:"column",gap:"8px"},children:[0,1,2,3].map(l=>e.jsx("div",{className:"skeleton",style:{height:"48px"}},l))}),!P&&p&&e.jsxs("div",{className:"banner banner--error",role:"alert",children:[e.jsxs("span",{children:["Không tải được danh sách nhân sự: ",p]}),e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>void s(),children:"Thử lại"})]}),!P&&!p&&I.length===0&&e.jsxs("div",{className:"empty",children:[e.jsx("div",{style:{fontSize:"13px",fontWeight:600,color:"var(--text)"},children:T||A||f?"Không có nhân sự khớp bộ lọc":"Chưa có nhân sự trong phạm vi"}),e.jsx("p",{children:T||A||f?"Thử xoá bộ lọc để xem toàn bộ phạm vi được giao.":"Máy chủ trả về danh sách rỗng cho phạm vi phòng ban của tài khoản này."}),(T||A||f)&&e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>{N(""),w(""),S(""),u(""),z(1)},children:"Xoá bộ lọc"})]}),!P&&!p&&I.length>0&&e.jsxs(e.Fragment,{children:[e.jsxs("div",{style:{fontSize:"11px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:[M," nhân sự · trang ",y,"/",W]}),e.jsx("div",{className:"card table-wrap",style:{overflow:"hidden"},children:e.jsxs("table",{className:"table",children:[e.jsx("thead",{children:e.jsxs("tr",{children:[e.jsx("th",{children:"Mã NV / Họ tên"}),e.jsx("th",{children:"Cấp bậc"}),e.jsx("th",{children:"Phòng ban / Điểm bán"}),e.jsx("th",{children:"Kỹ năng"}),e.jsx("th",{children:"Trạng thái"}),e.jsx("th",{style:{textAlign:"right"},children:"Hồ sơ"})]})}),e.jsx("tbody",{children:I.map(l=>e.jsxs("tr",{children:[e.jsxs("td",{children:[e.jsx("div",{style:{fontWeight:600,color:"#f8fafc"},children:l.fullName}),e.jsx("div",{style:{fontSize:"10px",color:"var(--text-muted)",fontFamily:"var(--mono)"},children:l.employeeId})]}),e.jsx("td",{style:{color:"var(--accent-primary)",fontWeight:600},children:l.level}),e.jsx("td",{style:{color:"var(--text-muted)"},children:l.department}),e.jsx("td",{children:e.jsxs("div",{style:{display:"flex",flexWrap:"wrap",gap:"4px"},children:[l.skills.slice(0,3).map(v=>e.jsx("span",{className:"chip",children:v},v)),l.skills.length===0&&e.jsx("span",{style:{color:"var(--text-faint)"},children:"—"})]})}),e.jsx("td",{children:e.jsx("span",{className:`chip ${l.status==="active"?"chip--ok":"chip--err"}`,children:l.status==="active"?"hoạt động":"tạm dừng"})}),e.jsx("td",{style:{textAlign:"right"},children:e.jsx("button",{type:"button",className:"btn btn--sm",onClick:()=>void c(l.employeeId),children:"Xem"})})]},l.employeeId))})]})}),e.jsxs("div",{style:{display:"flex",gap:"8px",justifyContent:"flex-end"},children:[e.jsx("button",{type:"button",className:"btn btn--sm",disabled:y<=1,onClick:()=>z(l=>Math.max(1,l-1)),children:"Trang trước"}),e.jsx("button",{type:"button",className:"btn btn--sm",disabled:y>=W,onClick:()=>z(l=>l+1),children:"Trang sau"})]})]})]}),i==="queue"&&e.jsxs("div",{className:"empty",children:[e.jsx("div",{style:{fontSize:"13px",fontWeight:600,color:"var(--text)"},children:"Hàng đợi duyệt hồ sơ đang trong giai đoạn tích hợp — chưa khả dụng ở bản demo."}),e.jsx("p",{children:"Máy chủ chưa mở endpoint danh sách yêu cầu thay đổi hồ sơ, nên màn hình này không gọi mạng và không hiển thị dữ liệu giả."})]}),j&&e.jsx("div",{className:"overlay",children:e.jsxs("div",{className:"sheet",children:[e.jsx("div",{className:"skeleton",style:{height:"24px",width:"60%"}}),e.jsx("div",{className:"skeleton",style:{height:"16px",marginTop:"12px"}}),e.jsx("div",{className:"skeleton",style:{height:"16px",marginTop:"8px"}})]})}),(O||g)&&!j&&e.jsx("div",{className:"overlay",role:"dialog","aria-modal":"true","aria-label":"Chi tiết hồ sơ",onClick:()=>m(null),children:e.jsxs("div",{className:"sheet",onClick:l=>l.stopPropagation(),children:[e.jsxs("div",{style:{display:"flex",justifyContent:"space-between",alignItems:"center",gap:"10px"},children:[e.jsx("h3",{style:{fontSize:"14px",fontWeight:700,color:"#f8fafc"},children:"Chi tiết hồ sơ"}),e.jsx("button",{type:"button",className:"btn btn--ghost btn--sm",onClick:()=>m(null),children:"Đóng"})]}),O&&e.jsx("div",{className:"banner banner--error",role:"alert",style:{marginTop:"12px"},children:e.jsx("span",{children:O})}),g&&e.jsxs("dl",{style:{display:"grid",gridTemplateColumns:"auto 1fr",gap:"8px 14px",marginTop:"14px",fontSize:"12px"},children:[e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Họ tên"}),e.jsx("dd",{children:g.fullName}),e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"employeeId"}),e.jsx("dd",{style:{fontFamily:"var(--mono)"},children:g.employeeId}),We(g)&&e.jsxs(e.Fragment,{children:[e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Mã NV"}),e.jsx("dd",{style:{fontFamily:"var(--mono)"},children:g.employeeCode}),e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Điện thoại"}),e.jsx("dd",{children:g.phone??"—"}),e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Ngày vào làm"}),e.jsx("dd",{children:g.hiredAt??"—"})]}),e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Cấp bậc"}),e.jsx("dd",{children:g.level}),e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Phòng ban"}),e.jsx("dd",{children:g.department}),e.jsx("dt",{style:{color:"var(--text-faint)",fontFamily:"var(--mono)"},children:"Trạng thái"}),e.jsx("dd",{children:g.status})]}),e.jsx("p",{style:{fontSize:"11px",color:"var(--text-faint)",marginTop:"14px"},children:"Admin chỉ nhận allowlist EmployeeSummary. Trường nhạy cảm (CCCD, tài khoản ngân hàng, lương, lý do nghỉ) không nằm trong DTO nên không thể hiển thị."})]})})]})},ct=`
  <div data-slot="sidebar-wrapper" style="--sidebar-width:16rem;--sidebar-width-icon:16rem" class="group/sidebar-wrapper flex min-h-svh w-full h-svh overflow-hidden">

    <!-- SIDEBAR -->
    <aside class="crm-sidebar w-64 border-r border-white/[0.08] bg-neutral-900/70 backdrop-blur-xl flex flex-col justify-between shrink-0 select-none">
      <div class="flex flex-col">
        <!-- Brand Header with HR-BlockBot Logo -->
        <div class="p-4 border-b border-border/80 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex size-8 items-center justify-center rounded-xl bg-white/[0.04] p-1 border border-white/10 shrink-0">
              <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" class="size-6 object-contain" />
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5 leading-none">
                <span class="font-black tracking-wider text-foreground text-sm">GUTA</span>
                <span class="font-semibold tracking-tight text-foreground text-sm">WORKSPACE</span>
              </div>
            </div>
          </div>
          <a href="#logout" title="Trở về Trang Chủ" class="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </a>
        </div>

        <!-- Search Bar Trigger -->
        <div class="px-3 pt-3">
          <div class="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/70 bg-background/60 text-xs text-muted-foreground shadow-xs cursor-pointer hover:border-zinc-400/50 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" placeholder="Lọc theo tên, quận, mã..." class="flex-1 bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground w-full" />
            <kbd class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border shrink-0">⌘K</kbd>
          </div>
        </div>

        <!-- Navigation Menu with AI Copilot at TOP -->
        <nav class="px-2 py-3 space-y-1">
          <div class="px-2 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Trợ Lý Thông Minh</div>

          <a href="#" aria-label="Trợ Lý AI (Copilot)" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-zinc-700/10 text-zinc-300 border border-zinc-400/20 shadow-xs hover:bg-zinc-700/15 transition cursor-pointer mb-3">
            <div class="size-6 rounded-lg bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center text-white shadow-2xs shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </div>
            <span class="font-bold">Guta Copilot AI</span>
            <span class="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold bg-zinc-400/20 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-400/30"><span class="size-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>Trợ Lý AI (Copilot)</span>
          </a>

          <div class="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Hệ Thống Vận Hành</div>

          <button type="button" data-section="stores" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold bg-muted/60 text-foreground border border-border/80 text-left">Chi nhánh / Cửa hàng <span class="ml-auto">45</span></button>
          <button type="button" data-section="employees" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Nhân sự</button>
          <button type="button" data-section="schedules" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Hồ sơ nhân sự</button>
          <button type="button" data-section="settings" id="crm-nav-settings" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Cài đặt LLM</button>
        </nav>
      </div>

      <!-- User Profile at bottom -->
      <div class="p-3 border-t border-border bg-sidebar/50">
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-border/60 bg-background/80 shadow-xs">
          <div class="size-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-border shrink-0">PA</div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-foreground text-xs truncate">Nguyễn Thị Phương Anh</div>
            <div class="text-[10px] text-muted-foreground truncate" title="Cửa hàng trưởng (SM)">Cửa hàng trưởng (SM)</div>
          </div>
          <button type="button" role="button" aria-label="Đăng Xuất Phiên" title="Đăng Xuất Phiên" class="text-muted-foreground hover:text-red-500 p-1.5 rounded-md hover:bg-muted transition cursor-pointer shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- MAIN CONTENT INSET -->
    <div class="flex flex-col flex-1 h-svh overflow-hidden bg-background">

      <!-- TOP BAR (To hơn, mềm mại hơn) -->
      <header class="crm-header-smooth flex items-center justify-between shrink-0">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <span class="text-foreground/90 font-medium text-sm">Guta Workspace</span>
            <span class="text-muted-foreground/30 font-mono">/</span>
            <span class="text-foreground font-semibold text-sm">Vận Hành Chi Nhánh & Phân Ca</span>
          </div>
          <span class="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3.5 py-1 text-xs font-medium flex items-center gap-2 shadow-2xs">
            <span class="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
            45/45 Chi nhánh mở ca sáng
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2.5">
            <button type="button" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/80 bg-background/80 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs cursor-pointer active:scale-95 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span>Bộ lọc Quận</span>
            </button>
            <button type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-400 hover:to-zinc-700 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              <span>Tạo Ca Đột Xuất</span>
            </button>
          </div>
        </div>
      </header>

      <!-- DATA TABLE AREA -->
      <main class="flex-1 overflow-auto p-6">
        <div id="crm-stores-container">
        <!-- KPI SUMMARY RIBBON (Frosted Muted Slate Gray) -->
        <div class="crm-kpi-grid">
          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Tổng Cửa Hàng</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-300"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div class="crm-kpi-value">45 <small style="font-size: 13px; font-weight: 400; color: #94a3b8; font-family: sans-serif;">chi nhánh</small></div>
            <div class="crm-kpi-meta" style="color: #34d399;">
              <span style="width: 6px; height: 6px; border-radius: 9999px; background: #10b981;"></span>
              <span>100% mở ca 1</span>
            </div>
          </div>

          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Nhân Sự Trực Ca</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-300"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="crm-kpi-value">135 <small style="font-size: 13px; font-weight: 400; color: #94a3b8; font-family: sans-serif;">nhân sự</small></div>
            <div class="crm-kpi-meta" style="color: #94a3b8;">
              <span>Định biên 3 người / cửa hàng</span>
            </div>
          </div>

          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Doanh Thu Két Sáng</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-zinc-300"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            </div>
            <div class="crm-kpi-value" style="color: #e4e4e7;">184.250.000 ₫</div>
            <div class="crm-kpi-meta" style="color: #34d399;">
              <span>Khớp 99.94% máy POS</span>
            </div>
          </div>

          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Tỷ Lệ Đúng Giờ</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="crm-kpi-value">98.6%</div>
            <div class="crm-kpi-meta" style="color: #94a3b8;">
              <span>Đồng bộ ZKTeco vân tay</span>
            </div>
          </div>
        </div>

        <div class="mb-4 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold tracking-tight text-foreground">Chi Nhánh Cà Phê Guta (Khu Vực TP.HCM)</h1>
            <p class="text-xs text-muted-foreground mt-0.5">Dữ liệu nhân sự, ca làm việc hiện tại và doanh thu két thời gian thực. Bấm vào từng hàng để mở Slide-Over Drawer.</p>
          </div>
          <div class="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Hiển thị 10 / 45 Cửa hàng
          </div>
        </div>

        <!-- TABLE -->
        <div class="crm-table-shell rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md shadow-xs overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse min-w-[960px]">
            <thead class="crm-table-head bg-neutral-900/60 backdrop-blur-md">
              <tr class="border-b border-white/[0.06] font-semibold text-muted-foreground">
                <th class="py-3 px-3 whitespace-nowrap">Mã CH</th>
                <th class="py-3 px-3 whitespace-nowrap">Tên Cửa Hàng / Chi Nhánh</th>
                <th class="py-3 px-3 whitespace-nowrap">Cửa Hàng Trưởng (SM)</th>
                <th class="py-3 px-3 whitespace-nowrap">Quận</th>
                <th class="py-3 px-3 text-center whitespace-nowrap">Số Barista</th>
                <th class="py-3 px-3 whitespace-nowrap">Ca Hiện Tại</th>
                <th class="py-3 px-3 text-right whitespace-nowrap">Doanh Thu Két</th>
                <th class="py-3 px-3 text-center whitespace-nowrap">Đúng Giờ</th>
                <th class="py-3 px-3 text-center whitespace-nowrap">Trạng Thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/60 font-medium">

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-01" data-name="GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm" data-sm="Nguyễn Thị Phương Anh" data-district="Tân Bình" data-staff="46" data-shift="Ca 1 (06:00 - 14:00)" data-rev="8.420.000 ₫" data-ontime="100%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-01</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Thị Phương Anh</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Tân Bình</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">46</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">8.420.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">100%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-02" data-name="GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh" data-sm="Đỗ Quỳnh Anh" data-district="Quận 10" data-staff="56" data-shift="Ca 1 (06:00 - 14:00)" data-rev="12.150.000 ₫" data-ontime="98%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-02</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Đỗ Quỳnh Anh</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 10</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">56</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">12.150.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">98%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-03" data-name="GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân" data-sm="Nguyễn Lê Quang Trường" data-district="Bình Thạnh" data-staff="47" data-shift="Ca 1 (06:00 - 14:00)" data-rev="7.890.000 ₫" data-ontime="95%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-03</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Lê Quang Trường</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Bình Thạnh</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">47</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">7.890.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">95%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-04" data-name="GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai" data-sm="Nguyễn Thị Thu Trúc" data-district="Quận 3" data-staff="45" data-shift="Ca 1 (06:00 - 14:00)" data-rev="9.340.000 ₫" data-ontime="100%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-04</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Thị Thu Trúc</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 3</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">45</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">9.340.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">100%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-05" data-name="GUTA CAFE - Quận 3 - 41 Trần Cao Vân" data-sm="Triệu Quang Nhân" data-district="Quận 3" data-staff="45" data-shift="Ca 1 (06:00 - 14:00)" data-rev="8.120.000 ₫" data-ontime="96%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-05</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 3 - 41 Trần Cao Vân</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Triệu Quang Nhân</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 3</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">45</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">8.120.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">96%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-06" data-name="GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ" data-sm="Trương Quốc Thái" data-district="Quận 1" data-staff="43" data-shift="Ca 1 (06:00 - 14:00)" data-rev="6.950.000 ₫" data-ontime="94%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-06</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Trương Quốc Thái</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 1</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">43</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">6.950.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">94%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-07" data-name="GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm" data-sm="Thái Thanh Lam" data-district="Gò Vấp" data-staff="42" data-shift="Ca 1 (06:00 - 14:00)" data-rev="7.200.000 ₫" data-ontime="97%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-07</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Thái Thanh Lam</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Gò Vấp</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">42</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">7.200.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">97%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-08" data-name="GUTA CAFE - Gò Vấp - 30 Phạm Văn Đồng" data-sm="Lại Ngọc Hoàng Nguyên" data-district="Gò Vấp" data-staff="42" data-shift="Ca 1 (06:00 - 14:00)" data-rev="7.600.000 ₫" data-ontime="99%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-08</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Gò Vấp - 30 Phạm Văn Đồng</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Lại Ngọc Hoàng Nguyên</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Gò Vấp</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">42</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">7.600.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">99%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-09" data-name="GUTA CAFE - Bình Thạnh - 193F Điện Biên Phủ" data-sm="Nguyễn Cao Thanh Hằng" data-district="Bình Thạnh" data-staff="39" data-shift="Ca 1 (06:00 - 14:00)" data-rev="6.450.000 ₫" data-ontime="95%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-09</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Bình Thạnh - 193F Điện Biên Phủ</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Cao Thanh Hằng</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Bình Thạnh</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">39</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">6.450.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">95%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-10" data-name="GUTA CAFE - Quận 3 - 206 Pasteur" data-sm="Lê Ngọc Bảo Trân" data-district="Quận 3" data-staff="38" data-shift="Ca 1 (06:00 - 14:00)" data-rev="8.870.000 ₫" data-ontime="100%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-10</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-neutral-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 3 - 206 Pasteur</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Lê Ngọc Bảo Trân</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 3</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">38</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">8.870.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">100%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
        <div id="crm-custom-view-portal" class="space-y-6" style="display: none;"></div>
      </main>

    </div>
  </div>

  <!-- SLIDE-OVER DETAIL DRAWER -->
  <div id="drawer-backdrop" class="fixed inset-0 z-40 bg-black/60 backdrop-blur-md transition-opacity duration-200 opacity-0 pointer-events-none"></div>
  <aside id="detail-drawer" class="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-neutral-900/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col h-full transform translate-x-full transition-transform duration-200">
    <!-- Drawer Header (shrink-0) -->
    <div class="p-6 border-b border-border flex items-start justify-between bg-muted/20 shrink-0">
      <div>
        <span class="rounded-md bg-zinc-400/10 border border-zinc-400/20 text-zinc-300 px-2 py-0.5 text-[10px] font-bold font-mono uppercase" id="d-id">GT-CH-01</span>
        <h2 class="text-base font-bold text-foreground mt-2" id="d-name">GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm</h2>
        <p class="text-xs text-muted-foreground mt-0.5" id="d-district">Quận: Tân Bình • Cửa hàng trưởng: Nguyễn Thị Phương Anh</p>
      </div>
      <button type="button" aria-label="Đóng chi tiết" data-close-drawer class="size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition cursor-pointer shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Drawer Body (scrollable) -->
    <div class="p-6 space-y-5 flex-1 overflow-y-auto">
      <p class="text-xs text-muted-foreground" role="note">Hệ thống dữ liệu vận hành 45 chi nhánh chuỗi GUTA Cafe</p>

      <!-- Metrics Grid -->
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3.5 rounded-xl border border-border bg-background/80 shadow-2xs">
          <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block whitespace-nowrap">Doanh Thu Két Ca</span>
          <div class="text-base font-bold font-mono text-zinc-700 dark:text-zinc-300 mt-1" id="d-rev">8.420.000 ₫</div>
          <span class="text-[10px] text-emerald-400 font-medium block mt-1">↑ +14% so với ca hôm qua</span>
        </div>
        <div class="p-3.5 rounded-xl border border-border bg-background/80 shadow-2xs">
          <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block whitespace-nowrap">Tổng Nhân Sự</span>
          <div class="text-base font-bold font-mono text-foreground mt-1" id="d-staff">46 người</div>
          <span class="text-[10px] text-muted-foreground font-medium block mt-1" id="d-ontime">Đúng giờ: 100%</span>
        </div>
      </div>

      <!-- Shift Live Roster -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-bold text-foreground uppercase tracking-wider">Barista Đang Làm Ca Hiện Tại</h3>
          <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">Đủ 3 người</span>
        </div>

        <div class="space-y-2.5">
          <div class="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background/80 shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-full bg-zinc-400/10 text-zinc-700 dark:text-zinc-300 flex items-center justify-center font-bold text-xs ring-1 ring-zinc-400/25 shrink-0">QT</div>
              <div>
                <div class="text-xs font-semibold text-foreground">Trương Quốc Thái</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Pha chế chính (Barista) • Check-in: 05:55</div>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">Đúng ca</span>
          </div>

          <div class="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background/80 shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-full bg-zinc-400/15 text-zinc-400 flex items-center justify-center font-bold text-xs ring-1 ring-zinc-400/25 shrink-0">KN</div>
              <div>
                <div class="text-xs font-semibold text-foreground">Lê Thị Kim Ngân</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Thu ngân / Order • Check-in: 06:01</div>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">Đúng ca</span>
          </div>

          <div class="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background/80 shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold text-xs ring-1 ring-purple-500/25 shrink-0">VD</div>
              <div>
                <div class="text-xs font-semibold text-foreground">Nguyễn Văn Đạt</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Phụ ca / Rửa dụng cụ • Check-in: 06:00</div>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">Đúng ca</span>
          </div>
        </div>
      </div>

      <!-- AI Assistant Recommendation -->
      <div class="p-3.5 rounded-xl border border-zinc-500/20 bg-zinc-500/5">
        <div class="flex items-center gap-2 text-zinc-300 text-xs font-bold mb-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          <span>Trợ lý ca Guta AI</span>
        </div>
        <p class="text-[11px] text-foreground/80 leading-relaxed">
          Dự báo lượng khách giờ trưa (11:30 - 13:00) tại chi nhánh này tăng 35% do khu vực văn phòng. Khuyến nghị điều chuyển thêm 1 Barista Part-time hỗ trợ order máy cà phê.
        </p>
      </div>

    </div>

    <!-- Drawer Footer Actions (shrink-0) -->
    <div class="p-4 border-t border-border bg-neutral-900/95 flex items-center gap-2.5 shrink-0 z-10">
      <button type="button" class="flex-1 py-2.5 px-3 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white font-semibold text-xs transition shadow-sm text-center cursor-pointer">
        Gửi Cảnh Báo Telegram
      </button>
      <button type="button" aria-label="Đóng" data-close-drawer class="py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition cursor-pointer">
        Đóng
      </button>
    </div>
  </aside>
`,De='<svg class="animate-spin inline-block mr-1.5 size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>',xt=({userName:t,userRole:i,userScope:d,onLogout:h,onTelegramAlert:N,onOpenAiCopilot:T,onSwitchTab:w,onNotify:A})=>{const[S,f]=o.useState("stores"),[u,y]=o.useState(null),z=o.useRef(null),I=A||((x,P)=>{console.log(`[Toast ${x}] ${P}`)}),E=o.useRef(N);E.current=N;const M=o.useRef(T);M.current=T;const _=o.useRef(w);_.current=w;const W=o.useRef(h);return W.current=h,o.useEffect(()=>{const x=z.current;if(!x)return;const P=x.querySelector("main h1");P&&(P.textContent="Guta Workspace — Quản lý nhân sự & 45 chi nhánh");const F=x.querySelector("main h1 + p");F&&(F.textContent="Hồ sơ nhân sự • Điều phối ca trực • Quỹ két ca • Trợ lý AI Copilot");const p=x.querySelector(".size-8.rounded-full.bg-gradient-to-tr");p&&(p.textContent=t.split(/\s+/).filter(Boolean).slice(-2).map(r=>r[0]).join("").toUpperCase());const R=x.querySelector(".font-bold.text-foreground.text-xs");R&&(R.textContent=t);const g=x.querySelector(".text-\\[10px\\].text-muted-foreground.truncate");g&&(g.textContent=i+" • "+d);const m=x.querySelector("#detail-drawer");m==null||m.setAttribute("aria-label","Chi tiết vận hành chi nhánh");const j=x.querySelector("#drawer-backdrop"),k=[];let O="GT-CH-01";const q=(r,a,L,H,B,fe,be,ye)=>{O=r;const he=x.querySelector("#d-id"),xe=x.querySelector("#d-name"),ie=x.querySelector("#d-district"),ae=x.querySelector("#d-rev"),oe=x.querySelector("#d-staff"),le=x.querySelector("#d-ontime");he&&(he.textContent=r),xe&&(xe.textContent=a),ie&&(ie.textContent="Quận: "+H+" • Cửa hàng trưởng: "+L),ae&&(ae.textContent=be),oe&&(oe.textContent=B+" người"),le&&(le.textContent="Đúng giờ: "+ye),m==null||m.classList.remove("translate-x-full"),m==null||m.classList.add("drawer-open"),j==null||j.classList.add("backdrop-open")},s=()=>{m==null||m.classList.add("translate-x-full"),m==null||m.classList.remove("drawer-open"),j==null||j.classList.remove("backdrop-open")},c=window,l=c.openDrawer,v=c.closeDrawer;c.openDrawer=q,c.closeDrawer=s;const C=new AbortController,K=x.querySelectorAll("tbody tr");x.querySelectorAll("[onclick], [data-close-drawer]").forEach(r=>{var a;r.setAttribute("data-close-drawer",""),r.addEventListener("click",s,{signal:C.signal}),r.tagName==="BUTTON"&&!((a=r.textContent)!=null&&a.trim())&&r.setAttribute("aria-label","Đóng chi tiết"),r.removeAttribute("onclick")});const te=Array.from(K).filter(r=>r.querySelectorAll("td").length>=8);te.forEach(r=>{r.addEventListener("click",()=>{var ie,ae,oe,le,Ne,Se,Ee,Ae;const a=r.querySelectorAll("td"),L=r.getAttribute("data-id")||((ie=a[0].textContent)==null?void 0:ie.trim())||"",H=r.getAttribute("data-name")||((ae=a[1].textContent)==null?void 0:ae.trim())||"",B=r.getAttribute("data-sm")||((oe=a[2].textContent)==null?void 0:oe.trim())||"",fe=r.getAttribute("data-district")||((le=a[3].textContent)==null?void 0:le.trim())||"",be=r.getAttribute("data-staff")||((Ne=a[4].textContent)==null?void 0:Ne.trim())||"40",ye=r.getAttribute("data-shift")||((Se=a[5].textContent)==null?void 0:Se.trim())||"Ca 1",he=r.getAttribute("data-rev")||((Ee=a[6].textContent)==null?void 0:Ee.trim())||"8.000.000 ₫",xe=r.getAttribute("data-ontime")||((Ae=a[7].textContent)==null?void 0:Ae.trim())||"100%";q(L,H,B,fe,be,ye,he,xe)},{signal:C.signal})}),j==null||j.addEventListener("click",s),x.querySelectorAll("button").forEach(r=>{var a,L;((a=r.textContent)==null?void 0:a.trim())==="Đóng"?r.onclick=s:(L=r.textContent)!=null&&L.includes("Telegram")&&(r.onclick=H=>{H.preventDefault(),H.stopPropagation();const B=r;if(B.disabled)return;const fe=B.innerHTML;B.innerHTML=`${De} Đang gửi...`,B.disabled=!0,E.current(O),k.push(setTimeout(()=>{B.innerHTML=fe,B.disabled=!1},800))})});const de=x.querySelectorAll('input[type="text"], input[type="search"]'),X=x.querySelector("tbody"),U=document.createElement("tr");U.className="empty-state-row",U.innerHTML=`
      <td colspan="8" class="text-center py-10 px-4">
        <div class="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
          <div class="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shadow-2xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="opacity-70"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold text-foreground">Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.</p>
            <p class="text-xs text-muted-foreground">Vui lòng kiểm tra lại tên đường, mã chi nhánh hoặc xóa bộ lọc.</p>
          </div>
          <button type="button" class="reset-filter-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition active:scale-95 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>
      </td>
    `,U.hidden=!0,X==null||X.append(U);const Q=[];for(let r=0;r<3;r++){const a=document.createElement("tr");a.className="skeleton-preview-row",a.hidden=!0,a.innerHTML=`
        <td class="p-3"><div class="skeleton h-4 w-16"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-44"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-28"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-20"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-12"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-16"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-20"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-14"></div></td>
      `,X==null||X.append(a),Q.push(a)}const ce=r=>{te.forEach(a=>a.style.display="none"),Q.forEach(a=>a.hidden=!1),k.push(setTimeout(()=>{Q.forEach(a=>a.hidden=!0),r()},120))};let G="",ne="";const D=r=>{const a=r.toLowerCase().trim();let L=0;te.forEach(H=>{var ae,oe,le;const B=((ae=H.textContent)==null?void 0:ae.toLowerCase())||"",be=((le=(oe=H.querySelectorAll("td")[3])==null?void 0:oe.textContent)==null?void 0:le.trim().toLowerCase())||"",ye=!ne||be===ne.toLowerCase(),he=!a||B.includes(a),xe=!G||B.includes(G.toLowerCase()),ie=he&&xe&&ye;H.style.display=ie?"":"none",ie&&L++}),U.hidden=L>0},Z=U.querySelector(".reset-filter-btn");Z==null||Z.addEventListener("click",()=>{de.forEach(r=>{r.value=""}),G="",ne="",pe&&(pe.textContent="Bộ lọc Quận"),D("")},{signal:C.signal}),de.forEach(r=>{r.addEventListener("input",a=>{D(a.target.value)},{signal:C.signal})});const se=Array.from(x.querySelectorAll("button")).find(r=>{var a;return(a=r.textContent)==null?void 0:a.includes("Bộ lọc Quận")}),pe=se==null?void 0:se.querySelector("span"),we=["Tất cả quận","Quận 1","Quận 3","Quận 10","Tân Bình","Gò Vấp","Bình Thạnh"];let me=0;se&&(se.classList.add("active:scale-95","transition-transform"),se.addEventListener("click",r=>{r.preventDefault(),me=(me+1)%we.length;const a=we[me];ne=a==="Tất cả quận"?"":a,pe&&(pe.textContent=ne?`Quận: ${ne}`:"Bộ lọc Quận"),ce(()=>{D(Array.from(de).map(L=>L.value).find(Boolean)||"")})},{signal:C.signal}));const $=Array.from(x.querySelectorAll("button")).find(r=>{var a;return(a=r.textContent)==null?void 0:a.includes("Tạo Ca Đột Xuất")});$&&($.classList.add("active:scale-95","transition-transform"),$.addEventListener("click",r=>{if(r.preventDefault(),$.disabled)return;const a=$.innerHTML;$.innerHTML=`${De} Đang khởi tạo...`,$.disabled=!0,E.current("GT-EMERGENCY-SHIFT"),k.push(setTimeout(()=>{$.innerHTML=a,$.disabled=!1},800))},{signal:C.signal}));const ge=Array.from(x.querySelectorAll("button")).filter(r=>{var a;return/^(Tất cả|Ca [123])$/.test(((a=r.textContent)==null?void 0:a.trim())||"")}),re=r=>{var L,H;const a=r.currentTarget;G=((L=a.textContent)==null?void 0:L.trim())==="Tất cả"?"":((H=a.textContent)==null?void 0:H.trim())||"",ce(()=>{D(Array.from(de).map(B=>B.value).find(Boolean)||"")})};ge.forEach(r=>r.addEventListener("click",re)),x.querySelectorAll('[role="tab"]:not(button), [data-shift-filter]').forEach(r=>{var a;/^(Tất cả|Ca [123])$/.test(((a=r.textContent)==null?void 0:a.trim())||"")&&(r.addEventListener("click",re),ge.push(r))});const V=x.querySelectorAll('a[href="#logout"], a[title="Trở về Trang Chủ"], [aria-label="Đăng Xuất Phiên"]');V.forEach((r,a)=>{a===V.length-1&&(r.setAttribute("role","button"),r.setAttribute("aria-label","Đăng Xuất Phiên")),r.addEventListener("click",L=>{L.preventDefault(),W.current()},{signal:C.signal})});const je=r=>{if(r.key==="Escape"&&(m!=null&&m.classList.contains("drawer-open"))&&s(),(r.metaKey||r.ctrlKey)&&(r.key==="k"||r.key==="K")){r.preventDefault();const a=x.querySelector('input[type="text"], input[type="search"]');a==null||a.focus(),a==null||a.select()}};window.addEventListener("keydown",je),x.querySelectorAll("nav a").forEach(r=>{var a;(a=r.textContent)!=null&&a.includes("Copilot")&&r.addEventListener("click",L=>{var H;L.preventDefault(),_.current?_.current("chat"):(H=M.current)==null||H.call(M)},{signal:C.signal})});const n=x.querySelectorAll("nav [data-section]"),b=x.querySelector("#crm-nav-settings");b&&i!=="Admin"&&(b.style.display="none");const Y=x.querySelector("#crm-custom-view-portal");return Y&&y(Y),n.forEach(r=>{r.addEventListener("click",()=>{const a=r.dataset.section;a&&(a==="settings"&&i!=="Admin"||(f(a),n.forEach(L=>{L.classList.remove("bg-muted/60","text-foreground","border","border-border/80"),L.classList.add("text-zinc-400")}),r.classList.add("bg-muted/60","text-foreground","border","border-border/80"),r.classList.remove("text-zinc-400")))},{signal:C.signal})}),()=>{C.abort(),U.remove(),Q.forEach(r=>r.remove()),x.querySelectorAll("button").forEach(r=>{r.onclick=null}),c.openDrawer===q&&(l?c.openDrawer=l:delete c.openDrawer),c.closeDrawer===s&&(v?c.closeDrawer=v:delete c.closeDrawer),j==null||j.removeEventListener("click",s),window.removeEventListener("keydown",je),ge.forEach(r=>r.removeEventListener("click",re)),k.forEach(clearTimeout)}},[t,i,d]),o.useEffect(()=>{const x=z.current;if(!x)return;const P=x.querySelector("#crm-stores-container"),F=x.querySelector("#crm-custom-view-portal");P&&F&&(S==="stores"?(P.style.display="block",F.style.display="none"):(P.style.display="none",F.style.display="block"))},[S]),e.jsxs(e.Fragment,{children:[e.jsx("div",{ref:z,className:"min-h-full flex flex-col bg-background text-foreground antialiased",dangerouslySetInnerHTML:{__html:ct}}),u&&_e.createPortal(S==="employees"?e.jsx(st,{}):S==="schedules"?e.jsx(dt,{onNotify:I}):S==="projects"?e.jsx(ot,{onNotify:I}):S==="settings"&&i==="Admin"?e.jsx(nt,{onNotify:I}):null,u)]})};export{xt as CrmDashboardView};
