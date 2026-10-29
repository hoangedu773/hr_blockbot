# SPEC-05: Formbricks In-App Survey Popover & Attribute Evaluation Engine

**Artifact Analyzed**: `@formbricks/js@5.1.0` (`dist/types/formbricks.d.ts`, `dist/index.js`)  
**Target Platform**: Browser In-App Survey Widget / Segment Evaluation / Dynamic Popover  
**Analysis Mode**: Clean-Room Specification (Evidence-driven)

---

## 1. Evidence Ledger (ID References)

- **E5.1**: Package npm entry: `@formbricks/js@5.1.0` exporting `formbricks` singleton.
- **E5.2**: Event Payloads: `TFormbricksEventPayloads` (`formbricks_survey_shown`, `formbricks_response_submitted`, `formbricks_survey_closed`, `formbricks_action_tracked`).
- **E5.3**: State Sync: `POST /api/v1/client/{environmentId}/website/sync` returning active surveys, triggers, and audience segment filters.
- **E5.4**: Response Submission: `POST /api/v1/client/{environmentId}/responses` with question answer map and embedded data.

---

## 2. Popover Trigger & Attribute Evaluation Architecture

```mermaid
flowchart TD
    UserEvent[User Action: track() or route change] --> TriggerMatcher[Trigger Matching Engine]
    TriggerMatcher -->|Matches Action or URL| SegmentEval{Audience Segment Evaluation}
    SegmentEval -->|Check User Attributes| AttrRule[Evaluate Attribute Filter Rules]
    AttrRule -->|AND/OR Group Match| FrequencyCheck{Frequency & Recontact Gate}
    FrequencyCheck -->|Cooldown Passed & Not Reached Limit| MountPopover[Inject Popover DOM]
    FrequencyCheck -->|Blocked by Cooldown/Limit| Drop[Ignore / Suppress]
    MountPopover --> EmitShown[Emit formbricks_survey_shown]
    EmitShown --> UserAnswers[User Submits Answers]
    UserAnswers --> EmitSubmitted[Emit formbricks_response_submitted]
```

---

## 3. Attribute Filter Engine Specification

Surveys contain audience segment definition `segment.filters`:
```typescript
type AttributeOperator =
  | 'equals'
  | 'notEquals'
  | 'contains'
  | 'doesNotContain'
  | 'isSet'
  | 'isNotSet'
  | 'greaterThan'
  | 'lessThan'
  | 'greaterEqual'
  | 'lessEqual';

interface FilterRule {
  root: {
    type: 'attribute';
    attributeKey: string;
    operator: AttributeOperator;
    value: string | number;
  };
}

interface SegmentFilterGroup {
  connector: 'and' | 'or';
  rules: (FilterRule | SegmentFilterGroup)[];
}
```

### Evaluation Logic:
```typescript
function evaluateRule(attrValue: any, op: AttributeOperator, targetValue: any): boolean {
  if (op === 'isSet') return attrValue !== undefined && attrValue !== null && attrValue !== '';
  if (op === 'isNotSet') return attrValue === undefined || attrValue === null || attrValue === '';
  if (attrValue === undefined || attrValue === null) return false;
  
  switch (op) {
    case 'equals': return String(attrValue) === String(targetValue);
    case 'notEquals': return String(attrValue) !== String(targetValue);
    case 'contains': return String(attrValue).toLowerCase().includes(String(targetValue).toLowerCase());
    case 'doesNotContain': return !String(attrValue).toLowerCase().includes(String(targetValue).toLowerCase());
    case 'greaterThan': return Number(attrValue) > Number(targetValue);
    case 'lessThan': return Number(attrValue) < Number(targetValue);
    case 'greaterEqual': return Number(attrValue) >= Number(targetValue);
    case 'lessEqual': return Number(attrValue) <= Number(targetValue);
  }
}
```

---

## 4. Popover Presentation & DOM Constraints

1. **Placement Matrix**:
   `bottomRight`, `bottomLeft`, `topRight`, `topLeft`, `center`.
   Fixed positioning container with `z-index: 2147483640` avoiding collision with standard live chat triggers (`2147483645`).
2. **CSP Nonce Support**:
   `formbricks.setNonce(nonce)` injects explicit nonce into all runtime style tags, allowing strictly compliant Enterprise CSP deployments without `unsafe-inline`.
3. **Optimistic Multi-Step Saving**:
   When answering multi-question surveys, partial answers are saved on each step transition via `responseId`. If user abandons halfway, responses up to step $N$ are retained as `finished: false`.

---

## 5. Residual Unknowns (§8)

1. Server-side anomaly detection heuristics on IP rate-limiting for spam responses.
2. Exact telemetry ping batch interval when multiple tracking actions fire in rapid succession (< 50ms).
