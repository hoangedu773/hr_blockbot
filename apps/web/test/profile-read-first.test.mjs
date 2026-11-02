import {before,after,test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from './helpers/browser-deps.mjs';
// Rendering-only fixtures. Real REST/authorization/copied-Mongo checks live in the read-first handoff.
const dist=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const uid='000000000000000000000001',eid='000000000000000000000002';
let server,browser,origin;
before(async()=>{
 server=http.createServer((req,res)=>{const pathname=new URL(req.url,'http://127.0.0.1').pathname,file=path.join(dist,pathname==='/'?'index.html':pathname);if(!file.startsWith(dist+path.sep)||!fs.existsSync(file)){res.writeHead(404).end();return;}res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'application/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]??'application/octet-stream'});fs.createReadStream(file).pipe(res);});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});
});
after(async()=>{if(browser)await browser.close();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}});
async function fixture(initialCaps){
 const state={caps:initialCaps},context=await browser.newContext({viewport:{width:1440,height:960}}),page=await context.newPage();page.setDefaultTimeout(10000);
 const authorization=()=>({configured:true,profile:'sm',securityVersion:1,enforcement:'MIGRATING',capabilities:state.caps,pendingCapabilities:[],stores:[],delegations:[],grants:[{id:'11111111-1111-4111-8111-111111111111',profile:'sm',scope:{kind:'self',storeIds:[],regionIds:[],reportingEmployeeIds:[]},capabilities:state.caps,approvalRef:'SYNTHETIC_UI_FIXTURE_NOT_REAL_APPROVAL',grantedBy:'000000000000000000000099',grantedAt:'2026-01-01T00:00:00Z',validFrom:'2026-01-01T00:00:00Z',validUntil:null,revokedAt:null}]});
 await context.route('**/*',r=>{const u=new URL(r.request().url());if(u.origin!==origin)return r.abort('blockedbyclient');if(!u.pathname.startsWith('/api/'))return r.continue();
  if(u.pathname==='/api/auth/login')return r.fulfill({status:200,json:{accessToken:'synthetic-ui-token',user:{id:uid,role:'Employee',authorization:authorization()}}});
  if(u.pathname==='/api/auth/refresh')return r.fulfill({status:200,json:{accessToken:null}});
  if(u.pathname==='/api/auth/me')return r.fulfill({status:200,json:{userId:uid,employeeId:eid,role:'Employee',skills:[],authorization:authorization()}});
  if(u.pathname===`/api/employees/${eid}`)return r.fulfill({status:200,json:{employeeId:eid,fullName:'Synthetic read-first employee',employeeCode:'SYNTHETIC',department:'Demo',departmentId:null,level:'Senior',skills:[],activeLoad:0,status:'active',storeId:null,storeName:null,profileVersion:0,phone:null,hiredAt:null}});
  if(u.pathname===`/api/employees/${eid}/change-requests`)return r.fulfill({status:200,json:{items:[{id:'rejected-request',requestedBy:uid,requestedAt:'2026-01-01T00:00:00Z',status:'REJECTED',targetFields:{jobTitle:'Unchanged'},previousSnapshot:{},reviewedBy:'reviewer',reviewedAt:'2026-01-02T00:00:00Z',rejectionReason:'Synthetic fixture'}]}});
  return r.fulfill({status:403,json:{error:{code:'RBAC_DENIED',message:'Not granted'}}});
 });
 await page.goto(origin,{waitUntil:'networkidle'});await page.getByRole('button',{name:'Get Started',exact:true}).click();await page.locator('#login-username').fill('synthetic');await page.locator('#login-password').fill('synthetic-only-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.crm-sidebar').waitFor();await page.locator('.crm-sidebar [data-section="profile"]').click();await page.getByRole('heading',{name:'Synthetic read-first employee',exact:true}).waitFor();await page.getByText('Synthetic fixture',{exact:false}).waitFor();return {state,context,page};
}
test('READ_FIRST renders own profile without edit, create or rejected-request resubmit controls',async()=>{
 const {context,page}=await fixture(['profile.read_self','authorization.inspect_self']);try{for(const name of ['Sửa','Tạo yêu cầu','Sửa và gửi lại yêu cầu'])assert.equal(await page.getByRole('button',{name,exact:true}).count(),0);await page.getByText('Tài khoản hiện chỉ được xem hồ sơ; chưa được cấp quyền gửi yêu cầu thay đổi.',{exact:true}).waitFor();}finally{await context.close();}
});
test('Existing explicitly granted edit/request flows remain available',async()=>{
 const {context,page}=await fixture(['profile.read_self','authorization.inspect_self','profile.update_self_basic','profile.request_self']);try{await page.getByRole('button',{name:'Sửa',exact:true}).click();await page.locator('#own-phone').waitFor();await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();await page.locator('#target-hired-at').waitFor();await page.getByRole('button',{name:'Sửa và gửi lại yêu cầu',exact:true}).waitFor();}finally{await context.close();}
});
test('Permission refresh closes open forms after edit/request capabilities are removed',async()=>{
 const {state,context,page}=await fixture(['profile.read_self','authorization.inspect_self','profile.update_self_basic','profile.request_self']);try{await page.getByRole('button',{name:'Sửa',exact:true}).click();await page.locator('#own-phone').waitFor();await page.getByRole('button',{name:'Tạo yêu cầu',exact:true}).click();await page.locator('#target-hired-at').waitFor();state.caps=['profile.read_self','authorization.inspect_self'];await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await page.locator('#own-phone').waitFor({state:'detached'});await page.locator('#target-hired-at').waitFor({state:'detached'});assert.equal(await page.getByRole('button',{name:'Sửa và gửi lại yêu cầu',exact:true}).count(),0);}finally{await context.close();}
});
