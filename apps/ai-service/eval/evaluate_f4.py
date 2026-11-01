"""F4 ranking pilot evaluation. Refuses missing independent human judgments."""
import argparse
import json
import math
from pathlib import Path
import statistics
import sys
import time
import ctypes
import os
import hashlib
import platform
import importlib.metadata
from datetime import datetime, timezone
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
from app.f4_encoder import PhoBertEncoder, semantic_rank, normalize, MODEL, REVISION, SEGMENTER_REVISION
from f4_review_validation import approved_labels, load_json, PROTOCOL_PATH, require

ALPHA_GRID = (0, .25, .5, .75, 1)
SUPPORTED_METRICS = {'binaryRelevantMin':1,'precisionAt':[1,3,5],'recallAt':5,
    'mrr':'first relevant rank over all 10 candidates','ndcgAt':5,'ndcgGain':'2^relevance-1',
    'zeroRelevantQueries':'score zero, retain in macro average and report their count',
    'aggregation':'macro average over tasks, with dev and test reported separately'}
SUPPORTED_SELECTION = {'alphaGrid':list(ALPHA_GRID),'metric':'dev.NDCG@5','tieBreak':'lowest alpha',
    'testUsage':'evaluation only after alpha is fixed; no re-selection from test results',
    'rankingTieBreak':'same Node score quantization, workload then stable candidate ID; missing skills last'}

def peak_rss_bytes():
    if os.name == "nt":
        class Counters(ctypes.Structure):
            _fields_ = [("cb", ctypes.c_ulong), ("faults", ctypes.c_ulong)] + [(name, ctypes.c_size_t) for name in ["peak", "working", "paged_peak", "paged", "nonpaged_peak", "nonpaged", "pagefile", "pagefile_peak"]]
        counters = Counters(); counters.cb = ctypes.sizeof(Counters)
        handle = ctypes.windll.kernel32.GetCurrentProcess
        handle.restype = ctypes.c_void_p
        query = ctypes.windll.psapi.GetProcessMemoryInfo
        query.argtypes = [ctypes.c_void_p, ctypes.c_void_p, ctypes.c_ulong]
        if not query(handle(), ctypes.byref(counters), counters.cb): raise RuntimeError("Peak RSS not measurable")
        return counters.peak
    import resource
    return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == "darwin" else 1024)

def validated_labels(dataset, evidence=None):
    # Legacy editable status strings alone are NOT human approval evidence.
    if evidence is None:
        raise ValueError("PENDING_INDEPENDENT_HUMAN_LABELS_OR_RUBRIC_APPROVAL")
    return approved_labels(dataset, **evidence)

def metrics(relevances):
    relevant = sum(value > 0 for value in relevances)
    values = {f"Precision@{k}": sum(value > 0 for value in relevances[:k]) / k for k in [1, 3, 5]}
    values["Recall@5"] = sum(value > 0 for value in relevances[:5]) / relevant if relevant else 0
    values["MRR"] = next((1 / (index + 1) for index, value in enumerate(relevances) if value > 0), 0)
    dcg = lambda rows: sum((2 ** value - 1) / math.log2(index + 2) for index, value in enumerate(rows[:5]))
    ideal = dcg(sorted(relevances, reverse=True))
    values["NDCG@5"] = dcg(relevances) / ideal if ideal else 0
    return values

def order_key(row, alpha):
    # Match Node's positive-score rounding and unknown-skills-last ordering.
    score = math.floor((alpha * row[2] + (1 - alpha) * row[1]) * 10000 + .5) / 100
    return (not row[4], -score, row[3], row[0])


def evaluate_split(prepared, labels, split, alpha):
    result = []
    for task, scores, _ in prepared:
        if task['split'] != split:
            continue
        order = sorted(scores, key=lambda row: order_key(row, alpha))
        result.append(metrics([labels[(task['id'], row[0])] for row in order]))
    require(bool(result), 'EMPTY_EVALUATION_SPLIT')
    return {key: statistics.mean(row[key] for row in result) for key in result[0]}


