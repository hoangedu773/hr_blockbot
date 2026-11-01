"""Offline fixtures only: never actual pilot labels, approvals or live HTTP."""
import copy
import json
from pathlib import Path
import sys
import httpx
import pytest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'eval'))
import f4_ai_judge as judge
import f4_gemini_judge as gemini
import evaluate_f4_exploratory as exploratory
import evaluate_f4 as official
from f4_review_validation import load_json, PROTOCOL_PATH


def decision():
    return {'relevance':2,'reason':'UNIT FIXTURE, NOT HUMAN OR AI PILOT EVIDENCE',
            'requirements':[{'requiredSkill':'unit skill','status':'MET','evidenceSkills':['unit skill'],'reason':'unit fixture'}],
            'uncertain':False,'uncertaintyReason':''}


@pytest.fixture
def unit_data():
    return {'synthetic':True,'tasks':[{'id':f'unit-task-{i}','title':'Unit title','description':'Unit task',
        'group':f'unit-group-{i}','split':'dev' if i<10 else 'test','requiredSkills':['unit skill'],
        'candidates':[{'id':f'unit-person-{i}-{j}','skills':['unit skill'],'workload':j,'judgments':[]} for j in range(10)]} for i in range(20)]}


def artifact(dataset):
    return {'version':1,'labelSource':'AI_GENERATED','status':'COMPLETE','datasetSha256':'unit-source','protocolSha256':'unit-protocol',
        'generatedAt':'2000-01-01T00:00:00Z','judge':{'name':gemini.MODEL,'version':'unit-server-version','declaredVersion':'unit-version',
            'runtime':'gemini-developer-api','apiVersion':'v1beta','execution':'LIVE_GEMINI','billingConfirmationSha256':'a'*64},
        'rows':[{'taskId':task['id'],'candidateId':candidate['id'],'decision':decision(),'latencyMs':1,'promptSha256':'b'*64}
                for task in dataset['tasks'] for candidate in task['candidates']]}


def test_blind_projection_has_no_ids_workload_split_scores_or_identity(unit_data):
    protocol,_=load_json(PROTOCOL_PATH)
    jobs=list(judge.blind_jobs(unit_data,protocol));assert len(jobs)==200
    for job in jobs:
        user=json.loads(job['messages'][1]['content'])
        assert set(user)=={'pairId','task','candidate'}
        assert set(user['task'])=={'requiredSkills','description'} and set(user['candidate'])=={'skills'}
        assert job['taskId'] not in json.dumps(job['messages']) and job['candidateId'] not in json.dumps(job['messages'])
        assert 'workload' not in user and 'split' not in user
    assert len({json.loads(job['messages'][1]['content'])['pairId'] for job in jobs})==200


def test_actual_pilot_export_has_200_requests_and_no_labels(tmp_path):
    path=PROTOCOL_PATH.with_name('f4-pilot.json');before=path.read_bytes()
    judge.export_blind_requests(path,tmp_path/'export')
    manifest,_=load_json(tmp_path/'export/input-manifest.json')
    assert manifest['pairCount']==200 and manifest['status']=='AWAITING_INDEPENDENT_JUDGE_NOT_LABELS'
    assert path.read_bytes()==before and not (tmp_path/'export/ai-generated-labels.json').exists()
    with pytest.raises(ValueError):judge.export_blind_requests(path,tmp_path/'export')


@pytest.mark.parametrize('mutation',['bool','foreign-skill','missing','contradiction','ambiguity','attestation','duplicate-evidence'])
def test_invalid_decision_rejected(mutation):
    value=decision()
    if mutation=='bool':value['relevance']=True
    elif mutation=='foreign-skill':value['requirements'][0]['evidenceSkills']=['invented']
    elif mutation=='missing':value['requirements']=[]
    elif mutation=='contradiction':value['relevance']=0
    elif mutation=='ambiguity':value['requirements'][0]['status']='UNCLEAR';value['relevance']=0
    elif mutation=='attestation':value['independentHumanAttestation']=True
    elif mutation=='duplicate-evidence':value['requirements'][0]['evidenceSkills']=['unit skill','unit skill']
    with pytest.raises(ValueError):judge.validate_decision(value,['unit skill'],['unit skill'])


@pytest.mark.parametrize('origin',['https://127.0.0.1:11434','http://localhost:11434','http://192.168.1.1:11434',
    'http://example.com:11434','http://x:y@127.0.0.1:11434','http://127.0.0.1:11434/path','http://127.0.0.1:11434/?key=x'])
def test_local_judge_cannot_be_redirected_to_external_or_credential_url(origin):
    with pytest.raises(ValueError):judge.local_origin(origin)


