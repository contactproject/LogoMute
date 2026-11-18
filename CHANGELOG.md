# Changelog

## 0.10.8
- Reverted activation audio from the spoken voice announcement to the original short synthesized two-tone confirmation chime.
- Deleted the bundled voice recording and removed the voice test button wording.
- Preserved eight-second calibration beeps, detection and mute logic, icons, settings, Apache 2.0 licensing, and ContactProject.org attribution.

## 0.10.7
- Replaced the monitoring-success ding with an offline, bundled synthetic female voice saying “Logo Mute active.”
- The announcement still plays through the extension’s offscreen audio document, separately from the TV tab, only after successful logo recognition (including after re-acquiring a new video layout).
- Retained the eight-second full-screen calibration countdown beeps and all existing detector, mute/unmute, LM icon, and sensitivity behavior.
- Renamed the settings test control to “Test voice confirmation” and updated user instructions accordingly.

## 0.10.6
- Reworded the in-extension Help, user guide and README to state more precisely that LogoMute locally controls the selected Chrome tab’s audio, without skipping, hiding or modifying TV advertisements or broadcasts.
- Added a visible independent-project disclaimer identifying ContactProject.org and disavowing broadcaster/streaming-provider affiliation or endorsement.
- Kept Apache 2.0 license, NOTICE, LM icon color behavior and detection/muting code unchanged.

## 0.10.5
- Released the project under the Apache License, Version 2.0, with copyright and NOTICE attribution to ContactProject.org.
- Replaced the original toolbar and extension icons with LM lettermarks while keeping grey/off, green/monitoring, and red/muted states.
- Clarified that a logo-selection rectangle can be moderately larger than the logo, while avoiding excessive changing video background.
- Preserved existing calibration, full-screen, muting, chime, and per-channel sensitivity logic.

## 0.10.4
- Added beginner Help & Instructions inside the extension and a visible popup Help link.
- Startup on a previously calibrated channel now begins muted while waiting to recognize the saved logo; no need to wait for commercials to end.
- Prevented the initial logo search from aborting merely because a logo remains absent for 45 seconds.
- Preserved the CNN Tolerant default, per-channel sensitivity, full-screen samples, countdown, chime and customizable Watch channels shortcut.
- Added GitHub-ready source documentation and smoke tests.

## 0.10.3
- Started monitoring automatically after saving a full-screen logo and closing the calibration window.
- Set CNN to Tolerant by default without overriding saved per-channel preferences.

## 0.10.2
- Compact popup with numbered calibration actions and audible eight-second full-screen screenshot countdown.

## Earlier experimental builds
- Introduced snapshot-based tab muting, channel profiles, full-screen calibration, status icons, and debugging tools.