def select_alpha_dev_only(prepared, labels):
    development = {alpha: evaluate_split(prepared, labels, 'dev', alpha) for alpha in ALPHA_GRID}
    selected = max(development, key=lambda alpha: (development[alpha]['NDCG@5'], -alpha))
    return selected, development


def quality_report(prepared, labels):
    # No held-out metric is read until selection is over.
    selected, development = select_alpha_dev_only(prepared, labels)
    comparisons = []
    for task, scores, _ in prepared:
        item = {'id':task['id'], 'split':task['split'], 'group':task['group'],
                'candidatePoolIds':sorted(row[0] for row in scores)}
        for name, alpha in [('baseline',0), ('phobertPure',1), ('selected',selected)]:
            order = sorted(scores, key=lambda row: order_key(row, alpha))
            item[name] = metrics([labels[(task['id'], row[0])] for row in order])
            item[name+'Order'] = [row[0] for row in order]
        item['pureDeltas'] = {key:item['phobertPure'][key]-value for key,value in item['baseline'].items()}
        item['selectedDeltas'] = {key:item['selected'][key]-value for key,value in item['baseline'].items()}
        item['zeroRelevant'] = not any(labels[(task['id'], row[0])] > 0 for row in scores)
        comparisons.append(item)
    worse = lambda key: [{'id':row['id'],'split':row['split'],'deltas':row[key]} for row in comparisons
                         if any(value < -1e-12 for value in row[key].values())]
    return {'selectedAlphaDevOnly':selected, 'development':development,
            'heldOutBaseline':evaluate_split(prepared,labels,'test',0),
            'heldOutPhoBertPure':evaluate_split(prepared,labels,'test',1),
            'heldOutSelected':evaluate_split(prepared,labels,'test',selected),
            'queryComparisons':comparisons, 'worseCases':{'pureVsBaseline':worse('pureDeltas'),'selectedVsBaseline':worse('selectedDeltas')},
            'zeroRelevantQueryCount':sum(row['zeroRelevant'] for row in comparisons)}