@pytest.mark.parametrize('mutation',['missing','duplicate','unknown','mock','incomplete','human','hash','nan','prompt','time','version'])
def test_ai_artifact_integrity_and_provenance(unit_data,mutation):
    value=artifact(unit_data)
    if mutation=='missing':value['rows'].pop()
    elif mutation=='duplicate':value['rows'][1]=copy.deepcopy(value['rows'][0])
    elif mutation=='unknown':value['rows'][0]['candidateId']='unknown'
    elif mutation=='mock':value['judge']['execution']='MOCK_TRANSPORT'
    elif mutation=='incomplete':value['status']='INCOMPLETE'
    elif mutation=='human':value['independentHumanAttestation']=True
    elif mutation=='hash':value['datasetSha256']='changed'
    elif mutation=='nan':value['rows'][0]['latencyMs']=float('nan')
    elif mutation=='prompt':value['rows'][0]['promptSha256']='not-a-hash'
    elif mutation=='time':value['generatedAt']='2000-01-01'
    elif mutation=='version':value['judge']['version']=''
    with pytest.raises(ValueError):judge.validate_ai_labels(unit_data,'unit-source','unit-protocol',value)


def test_complete_fixture_does_not_unlock_human_gate(unit_data):
    value=artifact(unit_data)
    assert len(judge.validate_ai_labels(unit_data,'unit-source','unit-protocol',value))==200
    with pytest.raises(ValueError,match='PENDING_INDEPENDENT_HUMAN'):official.validated_labels(unit_data)


def test_gemini_batch_is_blind_stateless_header_key_no_tools_and_mock_tagged(unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:10];requests=[]
    def transport(request):
        requests.append(request)
        assert request.url.host=='generativelanguage.googleapis.com'
        assert request.headers['x-goog-api-key']=='UNIT-NOT-A-REAL-KEY'
        assert 'UNIT-NOT-A-REAL-KEY' not in str(request.url)
        if request.method=='GET':return httpx.Response(200,json={'name':'models/'+gemini.MODEL,'version':'unit','supportedGenerationMethods':['generateContent']})
        body=json.loads(request.content);assert set(body)=={'systemInstruction','contents','generationConfig'}
        assert 'temperature' not in body['generationConfig'] and 'candidateCount' not in body['generationConfig']
        assert body['generationConfig']['thinkingConfig']=={'thinkingLevel':'minimal'}
        pairs=json.loads(body['contents'][0]['parts'][0]['text'])['pairs']
        assert len(pairs)==10 and all(set(pair)=={'pairId','task','candidate'} for pair in pairs)
        assert 'responseJsonSchema' not in body['generationConfig'] and 'responseMimeType' not in body['generationConfig']
        assert body['generationConfig']['responseFormat']['text']['mimeType']=='APPLICATION_JSON'
        schema=body['generationConfig']['responseFormat']['text']['schema']
        assert schema['properties']['decisions']['minItems']==10 and schema['additionalProperties'] is False
        return httpx.Response(200,json={'modelVersion':gemini.MODEL+'-unit-response-version','candidates':[{'finishReason':'STOP',
            'content':{'parts':[{'text':json.dumps({'decisions':[{'pairId':pair['pairId'],'decision':decision()} for pair in reversed(pairs)]})}]}}]})
    with httpx.Client(transport=httpx.MockTransport(transport)) as client:
        runner=gemini.GeminiJudge('UNIT-NOT-A-REAL-KEY','a'*64,client)
        assert runner.metadata()=='unit' and runner.execution=='MOCK_TRANSPORT'
        labels,latency,version=runner.decide_many(jobs)
        assert len(labels)==10 and latency>=0 and version==gemini.MODEL+'-unit-response-version' and len(requests)==2


@pytest.mark.parametrize('response',[{'modelVersion':'x','candidates':[]},
    {'modelVersion':'x','candidates':[{'finishReason':'MAX_TOKENS'}]},
    {'modelVersion':'x','promptFeedback':{'blockReason':'SAFETY'}},
    {'candidates':[{'finishReason':'STOP','content':{'parts':[{'functionCall':{}}]}}]}])
def test_gemini_invalid_or_truncated_response_has_no_repair_or_fallback(unit_data,response):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:1];calls=[]
    def handler(request):calls.append(request);return httpx.Response(200,json=response)
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError):gemini.GeminiJudge('unit-key','a'*64,client).decide_many(jobs)
    assert len(calls)==1


def test_quota_error_no_retry_or_key_rotation(unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:1];calls=[]
    def handler(request):calls.append(request);return httpx.Response(429,json={'error':{'message':'UNIT-UPSTREAM-SECRET'}})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(httpx.HTTPStatusError):gemini.GeminiJudge('unit-key','a'*64,client).decide_many(jobs)
    assert len(calls)==1


def test_paid_or_pending_confirmation_fails_before_reading_key_or_network(tmp_path,monkeypatch):
    path=tmp_path/'confirmation.json';path.write_text(json.dumps({'version':1,'status':'PENDING','provider':'gemini','model':gemini.MODEL,
        'billingLinked':False,'confirmedBy':'','confirmedAt':None,'reference':''}))
    monkeypatch.setattr(gemini,'GeminiJudge',lambda *a:pytest.fail('Must not construct network client'))
    with pytest.raises(ValueError,match='FREE_TIER'):gemini.run(PROTOCOL_PATH.with_name('f4-pilot.json'),tmp_path/'output',path)
    assert not (tmp_path/'output').exists()


