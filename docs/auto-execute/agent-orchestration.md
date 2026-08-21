# Agent Orchestration

Harness mode: `serial-fallback` because this Codex App session is outside tmux and the required external frontend worker is not a native subagent runtime.

Actual collaboration:

- Codex `/root`: contracts, backend, database, worker, migration, integration, tests and final gate.
- External ChatGPT Pro: native mini-program frontend only, delivered as ZIP through the user-specified conversation.

The final report will not claim `MULTI_AGENT_EXECUTED` under the harness unless supported by its allowed orchestration evidence. External frontend delivery will be recorded separately with prompt, timestamp, ZIP hash and integration review.
