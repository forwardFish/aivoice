# Verification Results

- Focused stable suite: PASS.
- Worker: 225 passed, 2 pre-existing integration skips.
- API: 50 passed, 2 pre-existing integration skips.
- Mini-program: 91 passed.
- CloudBase runtime: 4 passed.
- Workspace typecheck: PASS.
- Workspace build: PASS.
- Live provider: OFF, SAFE_ONLY, and BOUNDED_ALL each exactly 5/5 successful.
- Real-dialogue OFF: exactly 10/10 successful with ten distinct stored reply texts; one identity fingerprint and registered voice hash; zero instruction or acoustic overrides.
- Real-dialogue OFF acoustic check: median pitch 96.4–103.9 Hz across ten samples.
- Secret guard: PASS.
- Report integrity: PASS.
- Contract verifier: PASS.
- Live five-turn E2E: PASS.
- Auto-execute final gate: PASS_WITH_LIMITATION, acceptance confidence 0.75.
- Manual owner listening: pending.
