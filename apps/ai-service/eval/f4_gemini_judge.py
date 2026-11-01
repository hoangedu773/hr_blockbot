"""Explicit synthetic-only Gemini evaluation, isolated from application providers.

No key rotation, paid fallback, tools, CRM access or billing configuration.
JSON-only retry is bounded; all previous responses/events stay immutable.
The local confirmation is an owner assertion, NOT proof obtainable from an API key.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
from uuid import uuid4
import httpx
sys.path.insert(0,str(Path(__file__).resolve().parent))
from f4_ai_judge import export_blind_requests, validate_decision, validate_ai_labels
from f4_review_validation import load_json, require, nonblank, PROTOCOL_PATH
from f4_ai_judge import blind_jobs

MODEL='gemini-3.5-flash-lite'
ORIGIN='https://generativelanguage.googleapis.com/v1beta'


def confirmation(path):
    value,sha=load_json(path)
    require(set(value)=={'version','status','provider','model','billingLinked','confirmedBy','confirmedAt','reference'}
            and type(value['version']) is int and value['version']==1
            and value['status']=='CONFIRMED_FREE_TIER' and value['provider']=='gemini'
            and value['model']==MODEL and value['billingLinked'] is False
            and all(nonblank(value[field]) for field in ('confirmedBy','confirmedAt','reference')),
            'OWNER_FREE_TIER_NO_BILLING_CONFIRMATION_REQUIRED')
    when=datetime.fromisoformat(value['confirmedAt'].replace('Z','+00:00'))
    require(when.tzinfo is not None,'CONFIRMATION_REQUIRES_TIMEZONE')
    return sha


def strict_json(text):
    def unique(pairs):
        result={}
        for key,value in pairs:
            require(key not in result,'DUPLICATE_JUDGE_JSON_KEY');result[key]=value
        return result
    return json.loads(text,object_pairs_hook=unique)


def response_schema(jobs,array_bounds=True):
    """Compact supported JSON Schema; semantic checks still run locally."""
    def obj(properties):
        return {'type':'object','properties':properties,'required':list(properties),'additionalProperties':False}
    evidence=obj({'requiredSkill':{'type':'string'},'status':{'type':'string','enum':['MET','PARTIAL','NOT_EVIDENCED','UNCLEAR']},
        'evidenceSkills':{'type':'array','items':{'type':'string'}},'reason':{'type':'string'}})
    decision=obj({'relevance':{'type':'integer','enum':[0,1,2]},'reason':{'type':'string'},
        'requirements':{'type':'array','minItems':1,'maxItems':30,'items':evidence},
        'uncertain':{'type':'boolean'},'uncertaintyReason':{'type':'string'}})
    pair=obj({'pairId':{'type':'string','enum':[json.loads(job['messages'][1]['content'])['pairId'] for job in jobs]},'decision':decision})
    schema=obj({'decisions':{'type':'array','minItems':len(jobs),'maxItems':len(jobs),'items':pair}})
    if not array_bounds:
        def without_bounds(value):
            if type(value) is dict:return {key:without_bounds(item) for key,item in value.items() if key not in ('minItems','maxItems')}
            if type(value) is list:return [without_bounds(item) for item in value]
            return value
        schema=without_bounds(schema)
    return schema


def parse_batch(text,jobs):
    parsed=strict_json(text)
    require(type(parsed) is dict and set(parsed)=={'decisions'} and type(parsed['decisions']) is list,'INVALID_BATCH_ENVELOPE')
    expected={json.loads(job['messages'][1]['content'])['pairId']:job for job in jobs};result={}
    for item in parsed['decisions']:
        require(type(item) is dict and set(item)=={'pairId','decision'} and item['pairId'] in expected
                and item['pairId'] not in result,'JUDGE_BATCH_PAIR_MISMATCH')
        job=expected[item['pairId']]
        result[item['pairId']]=validate_decision(item['decision'],job['requiredSkills'],job['candidateSkills'])
    require(set(result)==set(expected),'INCOMPLETE_JUDGE_BATCH')
    return [result[json.loads(job['messages'][1]['content'])['pairId']] for job in jobs]


def json_retryable(error):
    # Never retry auth/quota/model/identity/evidence failures until they look good.
    return isinstance(error,json.JSONDecodeError) or type(error) is ValueError and str(error) in (
        'DUPLICATE_JUDGE_JSON_KEY','INVALID_BATCH_ENVELOPE','INCOMPLETE_JUDGE_BATCH')


def label_rows(jobs,decisions,latency):
    return [{'taskId':job['taskId'],'candidateId':job['candidateId'],'decision':decision,'latencyMs':latency,
             'promptSha256':hashlib.sha256(json.dumps(job['messages'],ensure_ascii=False).encode()).hexdigest()}
            for job,decision in zip(jobs,decisions)]


class GeminiJudge:
    def __init__(self,key,confirmation_sha,client=None):
        require(nonblank(key),'MISSING_ISOLATED_F4_JUDGE_KEY')
        self.key=key;self.confirmation_sha=confirmation_sha
        self.client=client or httpx.Client(trust_env=False,follow_redirects=False,timeout=90)
        self.execution='MOCK_TRANSPORT' if isinstance(self.client._transport,httpx.MockTransport) else 'LIVE_GEMINI'

    def metadata(self):
        response=self.client.get(ORIGIN+'/models/'+MODEL,headers={'x-goog-api-key':self.key},timeout=15)
        response.raise_for_status();body=response.json()
        require(body.get('name')=='models/'+MODEL and nonblank(body.get('version'))
            and 'generateContent' in body.get('supportedGenerationMethods',[]),'EXACT_GEMINI_MODEL_UNAVAILABLE')
        return body['version']

    def decide_many(self,jobs):
        self.last_response_meta=None  # Never attach a previous batch's200 to a new HTTP failure.
        # Only two blinded messages. No history, ranking, tools, files or grounding.
        system=jobs[0]['messages'][0]['content']+'\nBATCH ENVELOPE: Evaluate each pair independently, never compare or rank pairs. Return exactly {"decisions":[{"pairId":"exact opaque input ID","decision":{the exact decision fields specified above}}]}. Include every pair once.'
        inputs=[json.loads(job['messages'][1]['content']) for job in jobs]
        body={'systemInstruction':{'parts':[{'text':system}]},
              'contents':[{'role':'user','parts':[{'text':json.dumps({'pairs':inputs},ensure_ascii=False)}]}],
              'generationConfig':{'maxOutputTokens':16000,
                                  'responseFormat':{'text':{'mimeType':'APPLICATION_JSON','schema':response_schema(jobs,array_bounds=not getattr(self,'v5_verified',False))}},
                                  'thinkingConfig':{'thinkingLevel':'minimal'}}}
        start=time.perf_counter()
        response=self.client.post(ORIGIN+'/models/'+MODEL+':generateContent',headers={'x-goog-api-key':self.key},json=body,timeout=90)
        response.raise_for_status()
        require(self.key not in response.text,'SECRET_IN_PROVIDER_RESPONSE')
        value=response.json()
        self.last_response_meta={'httpStatus':response.status_code,'modelVersion':value.get('modelVersion'),
            'usage':{name:count for name,count in value.get('usageMetadata',{}).items()
                if name in ('promptTokenCount','candidatesTokenCount','totalTokenCount','thoughtsTokenCount') and type(count) is int and count>=0}}
        require(nonblank(value.get('modelVersion')) and not value.get('promptFeedback',{}).get('blockReason'),'MISSING_OR_BLOCKED_JUDGE_RESPONSE')
        require(value['modelVersion']==MODEL or value['modelVersion'].startswith(MODEL+'-'),'WRONG_JUDGE_MODEL')
        candidates=value.get('candidates',[])
        require(len(candidates)==1 and candidates[0].get('finishReason')=='STOP','INCOMPLETE_JUDGE_RESPONSE')
        parts=candidates[0].get('content',{}).get('parts',[])
        self.last_response_meta['partsShape']=[{'hasText':'text' in part,'hasThoughtSignature':'thoughtSignature' in part,
            'isThought':part.get('thought') is True,'unknownFieldCount':len(set(part)-{'text','thoughtSignature','thought'})} for part in parts]
        # Gemini Part can attach an opaque signature to ordinary text. It is
        # transport metadata, not a tool or a reason to discard a valid answer.
        # Never log signatures, include hidden thoughts or echo them into chats.
        require(bool(parts) and all(set(part)<={'text','thoughtSignature','thought'} and nonblank(part.get('text'))
            and ('thought' not in part or part['thought'] is False)
            and ('thoughtSignature' not in part or type(part['thoughtSignature']) is str) for part in parts),'JUDGE_TEXT_ONLY_REQUIRED')
        observer=getattr(self,'response_observer',None)
        latency=round((time.perf_counter()-start)*1000,3)
        if observer:observer({'response':self.last_response_meta,'jsonText':''.join(part['text'] for part in parts),'wallMs':latency})
        return parse_batch(''.join(part['text'] for part in parts),jobs),latency,value['modelVersion']


def redact_diagnostic(value,secret=''):
    text=str(value)
    if secret:text=text.replace(secret,'[REDACTED]')
    text=re.sub(r'(?:AQ\.|AIza)[A-Za-z0-9_-]{15,}','[REDACTED]',text)
    text=re.sub(r'(?i)Bearer\s+[^\s,;]+','Bearer [REDACTED]',text)
    text=re.sub(r'(?i)(?:api[_-]?key|access_token|token|password|credential)\s*[=:]\s*[^\s,;]+','[REDACTED]',text)
    text=re.sub(r'[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}','[REDACTED_EMAIL]',text)
    return text[:500]


def safe_failure(error):
    result={'errorType':type(error).__name__}
    if isinstance(error,httpx.HTTPStatusError):
        result['httpStatus']=error.response.status_code
        try:
            body=error.response.json().get('error',{});status=body.get('status')
            if status in ('NOT_FOUND','INVALID_ARGUMENT','PERMISSION_DENIED','RESOURCE_EXHAUSTED','UNAUTHENTICATED','UNAVAILABLE','INTERNAL'):
                result['providerStatus']=status
            text=body.get('message','').lower()
            # Fixed categories only: never log arbitrary upstream messages.
            if 'not found' in text or 'not supported' in text:result['category']='MODEL_OR_METHOD_UNAVAILABLE'
            elif 'quota' in text:result['category']='QUOTA_LIMIT'
            elif 'api key' in text:result['category']='CREDENTIAL_REJECTED'
            if error.response.status_code==400 and status=='INVALID_ARGUMENT':
                # Configuration diagnostics only. Strip header secret and all
                # supported key-shaped tokens before retaining a short excerpt.
                secret=error.request.headers.get('x-goog-api-key','')
                result['schemaDiagnostic']=redact_diagnostic(body.get('message',''),secret)
                violations=[];detail_types=[]
                for detail in body.get('details',[])[:10]:
                    if type(detail) is not dict:continue
                    detail_types.append(redact_diagnostic(detail.get('@type',''),secret))
                    for violation in detail.get('fieldViolations',[])[:10]:
                        if type(violation) is dict:
                            violations.append({name:redact_diagnostic(violation.get(name,''),secret) for name in ('field','description')})
                result['detailTypes']=detail_types
                result['fieldViolations']=violations
        except (ValueError,AttributeError,TypeError):pass
    elif type(error) is ValueError and re.fullmatch('[A-Z0-9_]+',str(error)):
        result['validationCode']=str(error)
    return result


def append_event(path,value):
    with path.open('a',encoding='utf-8') as handle:
        handle.write(json.dumps(value,ensure_ascii=False)+'\n');handle.flush();os.fsync(handle.fileno())


def read_jobs(dataset_path,output):
    dataset,source_sha=load_json(dataset_path);protocol,protocol_sha=load_json(PROTOCOL_PATH)
    manifest,_=load_json(output/'input-manifest.json');mapping,_=load_json(output/'source-map.private.json')
    require(manifest['datasetSha256']==source_sha and manifest['protocolSha256']==protocol_sha
        and manifest['messagesSha256']==hashlib.sha256((output/'judge-messages.jsonl').read_bytes()).hexdigest()
        and manifest['privateMappingSha256']==hashlib.sha256((output/'source-map.private.json').read_bytes()).hexdigest(), 'RESUME_INPUT_HASH_MISMATCH')
    canonical={(job['taskId'],job['candidateId']):job for job in blind_jobs(dataset,protocol)}
    jobs=[];seen=set()
    for line in (output/'judge-messages.jsonl').read_text(encoding='utf-8').splitlines():
        value=strict_json(line);pair_id=value['pairId'];source=mapping[pair_id];key=(source['taskId'],source['candidateId'])
        require(key in canonical and key not in seen,'RESUME_PAIR_MISMATCH');seen.add(key)
        job=canonical[key];projection=json.loads(value['messages'][1]['content'])
        expected=json.loads(job['messages'][1]['content']);expected['pairId']=pair_id
        require(projection==expected and value['messages'][0]==job['messages'][0]
            and len(value['messages'])==2 and value['messages'][1]['role']=='user','RESUME_BLIND_PROJECTION_CHANGED')
        job['messages']=value['messages'];jobs.append(job)
    require(len(jobs)==200 and seen==set(canonical),'ALL_200_REQUESTS_REQUIRED')
    return dataset,source_sha,protocol_sha,jobs


def inspect_checkpoint(output,jobs,consent_sha):
    """Offline inspection may list unfinished work, but cannot authorize resume."""
    rows={};provenance=None;started={};finished=set();measurements=[]
    expected={(job['taskId'],job['candidateId']):job for job in jobs}
    path=output/'request-events.jsonl'
    if not path.exists():return [],None,[],[]
    for line in path.read_text(encoding='utf-8').splitlines():
        event=strict_json(line);request_id=event['requestId']
        if event['kind']=='started':
            require(request_id not in started,'DUPLICATE_REQUEST_INTENT');started[request_id]=event['pairs']
            require(bool(event['pairs']) and len({tuple(pair) for pair in event['pairs']})==len(event['pairs'])
                and all(tuple(pair) in expected and tuple(pair) not in rows for pair in event['pairs']), 'REQUEST_CONTAINS_DUPLICATE_LABELLED_OR_FOREIGN_PAIR')
        elif event['kind']=='validated':
            require(request_id in started and request_id not in finished,'INVALID_CHECKPOINT_REQUEST')
            meta=event['judge']
            require(meta['name']==MODEL and meta['billingConfirmationSha256']==consent_sha
                and meta['execution']=='LIVE_GEMINI' and meta['runtime']=='gemini-developer-api'
                and meta['apiVersion']=='v1beta' and nonblank(meta['version']) and nonblank(meta['declaredVersion']), 'CHECKPOINT_JUDGE_MISMATCH')
            require(provenance in (None,meta),'JUDGE_VERSION_CHANGED');provenance=meta
            event_keys=[]
            for row in event['rows']:
                key=(row['taskId'],row['candidateId']);require(key in expected and key not in rows,'CHECKPOINT_DUPLICATE_OR_FOREIGN_PAIR')
                job=expected[key];validate_decision(row['decision'],job['requiredSkills'],job['candidateSkills'])
                require(row['promptSha256']==hashlib.sha256(json.dumps(job['messages'],ensure_ascii=False).encode()).hexdigest(), 'CHECKPOINT_PROMPT_HASH_MISMATCH')
                require(type(row['latencyMs']) in (int,float) and 0<=row['latencyMs']<float('inf'),'INVALID_CHECKPOINT_LATENCY')
                rows[key]=row;event_keys.append(list(key))
            require(event_keys==started[request_id],'CHECKPOINT_REQUEST_PAIRS_CHANGED')
            finished.add(request_id);measurements.append({'requestId':request_id,'pairs':len(event_keys),'wallMs':event['wallMs'],'response':event['response']})
        elif event['kind'] in ('failed','abandoned'):
            require(request_id in started and request_id not in finished,'INVALID_FAILURE_REQUEST')
            require(type(event.get('retryable')) is bool,'MISSING_FAILURE_POLICY')
            finished.add(request_id)
        elif event['kind']=='schema-recovery-authorized':
            require(request_id in started and request_id in finished,'INVALID_SCHEMA_RECOVERY')
        elif event['kind']=='structured-profile-verified':
            require(request_id in finished and event.get('profile')=='V5_UNBOUNDED_ARRAYS','INVALID_VERIFIED_PROFILE')
        else:raise ValueError('CHECKPOINT_FAILED_REQUEST_REQUIRES_REVIEW_NO_AUTO_RETRY')
    pending=[{'requestId':request_id,'pairs':pairs} for request_id,pairs in started.items() if request_id not in finished]
    return list(rows.values()),provenance,measurements,pending


def read_checkpoint(output,jobs,consent_sha):
    rows,provenance,measurements,pending=inspect_checkpoint(output,jobs,consent_sha)
    require(not pending,'UNCERTAIN_REQUEST_OUTCOME_NO_AUTO_RETRY')
    events=journal(output)
    schema_recovery={event['requestId'] for event in events if event['kind']=='schema-recovery-authorized'}
    for event in events:
        failure=event.get('failure',{})
        permitted400=event['requestId'] in schema_recovery and failure.get('httpStatus')==400 \
            and failure.get('providerStatus')=='INVALID_ARGUMENT' and failure.get('category')!='CREDENTIAL_REJECTED'
        require(event['kind'] not in ('failed','abandoned') or event['retryable'] or permitted400,'TERMINAL_REQUEST_FAILURE_REQUIRES_REVIEW')
    return rows,provenance,measurements


def journal(output):
    path=output/'request-events.jsonl'
    return [strict_json(line) for line in path.read_text(encoding='utf-8').splitlines()] if path.exists() else []


def recover_unfinished(output,jobs,consent_sha):
    """Explicit owner-approved recovery, append only, never repairs an answer."""
    rows,meta,_,pending=inspect_checkpoint(output,jobs,consent_sha)
    lookup={(job['taskId'],job['candidateId']):job for job in jobs}
    done={(row['taskId'],row['candidateId']) for row in rows}
    events=journal(output);approved={event['requestId'] for event in events if event['kind']=='schema-recovery-authorized'}
    for event in events:
        failure=event.get('failure',{})
        if event['kind']=='failed' and not event['retryable'] and failure.get('httpStatus')==400 and failure.get('providerStatus')=='INVALID_ARGUMENT':
            require(failure.get('category')!='CREDENTIAL_REJECTED','CREDENTIAL_FAILURE_NO_RETRY')
            if event['requestId'] not in approved:
                append_event(output/'request-events.jsonl',{'kind':'schema-recovery-authorized','requestId':event['requestId'],
                    'reason':'EXPLICIT_STRUCTURED_SCHEMA_RECOVERY_NOT_AUTH_OR_QUOTA','retryable':True})
    for request in pending:
        batch=[lookup[tuple(pair)] for pair in request['pairs']]
        require(not any((job['taskId'],job['candidateId']) in done for job in batch),'RECOVERY_WOULD_REGRADE')
        path=output/'responses'/(request['requestId']+'.json')
        if path.exists() and meta:
            stored,_=load_json(path)
            require(stored['response']['httpStatus']==200 and stored['response']['modelVersion']==meta['version'],'RECOVERY_MODEL_CHANGED')
            try:decisions=parse_batch(stored['jsonText'],batch)
            except Exception as error:
                if not json_retryable(error):raise
            else:
                # New responses persist measured latency, so a crash between
                # receipt and commit can be recovered offline with no re-call.
                latency=stored.get('wallMs')
                require(type(latency) in (int,float) and 0<=latency<float('inf'),'RECOVERY_MEASURED_LATENCY_REQUIRED')
                append_event(output/'request-events.jsonl',{'kind':'validated','requestId':request['requestId'],
                    'judge':meta,'rows':label_rows(batch,decisions,latency),'wallMs':latency,'response':stored['response'],
                    'recoveredFromResponseSha256':hashlib.sha256(path.read_bytes()).hexdigest()})
                continue
        append_event(output/'request-events.jsonl',{'kind':'abandoned','requestId':request['requestId'],'retryable':True,
            'reason':'OWNER_APPROVED_UNLABELLED_RECOVERY','responseSha256':hashlib.sha256(path.read_bytes()).hexdigest() if path.exists() else None})


def attempt_allowed(output,batch):
    events=journal(output);starts=[event for event in events if event['kind']=='started' and event.get('structured') is True]
    # HTTP400 configuration rejections never produced model labels. Give API
    # migration its own bounded budget (initial+3 repairs), not JSON inference
    # retries. All rejected requests remain in the journal and final counts.
    config_rejected={event['requestId'] for event in events if event['kind']=='failed'
        and event.get('failure',{}).get('httpStatus')==400 and event.get('failure',{}).get('providerStatus')=='INVALID_ARGUMENT'
        and event.get('failure',{}).get('category')!='CREDENTIAL_REJECTED'}
    verified=any(event['kind']=='structured-profile-verified' and event.get('profile')=='V5_UNBOUNDED_ARRAYS' for event in events)
    if verified:
        verified_ids={event['requestId'] for event in starts if event.get('profile')=='V5_UNBOUNDED_ARRAYS'}
        require(not config_rejected.intersection(verified_ids),'VERIFIED_PROFILE_HTTP400_STOP')
    else:require(len(config_rejected)<4,'SCHEMA_CONFIGURATION_RETRY_LIMIT_REACHED')
    for job in batch:
        pair=[job['taskId'],job['candidateId']]
        require(sum(pair in event['pairs'] and event['requestId'] not in config_rejected for event in starts)<3,'PER_PAIR_REQUEST_LIMIT_REACHED')
    return sum(bool(event.get('retryOf')) for event in starts)


def run(dataset_path,output,confirmation_path,interval=13,smoke_only=False,resume=False,batch_size=4,key_file=None,recover=False,verified_v5=False):
    # Check consent BEFORE even looking up a key or creating a network client.
    consent_sha=confirmation(confirmation_path)
    require(13<=interval<=60,'CONSERVATIVE_REQUEST_INTERVAL_REQUIRED')
    require(type(batch_size) is int and 1<=batch_size<=5,'SMALL_BATCH_REQUIRED')
    if key_file:
        sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
        from scripts.f4_judge_secret import load_key
        key=load_key(key_file)
    else:key=os.environ.get('F4_JUDGE_GEMINI_API_KEY','')
    require(nonblank(key),'MISSING_ISOLATED_F4_JUDGE_KEY')
    # Restrict live outbound data to the reviewed canonical synthetic pilot.
    canonical=Path(__file__).with_name('f4-pilot.json')
    require(dataset_path.resolve()==canonical.resolve(),'CANONICAL_SYNTHETIC_PILOT_ONLY')
    require(hashlib.sha256(dataset_path.read_bytes()).hexdigest()=='c67f23fec4150c139b51cc75803fa5e083ca6ed7004a64519e8d76b28afa77a0',
            'REVIEWED_SYNTHETIC_DATASET_CHANGED')
    require(resume or not output.exists(),'NEW_EXCLUSIVE_OUTPUT_DIRECTORY_REQUIRED')
    if not resume:export_blind_requests(dataset_path,output)
    dataset,source_sha,protocol_sha,jobs=read_jobs(dataset_path,output)
    require(not (output/'ai-generated-labels.json').exists(),'COMPLETE_LABELS_ALREADY_EXIST_NO_REGRADING')
    lock=output/'.run.lock';lock_handle=lock.open('x');lock_handle.close()
    try:
        if verified_v5:
            from diagnose_f4_structured import install_verified_smoke
            install_verified_smoke(output,jobs,consent_sha)
        if recover:recover_unfinished(output,jobs,consent_sha)
        existing,previous,batch_measurements=read_checkpoint(output,jobs,consent_sha)
    except BaseException:
        lock.unlink();raise
    done={(row['taskId'],row['candidateId']) for row in existing}
    artifact={'version':1,'labelSource':'AI_GENERATED','status':'INCOMPLETE','datasetSha256':source_sha,
        'protocolSha256':protocol_sha,'judge':previous or {},'generatedAt':datetime.now(timezone.utc).isoformat(),'rows':existing}
    attempts=0
    judge=None
    try:
        judge=GeminiJudge(key,consent_sha)
        judge.v5_verified=verified_v5
        require(not any(event['kind']=='structured-profile-verified' for event in journal(output)) or verified_v5,'VERIFIED_V5_PROFILE_MUST_BE_EXPLICIT')
        with judge.client:
            declared=judge.metadata();observed=previous['version'] if previous else None
            require(previous is None or declared==previous['declaredVersion'],'JUDGE_VERSION_CHANGED')
            remaining=[job for job in jobs if (job['taskId'],job['candidateId']) not in done]
            # The first generation call MUST be just two pairs. Smoke success is
            # committed and reused by resume; no regrading those accepted pairs.
            structured_starts={event['requestId'] for event in journal(output) if event['kind']=='started' and event.get('structured') is True}
            smoke_passed=any(event['kind']=='validated' and event['requestId'] in structured_starts and len(event['rows'])<=2 for event in journal(output))
            if smoke_only:batches=[remaining[:2]] if remaining and not smoke_passed else []
            else:
                require(smoke_passed,'STRUCTURED_SMOKE_REQUIRED_BEFORE_BATCHES')
                batches=[remaining[i:i+batch_size] for i in range(0,len(remaining),batch_size)]
            for batch in batches:
              retry_of=None
              while True:
                used_retries=attempt_allowed(output,batch)
                require(not retry_of or used_retries<6,'GLOBAL_JSON_RETRY_LIMIT_REACHED')
                if attempts or previous:time.sleep(interval)
                attempts+=1
                request_id=str(uuid4())
                append_event(output/'request-events.jsonl',{'kind':'started','requestId':request_id,'pairs':[[job['taskId'],job['candidateId']] for job in batch],
                    'model':MODEL,'declaredVersion':declared,'structured':True,'retryOf':retry_of,
                    'profile':'V5_UNBOUNDED_ARRAYS' if verified_v5 else 'V4_BOUNDED_ARRAYS',
                    'schemaSha256':hashlib.sha256(json.dumps(response_schema(batch,array_bounds=not verified_v5),sort_keys=True).encode()).hexdigest()})
                def preserve_answer(value):
                    # Synthetic returned text only, no prompt, key, signature or
                    # upstream error. Preserve before strict label validation.
                    response_dir=output/'responses';response_dir.mkdir(exist_ok=True)
                    with (response_dir/(request_id+'.json')).open('x',encoding='utf-8') as handle:
                        json.dump(value,handle,ensure_ascii=False,indent=2);handle.flush();os.fsync(handle.fileno())
                judge.response_observer=preserve_answer
                try:decisions,latency,version=judge.decide_many(batch)
                except Exception as error:
                    retryable=json_retryable(error)
                    append_event(output/'request-events.jsonl',{'kind':'failed','requestId':request_id,'retryable':retryable,
                        'failure':safe_failure(error),'response':getattr(judge,'last_response_meta',None)})
                    if not retryable:raise
                    retry_of=request_id
                    continue
                require(observed in (None,version),'JUDGE_VERSION_CHANGED');observed=version
                artifact['judge']={'name':MODEL,'version':observed,'declaredVersion':declared,'runtime':'gemini-developer-api',
                    'apiVersion':'v1beta','execution':judge.execution,'billingConfirmationSha256':consent_sha}
                request_rows=label_rows(batch,decisions,latency)
                append_event(output/'request-events.jsonl',{'kind':'validated','requestId':request_id,'judge':artifact['judge'],
                    'rows':request_rows,'wallMs':latency,'response':judge.last_response_meta})
                artifact['rows'].extend(request_rows)
                batch_measurements.append({'requestId':request_id,'pairs':len(batch),'wallMs':latency,'response':judge.last_response_meta})
                print(json.dumps({'validatedPairs':len(artifact['rows']),'totalPairs':200}),flush=True)
                break
            require(judge.metadata()==declared,'JUDGE_VERSION_CHANGED')
            if smoke_only:
                with (output/('smoke-'+str(uuid4())+'.json')).open('x',encoding='utf-8') as handle:json.dump({
                    'status':'SMOKE_VALIDATED_NOT_COMPLETE','labelSource':'AI_GENERATED','validatedPairs':len(artifact['rows']),
                    'judge':artifact['judge'],'batches':batch_measurements},handle,indent=2)
                return
            artifact['status']='COMPLETE';validate_ai_labels(dataset,source_sha,protocol_sha,artifact)
            with (output/'ai-generated-labels.json').open('x',encoding='utf-8') as handle:json.dump(artifact,handle,ensure_ascii=False,indent=2)
            with (output/'judge-batch-latency.json').open('x',encoding='utf-8') as handle:json.dump({
                'scope':'Wall latency per HTTP batch; row latencyMs is containing-batch latency, not additive per-pair inference time',
                'batches':batch_measurements,'totalHttpWallMs':sum(item['wallMs'] for item in batch_measurements)},handle,indent=2)
    except Exception as error:
        # Never print upstream response/error text, request headers or credentials.
        with (output/('incomplete-'+str(uuid4())+'.json')).open('x',encoding='utf-8') as handle:json.dump({
            'status':'INCOMPLETE','labelSource':'AI_GENERATED','validatedPairs':len(artifact['rows']),
            'attemptedRequests':attempts,**safe_failure(error),'judge':artifact['judge'],
            'responseMeta':getattr(judge,'last_response_meta',None)},handle,indent=2)
        raise RuntimeError('GEMINI_JUDGE_INCOMPLETE; no complete label set, no retry/key rotation') from None
    finally:lock.unlink()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--free-tier-confirmation',type=Path,required=True)
    parser.add_argument('--interval-seconds',type=float,default=13)
    parser.add_argument('--key-file',type=Path,help='Windows current-user DPAPI file outside the repo')
    parser.add_argument('--smoke-only',action='store_true',help='One generation request, at most two pairs; retain accepted results')
    parser.add_argument('--resume',action='store_true',help='Reuse validated pairs, refuse uncertain/failed previous requests')
    parser.add_argument('--recover-unlabelled',action='store_true',help='Append explicit recovery of unfinished unlabelled work; never regrade accepted pairs')
    parser.add_argument('--verified-v5',action='store_true',help='Use only the V5 profile backed by live diagnostic proof; preserve all V4 failures')
    parser.add_argument('--batch-size',type=int,default=4)
    args=parser.parse_args()
    try:run(Path(__file__).with_name('f4-pilot.json'),args.output,args.free_tier_confirmation,args.interval_seconds,
        args.smoke_only,args.resume,args.batch_size,args.key_file,args.recover_unlabelled,args.verified_v5)
    except Exception as error:
        # Generic CLI diagnostics, deliberately no traceback containing HTTP objects.
        print(json.dumps({'status':'BLOCKED_OR_INCOMPLETE','errorType':type(error).__name__}),file=sys.stderr)
        raise SystemExit(1)


if __name__=='__main__':main()
