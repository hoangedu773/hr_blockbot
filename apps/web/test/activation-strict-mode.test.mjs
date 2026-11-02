import {describe,it,before,after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import {chromium,transform,reactUmdPath,reactDomUmdPath} from './helpers/browser-deps.mjs';

// Actual AppContent and ActivationView source under development React StrictMode.
// HTTP transport is mocked here; backend one-use/CAS is covered by API tests.
const appSource=fs.readFileSync(new URL('../src/App.tsx',import.meta.url),'utf8');
const appContent=appSource.slice(appSource.indexOf('export const AppContent:'),appSource.indexOf('export const App:')).replace('export const AppContent:','const AppContent:');
const activation=fs.readFileSync(new URL('../src/components/ActivationView.tsx',import.meta.url),'utf8').replace(/^import .*?;\r?\n/gm,'').replace('export function ActivationView','function ActivationView');
const stub=`const {useState,useEffect,useCallback}=React;
const API_BASE='/api';
const useAuth=()=>({user:null,isAuthenticated:false,isLoading:false,login:async()=>{},logout:async()=>{},changePassword:async()=>{}});
const BrandMark=()=>null,ToastContainer=()=>null,ChangePasswordModal=()=>null,CrmDashboardView=()=>null,ChatPageView=()=>null;
const DemoErrorBoundary=({children})=>children;
const FolioLandingView=()=>React.createElement('div',{'data-testid':'landing'},'Landing');`;
const compiled=await transform(stub+'\n'+activation+'\n'+appContent+`\nReactDOM.createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(AppContent)));`,{loader:'tsx',format:'iife',target:'es2022'});
let browser,server,origin;
describe('Activation URL state is pure across StrictMode double initialization',()=>{
 before(async()=>{server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<div id="root"></div>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;browser=await chromium.launch({headless:true});});
 after(async()=>{await browser?.close();server.closeAllConnections();await new Promise(r=>server.close(r));});
 async function mount(fragment){
  const ctx=await browser.newContext();const page=await ctx.newPage();const calls=[],consumed=new Set();const errors=[];page.on('pageerror',e=>errors.push(e.name));
  await ctx.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin!==origin)return route.abort();
   if(url.pathname.startsWith('/api/')){const body=route.request().postDataJSON();calls.push({path:url.pathname,body});const used=consumed.has(body.token);consumed.add(body.token);return route.fulfill({status:used?400:204});}
   return route.continue();
  });
  async function render(){await page.goto(origin+'/?source=local'+fragment);await page.addScriptTag({path:reactUmdPath});await page.addScriptTag({path:reactDomUmdPath});await page.addScriptTag({content:compiled.code});}
  await render();return{ctx,page,calls,errors,render};
 }
 it('activate, reactivate and recover keep token in memory, clear fragment, route correctly and preserve replay denial',async()=>{
  for(const [key,path]of [['activate','activate'],['reactivate','reactivate'],['recover','recover-password'],['legacy-import','activate-legacy']]){
   const token=({'activate':'a','reactivate':'b','recover':'c','legacy-import':'d'})[key].repeat(64),h=await mount('#'+key+'='+token);
   try{
    await h.page.getByLabel('Mật khẩu mới',{exact:true}).waitFor({timeout:5000});assert.equal(new URL(h.page.url()).hash,'');assert.equal(new URL(h.page.url()).search,'?source=local');
    await h.page.getByLabel('Mật khẩu mới',{exact:true}).fill('SyntheticStrictMode@2026');await h.page.getByLabel('Nhập lại mật khẩu',{exact:true}).fill('SyntheticStrictMode@2026');await h.page.getByRole('button',{name:'Thiết lập mật khẩu',exact:true}).click();await h.page.getByText('Đã thiết lập mật khẩu. Bạn có thể đăng nhập bằng mã nhân viên.',{exact:true}).waitFor();
    assert.equal(h.calls.length,1);assert.equal(h.calls[0].path,'/api/auth/'+path);assert.equal(h.calls[0].body.token,token);
    await h.render();await h.page.getByLabel('Mật khẩu mới',{exact:true}).waitFor();await h.page.getByLabel('Mật khẩu mới',{exact:true}).fill('SyntheticStrictMode@2026');await h.page.getByLabel('Nhập lại mật khẩu',{exact:true}).fill('SyntheticStrictMode@2026');await h.page.getByRole('button',{name:'Thiết lập mật khẩu',exact:true}).click();await h.page.getByRole('alert').waitFor();assert.equal(h.calls.length,2);assert.equal(h.errors.length,0);
    assert.equal(await h.page.evaluate(t=>[localStorage,sessionStorage].some(s=>Object.values(s).some(v=>String(v).includes(t))),token),false);
   }finally{await h.ctx.close();}
  }
 });
 it('invalid token does not open setup or send a request and is removed from the URL',async()=>{
  const h=await mount('#recover=synthetic-invalid');try{await h.page.getByTestId('landing').waitFor();assert.equal(new URL(h.page.url()).hash,'');assert.equal(await h.page.getByLabel('Mật khẩu mới',{exact:true}).count(),0);assert.equal(h.calls.length,0);}finally{await h.ctx.close();}
 });
});
