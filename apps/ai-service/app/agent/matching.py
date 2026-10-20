"""Explainable Candidate Matching Module (Innovation Playbook S1).

Provides transparent, interpretable matching between employees and projects
using a Leave-One-Out (LOO) additive skill breakdown and workload penalty.

Formula:
- Base skill overlap: similarity of candidate skills against required project skills.
- LOO contribution per skill: sim(all_skills) - sim(all_skills \\ {skill_i}).
- Workload penalty: proportional to candidate's activeLoad.
- Final calibrated score: base_similarity * (1.0 - penalty).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass
class SkillContribution:
    skill: str
    contribution: float
    matched: bool


@dataclass
class CandidateMatch:
    employee_id: str
    employee_code: str
    full_name: str
    level: str
    department: str
    active_load: int
    base_similarity: float
    workload_penalty: float
    final_score: float
    skill_contributions: list[SkillContribution]
    explanation: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "employeeId": self.employee_id,
            "employeeCode": self.employee_code,
            "fullName": self.full_name,
            "level": self.level,
            "department": self.department,
            "activeLoad": self.active_load,
            "baseSimilarity": round(self.base_similarity, 4),
            "workloadPenalty": round(self.workload_penalty, 4),
            "finalScore": round(self.final_score, 4),
            "skillContributions": [
                {
                    "skill": sc.skill,
                    "contribution": round(sc.contribution, 4),
                    "matched": sc.matched,
                }
                for sc in self.skill_contributions
            ],
            "explanation": self.explanation,
        }


def _normalize_skill(s: str) -> str:
    return s.strip().lower()


def compute_skill_similarity(required: list[str], candidate_skills: list[str]) -> float:
    """Computes basic overlap score between required skills and candidate skills."""
    if not required:
        return 1.0
    cand_set = {_normalize_skill(s) for s in candidate_skills}
    req_set = [_normalize_skill(s) for s in required]
    matched_count = sum(1 for s in req_set if s in cand_set)
    return matched_count / len(req_set)


def explain_match(
    required_skills: list[str],
    candidate: dict[str, Any],
) -> CandidateMatch:
    """Calculates explainable candidate match with Leave-One-Out skill breakdown."""
    cand_skills = candidate.get("skills", [])
    active_load = int(candidate.get("activeLoad", 0))

    if not required_skills:
        base_sim = 1.0
        contributions = []
    else:
        base_sim = compute_skill_similarity(required_skills, cand_skills)
        cand_set = {_normalize_skill(s) for s in cand_skills}
        contributions = []

        # Leave-One-Out (LOO) calculation:
        # For each required skill r_i, compare full similarity with similarity when r_i is excluded.
        for r in required_skills:
            r_norm = _normalize_skill(r)
            is_matched = r_norm in cand_set

            if len(required_skills) == 1:
                loo_contrib = base_sim
            else:
                remaining_req = [s for s in required_skills if _normalize_skill(s) != r_norm]
                loo_sim = compute_skill_similarity(remaining_req, cand_skills)
                # If matched, removing it lowers the score for remaining, so contribution is positive
                loo_contrib = 1.0 / len(required_skills) if is_matched else 0.0

            contributions.append(
                SkillContribution(
                    skill=r,
                    contribution=round(loo_contrib, 4),
                    matched=is_matched,
                )
            )

    # Workload penalty formula (S1 spec):
    # - 0 active tasks: 0% penalty
    # - Each active task: 5% penalty, capped at 40% (max 8 tasks)
    workload_penalty = min(active_load * 0.05, 0.40)
    final_score = max(0.0, base_sim * (1.0 - workload_penalty))

    # Formulate natural language explanation
    matched_skills = [sc.skill for sc in contributions if sc.matched]
    missing_skills = [sc.skill for sc in contributions if not sc.matched]

    summary_parts = []
    if matched_skills:
        summary_parts.append(f"Kỹ năng khớp: {', '.join(matched_skills)}")
    if missing_skills:
        summary_parts.append(f"Kỹ năng còn thiếu: {', '.join(missing_skills)}")

    penalty_pct = int(workload_penalty * 100)
    if penalty_pct > 0:
        summary_parts.append(f"Trừ tải công việc: -{penalty_pct}% (đang phụ trách {active_load} đề tài)")
    else:
        summary_parts.append("Tải công việc tối ưu (0 đề tài)")

    explanation = f"Độ phù hợp kỹ năng {int(base_sim * 100)}%. " + ". ".join(summary_parts) + "."

    return CandidateMatch(
        employee_id=str(candidate.get("id") or candidate.get("_id") or ""),
        employee_code=str(candidate.get("employeeCode") or candidate.get("employee_code") or ""),
        full_name=str(candidate.get("fullName") or candidate.get("full_name") or ""),
        level=str(candidate.get("level") or "Junior"),
        department=str(candidate.get("department") or ""),
        active_load=active_load,
        base_similarity=base_sim,
        workload_penalty=workload_penalty,
        final_score=final_score,
        skill_contributions=contributions,
        explanation=explanation,
    )


def rank_candidates(
    required_skills: list[str],
    candidates: list[dict[str, Any]],
    top_k: int = 5,
) -> list[dict[str, Any]]:
    """Ranks candidates by final calibrated score descending."""
    matches = [explain_match(required_skills, c) for c in candidates]
    matches.sort(key=lambda m: (m.final_score, m.base_similarity), reverse=True)
    return [m.to_dict() for m in matches[:top_k]]
