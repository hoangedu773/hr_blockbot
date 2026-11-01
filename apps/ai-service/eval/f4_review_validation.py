"""Offline evidence checks. Hashes bind files, not proof of a person's identity."""
from datetime import datetime
import hashlib
import json
from pathlib import Path

PROTOCOL_PATH = Path(__file__).with_name('f4-evaluation-protocol.proposed.json')


def sha256(raw):
    return hashlib.sha256(raw).hexdigest()


def load_json(path):
    raw = Path(path).read_bytes()
    # Duplicate JSON keys must not shadow a label/approval or source field.
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('DUPLICATE_JSON_KEY')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique), sha256(raw)


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def nonblank(value):
    return type(value) is str and bool(value.strip())


def aware_time(value):
    require(nonblank(value), 'MISSING_HUMAN_TIMESTAMP')
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        raise ValueError('INVALID_HUMAN_TIMESTAMP') from None
    require(parsed.tzinfo is not None and parsed.utcoffset() is not None, 'TIMESTAMP_REQUIRES_TIMEZONE')
    return parsed


def validate_pilot(dataset):
    require(dataset.get('synthetic') is True and len(dataset.get('tasks', [])) == 20, 'EXPECTED_SYNTHETIC_20_TASKS')
    tasks, pairs, groups, global_candidates = {}, {}, {}, set()
    for task in dataset['tasks']:
        tid = task.get('id')
        require(nonblank(tid) and tid not in tasks, 'DUPLICATE_OR_MISSING_TASK_ID')
        require(task.get('split') in ('dev', 'test') and nonblank(task.get('group')), 'INVALID_SPLIT_GROUP')
        require(groups.setdefault(task['group'], task['split']) == task['split'], 'SCENARIO_LEAKAGE')
        require(nonblank(task.get('title')) and nonblank(task.get('description')), 'MISSING_TASK_TEXT')
        required = task.get('requiredSkills')
        require(type(required) is list and 1 <= len(required) <= 30 and all(nonblank(s) for s in required), 'INVALID_REQUIRED_SKILLS')
        require(len(task.get('candidates', [])) == 10, 'EXPECTED_TEN_CANDIDATES')
        tasks[tid] = task
        for candidate in task['candidates']:
            cid = candidate.get('id')
            require(nonblank(cid) and cid not in global_candidates, 'DUPLICATE_OR_MISSING_CANDIDATE_ID')
            global_candidates.add(cid)
            require(type(candidate.get('skills')) is list and all(nonblank(s) for s in candidate['skills']), 'INVALID_SKILL_EVIDENCE')
            require(type(candidate.get('workload')) is int and candidate['workload'] >= 0, 'INVALID_WORKLOAD')
            require(candidate.get('judgments') == [], 'PILOT_SOURCE_MUST_REMAIN_UNLABELLED_USE_PACKETS')
            pairs[(tid, cid)] = candidate
    require({task['split'] for task in tasks.values()} == {'dev', 'test'}, 'BOTH_DEV_TEST_REQUIRED')
    return tasks, pairs


def validate_packet(dataset, source_sha, packet, slot, protocol_sha=None):
    tasks, pairs = validate_pilot(dataset)
    require(packet.get('sourceDatasetSha256') == source_sha and packet.get('reviewerSlot') == slot,
            'SOURCE_HASH_OR_REVIEWER_SLOT_MISMATCH')
    require(packet.get('version') == 1 and packet.get('synthetic') is True, 'INVALID_PACKET_VERSION')
    require(packet.get('proposedRubric') == dataset['rubric'] and packet.get('rubricStatus') == dataset['rubricStatus'], 'PACKET_RUBRIC_CHANGED')
    if protocol_sha is not None:
        require(packet.get('proposedProtocolSha256') == protocol_sha, 'PROTOCOL_HASH_MISMATCH')
    require(type(packet.get('reviewer')) is str and (packet.get('completedAt') is None or type(packet.get('completedAt')) is str), 'INVALID_REVIEWER_METADATA')
    seen_tasks, rows = set(), {}
    for task in packet.get('tasks', []):
        tid = task.get('id')
        require(tid in tasks and tid not in seen_tasks, 'PACKET_TASK_ID_MISMATCH')
        seen_tasks.add(tid)
        require(set(task) == {'id','title','description','requiredSkills','candidates'}, 'PACKET_TASK_FIELDS_CHANGED')
        require(all(task[key] == tasks[tid][key] for key in ('title','description','requiredSkills')), 'TASK_EVIDENCE_CHANGED')
        for row in task.get('candidates', []):
            key = (tid, row.get('id'))
            require(key in pairs and key not in rows, 'PACKET_CANDIDATE_ID_MISMATCH')
            require(set(row) == {'id','skills','relevance','reason','independentHumanAttestation'}, 'PACKET_ROW_FIELDS_CHANGED')
            require(row.get('skills') == pairs[key]['skills'], 'CANDIDATE_EVIDENCE_CHANGED')
            value = row.get('relevance')
            require(value is None or type(value) is int and value in (0,1,2), 'INVALID_RELEVANCE')
            require(type(row.get('reason')) is str and type(row.get('independentHumanAttestation')) is bool, 'INVALID_REASON_OR_ATTESTATION')
            rows[key] = row
    require(seen_tasks == set(tasks) and set(rows) == set(pairs), 'MISSING_OR_EXTRA_REVIEW_PAIRS')
    return rows


