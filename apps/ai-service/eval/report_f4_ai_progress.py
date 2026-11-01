"""Offline progress export. Never sends, repairs, approves or completes labels."""
import argparse
from collections import Counter
from datetime import datetime,timezone
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from f4_gemini_judge import confirmation,read_jobs,inspect_checkpoint,journal
from f4_review_validation import require


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--run',type=Path,required=True)
    parser.add_argument('--confirmation',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();require(not args.output.exists(),'NEW_EXCLUSIVE_OUTPUT_DIRECTORY_REQUIRED')
    dataset,source_sha,protocol_sha,jobs=read_jobs(Path(__file__).with_name('f4-pilot.json'),args.run)
    rows,judge,measurements,pending=inspect_checkpoint(args.run,jobs,confirmation(args.confirmation))
    events=journal(args.run);new_requests=[event for event in events if event['kind']=='started' and event.get('structured') is True]
    failed=[event for event in events if event['kind']=='failed']
    configs=[event for event in failed if event.get('failure',{}).get('httpStatus')==400]
    require(judge is not None,'NO_VALIDATED_AI_LABELS')
    args.output.mkdir(parents=True)
    partial={'version':1,'labelSource':'AI_GENERATED','status':'INCOMPLETE','datasetSha256':source_sha,
        'protocolSha256':protocol_sha,'judge':judge,'generatedAt':datetime.now(timezone.utc).isoformat(),'rows':rows}
    path=args.output/'ai-generated-labels.partial.json'
    with path.open('x',encoding='utf-8') as handle:json.dump(partial,handle,ensure_ascii=False,indent=2)
    summary={'status':'PARTIAL_NOT_BENCHMARK_EVIDENCE','labelSource':'AI_GENERATED','validatedPairs':len(rows),
        'totalPairs':len(jobs),'remainingPairs':len(jobs)-len(rows),'judge':judge,
        'relevanceCounts':dict(Counter(row['decision']['relevance'] for row in rows)),
        'uncertainPairs':[{'taskId':row['taskId'],'candidateId':row['candidateId'],
            'reason':row['decision']['uncertaintyReason']} for row in rows if row['decision']['uncertain']],
        'unfinishedRequests':pending,'validatedRequestCount':len(measurements),
        'structuredRequestCount':len(new_requests),'jsonRetryCount':sum(bool(event.get('retryOf')) for event in new_requests),
        'configurationRejectedRequestCount':len(configs),'configurationResubmissions':max(0,len(configs)-1),
        'failedRequests':failed,
        'validatedRequestHttpWallMs':sum(item['wallMs'] for item in measurements),
        'latencyScope':'Accepted HTTP requests only; excludes failed requests, metadata probes and deliberate pacing.',
        'partialLabelsSha256':hashlib.sha256(path.read_bytes()).hexdigest(),
        'qualityMetrics':'NOT_COMPUTED; incomplete labels and no new real-PhoBERT ranking run'}
    with (args.output/'summary.json').open('x',encoding='utf-8') as handle:json.dump(summary,handle,ensure_ascii=False,indent=2)
    print(json.dumps({key:summary[key] for key in ('status','validatedPairs','remainingPairs','validatedRequestCount')}))


if __name__=='__main__':main()