def test_exploratory_math_keeps_uncertainty_and_test_does_not_select_alpha():
    prepared=[];labels={};rows={}
    for split in ('dev','test'):
        task={'id':'unit-'+split,'split':split,'group':'unit-'+split}
        scores=[(f'c{j}',1 if j==0 else 0,0 if j==0 else 1,j,True) for j in range(10)]
        prepared.append((task,scores,1))
        for j in range(10):
            key=(task['id'],f'c{j}');labels[key]=2 if j==0 else 0
            rows[key]={'decision':{'relevance':labels[key],'uncertain':j==0,'uncertaintyReason':'unit uncertainty','requirements':[]}}
    result=exploratory.exploratory_comparisons(prepared,labels,rows)
    assert result['selectedAlphaDevOnly']==0 and len(result['uncertainPairs'])==2 and result['worseCases']['pureVsBaseline']
    changed={key:2-value if key[0]=='unit-test' else value for key,value in labels.items()}
    assert exploratory.exploratory_comparisons(prepared,changed,rows)['selectedAlphaDevOnly']==0


def test_duplicate_judge_json_cannot_shadow_grade():
    with pytest.raises(ValueError,match='DUPLICATE'):gemini.strict_json('{"relevance":0,"relevance":2}')


def test_failure_classification_never_logs_upstream_text_or_key():
    request=httpx.Request('POST',gemini.ORIGIN+'/models/unit:generateContent',headers={'x-goog-api-key':'UNIT-SECRET'})
    response=httpx.Response(404,request=request,json={'error':{'status':'NOT_FOUND','message':'UNIT-SECRET model not found UNIT-RAW-PROMPT'}})
    error=httpx.HTTPStatusError('UNIT-SECRET upstream',request=request,response=response)
    result=gemini.safe_failure(error)
    assert result=={'errorType':'HTTPStatusError','httpStatus':404,'providerStatus':'NOT_FOUND','category':'MODEL_OR_METHOD_UNAVAILABLE'}
    assert 'UNIT-' not in json.dumps(result)


def test_exploratory_gate_rejects_mock_labels_before_any_model(tmp_path,unit_data,monkeypatch):
    data=tmp_path/'data.json';data.write_text(json.dumps(unit_data))
    _,sha=load_json(data);_,protocol_sha=load_json(PROTOCOL_PATH)
    value=artifact(unit_data);value.update(datasetSha256=sha,protocolSha256=protocol_sha);value['judge']['execution']='MOCK_TRANSPORT'
    labels=tmp_path/'labels.json';labels.write_text(json.dumps(value))
    monkeypatch.setattr(exploratory,'PhoBertEncoder',lambda:pytest.fail('No model before provenance'))
    with pytest.raises(ValueError,match='PROVENANCE'):exploratory.ai_evidence(data,labels)


def test_local_model_metadata_mock_is_not_live_provenance():
    def handler(request):
        if request.url.path=='/api/version':return httpx.Response(200,json={'version':'unit'})
        if request.url.path=='/api/tags':return httpx.Response(200,json={'models':[{'name':'unit-chat:1','digest':'a'*64,'size':100}]})
        return httpx.Response(200,json={'details':{'format':'gguf'},'capabilities':['completion'],'model_info':{'general.architecture':'unit-chat'}})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        runner=judge.LocalJudge('http://127.0.0.1:11434','unit-chat:1',client)
        assert runner.metadata()['execution']=='MOCK_TRANSPORT'


def test_cloud_ollama_proxy_is_not_accepted_even_on_loopback():
    def handler(request):
        if request.url.path=='/api/version':return httpx.Response(200,json={'version':'unit'})
        return httpx.Response(200,json={'models':[{'name':'unit-chat:1','remote_host':'https://cloud.invalid','digest':'a'*64,'size':100}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        with pytest.raises(ValueError,match='CLOUD'):judge.LocalJudge('http://127.0.0.1:11434','unit-chat:1',client).metadata()


def test_gemini_text_signature_is_metadata_not_tool_and_never_logged(unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:2]
    pairs=[json.loads(job['messages'][1]['content']) for job in jobs]
    value={'modelVersion':gemini.MODEL+'-unit','candidates':[{'finishReason':'STOP','content':{'parts':[{
        'text':json.dumps({'decisions':[{'pairId':pair['pairId'],'decision':decision()} for pair in pairs]}),
        'thoughtSignature':'UNIT-OPAQUE-SIGNATURE','thought':False}]}}]}
    with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,json=value))) as client:
        runner=gemini.GeminiJudge('UNIT-KEY','a'*64,client);captured=[];runner.response_observer=captured.append
        result,_,_=runner.decide_many(jobs)
        assert len(result)==2 and runner.last_response_meta['httpStatus']==200
        assert 'UNIT-OPAQUE-SIGNATURE' not in json.dumps(captured+ [runner.last_response_meta])