def read_evidence(args):
    dataset, source_sha = load_json(args.dataset)
    require(all((args.reviewer_a,args.reviewer_b,args.approval)), 'PENDING_INDEPENDENT_HUMAN_LABELS_OR_RUBRIC_APPROVAL')
    a,a_sha = load_json(args.reviewer_a); b,b_sha = load_json(args.reviewer_b)
    approval,approval_sha = load_json(args.approval)
    protocol,protocol_sha = load_json(PROTOCOL_PATH)
    # A changed protocol requires a reviewed evaluator, not silently different metrics.
    require(protocol.get('version') == 1 and protocol.get('selection') == SUPPORTED_SELECTION
            and protocol.get('metrics') == SUPPORTED_METRICS, 'UNSUPPORTED_PROTOCOL')
    labels = validated_labels(dataset, dict(source_sha=source_sha,a=a,a_sha=a_sha,b=b,b_sha=b_sha,
                                          approval=approval,protocol_sha=protocol_sha))
    return dataset, labels, {'datasetSha256':source_sha,'reviewerASha256':a_sha,'reviewerBSha256':b_sha,
                             'approvalSha256':approval_sha,'protocolSha256':protocol_sha,'protocol':protocol}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=Path(__file__).with_name("f4-pilot.json"))
    parser.add_argument('--reviewer-a', type=Path)
    parser.add_argument('--reviewer-b', type=Path)
    parser.add_argument('--approval', type=Path)
    parser.add_argument('--check-only', action='store_true')
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    dataset, labels, provenance = read_evidence(args)  # BEFORE model, RAM gate or metrics.
    if args.check_only:
        print(json.dumps({'status':'EVIDENCE_VALIDATED_NOT_A_BENCHMARK','pairs':len(labels),'provenance':provenance}))
        return
    require(args.output is not None and not args.output.exists(), 'NEW_EXCLUSIVE_OUTPUT_PATH_REQUIRED')
    require(bool(os.environ.get('F4_MODEL_DIR')) and bool(os.environ.get('F4_SEGMENTER_DIR')), 'MISSING_OFFLINE_MODEL_DIRECTORIES')
    from scripts.prepare_f4 import resources
    resource_report = resources(Path(os.environ.get('F4_MODEL_DIR', '.')))
    require(resource_report['ready'], 'RESOURCE_BUDGET_NOT_MET')
    start = time.perf_counter(); encoder = PhoBertEncoder(); load_ms = 1000 * (time.perf_counter() - start)
    prepared, baseline_latencies = [], []
    for task in dataset["tasks"]:
        start = time.perf_counter()
        exact_rows = []
        for candidate in task["candidates"]:
            exact = sum(normalize(skill).lower() in {normalize(own).lower() for own in candidate["skills"]} for skill in task["requiredSkills"]) / len(task["requiredSkills"])
            exact_rows.append((candidate["id"], exact, candidate["workload"], bool(candidate["skills"])))
        sorted([(id,exact,0,load,enough) for id,exact,load,enough in exact_rows], key=lambda row:order_key(row,0))
        baseline_latencies.append(1000 * (time.perf_counter() - start))
        start = time.perf_counter()
        semantic_rows = semantic_rank(task["requiredSkills"], task["description"], task["candidates"], encoder)
        semantic = {item['id']:item['semanticScore'] for item in semantic_rows}
        require(len(semantic_rows) == len(semantic) and set(semantic) == {row[0] for row in exact_rows}, 'CANDIDATE_POOL_CHANGED')
        require(all(type(value) in (int,float) and math.isfinite(value) and 0<=value<=1 for value in semantic.values()), 'INVALID_SEMANTIC_SCORE')
        scores = [(id, exact, semantic[id], load, enough) for id, exact, load, enough in exact_rows]
        prepared.append((task, scores, 1000 * (time.perf_counter() - start)))
    latencies = sorted(row[2] for row in prepared)
    report = {"scope": "approved exploratory synthetic pilot; not production accuracy or F1", **quality_report(prepared, labels),
              "modelLoadMs": load_ms, "semanticCoreP50Ms": statistics.median(latencies), "semanticCoreP95Ms": latencies[max(0, math.ceil(len(latencies)*.95)-1)],
              "baselineCoreP50Ms": statistics.median(baseline_latencies), "baselineCoreP95Ms": sorted(baseline_latencies)[max(0, math.ceil(len(baseline_latencies)*.95)-1)],
              "latencyScope": "Algorithm core only, not Web/API end-to-end; process peak includes loaded model and JVM",
              'firstSemanticQueryMs':prepared[0][2], 'perQueryLatencyMs':[{'id':task['id'],'baselineCore':base,'semanticCore':latency} for (task,_,latency),base in zip(prepared,baseline_latencies)],
              "provenance": {**provenance,"utc": datetime.now(timezone.utc).isoformat(), "python": platform.python_version(), "os": platform.platform(), "device": "CPU", "torchThreads": 2, 'logicalCpuCount':os.cpu_count(), 'resourcesBeforeLoad':resource_report,
                'versions':{name:importlib.metadata.version(name) for name in ['torch','transformers','numpy','py-vncorenlp','pyjnius']},
                "model": MODEL, "modelRevision": REVISION, "segmenterRevision": SEGMENTER_REVISION,
                "sourceSha256": {str(path.name): hashlib.sha256(path.read_bytes()).hexdigest() for path in [Path(__file__), Path(__file__).with_name('f4_review_validation.py'), Path(__file__).resolve().parents[1] / "app/f4_encoder.py"]}},
              "peakRssBytes": peak_rss_bytes(), 'memoryScope':'Whole process including embedded JVM and loaded model; not standalone baseline memory',
              "nQueries": len(prepared), "F1": "NOT_MEASURED"}
    with args.output.open("x", encoding="utf-8") as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2))

if __name__ == "__main__": main()
