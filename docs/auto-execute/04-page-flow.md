# Page Flow

```text
Home
 -> select video
 -> select 10-30s clip
 -> name + permission type + dynamic confirmation
 -> upload/process progress
 -> fixed preview (must finish playback)
 -> accept or retry
 -> account uses its registration-granted 5-point balance
 -> workbench chat / exact speech
 -> each successful result consumes 1 point; failures consume 0
 -> result plays normally when points become 0 without popup
 -> next generate attempt returns POINTS_EXHAUSTED
 -> ¥9.9 / 50 points purchase modal
 -> wx.requestPayment
 -> server-confirmed order refresh
 -> draft remains and generation can continue
```

Home shows only create entry and recent ready voices. Processing/failed/draft states live under My Voices.