@pytest.mark.parametrize('part',[{'functionCall':{}},{'text':'unit','thought':True},
    {'text':'unit','executableCode':{}},{'text':'unit','thoughtSignature':{}}])
def test_gemini_does_not_accept_hidden_thoughts_tools_or_wrong_signature_types(unit_data,part):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:1]
    value={'modelVersion':gemini.MODEL,'candidates':[{'finishReason':'STOP','content':{'parts':[part]}}]}
    with httpx.Client(transport=httpx.MockTransport(lambda r:httpx.Response(200,json=value))) as client:
        with pytest.raises(ValueError,match='TEXT_ONLY'):gemini.GeminiJudge('UNIT-KEY','a'*64,client).decide_many(jobs)


def test_resume_checkpoint_retains_accepted_pairs_and_blocks_uncertain_outcome(tmp_path,unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:3]
    import hashlib
    meta=artifact(unit_data)['judge'];rows=[]
    for job in jobs[:2]:
        rows.append({'taskId':job['taskId'],'candidateId':job['candidateId'],'decision':decision(),'latencyMs':1,
            'promptSha256':hashlib.sha256(json.dumps(job['messages'],ensure_ascii=False).encode()).hexdigest()})
    path=tmp_path/'request-events.jsonl'
    gemini.append_event(path,{'kind':'started','requestId':'unit-request','pairs':[[job['taskId'],job['candidateId']] for job in jobs[:2]]})
    with pytest.raises(ValueError,match='UNCERTAIN'):gemini.read_checkpoint(tmp_path,jobs,'a'*64)
    gemini.append_event(path,{'kind':'validated','requestId':'unit-request','judge':meta,'rows':rows,'wallMs':1,'response':{'httpStatus':200}})
    loaded,provenance,measurements=gemini.read_checkpoint(tmp_path,jobs,'a'*64)
    assert loaded==rows and provenance==meta and len(measurements)==1
    gemini.append_event(path,{'kind':'started','requestId':'unit-unknown-request','pairs':[[jobs[2]['taskId'],jobs[2]['candidateId']]]})
    with pytest.raises(ValueError,match='UNCERTAIN'):gemini.read_checkpoint(tmp_path,jobs,'a'*64)


def test_resume_rejects_regraded_duplicates(tmp_path,unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:1]
    import hashlib
    row={'taskId':jobs[0]['taskId'],'candidateId':jobs[0]['candidateId'],'decision':decision(),'latencyMs':1,
        'promptSha256':hashlib.sha256(json.dumps(jobs[0]['messages'],ensure_ascii=False).encode()).hexdigest()}
    for request in ('unit-1','unit-2'):
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'started','requestId':request,'pairs':[[row['taskId'],row['candidateId']]]})
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'validated','requestId':request,'judge':artifact(unit_data)['judge'],
            'rows':[row],'wallMs':1,'response':{}})
    with pytest.raises(ValueError,match='DUPLICATE'):gemini.read_checkpoint(tmp_path,jobs,'a'*64)


def test_current_user_dpapi_roundtrip_not_plaintext_and_no_overwrite(tmp_path):
    from scripts.f4_judge_secret import save_key,load_key
    path=tmp_path/'unit.dpapi';save_key('UNIT-ONLY-NOT-A-REAL-KEY',path)
    assert b'UNIT-ONLY-NOT-A-REAL-KEY' not in path.read_bytes()
    assert load_key(path)=='UNIT-ONLY-NOT-A-REAL-KEY'
    with pytest.raises(FileExistsError):save_key('UNIT-OTHER-KEY',path)


def test_partial_export_never_unlocks_exploratory_benchmark(unit_data):
    value=artifact(unit_data);value['status']='INCOMPLETE';value['rows']=value['rows'][:17]
    with pytest.raises(ValueError,match='COMPLETE_AI_GENERATED'):judge.validate_ai_labels(unit_data,'unit-source','unit-protocol',value)


