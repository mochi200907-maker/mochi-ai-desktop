---
name: Responsive face layout
description: Landscape-safe sizing rules for the browser and Expo robot-face canvases.
---

The robot face is drawn in a fixed logical coordinate system and uniformly scaled against the available viewport width and height. Viewport dimensions must come from the actual visual/root viewport, with safe-area-aware overlays and video controls.

**Why:** Phone landscape screens are much shorter than portrait screens; drawing the portrait-sized face directly at viewport center crops eyes, accessories, or controls.

**How to apply:** Preserve the logical face coordinate system when adding expressions, and apply responsive scaling at the render boundary. Size landscape video overlays from both viewport width and available dynamic height.