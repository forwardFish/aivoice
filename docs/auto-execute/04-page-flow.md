# Page Flow

```text
Home
 -> select video
 -> select 10-30s clip
 -> name + permission type + dynamic confirmation
 -> upload/process progress
 -> fixed preview (must finish playback)
 -> accept or retry
 -> one free custom generation if account eligible
 -> workbench chat / exact speech
 -> result plays normally; quota becomes 0 without popup
 -> next generate attempt returns QUOTA_EXHAUSTED
 -> ¥9.9 / 10 purchase modal
 -> wx.requestPayment
 -> server-confirmed order refresh
 -> draft remains and generation can continue
```

Home shows only create entry and recent ready voices. Processing/failed/draft states live under My Voices.
