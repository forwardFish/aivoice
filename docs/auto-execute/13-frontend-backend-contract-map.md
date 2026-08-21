# Frontend / Backend Contract Map

| Surface | Frontend action | Backend | Auth | Required states |
|---|---|---|---|---|
| Login | `wx.login` then profile submit | `POST /v1/auth/wechat` | no | idle/loading/error/success |
| Home | page show refresh | `GET /v1/home` | yes | empty/recent/error |
| Video | choose + metadata | `POST /v1/voices`, upload policy/media | yes | validation/upload progress/error |
| Clip | save start/end | `PUT /v1/voices/:id/clip` | yes | invalid/valid/saved |
| Permission | dynamic confirmation | profile + consent endpoints | yes | three permission variants/error |
| Progress | poll/recover | `POST process`, `GET voice` | yes | queued/processing/ready/failed |
| Preview | play to end/accept/retry | preview/accept/retry | yes | disabled/playing/finished/error |
| Workbench | send chat/exact speech | messages/exact-speech/message status | yes + idempotency | draft/processing/ready/failed/blocked |
| Purchase | submit after zero quota | `POST /v1/orders` + `wx.requestPayment` + refresh | yes | modal/paying/pending/paid/cancelled |
| My voices | filter and recover | `GET /v1/voices` | yes | empty/status cards/error |
| Account/settings | orders/delete | orders, quota-ledgers, deletes | yes | confirmation/progress/error/success |
