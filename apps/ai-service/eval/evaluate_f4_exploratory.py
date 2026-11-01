"""Separate EXPLORATORY ranking path. AI labels NEVER unlock official evaluation."""
import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import math
import os
from pathlib import Path
import platform
import statistics
import sys
import time
sys.path.insert(0,str(Path(__file__).resolve().parent))
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from f4_ai_judge import validate_ai_labels
from f4_review_validation import load_json, PROTOCOL_PATH, require
# Reuse math/reporting only; never invoke/modify official main or approval gate.
from evaluate_f4 import order_key, quality_report, peak_rss_bytes, SUPPORTED_METRICS, SUPPORTED_SELECTION
from app.f4_encoder import PhoBertEncoder, semantic_rank, normalize, MODEL, REVISION, SEGMENTER_REVISION
from scripts.prepare_f4 import resources


def ai_evidence(dataset_path,labels_path):
    dataset,source_sha=load_json(dataset_path);artifact,labels_sha=load_json(labels_path)
    protocol,protocol_sha=load_json(PROTOCOL_PATH)
    require(protocol.get('version')==1 and protocol.get('selection')==SUPPORTED_SELECTION
            and protocol.get('metrics')==SUPPORTED_METRICS,'UNSUPPORTED_PROTOCOL')
    rows=validate_ai_labels(dataset,source_sha,protocol_sha,artifact)
    labels={key:row['decision']['relevance'] for key,row in rows.items()}
    return dataset,artifact,rows,labels,{'datasetSha256':source_sha,'aiLabelsSha256':labels_sha,'protocolSha256':protocol_sha}


def exploratory_comparisons(prepared,labels,rows):
    report=quality_report(prepared,labels)
    # Every ambiguous pair is reported; never silently omit difficult examples.
    report['uncertainPairs']=[{'taskId':key[0],'candidateId':key[1],'relevance':row['decision']['relevance'],
        'reason':row['decision']['uncertaintyReason'],'requirements':row['decision']['requirements']} for key,row in rows.items() if row['decision']['uncertain']]
    better=lambda field:[{'id':row['id'],'split':row['split'],'deltas':row[field]} for row in report['queryComparisons']
                         if any(delta>1e-12 for delta in row[field].values())]
    report['betterCases']={'pureVsBaseline':better('pureDeltas'),'selectedVsBaseline':better('selectedDeltas')}
    report['interpretation']='Agreement with provisional AI Judge labels, NOT human-validated accuracy or F1. Mixed deltas may appear in both better/worse lists.'
    return report


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--dataset',type=Path,default=Path(__file__).with_name('f4-pilot.json'))
    parser.add_argument('--labels',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args()
    require(not args.output.exists(),'NEW_EXCLUSIVE_OUTPUT_PATH_REQUIRED')
    dataset,artifact,rows,labels,provenance=ai_evidence(args.dataset,args.labels)
    require(bool(os.getenv('F4_MODEL_DIR')) and bool(os.getenv('F4_SEGMENTER_DIR')),'PINNED_LOCAL_PHOBERT_REQUIRED')
    gate=resources(Path(os.environ['F4_MODEL_DIR']));require(gate['ready'],'RESOURCE_BUDGET_NOT_MET')
    start=time.perf_counter();encoder=PhoBertEncoder();load_ms=(time.perf_counter()-start)*1000
    prepared=[];baseline_times=[]
    for task in dataset['tasks']:
        start=time.perf_counter();exact=[]
        for candidate in task['candidates']:
            own={normalize(skill).lower() for skill in candidate['skills']}
            score=sum(normalize(skill).lower() in own for skill in task['requiredSkills'])/len(task['requiredSkills'])
            exact.append((candidate['id'],score,candidate['workload'],bool(candidate['skills'])))
        sorted([(id,score,0,load,enough) for id,score,load,enough in exact],key=lambda row:order_key(row,0))
        baseline_times.append((time.perf_counter()-start)*1000)
        start=time.perf_counter();inferred=semantic_rank(task['requiredSkills'],task['description'],task['candidates'],encoder)
        semantic={row['id']:row['semanticScore'] for row in inferred}
        require(len(inferred)==len(semantic) and set(semantic)=={row[0] for row in exact},'CANDIDATE_POOL_CHANGED')
        require(all(type(value) in (int,float) and math.isfinite(value) and 0<=value<=1 for value in semantic.values()),'INVALID_SEMANTIC_SCORE')
        scores=[(id,score,semantic[id],load,enough) for id,score,load,enough in exact]
        prepared.append((task,scores,(time.perf_counter()-start)*1000))
    semantic_times=sorted(row[2] for row in prepared)
    p95=lambda values:sorted(values)[max(0,math.ceil(len(values)*.95)-1)]
    report={'benchmarkKind':'EXPLORATORY_AI_GENERATED','labelSource':'AI_GENERATED',
        'warning':'NOT HUMAN GOLD, NOT OFFICIAL ACCEPTANCE. Judge bias/uncertainty remain; no F1 claim.',
        'utc':datetime.now(timezone.utc).isoformat(),'judge':artifact['judge'],
        **exploratory_comparisons(prepared,labels,rows),
        'model':MODEL,'revision':REVISION,'segmenterRevision':SEGMENTER_REVISION,'modelLoadMs':load_ms,
        'baselineCoreP50Ms':statistics.median(baseline_times),'baselineCoreP95Ms':p95(baseline_times),
        'semanticCoreP50Ms':statistics.median(semantic_times),'semanticCoreP95Ms':p95(semantic_times),
        'perTaskLatencyMs':[{'id':task['id'],'baselineCore':baseline,'semanticCore':latency} for (task,_,latency),baseline in zip(prepared,baseline_times)],
        'judgeLabelLatencyMs':{'p50ContainingRequestMs':statistics.median(row['latencyMs'] for row in rows.values()),
            'pairs':len(rows),'scope':'Containing Judge request latency; batch rows share latency, do not sum. See judge-batch-latency.json for HTTP total.'},
        'peakRssBytesIncludingJvm':peak_rss_bytes(),
        'measurementScope':'Ranking core on real PhoBERT CPU, not Web/API latency; RSS includes model/JVM, not Judge-server memory or standalone baseline RSS',
        'provenance':{**provenance,'resourcesBeforeLoad':gate,'python':platform.python_version(),'platform':platform.platform(),
            'versions':{name:importlib.metadata.version(name) for name in ['torch','transformers','py-vncorenlp','pyjnius']},
            'sourceSha256':{path.name:hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__),Path(__file__).with_name('f4_ai_judge.py'),Path(__file__).with_name('evaluate_f4.py'),Path(__file__).resolve().parents[1]/'app/f4_encoder.py']}}}
    with args.output.open('x',encoding='utf-8') as handle:json.dump(report,handle,ensure_ascii=False,indent=2)


if __name__=='__main__':main()
