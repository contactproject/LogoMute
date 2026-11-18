# LogoMute

**Keep the News. Mute the Ads.**

LogoMute is an experimental **Google Chrome extension for desktop and laptop computers**. It monitors a user-selected area of a visible TV picture and mutes the Chrome tab when the saved station logo disappears, restoring audio when the logo returns. It does not skip or hide advertisements, modify broadcasts, or control sound outside the Chrome tab. Detection depends on how each broadcaster uses its logo.

**This is not a mobile Chrome extension.** It is intended for desktop/laptop Chrome, particularly a dedicated media computer.

## Features

- Per-channel URL logo samples for both preview and full-screen video.
- **Start monitoring even during a commercial:** LogoMute starts muted until it recognizes the saved logo, then restores sound.
- Large color-changing START/STOP button and **LM** toolbar icon: grey (not ready/off), green (ready/monitoring), red (muted).
- Channel-specific sensitivity, with **CNN initially set to Tolerant** unless explicitly overridden.
- Eight-second audible countdown to full-screen calibration, plus a short confirmation chime after a successful logo lock.
- Built-in, **editable** **Watch channels** shortcut, initially set to https://usnewson.com/watch/.
- Beginner-friendly **Help & Instructions** page accessible from the popup.
- Screenshot analysis and calibrated logo images stay in the local browser extension storage; no video is uploaded to a LogoMute server.

## Installing (no programming knowledge needed)

1. Download the **LogoMute extension ZIP** from a release, and extract it on your computer.
2. In Chrome, open `chrome://extensions`, turn on **Developer mode**, and click **Load unpacked**.
3. Select the extracted LogoMute extension folder.
4. Pin LogoMute via the puzzle-piece menu in Chrome's toolbar.
5. Click **Help & Instructions — Start Here** inside LogoMute to calibrate a TV channel.

The TV directory is already linked using the **Watch channels** button. To change it, open **Settings → Channel directory shortcut**, update the label and URL, then save.

**Updating an existing install:** Extract new extension files over the **same installed folder**, then click **Reload** at `chrome://extensions`. Do not uninstall/reinstall if you wish to preserve local channel calibrations.

Full instructions: [docs/USER-GUIDE.md](docs/USER-GUIDE.md) (the same guide is accessible as `help.html` inside the extension).

## Using it

First save a logo while it is visible in preview mode (**1. Select preview logo**); optionally capture a separate full-screen logo (**2. Capture full-screen logo · 8 sec**). Once calibrated, you can press START at any point, including while commercials are playing. LogoMute begins muted until it verifies the saved logo, and restores sound when it returns. Press STOP to end monitoring and restore sound.

LogoMute monitors one visible TV tab at a time. Switching to a different tab stops monitoring. Full-screen behavior varies across websites and must be tested per player.

**Selecting the logo:** A rectangle may extend a little beyond the visible logo. Leave a modest margin (for example, around 10–20% larger in width and height) without including a large area of moving video. During startup, LogoMute learns which edges remain stable across frames, helping suppress changing background details. This is not infallible; if recognition fails, use a smaller box.

## Technical details

- Chrome Manifest V3 (`minimum_chrome_version`: 116).
- Vanilla JavaScript and HTML; no build step, backend, tracking SDK, account, analytics, or runtime dependencies.
- Core permissions: `activeTab`, `scripting`, `storage`, `offscreen`.
- Screenshots: `chrome.tabs.captureVisibleTab` (visible tab only); muting: `chrome.tabs.update({ muted: true/false })`.
- Local state: `chrome.storage.local` for saved per-channel logos and settings; `chrome.storage.session` for temporary full-screen calibration handoff.
- Offscreen document plays a locally synthesized confirmation chime and calibration countdown beeps, separately from the TV tab.

## GitHub repository contents

The repository root is the Chrome extension itself, so you can install it using **Load unpacked** without compiling or copying subfolders. The `docs/` directory contains user and contributor notes; the `tests/` directory contains lightweight Node.js tests.

Run the smoke tests with:

```sh
npm test
```

These tests exercise the startup/mute state transitions using mock Chrome APIs. They are **not a substitute for a live test** on CNN, MS NOW, FOX, or other streaming sites.

For preparing release ZIPs and publishing to GitHub, see [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Limits and privacy

A channel must remove its visible logo during commercials for this detection method to work. Protected/DRM playback may produce blank screenshots. Chrome must be able to capture the video tab and the tab must remain visible. Recognition can be imperfect and is experimental. The extension does **not** remove commercials, skip or hide ads, modify the television broadcast, or mute computer-wide sound.

Read [PRIVACY.md](PRIVACY.md) for what stays on your machine.

## Licensing

**Copyright © 2026 ContactProject.org.** Licensed under the **Apache License, Version 2.0** (SPDX identifier: `Apache-2.0`).

You may use, modify, redistribute, and commercially use LogoMute under the terms of that license. Keep the relevant copyright and attribution notices, provide a copy of the license, and mark modified files as required by the license. Apache 2.0 does **not** require modifications to be publicly released.

- Full text: [LICENSE](LICENSE)
- Copyright and attribution: [NOTICE](NOTICE)
- Project website: https://contactproject.org


## Independence

LogoMute is an independent, open-source browser extension developed by ContactProject.org. It is not affiliated with or endorsed by any television broadcaster or streaming provider.
