---
name: ESP32-S3 watchdog debugging
description: Durable guidance for diagnosing startup watchdog resets in the robot firmware.
---

For ESP32-S3 firmware, startup watchdog resets are easiest to isolate with serial markers around each hardware subsystem. BLE callbacks should only copy incoming commands; motor, servo, NeoPixel, and serial work belongs on the main loop.

**Why:** Bluetooth callbacks run on a separate system task, and hardware/library calls or longer allocations there can starve system work and make a `TG1WDT_SYS_RST` difficult to distinguish from a startup failure.

**How to apply:** Keep the main loop yielding regularly, upload with USB CDC enabled, and use the last `[BOOT]` marker printed before reset to identify the failing initialization stage.

On ESP32-S3 modules, GPIO26–32 are commonly connected to the internal flash interface; do not use them for external motor or servo signals unless the exact board/module datasheet confirms they are available.

**Why:** Driving a flash-connected GPIO during startup can corrupt instruction/data access and present as a system watchdog reset before later setup markers appear.

**How to apply:** Prefer GPIOs confirmed by the board pinout, move the motor-driver B2 signal off GPIO27, and verify the physical wiring matches the firmware constants before flashing.

Explicit look commands and autonomous look phases intentionally stop the motors and hold the head target for 20 seconds before exploration resumes.

**Why:** A look action should be visually readable instead of immediately blending into the next random movement.

**How to apply:** Route `LOOK_UP`, `LOOK_DOWN`, and `LOOK_CENTER` through the non-blocking hold state; keep the loop running so BLE and watchdog servicing continue.