def test_invalid_json_stops_once_without_repair_and_preserves_diagnostic(unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:2];calls=[]
    def handler(request):
        calls.append(request)
        return httpx.Response(200,json={'modelVersion':gemini.MODEL,'candidates':[{'finishReason':'STOP',
            'content':{'parts':[{'text':'{"decisions":[}'}]}}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        runner=gemini.GeminiJudge('UNIT-KEY','a'*64,client);saved=[];runner.response_observer=saved.append
        with pytest.raises(json.JSONDecodeError):runner.decide_many(jobs)
        assert len(calls)==1 and len(saved)==1 and saved[0]['response']['httpStatus']==200


def test_http_error_does_not_reuse_previous_success_metadata(unit_data):
    protocol,_=load_json(PROTOCOL_PATH);jobs=list(judge.blind_jobs(unit_data,protocol))[:1]
    with httpx.Client(transport=httpx.MockTransport(lambda request:httpx.Response(429,json={}))) as client:
        runner=gemini.GeminiJudge('UNIT-KEY','a'*64,client);runner.last_response_meta={'httpStatus':200}
        with pytest.raises(httpx.HTTPStatusError):runner.decide_many(jobs)
        assert runner.last_response_meta is None


def unit_jobs(unit_data,count=2):
    protocol,_=load_json(PROTOCOL_PATH)
    return list(judge.blind_jobs(unit_data,protocol))[:count]


def test_structured_schema_binds_opaque_ids_not_workload_or_ranking(unit_data):
    jobs=unit_jobs(unit_data);schema=gemini.response_schema(jobs)
    items=schema['properties']['decisions']['items']
    assert items['properties']['pairId']['enum']==[json.loads(job['messages'][1]['content'])['pairId'] for job in jobs]
    definition=items['properties']['decision']['properties']
    assert definition['relevance']=={'type':'integer','enum':[0,1,2]}
    assert definition['uncertain']=={'type':'boolean'}
    assert set(items['properties']['decision']['required'])=={'relevance','reason','requirements','uncertain','uncertaintyReason'}
    assert not any(word in json.dumps(schema) for word in ('workload','split','baseline','phobert','unit-person'))


@pytest.mark.parametrize('version',['gemini-2.5-flash','unrelated-judge','gemini-3.5-pro'])
def test_wrong_model_is_never_accepted_or_retried(unit_data,version):
    response={'modelVersion':version,'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{}'}]}}]}
    with httpx.Client(transport=httpx.MockTransport(lambda request:httpx.Response(200,json=response))) as client:
        with pytest.raises(ValueError,match='WRONG_JUDGE_MODEL') as failure:gemini.GeminiJudge('UNIT-KEY','a'*64,client).decide_many(unit_jobs(unit_data))
        assert gemini.json_retryable(failure.value) is False


@pytest.mark.parametrize('error',[ValueError('INVENTED_SKILL_EVIDENCE'),ValueError('JUDGE_BATCH_PAIR_MISMATCH'),
    ValueError('JUDGE_GRADE_EVIDENCE_CONTRADICTION'),ValueError('WRONG_JUDGE_MODEL'),ValueError('INVALID_JUDGE_GRADE')])
def test_semantic_identity_and_grade_failures_not_retried(error):
    assert gemini.json_retryable(error) is False


def test_explicit_recovery_abandons_old_invalid_json_without_editing_history(tmp_path,unit_data):
    jobs=unit_jobs(unit_data);path=tmp_path/'request-events.jsonl';pairs=[[job['taskId'],job['candidateId']] for job in jobs]
    gemini.append_event(path,{'kind':'started','requestId':'unit-old-failed','pairs':pairs})
    before=path.read_bytes()
    gemini.recover_unfinished(tmp_path,jobs,'a'*64)
    assert path.read_bytes().startswith(before)
    assert gemini.read_checkpoint(tmp_path,jobs,'a'*64)==([],None,[])
    assert gemini.journal(tmp_path)[-1]['kind']=='abandoned'


def test_crash_after_response_can_resume_offline_without_regrading(tmp_path,unit_data):
    jobs=unit_jobs(unit_data,3);meta=artifact(unit_data)['judge'];meta['version']=gemini.MODEL
    path=tmp_path/'request-events.jsonl'
    first=jobs[:1];rest=jobs[1:]
    gemini.append_event(path,{'kind':'started','requestId':'unit-accepted','pairs':[[first[0]['taskId'],first[0]['candidateId']]]})
    gemini.append_event(path,{'kind':'validated','requestId':'unit-accepted','judge':meta,'rows':gemini.label_rows(first,[decision()],1),'wallMs':1,'response':{}})
    gemini.append_event(path,{'kind':'started','requestId':'unit-crash','pairs':[[job['taskId'],job['candidateId']] for job in rest]})
    response_dir=tmp_path/'responses';response_dir.mkdir()
    saved={'response':{'httpStatus':200,'modelVersion':gemini.MODEL},'wallMs':2,
        'jsonText':json.dumps({'decisions':[{'pairId':json.loads(job['messages'][1]['content'])['pairId'],'decision':decision()} for job in rest]})}
    (response_dir/'unit-crash.json').write_text(json.dumps(saved),encoding='utf-8');before=path.read_bytes()
    gemini.recover_unfinished(tmp_path,jobs,'a'*64)
    loaded,provenance,_=gemini.read_checkpoint(tmp_path,jobs,'a'*64)
    assert len(loaded)==3 and path.read_bytes().startswith(before) and provenance==meta
    assert gemini.journal(tmp_path)[-1]['recoveredFromResponseSha256']


