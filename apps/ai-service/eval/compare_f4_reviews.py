"""Coordinator-only comparison; never resolves disagreement or approves labels."""
import argparse
import json
from pathlib import Path
from f4_review_validation import load_json, compare_reviews, PROTOCOL_PATH


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dataset', type=Path, default=Path(__file__).with_name('f4-pilot.json'))
    parser.add_argument('--reviewer-a', type=Path, required=True)
    parser.add_argument('--reviewer-b', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.output.exists():
        raise FileExistsError('Retain earlier comparison; choose a new output')
    dataset,source_sha = load_json(args.dataset)
    a,a_sha = load_json(args.reviewer_a); b,b_sha = load_json(args.reviewer_b)
    _,protocol_sha = load_json(PROTOCOL_PATH)
    result = compare_reviews(dataset,source_sha,a,b,protocol_sha)
    result.update(sourceDatasetSha256=source_sha, protocolSha256=protocol_sha,
                  reviewerASha256=a_sha, reviewerBSha256=b_sha, approvalStatus='PENDING_HUMAN_APPROVAL')
    with args.output.open('x',encoding='utf-8') as handle:
        json.dump(result,handle,ensure_ascii=False,indent=2)
    print(json.dumps({'pairs':result['pairs'],'agreements':result['agreements'],
                      'incomplete':len(result['incompletePairs']),'disagreements':len(result['disagreements']),
                      'readyForHumanApproval':result['readyForHumanApproval']}))


if __name__ == '__main__':
    main()
