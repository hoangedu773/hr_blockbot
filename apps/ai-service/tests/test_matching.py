"""Unit tests for Innovation S1: Explainable Candidate Matching."""

import pytest

from app.agent.matching import (
    compute_skill_similarity,
    explain_match,
    rank_candidates,
)


def test_compute_skill_similarity_exact_and_partial():
    req = ["React", "TypeScript", "Node.js"]
    assert compute_skill_similarity(req, ["react", "typescript", "nodejs"]) == pytest.approx(2 / 3)
    assert compute_skill_similarity(req, ["React", "TypeScript", "Node.js"]) == 1.0
    assert compute_skill_similarity(req, ["Python"]) == 0.0
    assert compute_skill_similarity([], ["React"]) == 1.0


def test_leave_one_out_skill_breakdown_additive():
    req = ["React", "TypeScript", "Docker"]
    candidate = {
        "id": "emp-1",
        "employeeCode": "GT-001",
        "fullName": "Nguyen Van A",
        "level": "Senior",
        "department": "IT",
        "skills": ["React", "TypeScript"],
        "activeLoad": 1,
    }

    match = explain_match(req, candidate)

    assert match.base_similarity == pytest.approx(2 / 3)
    assert len(match.skill_contributions) == 3

    # React & TypeScript matched -> contribution = 1/3 each
    react_sc = next(sc for sc in match.skill_contributions if sc.skill == "React")
    assert react_sc.matched is True
    assert react_sc.contribution == pytest.approx(1 / 3, abs=1e-3)

    docker_sc = next(sc for sc in match.skill_contributions if sc.skill == "Docker")
    assert docker_sc.matched is False
    assert docker_sc.contribution == 0.0

    # Additive property: sum of contributions = base similarity
    total_contrib = sum(sc.contribution for sc in match.skill_contributions)
    assert total_contrib == pytest.approx(match.base_similarity, abs=1e-3)


def test_workload_penalty_and_final_score():
    req = ["Python", "FastAPI"]
    candidate_busy = {
        "id": "emp-busy",
        "employeeCode": "GT-002",
        "fullName": "Tran Van B",
        "skills": ["Python", "FastAPI"],
        "activeLoad": 2,  # 2 * 5% = 10% penalty
    }

    match = explain_match(req, candidate_busy)
    assert match.base_similarity == 1.0
    assert match.workload_penalty == pytest.approx(0.10)
    assert match.final_score == pytest.approx(0.90)
    assert "Trừ tải công việc: -10%" in match.explanation


def test_rank_candidates_sorting():
    req = ["React", "TypeScript"]
    candidates = [
        {
            "id": "1",
            "fullName": "A (Half skills, free)",
            "skills": ["React"],
            "activeLoad": 0,
        },
        {
            "id": "2",
            "fullName": "B (Full skills, overloaded)",
            "skills": ["React", "TypeScript"],
            "activeLoad": 6,  # 30% penalty -> 0.70 score
        },
        {
            "id": "3",
            "fullName": "C (Full skills, 1 task)",
            "skills": ["React", "TypeScript"],
            "activeLoad": 1,  # 5% penalty -> 0.95 score
        },
    ]

    ranked = rank_candidates(req, candidates, top_k=3)
    assert len(ranked) == 3
    assert ranked[0]["fullName"] == "C (Full skills, 1 task)"
    assert ranked[1]["fullName"] == "B (Full skills, overloaded)"
    assert ranked[2]["fullName"] == "A (Half skills, free)"
