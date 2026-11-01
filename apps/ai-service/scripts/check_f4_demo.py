"""Owned offline worker startup/warm-up check; NOT a pilot quality benchmark.

Never changes server flags, installs packages, reads HR data or starts CRM.
"""
import argparse
import json
import math
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
from uuid import uuid4
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from scripts.prepare_f4 import resources
from app.f4_encoder import MODEL, REVISION


def check_response(body, request_id):
    assert set(body)=={'requestId','model','revision','items'}
    assert body['requestId']==request_id and body['model']==MODEL and body['revision']==REVISION
    assert len(body['items'])==1 and body['items'][0]['id']=='c0'
    for row in body['items']:
        score=row['semanticScore']
        assert type(score) in (int,float) and math.isfinite(score) and 0<=score<=1


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--python',type=Path,required=True)
    parser.add_argument('--model-dir',type=Path,required=True)
    parser.add_argument('--segmenter-dir',type=Path,required=True)
    parser.add_argument('--java-home',type=Path,required=True)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    log_path=args.output.with_suffix('.worker.log')
    if args.output.exists() or log_path.exists():
        raise FileExistsError('Existing evidence retained; choose a new output')
    samples=[]
    for index in range(5):
        sample=resources(args.model_dir);samples.append(sample)
        print(json.dumps({'preflightSample':index+1,**sample}),flush=True)
        if index<4:time.sleep(2)
    report={'scope':'LOCAL_SYNTHETIC_DEMO_SMOKE_NOT_QUALITY_BENCHMARK','resources':samples,
            'productionFlagsChanged':False,'workerLog':str(log_path),'status':'BLOCKED_RESOURCES'}
    if not all(sample['ready'] for sample in samples):
        with args.output.open('x',encoding='utf-8') as handle:json.dump(report,handle,indent=2)
        raise SystemExit('RESOURCE_BUDGET_NOT_MET; no worker started')
    if not args.python.is_file() or not args.model_dir.is_dir() or not args.segmenter_dir.is_dir():
        raise ValueError('Missing dedicated runtime or pinned local artifacts')
    if os.name=='nt' and not (args.java_home/'bin/server/jvm.dll').is_file():
        raise ValueError('Missing existing JDK; do not change Windows settings')
    env={key:value for key,value in os.environ.items() if key.upper() in ('PATH','SYSTEMROOT','WINDIR','COMSPEC','PATHEXT','TEMP','TMP')}
    key=secrets.token_hex(32)
    env.update(PYTHONDONTWRITEBYTECODE='1',PYTHON_DOTENV_DISABLED='1',JAVA_HOME=str(args.java_home.resolve()),
               HF_HUB_OFFLINE='1',TRANSFORMERS_OFFLINE='1',HF_HUB_DISABLE_IMPLICIT_TOKEN='1',HF_HUB_DISABLE_TELEMETRY='1',
               F4_MODEL_DIR=str(args.model_dir.resolve()),F4_SEGMENTER_DIR=str(args.segmenter_dir.resolve()),F4_SERVICE_KEY=key)
    with socket.socket() as reservation:
        reservation.bind(('127.0.0.1',0));port=reservation.getsockname()[1]
    import httpx
    origin=f'http://127.0.0.1:{port}'
    started=time.perf_counter();child=None
    with log_path.open('x',encoding='utf-8') as worker_log:
        try:
            child=subprocess.Popen([str(args.python.resolve()),'-m','uvicorn','app.f4_gateway:app','--host','127.0.0.1',
                                    '--port',str(port),'--no-access-log'],cwd=Path(__file__).resolve().parents[1],env=env,
                                   stdout=worker_log,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
            with httpx.Client(trust_env=False,follow_redirects=False) as client:
                # Same bounded startup readiness as the existing real browser harness.
                ready=False
                for _ in range(100):
                    if child.poll() is not None:raise RuntimeError('Owned worker exited; inspect retained worker log')
                    try:
                        response=client.get(origin+'/health',timeout=1)
                        if response.status_code==200:ready=True;break
                    except httpx.HTTPError:pass
                    time.sleep(.1)
                assert ready,'Owned worker startup failed'
                initial=response.json();assert initial=={'mode':'f4-read-only','loaded':False}
                report['startupToHealthMs']=(time.perf_counter()-started)*1000
                def payload():return {'requestId':str(uuid4()),'requiredSkills':['Kiểm kê'],
                                      'description':'Synthetic demo warm-up only','candidates':[{'id':'c0','skills':['Kiểm kê']}]}
                body=payload()
                auth_status=[client.post(origin+'/rank',json=body,timeout=8).status_code,
                             client.post(origin+'/rank',json=body,headers={'x-f4-service-key':'wrong-unit-key'},timeout=8).status_code]
                assert auth_status==[401,401]
                headers={'x-f4-service-key':key}
                assert client.post(origin+'/rank',json={**body,'jwt':'forged-synthetic'},headers=headers,timeout=8).status_code==422
                start=time.perf_counter()
                # Explicit synthetic prewarm, same 60s budget as the already accepted
                # real E2E harness. Node's real user-request timeout remains 8s.
                response=client.post(origin+'/rank',json=body,headers=headers,timeout=60)
                response.raise_for_status();check_response(response.json(),body['requestId'])
                report['coldSyntheticWarmupMs']=(time.perf_counter()-start)*1000
                assert client.get(origin+'/health',timeout=1).json()=={'mode':'f4-read-only','loaded':True}
                times=[]
                for _ in range(3):
                    body=payload();start=time.perf_counter()
                    response=client.post(origin+'/rank',json=body,headers=headers,timeout=8)
                    response.raise_for_status();check_response(response.json(),body['requestId'])
                    times.append((time.perf_counter()-start)*1000)
                report.update(status='PASS',model=MODEL,revision=REVISION,serviceAuthStatus=auth_status,
                              extraFieldStatus=422,healthLoaded=True,warmSyntheticRequestMs=times,
                              nodeDeadlineSecondsUnchanged=8,alphaSelected=False)
                assert child.poll() is None, 'Worker exited before harness cleanup'
        except BaseException as error:
            report.update(status='FAIL',errorType=type(error).__name__)
            raise
        finally:
            if child is not None:
                report['cleanupRequestedByHarness']=child.poll() is None
                if child.poll() is None:
                    child.terminate()
                    try:child.wait(timeout=5)
                    except subprocess.TimeoutExpired:child.kill();child.wait(timeout=5)
                report['ownedWorkerExitCode']=child.returncode
            worker_log.flush()
            text=log_path.read_text(encoding='utf-8',errors='replace')
            report['nativeDiagnosticObserved']=any(word in text.lower() for word in ('access violation','fatal error','fatal exception'))
            with args.output.open('x',encoding='utf-8') as handle:json.dump(report,handle,ensure_ascii=False,indent=2)
    # Retain the complete worker log. This final summary does not alter it.
    print(json.dumps(report),flush=True)


if __name__=='__main__':main()