def test_recovery_rejects_wrong_saved_model(tmp_path,unit_data):
    jobs=unit_jobs(unit_data);meta=artifact(unit_data)['judge'];meta['version']=gemini.MODEL
    first=jobs[:1];last=jobs[1:];path=tmp_path/'request-events.jsonl'
    gemini.append_event(path,{'kind':'started','requestId':'unit-ok','pairs':[[first[0]['taskId'],first[0]['candidateId']]]})
    gemini.append_event(path,{'kind':'validated','requestId':'unit-ok','judge':meta,'rows':gemini.label_rows(first,[decision()],1),'wallMs':1,'response':{}})
    gemini.append_event(path,{'kind':'started','requestId':'unit-wrong','pairs':[[last[0]['taskId'],last[0]['candidateId']]]})
    (tmp_path/'responses').mkdir();(tmp_path/'responses/unit-wrong.json').write_text(json.dumps({'response':{'httpStatus':200,'modelVersion':'gemini-other'},'jsonText':'{}'}))
    with pytest.raises(ValueError,match='MODEL_CHANGED'):gemini.recover_unfinished(tmp_path,jobs,'a'*64)


def test_retry_request_ids_and_cap_persist_across_resume(tmp_path,unit_data):
    jobs=unit_jobs(unit_data);pairs=[[job['taskId'],job['candidateId']] for job in jobs]
    for i in range(3):
        assert gemini.attempt_allowed(tmp_path,jobs)==max(0,i-1)
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'started','requestId':f'unit-{i}','pairs':pairs,'structured':True,'retryOf':None if i==0 else f'unit-{i-1}'})
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'failed','requestId':f'unit-{i}','retryable':True})
    with pytest.raises(ValueError,match='REQUEST_LIMIT'):gemini.attempt_allowed(tmp_path,jobs)


def test_quota_auth_or_transport_failure_stops_checkpoint(tmp_path,unit_data):
    jobs=unit_jobs(unit_data)
    gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'started','requestId':'unit-429','pairs':[[job['taskId'],job['candidateId']] for job in jobs]})
    gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'failed','requestId':'unit-429','retryable':False,'failure':{'httpStatus':429}})
    with pytest.raises(ValueError,match='TERMINAL'):gemini.read_checkpoint(tmp_path,jobs,'a'*64)


def test_configuration_retries_have_separate_hard_cap_and_do_not_generate_labels(tmp_path,unit_data):
    jobs=unit_jobs(unit_data);pairs=[[job['taskId'],job['candidateId']] for job in jobs]
    for i in range(4):
        gemini.attempt_allowed(tmp_path,jobs)
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'started','requestId':f'unit-config-{i}','pairs':pairs,'structured':True})
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'failed','requestId':f'unit-config-{i}','retryable':False,
            'failure':{'httpStatus':400,'providerStatus':'INVALID_ARGUMENT'}})
    with pytest.raises(ValueError,match='CONFIGURATION_RETRY_LIMIT'):gemini.attempt_allowed(tmp_path,jobs)
    assert gemini.inspect_checkpoint(tmp_path,jobs,'a'*64)[0]==[]


@pytest.mark.parametrize('status',[401,403,429])
def test_explicit_recovery_never_authorizes_quota_or_auth_failure(tmp_path,unit_data,status):
    jobs=unit_jobs(unit_data)
    gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'started','requestId':'unit-fatal','pairs':[[job['taskId'],job['candidateId']] for job in jobs]})
    gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'failed','requestId':'unit-fatal','retryable':False,
        'failure':{'httpStatus':status,'providerStatus':'PERMISSION_DENIED'}})
    gemini.recover_unfinished(tmp_path,jobs,'a'*64)
    with pytest.raises(ValueError,match='TERMINAL'):gemini.read_checkpoint(tmp_path,jobs,'a'*64)


def test_schema_diagnostic_redacts_key_before_logging():
    request=httpx.Request('POST',gemini.ORIGIN+'/models/unit:generateContent',headers={'x-goog-api-key':'UNIT-HEADER-SECRET'})
    response=httpx.Response(400,request=request,json={'error':{'status':'INVALID_ARGUMENT','message':
        'Invalid schema UNIT-HEADER-SECRET AQ.'+'x'*40}})
    result=gemini.safe_failure(httpx.HTTPStatusError('do not log',request=request,response=response))
    assert 'UNIT-HEADER-SECRET' not in json.dumps(result) and 'x'*40 not in json.dumps(result)
    assert '[REDACTED]' in result['schemaDiagnostic']


def test_google_error_details_field_violations_are_filtered():
    secret='UNIT-PRIVATE-HEADER'
    request=httpx.Request('POST',gemini.ORIGIN+'/models/unit:generateContent',headers={'x-goog-api-key':secret})
    response=httpx.Response(400,request=request,json={'error':{'status':'INVALID_ARGUMENT','message':'Generic invalid argument',
        'details':[{'@type':'type.googleapis.com/google.rpc.BadRequest','fieldViolations':[
            {'field':'generationConfig.responseFormat','description':'Bad '+secret+' user@example.com Bearer PRIVATE-TOKEN'}],
            'metadata':{'credential':'DO-NOT-KEEP'}}]}})
    result=gemini.safe_failure(httpx.HTTPStatusError('raw not logged',request=request,response=response))
    assert result['fieldViolations'][0]['field']=='generationConfig.responseFormat'
    assert all(value not in json.dumps(result) for value in (secret,'user@example.com','PRIVATE-TOKEN','DO-NOT-KEEP'))


