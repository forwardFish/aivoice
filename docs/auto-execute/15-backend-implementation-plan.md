# Backend Implementation Plan

- Scaffold NestJS API, Worker, Drizzle/PostgreSQL and shared contracts.
- Port printersheet code2Session and Pay v3 logic into typed modules.
- Replace custom token with expiring hashed sessions.
- Replace plans/points with fixed product and trial/paid quota ledger.
- Replace CloudBase/in-process job pump with PostgreSQL transactions and pg-boss leases.
- Wrap existing Aliyun provider behind product VoiceProvider and private media service.
- Add integration, concurrency, crypto, ownership and full-flow tests before integration claim.