def compare_reviews(dataset, source_sha, a, b, protocol_sha=None):
    left = validate_packet(dataset, source_sha, a, 'A', protocol_sha)
    right = validate_packet(dataset, source_sha, b, 'B', protocol_sha)
    if nonblank(a['reviewer']) and nonblank(b['reviewer']):
        require(a['reviewer'].strip().casefold() != b['reviewer'].strip().casefold(), 'REVIEWERS_MUST_BE_DISTINCT')
    disagreements, incomplete, agreements = [], [], 0
    for key in sorted(left):
        x, y = left[key], right[key]
        if x['relevance'] is not None and y['relevance'] is not None and x['relevance'] != y['relevance']:
            disagreements.append({'taskId': key[0], 'candidateId': key[1], 'A': {'relevance':x['relevance'],'reason':x['reason']},
                                  'B': {'relevance':y['relevance'],'reason':y['reason']}})
        if any(row['relevance'] is None or not nonblank(row['reason']) or row['independentHumanAttestation'] is not True for row in (x,y)):
            incomplete.append({'taskId':key[0], 'candidateId':key[1]})
        elif x['relevance'] == y['relevance']:
            agreements += 1
    metadata_complete = all(nonblank(packet['reviewer']) and nonblank(packet['completedAt']) for packet in (a,b))
    if metadata_complete:
        aware_time(a['completedAt']); aware_time(b['completedAt'])
    return {'scope':'annotation comparison only, NOT model quality benchmark', 'pairs':len(left), 'agreements':agreements,
            'incompletePairs':incomplete, 'disagreements':disagreements, 'reviewerMetadataComplete':metadata_complete,
            'readyForHumanApproval':metadata_complete and not incomplete and not disagreements}


def approved_labels(dataset, source_sha, a, a_sha, b, b_sha, approval, protocol_sha):
    require(type(approval) is dict and approval.get('status') == 'APPROVED', 'PENDING_INDEPENDENT_HUMAN_LABELS_OR_RUBRIC_APPROVAL')
    require(type(approval.get('version')) is int and approval['version'] == 1, 'UNSUPPORTED_APPROVAL_VERSION')
    require(approval.get('sourceDatasetSha256') == source_sha and approval.get('protocolSha256') == protocol_sha,
            'APPROVAL_SOURCE_OR_PROTOCOL_HASH_MISMATCH')
    require(approval.get('reviewerASha256') == a_sha and approval.get('reviewerBSha256') == b_sha, 'APPROVAL_REVIEW_FILE_HASH_MISMATCH')
    require(nonblank(approval.get('approvedBy')) and nonblank(approval.get('reference')), 'MISSING_HUMAN_APPROVAL_REFERENCE')
    final_time = aware_time(approval.get('approvedAt'))
    rubric_approval = approval.get('rubricApproval', {})
    require(nonblank(rubric_approval.get('approvedBy')) and nonblank(rubric_approval.get('reference')), 'MISSING_RUBRIC_APPROVAL_REFERENCE')
    rubric_time = aware_time(rubric_approval.get('approvedAt'))
    require(approval.get('rubricApproved') is True and approval.get('labelsApproved') is True and
            approval.get('independentReviewsConfirmed') is True, 'PENDING_HUMAN_CONFIRMATIONS')
    comparison = compare_reviews(dataset, source_sha, a, b, protocol_sha)
    require(comparison['readyForHumanApproval'], 'PENDING_INDEPENDENT_HUMAN_LABELS_OR_DISAGREEMENT')
    require(all(rubric_time <= aware_time(packet['completedAt']) <= final_time for packet in (a,b)), 'APPROVAL_REVIEW_TIMELINE_INVALID')
    return {key: row['relevance'] for key,row in validate_packet(dataset, source_sha, a, 'A', protocol_sha).items()}


def approval_template(source_sha, protocol_sha):
    return {'version':1, 'status':'PENDING', 'sourceDatasetSha256':source_sha, 'protocolSha256':protocol_sha,
            'reviewerASha256':'', 'reviewerBSha256':'', 'approvedBy':'', 'approvedAt':None, 'reference':'',
            'rubricApproval':{'approvedBy':'','approvedAt':None,'reference':''},
            'rubricApproved':False, 'labelsApproved':False, 'independentReviewsConfirmed':False,
            'warning':'Only the authorized human may fill approval. Hashes are file integrity, not identity authentication.'}
