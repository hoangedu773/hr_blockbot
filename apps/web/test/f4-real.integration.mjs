// Explicit opt-in acceptance: real CRM Web/Node -> separately spawned real PhoBERT.
// Not part of mock tests and never silently skips/mocks missing model assets.
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
if(process.env.RUN_F4_REAL!=='1') throw new Error('REAL_F4_NOT_RUN: opt in only after resource preflight, installation and an explicitly declared integration coefficient; this is not a quality benchmark');
for(const name of ['F4_REAL_PYTHON','F4_MODEL_DIR','F4_SEGMENTER_DIR','F4_SEMANTIC_WEIGHT']) if(!process.env[name])throw new Error('Missing real F4 acceptance prerequisite: '+name);
const probe=createServer();await new Promise(resolve=>probe.listen(0,'127.0.0.1',resolve));const port=probe.address().port;await new Promise(resolve=>probe.close(resolve));
const key=randomBytes(32).toString('hex');const origin='http://127.0.0.1:'+port;
const env={};for(const name of ['PATH','Path','SystemRoot','SYSTEMROOT','TEMP','TMP','JAVA_HOME'])if(process.env[name])env[name]=process.env[name];
Object.assign(env,{PYTHONDONTWRITEBYTECODE:'1',PYTHON_DOTENV_DISABLED:'1',HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1',HF_HUB_DISABLE_IMPLICIT_TOKEN:'1',F4_SERVICE_KEY:key,F4_MODEL_DIR:process.env.F4_MODEL_DIR,F4_SEGMENTER_DIR:process.env.F4_SEGMENTER_DIR});
const child=spawn(process.env.F4_REAL_PYTHON,['-m','uvicorn','app.f4_gateway:app','--host','127.0.0.1','--port',String(port),'--no-access-log'],{cwd:fileURLToPath(new URL('../../ai-service/',import.meta.url)),env,stdio:['ignore','ignore','pipe'],windowsHide:true});
let diagnostic='';child.stderr.on('data',data=>{diagnostic=(diagnostic+data).slice(-3000);});
try{
  let ready=false;for(let i=0;i<100;i++){if(child.exitCode!==null)throw new Error('Real worker failed to start');try{ready=(await fetch(origin+'/health')).ok;}catch{}if(ready)break;await new Promise(resolve=>setTimeout(resolve,100));}
  if(!ready)throw new Error('Real worker not ready');
  const warm=await fetch(origin+'/rank',{method:'POST',headers:{'Content-Type':'application/json','x-f4-service-key':key},body:JSON.stringify({requestId:randomUUID(),requiredSkills:['Kiểm kê'],description:'Nhiệm vụ synthetic kiểm kê',candidates:[{id:'c0',skills:['Kiểm kê']}]}),signal:AbortSignal.timeout(60000)});
  if(!warm.ok)throw new Error('Real model load/forward failed; no mock substitution');
  const value=await warm.json();if(value.model!=='vinai/phobert-base'||value.revision!=='01daacda68afe13d83023d16ec647239e344a1e6')throw new Error('Unpinned model');
  process.env.F4_WORKER_ORIGIN=origin;process.env.F4_SERVICE_KEY=key;
  await import('./crm-workflow.integration.mjs');
  console.log('PASS REAL F4: real forward -> CRM initial/replacement advice -> manager confirmation -> consent, no automatic assignment');
}finally{if(child.exitCode===null){const done=new Promise(resolve=>child.once('close',resolve));child.kill();await done;}}
