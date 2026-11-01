"""Evaluation tooling only. Unit labels/approvals below are invented TEST FIXTURES,
not human annotations and are never exported into the actual 20x10 pilot."""
import copy
import hashlib
import json
from pathlib import Path
import sys
import pytest

EVAL = Path(__file__).resolve().parents[1] / 'eval'
sys.path.insert(0,str(EVAL))
import evaluate_f4 as evaluator
import f4_review_validation as validation
from prepare_f4_review import review_packet, export_bundle


def digest(value):
    return hashlib.sha256(json.dumps(value,sort_keys=True).encode()).hexdigest()


@pytest.fixture
def unit_evidence():
    dataset={'synthetic':True,'rubricStatus':'PROPOSED_FOR_REVIEW','rubric':{'0':'unit-none','1':'unit-partial','2':'unit-all'},'tasks':[]}
    for i in range(20):
        dataset['tasks'].append({'id':f'unit-task-{i}','title':'Unit task','description':'Unit description',
            'requiredSkills':['Unit skill'],'group':f'unit-group-{i}','split':'dev' if i<10 else 'test',
            'candidates':[{'id':f'unit-{i}-{j}','skills':['Unit skill'],'workload':j,'judgments':[]} for j in range(10)]})
    source_sha=digest(dataset)
    _,protocol_sha=validation.load_json(validation.PROTOCOL_PATH)
    packets=[]
    for slot in ('A','B'):
        packet=review_packet(dataset,source_sha,slot)
        packet.update(proposedProtocolSha256=protocol_sha,reviewer='unit-only-'+slot,completedAt='2000-01-01T00:00:00Z')
        for task in packet['tasks']:
            for row in task['candidates']:
                row.update(relevance=1,reason='Invented unit fixture; never human evidence',independentHumanAttestation=True)
        packets.append(packet)
    a,b=packets
    approval=validation.approval_template(source_sha,protocol_sha)
    approval.update(status='APPROVED',approvedBy='unit-only-approver',approvedAt='2000-01-01T00:00:00Z',reference='UNIT-NOT-REAL',
                    rubricApproved=True,labelsApproved=True,independentReviewsConfirmed=True,
                    reviewerASha256=digest(a),reviewerBSha256=digest(b))
    approval['rubricApproval']={'approvedBy':'unit-only-rubric-approver','approvedAt':'2000-01-01T00:00:00Z','reference':'UNIT-RUBRIC-NOT-REAL'}
    return dataset,dict(source_sha=source_sha,a=a,a_sha=digest(a),b=b,b_sha=digest(b),approval=approval,protocol_sha=protocol_sha)


def test_fixture_gate_checks_two_distinct_complete_attested_files(unit_evidence):
    dataset,evidence=unit_evidence
    labels=evaluator.validated_labels(dataset,evidence)
    assert len(labels)==200
    assert len(validation.compare_reviews(dataset,evidence['source_sha'],evidence['a'],evidence['b'],evidence['protocol_sha'])['incompletePairs'])==0


@pytest.mark.parametrize('field,value',[
    ('status','PENDING'),('version',2),('approvedBy',' '),('approvedAt',None),('approvedAt','2000-01-01T00:00:00'),
    ('reference',''),('rubricApproved',False),('labelsApproved',False),('independentReviewsConfirmed',False),
    ('reviewerASha256','changed'),('reviewerBSha256','changed'),('sourceDatasetSha256','changed'),('protocolSha256','changed')])
def test_pending_or_unbound_approval_cannot_authorize_benchmark(unit_evidence,field,value):
    dataset,evidence=unit_evidence;evidence['approval'][field]=value
    with pytest.raises(ValueError):evaluator.validated_labels(dataset,evidence)


def test_legacy_status_strings_cannot_bypass_external_evidence(unit_evidence):
    dataset,_=unit_evidence
    dataset.update(annotationStatus='REVIEWED_BY_INDEPENDENT_HUMANS',rubricStatus='APPROVED')
    with pytest.raises(ValueError,match='PENDING_INDEPENDENT_HUMAN'):evaluator.validated_labels(dataset)


def test_rubric_approval_must_precede_completed_reviews(unit_evidence):
    dataset,evidence=unit_evidence
    evidence['approval']['rubricApproval']['approvedAt']='2001-01-01T00:00:00Z'
    with pytest.raises(ValueError,match='TIMELINE'):evaluator.validated_labels(dataset,evidence)


def test_labels_cannot_be_approved_before_reviews_finish(unit_evidence):
    dataset,evidence=unit_evidence;evidence['approval']['approvedAt']='1999-01-01T00:00:00Z'
    with pytest.raises(ValueError,match='TIMELINE'):evaluator.validated_labels(dataset,evidence)


