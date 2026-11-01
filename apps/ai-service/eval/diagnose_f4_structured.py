"""V5: offline payload audit, then at most three explicit live POST probes.

No automatic provider calls, key search/rotation, labels, billing or legacy reset.
Request bodies are saved WITHOUT headers; inputs are synthetic or a boolean probe.
"""
import argparse
import copy
from datetime import datetime,timezone
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import sys
import time
from uuid import uuid4
import httpx
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from f4_gemini_judge import (MODEL,ORIGIN,confirmation,read_jobs,inspect_checkpoint,response_schema,
    strict_json,parse_batch,safe_failure,append_event,journal,label_rows)
from f4_review_validation import load_json,require
from scripts.f4_judge_secret import load_key,DEFAULT_KEY_FILE

ROOT=Path(__file__).resolve().parents[4]/'outputs'
DESTINATION=ROOT/'phobert-f4-ai-judge-v5'
RUN=ROOT/'phobert-f4-ai-judge-v3/gemini-run-02'
CONSENT=ROOT/'phobert-f4-ai-judge-v3/free-tier-confirmation.json'
PILOT=Path(__file__).with_name('f4-pilot.json')
TINY={'type':'object','properties':{'ok':{'type':'boolean'}},'required':['ok']}
VARIANTS=('tiny-current','tiny-legacy','tiny-legacy-no-thinking','pair-current','pair-current-unbounded','pair-legacy')


