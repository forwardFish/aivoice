# Total Task

将 `VoiceDeliveryPlan` 从自由表演提示输入改造成确定性的 identity-stable 编译管线：

`VoiceDeliveryPlan -> BoundedEmotionOverlay -> StableVoiceSynthesisPlan -> strict CosyVoice request -> pinned route`

## Linked controls

- Requirements: `01-requirements-summary.md`
- Decomposition: `02-task-decomposition.md`
- Architecture: `03-architecture-plan.md`
- Acceptance: `07-acceptance-checklist.md`
- Tests: `08-test-matrix.md`
- Orchestration: `agent-orchestration.json`
- State/Handoff: `state.json`, `HANDOFF.md`
- Final report: `11-final-acceptance-report.md`
