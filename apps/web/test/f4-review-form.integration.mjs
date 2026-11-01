// Offline form component test. ALL ratings/metadata below are UI-UNIT fixtures,
// not actual pilot labels, human evidence, or a model-quality benchmark.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from './helpers/browser-deps.mjs';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const template=fs.readFileSync(path.join(root,'apps/ai-service/eval/review_form.html'),'utf8');
const protocol=JSON.parse(fs.readFileSync(path.join(root,'apps/ai-service/eval/f4-evaluation-protocol.proposed.json'),'utf8'));
const packet={version:1,synthetic:true,sourceDatasetSha256:'ui-unit-not-a-pilot-hash',reviewerSlot:'A',reviewer:'',completedAt:null,
  rubricStatus:'PROPOSED_FOR_REVIEW',proposedRubric:protocol.rubric,proposedProtocolSha256:'ui-unit-protocol',warning:'UI UNIT DATA ONLY',
  tasks:Array.from({length:20},(_,i)=>({id:`ui-unit-task-${i}`,title:i?'Unit task':'<img src=x onerror="window.__xss=true">',description:'UI unit only',requiredSkills:['Unit skill'],
    candidates:Array.from({length:10},(_,j)=>({id:`ui-unit-candidate-${i}-${j}`,skills:['<b>Unit literal skill</b>'],relevance:null,reason:'',independentHumanAttestation:false}))}))};
const directory=fs.mkdtempSync(path.join(os.tmpdir(),'f4-review-ui-unit-'));
const target=path.join(directory,'unit-only.html');
fs.writeFileSync(target,template.replace('__PACKET_JSON__',JSON.stringify(packet).replaceAll('<','\\u003c')).replace('__PROTOCOL_JSON__',JSON.stringify(protocol).replaceAll('<','\\u003c')));
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({acceptDownloads:true});const page=await context.newPage();
const errors=[],network=[];page.on('pageerror',error=>errors.push(error.message));
page.on('request',request=>{if(/^https?:/.test(request.url()))network.push(request.url());});
page.on('dialog',dialog=>dialog.accept());
try{
  await page.goto(pathToFileURL(target).href);
  assert.equal(await page.locator('input[type=radio]:checked').count(),0);
  assert.equal(await page.locator('input[type=checkbox]:checked').count(),0);
  assert.equal(await page.locator('#reviewer').inputValue(),'');assert.equal(await page.locator('#completed-at').inputValue(),'');
  await page.getByRole('heading',{name:/<img src=x/}).waitFor();
  assert.equal(await page.evaluate(()=>window.__xss),undefined);assert.equal(await page.locator('img').count(),0);
  console.log('PASS UI UNIT: no automatic labels/reviewer/time/attestation; source text is inert');
  await page.getByRole('radio',{name:'Mức 2 cho ui-unit-candidate-0-0',exact:true}).check();
  await page.getByRole('textbox',{name:'Lý do cho ui-unit-candidate-0-0',exact:true}).fill('UI-unit simulated typing; not a human label');
  assert.equal(await page.getByRole('checkbox',{name:'Tôi tự chấm độc lập ui-unit-candidate-0-0',exact:true}).isChecked(),false);
  await page.getByRole('checkbox',{name:'Tôi tự chấm độc lập ui-unit-candidate-0-0',exact:true}).check();
  await page.getByRole('button',{name:'Sau',exact:true}).click();await page.getByRole('button',{name:'Trước',exact:true}).click();
  assert.equal(await page.getByRole('radio',{name:'Mức 2 cho ui-unit-candidate-0-0',exact:true}).isChecked(),true);
  await page.getByRole('button',{name:'Kiểm tra đủ điều kiện bàn giao'}).click();await page.getByRole('status').getByText(/Chưa hoàn tất: 1\/200/).waitFor();
  assert.equal(await page.locator('#completed-at').inputValue(),'');
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Tải JSON bản nháp / đã chấm'}).click();
  const download=await downloading;const saved=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
  assert.equal(saved.completedAt,null);assert.equal(saved.reviewer,'');
  assert.equal(saved.tasks.flatMap(task=>task.candidates).filter(row=>row.relevance!==null).length,1);
  assert.deepEqual(saved.tasks[1],packet.tasks[1]);
  const draft=path.join(directory,'unit-draft.json');fs.writeFileSync(draft,JSON.stringify(saved));
  await page.reload();await page.locator('#import').setInputFiles(draft);
  assert.equal(await page.getByRole('radio',{name:'Mức 2 cho ui-unit-candidate-0-0',exact:true}).isChecked(),true);
  // Simulated input on invented UI data only, never actual review packets.
  await page.locator('#reviewer').fill('unit-ui-reviewer-not-a-human');
  await page.locator('#completed-at').fill('2000-01-01T00:00:00Z');
  const metadataDownload=page.waitForEvent('download');await page.getByRole('button',{name:'Tải JSON bản nháp / đã chấm'}).click();
  const withMetadata=JSON.parse(fs.readFileSync(await (await metadataDownload).path(),'utf8'));
  assert.equal(withMetadata.reviewer,'unit-ui-reviewer-not-a-human');assert.equal(withMetadata.completedAt,'2000-01-01T00:00:00Z');
  assert.equal(withMetadata.tasks.flatMap(task=>task.candidates).filter(row=>row.independentHumanAttestation).length,1);
  console.log('PASS UI UNIT: explicit per-row input only; draft round-trip retains original IDs and untouched rows');
  const invalid=structuredClone(saved);invalid.tasks[0].candidates[0].skills=['tampered'];const invalidPath=path.join(directory,'unit-invalid.json');fs.writeFileSync(invalidPath,JSON.stringify(invalid));
  await page.locator('#import').setInputFiles(invalidPath);await page.getByRole('status').getByText(/Không nhập: Sai phiếu/).waitFor();
  const other=structuredClone(saved);other.reviewerSlot='B';const otherPath=path.join(directory,'unit-other.json');fs.writeFileSync(otherPath,JSON.stringify(other));
  await page.locator('#import').setInputFiles(otherPath);await page.getByRole('status').getByText(/Không nhập: Sai phiếu/).waitFor();
  assert.equal(await page.getByRole('radio',{name:'Mức 2 cho ui-unit-candidate-0-0',exact:true}).isChecked(),true);
  await page.setViewportSize({width:375,height:812});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#reviewer').focus();await page.keyboard.press('Tab');assert.equal(await page.locator('#completed-at').evaluate(el=>el===document.activeElement),true);
  assert.deepEqual(network,[]);assert.deepEqual(errors,[]);
  console.log('PASS UI UNIT: wrong reviewer/tampered evidence rejected; mobile/keyboard; no HTTP or page errors');
}finally{
 await browser.close();
 // The directory contains only invented UI fixtures and may be inspected locally.
 console.log('Retained disposable UI-unit fixtures:',directory);
}
