# Project Intake

## Current state

- The remote repository baseline contains only an initial README; current implementation is local on `codex/aivoice-fullstack` and is not yet committed or pushed.
- The local repository contains both the verified Python voice-cloning technical spike and the implemented TypeScript backend.
- Real Aliyun Voice Enrollment + CosyVoice 3.5 Flash produced playable output.
- NestJS business API, PostgreSQL/Drizzle schema and Node Worker exist and pass the project-local backend gates. The native mini-program delivery is still pending external ZIP integration.
- Printersheet has reusable native mini-program, code2Session, WeChat Pay v3, order and test patterns.
- Printersheet production gaps prevent whole-file copying: custom tokens lack expiry, CloudBase balance updates are not transactional, legacy unauthenticated routes remain, and runtime config points to a LAN URL.

## Chosen boundaries

- Frontend: native WeChat mini-program, TypeScript, WXML/WXSS.
- API: Node.js 20, NestJS, TypeScript.
- Database: PostgreSQL + Drizzle ORM.
- Worker: separate Node.js process using a custom PostgreSQL lease/heartbeat job loop.
- Media: private media service using local filesystem storage for the single-host MVP; an OSS-compatible adapter is a later deployment option, not current implementation.
- Voice: Provider interface; Aliyun CosyVoice 3.5 Flash is default, local Chatterbox remains a comparison tool.

## Migration rule

Copy only allowlisted login/payment/request patterns. Rewrite product-specific plans, points, CloudBase persistence, UI branding, job pump and legacy routes.