@pytest.fixture
def diagnostic_environment(tmp_path,unit_data,monkeypatch):
    import diagnose_f4_structured as diagnostic
    destination=tmp_path/'diagnostic';destination.mkdir();(destination/'offline-audit.json').write_text('{}')
    jobs=unit_jobs(unit_data)
    provenance=artifact(unit_data)['judge'];provenance['version']=gemini.MODEL
    monkeypatch.setattr(diagnostic,'DESTINATION',destination)
    monkeypatch.setattr(diagnostic,'confirmation',lambda path:'a'*64)
    monkeypatch.setattr(diagnostic,'load_key',lambda path:'UNIT-DIAGNOSTIC-KEY')
    monkeypatch.setattr(diagnostic,'jobs_and_seed',lambda:(jobs,[],provenance,jobs))
    return diagnostic,destination,jobs


def test_minimal_diagnostic_makes_one_post_no_metadata_or_retry(diagnostic_environment):
    diagnostic,destination,jobs=diagnostic_environment;requests=[]
    def handler(request):
        requests.append(request);body=json.loads(request.content)
        assert request.method=='POST' and request.url.path.endswith('/'+gemini.MODEL+':generateContent')
        assert body['generationConfig']['responseFormat']['text']['schema']==diagnostic.TINY
        return httpx.Response(200,json={'modelVersion':gemini.MODEL,'candidates':[{'finishReason':'STOP','content':{'parts':[{'text':'{"ok":true}'}]}}]})
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        result=diagnostic.live('tiny-current',client=client)
    assert len(requests)==1 and result['status']=='PASS' and result['execution']=='MOCK_TRANSPORT'
    assert 'UNIT-DIAGNOSTIC-KEY' not in ''.join(path.read_text() for path in destination.glob('*.json*'))


def test_diagnostic_limit_three_survives_process_reentry_before_key_read(diagnostic_environment,monkeypatch):
    diagnostic,destination,_=diagnostic_environment
    for variant in ('tiny-current','tiny-legacy','tiny-legacy-no-thinking'):
        gemini.append_event(destination/'diagnostic-events.jsonl',{'kind':'started','variant':variant,'requestId':variant})
        gemini.append_event(destination/'diagnostic-events.jsonl',{'kind':'result','variant':variant,'requestId':variant,'httpStatus':400,'status':'FAILED'})
    monkeypatch.setattr(diagnostic,'load_key',lambda path:pytest.fail('No key use beyond hard cap'))
    with pytest.raises(ValueError,match='HARD_CAP_THREE'):diagnostic.live('pair-current')


def test_diagnostic_variant_changes_only_format_then_optional_thinking(diagnostic_environment):
    diagnostic,_,jobs=diagnostic_environment
    current=diagnostic.payload('tiny-current',jobs);legacy=diagnostic.payload('tiny-legacy',jobs)
    assert current['contents']==legacy['contents']
    assert current['generationConfig']['thinkingConfig']==legacy['generationConfig']['thinkingConfig']
    assert current['generationConfig']['maxOutputTokens']==legacy['generationConfig']['maxOutputTokens']
    no_thinking=diagnostic.payload('tiny-legacy-no-thinking',jobs)
    removed=copy.deepcopy(legacy);removed['generationConfig'].pop('thinkingConfig')
    assert no_thinking==removed


def test_diagnostic_auth_or_quota_result_stops_other_variants(diagnostic_environment):
    diagnostic,_,_=diagnostic_environment
    events=[{'kind':'started','variant':'tiny-current'},{'kind':'result','variant':'tiny-current','status':'FAILED','httpStatus':429}]
    with pytest.raises(ValueError,match='AUTH_OR_QUOTA'):diagnostic.check_variant(events,'tiny-legacy')


def test_real_pair_smoke_not_allowed_before_minimal_success(diagnostic_environment):
    diagnostic,_,_=diagnostic_environment
    with pytest.raises(ValueError,match='MUST_BE_FIRST'):diagnostic.check_variant([],'pair-current')


def test_legacy_schema_keeps_integer_relevance_and_required_evidence(diagnostic_environment):
    diagnostic,_,jobs=diagnostic_environment
    body=diagnostic.payload('pair-legacy',jobs)
    schema=body['generationConfig']['responseSchema']
    definition=schema['properties']['decisions']['items']['properties']['decision']
    assert definition['properties']['relevance']=={'type':'INTEGER','minimum':0,'maximum':2}
    assert set(definition['required'])=={'relevance','reason','requirements','uncertain','uncertaintyReason'}
    assert definition['properties']['requirements']['items']['required']==['requiredSkill','status','evidenceSkills','reason']