@pytest.mark.parametrize('mutation', ['disagree','missing-label','missing-reason','not-attested','same-reviewer','bad-time','foreign-id','changed-skill','duplicate-pair','missing-task','boolean-label','protocol'])
def test_invalid_reviews_block_without_silent_resolution(unit_evidence,mutation):
    dataset,evidence=unit_evidence;a,b=evidence['a'],evidence['b'];row=b['tasks'][0]['candidates'][0]
    if mutation=='disagree':row['relevance']=2
    elif mutation=='missing-label':row['relevance']=None
    elif mutation=='missing-reason':row['reason']=' '
    elif mutation=='not-attested':row['independentHumanAttestation']=False
    elif mutation=='same-reviewer':b['reviewer']=' UNIT-ONLY-A '
    elif mutation=='bad-time':b['completedAt']='yesterday'
    elif mutation=='foreign-id':row['id']='forged'
    elif mutation=='changed-skill':row['skills']=['invented']
    elif mutation=='duplicate-pair':b['tasks'][0]['candidates'][1]=copy.deepcopy(row)
    elif mutation=='missing-task':b['tasks'].pop()
    elif mutation=='boolean-label':row['relevance']=True
    elif mutation=='protocol':b['proposedProtocolSha256']='changed'
    evidence['b_sha']=digest(b);evidence['approval']['reviewerBSha256']=digest(b)
    with pytest.raises(ValueError):evaluator.validated_labels(dataset,evidence)


def test_comparison_preserves_conflicting_originals(unit_evidence):
    dataset,evidence=unit_evidence;a,b=evidence['a'],evidence['b'];b['tasks'][0]['candidates'][0]['relevance']=2
    before=json.dumps([dataset,a,b],sort_keys=True)
    report=validation.compare_reviews(dataset,evidence['source_sha'],a,b,evidence['protocol_sha'])
    assert len(report['disagreements'])==1 and report['agreements']==199
    assert report['readyForHumanApproval'] is False
    assert json.dumps([dataset,a,b],sort_keys=True)==before


@pytest.mark.parametrize('mutation',['task-id','candidate-id','group-leak','workload-bool','embedded-label'])
def test_pilot_integrity_and_split_leakage(unit_evidence,mutation):
    dataset,_=unit_evidence
    if mutation=='task-id':dataset['tasks'][1]['id']=dataset['tasks'][0]['id']
    elif mutation=='candidate-id':dataset['tasks'][1]['candidates'][0]['id']=dataset['tasks'][0]['candidates'][0]['id']
    elif mutation=='group-leak':dataset['tasks'][10]['group']=dataset['tasks'][0]['group']
    elif mutation=='workload-bool':dataset['tasks'][0]['candidates'][0]['workload']=True
    elif mutation=='embedded-label':dataset['tasks'][0]['candidates'][0]['judgments']=[{'relevance':2}]
    with pytest.raises(ValueError):validation.validate_pilot(dataset)


def test_duplicate_json_keys_rejected(tmp_path):
    path=tmp_path/'bad.json';path.write_text('{"status":"PENDING","status":"APPROVED"}',encoding='utf-8')
    with pytest.raises(ValueError,match='DUPLICATE_JSON_KEY'):validation.load_json(path)


def test_metrics_have_exact_binary_and_graded_definitions():
    values=evaluator.metrics([0,2,1,0,0,0,0,0,0,0])
    assert values['Precision@1']==0 and values['Precision@3']==2/3 and values['Precision@5']==.4
    assert values['Recall@5']==1 and values['MRR']==.5
    import math
    expected=(3/math.log2(3)+1/math.log2(4))/(3+1/math.log2(3))
    assert values['NDCG@5']==pytest.approx(expected)
    assert set(evaluator.metrics([0]*10).values())=={0}


def toy_rankings():
    # Two artificial ranking/math queries, not pilot predictions/annotations.
    prepared=[];labels={}
    for split in ('dev','test'):
        task={'id':'unit-'+split,'split':split,'group':'unit-'+split}
        rows=[(f'c{j}',1 if j==0 else 0,0 if j==0 else 1,j,True) for j in range(10)]
        prepared.append((task,rows,0))
        labels.update({(task['id'],f'c{j}'):2 if j==0 else 0 for j in range(10)})
    return prepared,labels


def test_alpha_cannot_be_optimized_from_heldout_labels():
    prepared,labels=toy_rankings();selected,dev=evaluator.select_alpha_dev_only(prepared,labels)
    altered=dict(labels)
    for key in altered:
        if key[0]=='unit-test':altered[key]=2-altered[key]
    changed,changed_dev=evaluator.select_alpha_dev_only(prepared,altered)
    assert selected==changed==0 and dev==changed_dev


