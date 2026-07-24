---
name: TikTok media routing
description: Provider routing rules for TikTok search and playback in Mochi.
---

TikTok requests must use a separate `TIKTOK_QUERY` media intent. Resolve keyword searches or supplied TikTok links through TikWM, then play the returned direct MP4 URL; YouTube `VIDEO_QUERY` remains an iframe flow.

**Why:** TikWM returns playable MP4 paths, not YouTube watch IDs. Sending those URLs through the YouTube iframe produces an invalid player.

**How to apply:** Keep explicit TikTok words, shoti/short-video language, and TikTok creator/topic requests authoritative over `MUSIC_QUERY` or `VIDEO_QUERY`. Carry the provider with the URL into every client player.