def digest(value):return hashlib.sha256(json.dumps(value,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def jobs_and_seed():
    _,_,_,jobs=read_jobs(PILOT,RUN)
    rows,judge,_,pending=inspect_checkpoint(RUN,jobs,confirmation(CONSENT))
    require(not pending,'UNFINISHED_V4_REQUEST_REQUIRES_INSPECTION')
    done={(row['taskId'],row['candidateId']) for row in rows}
    return jobs,rows,judge,[job for job in jobs if (job['taskId'],job['candidateId']) not in done][:2]


def capture_body(source,jobs):
    """Replay request construction only, with fake transport and dummy key."""
    spec=importlib.util.spec_from_file_location('offline_f4_snapshot_'+digest(str(source))[:8],source)
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    bodies=[]
    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(400,json={'error':{'status':'INVALID_ARGUMENT','message':'OFFLINE_CAPTURE_ONLY'}})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        try:module.GeminiJudge('UNIT-OFFLINE-NOT-A-KEY','a'*64,client).decide_many(jobs)
        except httpx.HTTPStatusError:pass
    require(len(bodies)==1,'ONE_OFFLINE_BODY_EXPECTED')
    return bodies[0]


def openapi_schema(schema):
    """Documented legacy OpenAPI subset, same local semantic validator."""
    result={key:copy.deepcopy(value) for key,value in schema.items() if key not in ('additionalProperties','enum')}
    result['type']=schema['type'].upper()
    if 'enum' in schema:
        if schema['type']=='integer':result.update(minimum=min(schema['enum']),maximum=max(schema['enum']))
        else:result['enum']=copy.deepcopy(schema['enum'])
    if 'properties' in schema:result['properties']={key:openapi_schema(value) for key,value in schema['properties'].items()}
    if 'items' in schema:result['items']=openapi_schema(schema['items'])
    for key in ('minItems','maxItems'):
        if key in result:result[key]=str(result[key])
    return result


def remove_array_bounds(value):
    if type(value) is dict:return {key:remove_array_bounds(item) for key,item in value.items() if key not in ('minItems','maxItems')}
    if type(value) is list:return [remove_array_bounds(item) for item in value]
    return value


def payload(variant,jobs):
    require(variant in VARIANTS,'UNKNOWN_DIAGNOSTIC_VARIANT')
    pair=variant.startswith('pair-')
    if pair:
        body=capture_body(Path(__file__).with_name('f4_gemini_judge.py'),jobs)
        schema=response_schema(jobs)
        if variant=='pair-current-unbounded':schema=remove_array_bounds(schema)
    else:
        body={'contents':[{'role':'user','parts':[{'text':'Synthetic API protocol probe. Return exactly an object with ok=true.'}]}],
              'generationConfig':{'maxOutputTokens':16000,'thinkingConfig':{'thinkingLevel':'minimal'}}}
        schema=copy.deepcopy(TINY)
    config=body['generationConfig']
    for key in ('responseFormat','responseMimeType','responseJsonSchema','responseSchema'):config.pop(key,None)
    if 'legacy' in variant:
        config.update(responseMimeType='application/json',responseSchema=openapi_schema(schema))
    else:config['responseFormat']={'text':{'mimeType':'APPLICATION_JSON','schema':schema}}
    if variant.endswith('no-thinking'):config.pop('thinkingConfig')
    return body


def audit():
    jobs,rows,_,remaining=jobs_and_seed();DESTINATION.mkdir(parents=True,exist_ok=True)
    old=ROOT/'phobert-f4-ai-judge-v4/backup/apps/ai-service/eval/f4_gemini_judge.py'
    success=capture_body(old,jobs[:2]);current=capture_body(Path(__file__).with_name('f4_gemini_judge.py'),jobs[:2])
    early=copy.deepcopy(success);early['generationConfig']['responseJsonSchema']=response_schema(jobs[:2])
    bodies={'v3-success-reconstructed':success,'v4-sdk-style-reconstructed':early,'v4-current-rest-reconstructed':current}
    for name,body in bodies.items():
        with (DESTINATION/(name+'.json')).open('x',encoding='utf-8') as handle:json.dump(body,handle,ensure_ascii=False,indent=2)
    records=[strict_json(line) for line in (RUN/'request-events.jsonl').read_text(encoding='utf-8').splitlines()]
    failed=[event for event in records if event['kind']=='started' and event.get('structured')]
    schema_hash=hashlib.sha256(json.dumps(response_schema(remaining),sort_keys=True).encode()).hexdigest()
    report={'status':'OFFLINE_ONLY_NO_LIVE_CALL','evidenceLimit':'Old wire bodies were not saved. These are source/mock-transport reconstructions, not claimed byte-identical wire captures.',
        'validRows':len(rows),'bodyKeysV3':list(success),'bodyKeysV4':list(current),
        'outsideGenerationConfigEqual':{key:success.get(key)==current.get(key) for key in set(success)|set(current) if key!='generationConfig'},
        'configs':{name:body['generationConfig'] for name,body in bodies.items()},
        'schemaMatchesAllFourV4EventHashes':len(failed)==4 and all(event['schemaSha256']==schema_hash for event in failed),
        'schemaBytes':len(json.dumps(response_schema(remaining)).encode()),
        'sourceSha256':{'v3Source':hashlib.sha256(old.read_bytes()).hexdigest(),'currentSource':hashlib.sha256(Path(__file__).with_name('f4_gemini_judge.py').read_bytes()).hexdigest()},
        'candidateProbes':{variant:payload(variant,remaining) for variant in VARIANTS},
        'liveBudget':3,'rootCause':'UNCONFIRMED'}
    with (DESTINATION/'offline-audit.json').open('x',encoding='utf-8') as handle:json.dump(report,handle,ensure_ascii=False,indent=2)
    print(json.dumps({key:report[key] for key in ('status','validRows','schemaMatchesAllFourV4EventHashes','schemaBytes','liveBudget','rootCause')}))


def check_variant(events,variant):
    starts=[event for event in events if event['kind']=='started']
    require(len(starts)<3,'V5_LIVE_HARD_CAP_THREE')
    outcomes={event['variant']:event for event in events if event['kind']=='result'}
    require(len(starts)==len(outcomes),'UNRESOLVED_DIAGNOSTIC_OUTCOME_NO_RETRY')
    require(variant not in outcomes,'DIAGNOSTIC_VARIANT_ALREADY_TRIED')
    if not starts:require(variant=='tiny-current','TINY_CURRENT_MUST_BE_FIRST');return
    last=events[-1];require(last['kind']=='result','LAST_DIAGNOSTIC_RESULT_REQUIRED')
    if last['httpStatus'] in (401,403,429):raise ValueError('AUTH_OR_QUOTA_STOP_NO_VARIANT')
    if last['status']=='PASS':
        require((last['variant']=='tiny-current' and variant=='pair-current') or
                (last['variant']=='tiny-legacy' and variant=='pair-legacy'),'ONLY_REAL_PAIR_SMOKE_AFTER_TINY_SUCCESS')
    else:
        require(last['httpStatus']==400,'UNEXPECTED_PROVIDER_FAILURE_STOP')
        require((last['variant']=='tiny-current' and variant=='tiny-legacy') or
                (last['variant']=='tiny-legacy' and variant=='tiny-legacy-no-thinking') or
                (last['variant']=='pair-current' and variant=='pair-current-unbounded'),'ONE_DOCUMENTED_FACTOR_ONLY')


def live(variant,key_file=DEFAULT_KEY_FILE,client=None):
    require((DESTINATION/'offline-audit.json').exists(),'OFFLINE_AUDIT_REQUIRED_FIRST')
    confirmation(CONSENT)
    ledger=DESTINATION/'diagnostic-events.jsonl';lock=DESTINATION/'.diagnostic.lock'
    with lock.open('x'):pass
    try:
        events=[strict_json(line) for line in ledger.read_text(encoding='utf-8').splitlines()] if ledger.exists() else []
        check_variant(events,variant)
        _,rows,provenance,remaining=jobs_and_seed();body=payload(variant,remaining)
        request_id=str(uuid4());body_path=DESTINATION/(request_id+'-request.json')
        with body_path.open('x',encoding='utf-8') as handle:json.dump(body,handle,ensure_ascii=False,indent=2)
        # Persist intent BEFORE the only HTTP call. No retries and no metadata GET.
        append_event(ledger,{'kind':'started','requestId':request_id,'variant':variant,'model':MODEL,'apiVersion':'v1beta',
            'utc':datetime.now(timezone.utc).isoformat(),'requestSha256':hashlib.sha256(body_path.read_bytes()).hexdigest()})
        key=load_key(key_file)
        owned=client is None;client=client or httpx.Client(trust_env=False,follow_redirects=False,timeout=90)
        result={'kind':'result','requestId':request_id,'variant':variant,'status':'FAILED','httpStatus':None,'validRowsBefore':len(rows),
            'execution':'MOCK_TRANSPORT' if isinstance(client._transport,httpx.MockTransport) else 'LIVE_GEMINI'}
        start=time.perf_counter()
        try:
            response=client.post(ORIGIN+'/models/'+MODEL+':generateContent',headers={'x-goog-api-key':key},json=body,timeout=90)
            result['httpStatus']=response.status_code;response.raise_for_status()
            require(key not in response.text,'SECRET_IN_PROVIDER_RESPONSE');value=response.json()
            require(value.get('modelVersion')==provenance['version'],'WRONG_OR_CHANGED_JUDGE_MODEL')
            candidates=value.get('candidates',[])
            require(len(candidates)==1 and candidates[0].get('finishReason')=='STOP','INCOMPLETE_DIAGNOSTIC_RESPONSE')
            parts=candidates[0].get('content',{}).get('parts',[])
            require(bool(parts) and all(type(part) is dict and set(part)<={'text','thoughtSignature','thought'}
                and type(part.get('text')) is str and part.get('thought',False) is False for part in parts),'DIAGNOSTIC_TEXT_ONLY')
            text=''.join(part['text'] for part in parts);parsed=strict_json(text)
            if variant.startswith('tiny-'):require(type(parsed) is dict and set(parsed)=={'ok'} and parsed['ok'] is True,'INVALID_TINY_BOOLEAN_RESULT')
            else:
                decisions=parse_batch(text,remaining)
                result['validatedPairDecisions']=[{'taskId':job['taskId'],'candidateId':job['candidateId'],'decision':decision}
                    for job,decision in zip(remaining,decisions)]
            result.update(status='PASS',modelVersion=value['modelVersion'],output=parsed,
                usage={name:count for name,count in value.get('usageMetadata',{}).items() if name in ('promptTokenCount','candidatesTokenCount','totalTokenCount') and type(count) is int})
        except Exception as error:result['failure']=safe_failure(error)
        finally:
            result['wallMs']=round((time.perf_counter()-start)*1000,3)
            append_event(ledger,result)
            if owned:client.close()
        print(json.dumps({key:result[key] for key in ('requestId','variant','status','httpStatus','wallMs')}))
        return result
    finally:lock.unlink()


def install_verified_smoke(output,jobs,consent_sha):
    """Promote real V5 smoke, not mock output or a boolean diagnostic, to rows."""
    require(output.resolve()==RUN.resolve(),'VERIFIED_PROOF_BOUND_TO_ORIGINAL_RUN')
    ledger=DESTINATION/'diagnostic-events.jsonl'
    events=[strict_json(line) for line in ledger.read_text(encoding='utf-8').splitlines()]
    require(len([event for event in events if event['kind']=='started'])<=3,'V5_DIAGNOSTIC_BUDGET_VIOLATED')
    passed=[event for event in events if event['kind']=='result' and event.get('variant')=='pair-current-unbounded' and event.get('status')=='PASS']
    require(len(passed)==1,'LIVE_REAL_PAIR_SMOKE_REQUIRED')
    success=passed[0];require(success['execution']=='LIVE_GEMINI' and success['httpStatus']==200 and success['modelVersion']==MODEL,'LIVE_SMOKE_PROVENANCE_REQUIRED')
    start=next(event for event in events if event['kind']=='started' and event['requestId']==success['requestId'])
    require(start['model']==MODEL and start['apiVersion']=='v1beta','SMOKE_MODEL_MISMATCH')
    body_path=DESTINATION/(success['requestId']+'-request.json');body,_=load_json(body_path)
    require(hashlib.sha256(body_path.read_bytes()).hexdigest()==start['requestSha256'],'SMOKE_BODY_HASH_MISMATCH')
    lookup={(job['taskId'],job['candidateId']):job for job in jobs}
    smoke=[lookup[(row['taskId'],row['candidateId'])] for row in success['validatedPairDecisions']]
    require(1<=len(smoke)<=2 and len({(job['taskId'],job['candidateId']) for job in smoke})==len(smoke),'INVALID_SMOKE_PAIRS')
    require(body==payload('pair-current-unbounded',smoke),'VERIFIED_PAYLOAD_PROFILE_CHANGED')
    decisions=parse_batch(json.dumps(success['output'],ensure_ascii=False),smoke)
    require(decisions==[row['decision'] for row in success['validatedPairDecisions']],'SMOKE_DECISION_MISMATCH')
    rows,meta,_,pending=inspect_checkpoint(output,jobs,consent_sha)
    require(not pending and meta and meta['version']==success['modelVersion'],'SMOKE_EXISTING_PROVENANCE_CHANGED')
    done={(row['taskId'],row['candidateId']):row for row in rows}
    existing=journal(output);request_id=success['requestId']
    imported=[event for event in existing if event['kind']=='validated' and event['requestId']==request_id]
    new_rows=label_rows(smoke,decisions,success['wallMs'])
    if not imported:
        require(not any((row['taskId'],row['candidateId']) in done for row in new_rows),'SMOKE_WOULD_REGRADE_ACCEPTED_PAIR')
        if not any(event['kind']=='started' and event['requestId']==request_id for event in existing):
            append_event(output/'request-events.jsonl',{'kind':'started','requestId':request_id,'pairs':[[job['taskId'],job['candidateId']] for job in smoke],
                'model':MODEL,'declaredVersion':meta['declaredVersion'],'structured':True,'retryOf':None,'profile':'V5_UNBOUNDED_ARRAYS',
                'schemaSha256':hashlib.sha256(json.dumps(response_schema(smoke,array_bounds=False),sort_keys=True).encode()).hexdigest(),
                'importedLiveDiagnosticSha256':hashlib.sha256(ledger.read_bytes()).hexdigest()})
        append_event(output/'request-events.jsonl',{'kind':'validated','requestId':request_id,'judge':meta,'rows':new_rows,
            'wallMs':success['wallMs'],'response':{'httpStatus':200,'modelVersion':success['modelVersion'],'usage':success.get('usage',{})},
            'importedLiveDiagnosticSha256':hashlib.sha256(ledger.read_bytes()).hexdigest()})
    else:require(imported[0]['rows']==new_rows,'PREVIOUSLY_IMPORTED_SMOKE_CHANGED')
    if not any(event['kind']=='structured-profile-verified' and event['requestId']==request_id for event in existing):
        append_event(output/'request-events.jsonl',{'kind':'structured-profile-verified','requestId':request_id,'profile':'V5_UNBOUNDED_ARRAYS',
            'diagnosticSha256':hashlib.sha256(ledger.read_bytes()).hexdigest(),'reason':'REAL_PAIR_SMOKE_PASSED_WITH_ALL_LOCAL_VALIDATION'})


def compare_live_payloads():
    """Read saved request bodies only, no provider calls and no label writes."""
    events=[strict_json(line) for line in (DESTINATION/'diagnostic-events.jsonl').read_text(encoding='utf-8').splitlines()]
    results={event['variant']:event for event in events if event['kind']=='result'}
    bounded=load_json(DESTINATION/(results['pair-current']['requestId']+'-request.json'))[0]
    unbounded=load_json(DESTINATION/(results['pair-current-unbounded']['requestId']+'-request.json'))[0]
    removed=[]
    def visit(left,right,path=''):
        require(type(left) is type(right),'UNEXPECTED_PAYLOAD_TYPE_CHANGE')
        if type(left) is dict:
            require(set(right)<=set(left),'UNEXPECTED_ADDED_PAYLOAD_FIELD')
            for key in left:
                current=path+'.'+key if path else key
                if key not in right:removed.append({'path':current,'value':left[key]})
                else:visit(left[key],right[key],current)
        elif type(left) is list:
            require(len(left)==len(right),'UNEXPECTED_INPUT_COUNT_CHANGE')
            for index,(a,b) in enumerate(zip(left,right)):visit(a,b,path+f'[{index}]')
        else:require(left==right,'UNEXPECTED_PAYLOAD_VALUE_CHANGE')
    visit(bounded,unbounded)
    require(len(removed)==4 and all(item['path'].endswith(('.minItems','.maxItems')) for item in removed),'ARRAY_BOUND_ISOLATION_NOT_ESTABLISHED')
    report={'liveDiagnosticRequests':len(results),'beforeHttpStatus':results['pair-current']['httpStatus'],
        'afterHttpStatus':results['pair-current-unbounded']['httpStatus'],'onlyChanges':removed,
        'allOtherRequestValuesIdentical':True,'rootCauseScope':'Removing this schema group is verified sufficient for these identical real-pair inputs. Individual keyword/limit and provider compiler mechanism are not isolated.',
        'notAnExplanation':'Not proof that all minItems/maxItems are globally unsupported; not evidence of billing/key/model failure.'}
    with (DESTINATION/'payload-comparison.json').open('x',encoding='utf-8') as handle:json.dump(report,handle,ensure_ascii=False,indent=2)
    return report


def main():
    parser=argparse.ArgumentParser();group=parser.add_mutually_exclusive_group(required=True)
    group.add_argument('--offline',action='store_true');group.add_argument('--variant',choices=VARIANTS)
    args=parser.parse_args()
    try:
        if args.offline:audit()
        else:live(args.variant)
    except Exception as error:
        print(json.dumps({'status':'STOPPED','errorType':type(error).__name__}),file=sys.stderr);raise SystemExit(1)


if __name__=='__main__':main()