def test_verified_unbounded_schema_does_not_relax_local_pair_or_evidence_checks(unit_data):
    jobs=unit_jobs(unit_data)
    schema=gemini.response_schema(jobs,array_bounds=False)
    assert 'minItems' not in json.dumps(schema) and 'maxItems' not in json.dumps(schema)
    pair_ids=[json.loads(job['messages'][1]['content'])['pairId'] for job in jobs]
    missing={'decisions':[{'pairId':pair_ids[0],'decision':decision()}]}
    with pytest.raises(ValueError,match='INCOMPLETE'):gemini.parse_batch(json.dumps(missing),jobs)
    wrong_requirements=decision();wrong_requirements['requirements']=[]
    with pytest.raises(ValueError,match='MISSING_REQUIREMENT'):judge.validate_decision(wrong_requirements,['unit skill'],['unit skill'])
    invented=decision();invented['requirements'][0]['evidenceSkills']=['fabricated']
    with pytest.raises(ValueError,match='INVENTED'):judge.validate_decision(invented,['unit skill'],['unit skill'])


def test_live_schema_pair_payloads_differ_only_in_four_array_bounds(diagnostic_environment):
    diagnostic,_,jobs=diagnostic_environment
    bounded=diagnostic.payload('pair-current',jobs);unbounded=diagnostic.payload('pair-current-unbounded',jobs)
    assert diagnostic.remove_array_bounds(bounded)==unbounded
    def removed(value):
        if type(value) is dict:return sum(key in ('minItems','maxItems') for key in value)+sum(removed(item) for item in value.values())
        if type(value) is list:return sum(removed(item) for item in value)
        return 0
    assert removed(bounded)==4 and removed(unbounded)==0


def test_boolean_or_mock_probe_cannot_authorize_profile_promotion(diagnostic_environment,monkeypatch):
    diagnostic,destination,jobs=diagnostic_environment
    monkeypatch.setattr(diagnostic,'RUN',destination)
    ledger=destination/'diagnostic-events.jsonl'
    gemini.append_event(ledger,{'kind':'started','requestId':'unit-probe','variant':'tiny-current'})
    gemini.append_event(ledger,{'kind':'result','requestId':'unit-probe','variant':'tiny-current','status':'PASS','execution':'MOCK_TRANSPORT'})
    with pytest.raises(ValueError,match='LIVE_REAL_PAIR'):diagnostic.install_verified_smoke(destination,jobs,'a'*64)
    gemini.append_event(ledger,{'kind':'started','requestId':'unit-pair','variant':'pair-current-unbounded'})
    gemini.append_event(ledger,{'kind':'result','requestId':'unit-pair','variant':'pair-current-unbounded','status':'PASS',
        'execution':'MOCK_TRANSPORT','httpStatus':200,'modelVersion':gemini.MODEL})
    with pytest.raises(ValueError,match='PROVENANCE'):diagnostic.install_verified_smoke(destination,jobs,'a'*64)


def test_four_v4_errors_stay_blocked_without_real_profile_verification(tmp_path,unit_data):
    jobs=unit_jobs(unit_data);pairs=[[job['taskId'],job['candidateId']] for job in jobs]
    for i in range(4):
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'started','requestId':f'unit-old-{i}','pairs':pairs,'structured':True})
        gemini.append_event(tmp_path/'request-events.jsonl',{'kind':'failed','requestId':f'unit-old-{i}','retryable':False,
            'failure':{'httpStatus':400,'providerStatus':'INVALID_ARGUMENT'}})
    with pytest.raises(ValueError,match='CONFIGURATION_RETRY_LIMIT'):gemini.attempt_allowed(tmp_path,jobs)


def test_verified_profile_retains_old_failures_but_new_http400_stops(tmp_path,unit_data):
    jobs=unit_jobs(unit_data);pairs=[[job['taskId'],job['candidateId']] for job in jobs]
    path=tmp_path/'request-events.jsonl'
    for i in range(4):
        gemini.append_event(path,{'kind':'started','requestId':f'unit-v4-{i}','pairs':pairs,'structured':True})
        gemini.append_event(path,{'kind':'failed','requestId':f'unit-v4-{i}','retryable':False,
            'failure':{'httpStatus':400,'providerStatus':'INVALID_ARGUMENT'}})
    original=path.read_bytes()
    # Unit journal only: live proof import is independently tested fail-closed.
    gemini.append_event(path,{'kind':'structured-profile-verified','requestId':'unit-proof','profile':'V5_UNBOUNDED_ARRAYS'})
    assert gemini.attempt_allowed(tmp_path,jobs)==0
    gemini.append_event(path,{'kind':'started','requestId':'unit-v5-bad','pairs':pairs,
        'structured':True,'profile':'V5_UNBOUNDED_ARRAYS'})
    gemini.append_event(path,{'kind':'failed','requestId':'unit-v5-bad','retryable':False,
        'failure':{'httpStatus':400,'providerStatus':'INVALID_ARGUMENT'}})
    with pytest.raises(ValueError,match='VERIFIED_PROFILE_HTTP400_STOP'):gemini.attempt_allowed(tmp_path,jobs)
    assert path.read_bytes().startswith(original)
