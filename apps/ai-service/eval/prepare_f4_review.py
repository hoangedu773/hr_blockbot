"""Export two unlabelled, blinded human review packets; never approve/score data."""
import argparse
import hashlib
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from f4_review_validation import validate_pilot, load_json, PROTOCOL_PATH, approval_template


def review_packet(dataset, dataset_sha256, slot):
    tasks = []
    for task in dataset["tasks"]:
        candidates = [{"id": row["id"], "skills": row["skills"], "relevance": None,
                       "reason": "", "independentHumanAttestation": False}
                      for row in task["candidates"]]
        # Hide original ordering, load, split/scenario and all model/baseline scores.
        candidates.sort(key=lambda row: hashlib.sha256(row["id"].encode()).hexdigest())
        tasks.append({"id": task["id"], "title": task["title"], "description": task["description"],
                      "requiredSkills": task["requiredSkills"], "candidates": candidates})
    tasks.sort(key=lambda row: hashlib.sha256(row["id"].encode()).hexdigest())
    return {"version": 1, "synthetic": True, "sourceDatasetSha256": dataset_sha256,
            "reviewerSlot": slot, "reviewer": "", "completedAt": None,
            "rubricStatus": dataset["rubricStatus"], "proposedRubric": dataset["rubric"],
            "warning": "PENDING HUMAN REVIEW. Do not consult model scores or the other reviewer. Null is not a zero label.",
            "tasks": tasks}


def export_packets(dataset_path, destination):
    raw = dataset_path.read_bytes()
    dataset = json.loads(raw)
    if dataset.get("synthetic") is not True:
        raise ValueError("Only the synthetic F4 pilot may be exported")
    if len(dataset["tasks"]) != 20 or any(len(task["candidates"]) != 10 for task in dataset["tasks"]):
        raise ValueError("The approved 20 by 10 pilot must be retained")
    targets = [destination / f"reviewer-{slot}.json" for slot in ("A", "B")]
    if any(path.exists() for path in targets):
        raise FileExistsError("Existing reviewer work retained; choose a new destination")
    destination.mkdir(parents=True, exist_ok=True)
    digest = hashlib.sha256(raw).hexdigest()
    for slot, path in zip(("A", "B"), targets):
        with path.open("x", encoding="utf-8") as handle:
            json.dump(review_packet(dataset, digest, slot), handle, ensure_ascii=False, indent=2)
    return targets


def export_bundle(dataset_path, destination):
    dataset, source_sha = load_json(dataset_path)
    validate_pilot(dataset)
    protocol, protocol_sha = load_json(PROTOCOL_PATH)
    names = ['reviewer-A.json','reviewer-B.json','reviewer-A.html','reviewer-B.html',
             'approval.pending.json','protocol.proposed.json']
    if any((destination/name).exists() for name in names):
        raise FileExistsError('Existing review work retained; choose a new destination')
    template = Path(__file__).with_name('review_form.html').read_text(encoding='utf-8')
    destination.mkdir(parents=True,exist_ok=True)
    for slot in ('A','B'):
        packet = review_packet(dataset,source_sha,slot)
        packet['proposedProtocolSha256'] = protocol_sha
        raw = json.dumps(packet,ensure_ascii=False,indent=2)
        with (destination/f'reviewer-{slot}.json').open('x',encoding='utf-8') as handle:
            handle.write(raw)
        # Data is inert JSON, never executable HTML; escape script closing tags.
        page = template.replace('__PACKET_JSON__',raw.replace('<','\\u003c')).replace(
            '__PROTOCOL_JSON__',json.dumps(protocol,ensure_ascii=False).replace('<','\\u003c'))
        with (destination/f'reviewer-{slot}.html').open('x',encoding='utf-8') as handle:
            handle.write(page)
    with (destination/'protocol.proposed.json').open('xb') as handle:
        handle.write(PROTOCOL_PATH.read_bytes())
    with (destination/'approval.pending.json').open('x',encoding='utf-8') as handle:
        json.dump(approval_template(source_sha,protocol_sha),handle,ensure_ascii=False,indent=2)
    return [destination/name for name in names]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=Path(__file__).with_name("f4-pilot.json"))
    parser.add_argument("--destination", type=Path, required=True)
    parser.add_argument('--with-ui',action='store_true',help='Export offline forms + pending approval template; never label or approve')
    args = parser.parse_args()
    for path in (export_bundle if args.with_ui else export_packets)(args.dataset, args.destination):
        print(path)


if __name__ == "__main__":
    main()
