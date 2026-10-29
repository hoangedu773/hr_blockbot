---
title: "Phase 09: Audio removed by user decision"
status: todo
---

# Phase 09 — Removed scope record

On 2026-10-22 the user explicitly requested removal of audio. This phase is a historical numbering slot, not a deferred feature, executable implementation phase or release dependency.

## Excluded
Vapi, Gemini Live, microphone capture, voice calls, speech recognition, speech synthesis, audio recording/transcription, audio session/token endpoints and audio-specific dependencies or billing are outside this roadmap. Do not install or implement them. Text model providers remain in scope for existing policy chat; this decision does not remove text chat, citations, tool-status indicators or explicit UI confirmation.

## Execution and acceptance
No product tasks or audio acceptance tests remain. P10 depends directly on P08. The former P09 runtime task must be removed rather than marked implemented. Original SPEC-02 remains a historical research input outside the active eight-source scope; do not delete prior research artifacts.

Reintroducing audio requires a new explicit user request and separate scope/privacy/budget review. No automatic implementation, commit, push or deployment.