def test_same_pool_pure_model_and_worse_cases_are_not_hidden():
    prepared,labels=toy_rankings();report=evaluator.quality_report(prepared,labels)
    assert report['heldOutPhoBertPure']['NDCG@5']<report['heldOutBaseline']['NDCG@5']
    assert report['worseCases']['pureVsBaseline']
    assert report['selectedAlphaDevOnly']==0
    assert report['worseCases']['selectedVsBaseline']==[]
    for row in report['queryComparisons']:
        assert set(row['candidatePoolIds'])==set(row['baselineOrder'])==set(row['phobertPureOrder'])==set(row['selectedOrder'])


def test_bundle_never_creates_human_evidence_and_is_exclusive(tmp_path):
    source=EVAL/'f4-pilot.json';before=source.read_bytes()
    paths=export_bundle(source,tmp_path)
    for slot in ('A','B'):
        packet=json.loads((tmp_path/f'reviewer-{slot}.json').read_text(encoding='utf-8'))
        assert packet['reviewer']=='' and packet['completedAt'] is None
        assert len(validation.validate_packet(json.loads(before),hashlib.sha256(before).hexdigest(),packet,slot,validation.load_json(validation.PROTOCOL_PATH)[1]))==200
        assert all(row['relevance'] is None and row['reason']=='' and row['independentHumanAttestation'] is False for task in packet['tasks'] for row in task['candidates'])
        html=(tmp_path/f'reviewer-{slot}.html').read_text(encoding='utf-8')
        assert '__PACKET_JSON__' not in html and 'connect-src \'none\'' in html
    approval=json.loads((tmp_path/'approval.pending.json').read_text(encoding='utf-8'))
    assert approval['status']=='PENDING' and approval['approvedBy']=='' and approval['approvedAt'] is None
    assert not any(approval[key] for key in ('rubricApproved','labelsApproved','independentReviewsConfirmed'))
    saved={path.name:path.read_bytes() for path in paths}
    with pytest.raises(FileExistsError):export_bundle(source,tmp_path)
    assert {path.name:path.read_bytes() for path in paths}==saved and source.read_bytes()==before


def test_missing_approval_fails_before_model_or_benchmark_output(monkeypatch,tmp_path):
    output=tmp_path/'must-not-exist.json'
    def forbidden():raise AssertionError('No model may load before human approval')
    monkeypatch.setattr(evaluator,'PhoBertEncoder',forbidden)
    monkeypatch.setattr(sys,'argv',['evaluate_f4.py','--output',str(output)])
    with pytest.raises(ValueError,match='PENDING_INDEPENDENT_HUMAN'):evaluator.main()
    assert not output.exists()


def test_demo_resource_block_never_starts_a_worker(monkeypatch,tmp_path):
    import importlib.util
    spec=importlib.util.spec_from_file_location('unit_demo_check',EVAL.parent/'scripts/check_f4_demo.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    monkeypatch.setattr(module,'resources',lambda path:{'ready':False,'availableRamBytes':0})
    monkeypatch.setattr(module.time,'sleep',lambda _:None)
    def forbidden(*args,**kwargs):raise AssertionError('No worker may start below budget')
    monkeypatch.setattr(module.subprocess,'Popen',forbidden)
    output=tmp_path/'blocked.json'
    monkeypatch.setattr(sys,'argv',['check_f4_demo.py','--python','missing','--model-dir','missing','--segmenter-dir','missing',
                                  '--java-home','missing','--output',str(output)])
    with pytest.raises(SystemExit,match='RESOURCE_BUDGET_NOT_MET'):module.main()
    assert json.loads(output.read_text())['status']=='BLOCKED_RESOURCES'


def test_check_only_validates_unit_files_without_loading_model_or_metrics(unit_evidence,monkeypatch,tmp_path,capsys):
    dataset,evidence=unit_evidence
    files={name:tmp_path/f'unit-only-{name}.json' for name in ('dataset','a','b','approval')}
    for name,value in [('dataset',dataset),('a',evidence['a']),('b',evidence['b']),('approval',evidence['approval'])]:
        files[name].write_text(json.dumps(value,sort_keys=True),encoding='utf-8')
    def forbidden(*args,**kwargs):raise AssertionError('Check-only cannot load a model or produce metrics')
    monkeypatch.setattr(evaluator,'PhoBertEncoder',forbidden);monkeypatch.setattr(evaluator,'quality_report',forbidden)
    monkeypatch.setattr(sys,'argv',['evaluate_f4.py','--dataset',str(files['dataset']),'--reviewer-a',str(files['a']),
                                  '--reviewer-b',str(files['b']),'--approval',str(files['approval']),'--check-only'])
    evaluator.main()
    assert 'EVIDENCE_VALIDATED_NOT_A_BENCHMARK' in capsys.readouterr().out
    # Byte-level edits after approval invalidate even otherwise identical JSON.
    with files['a'].open('a',encoding='utf-8') as handle:handle.write(' ')
    with pytest.raises(ValueError,match='HASH_MISMATCH'):evaluator.main()
