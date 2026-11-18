# LogoMute v0.10.8 — Chrome Extension

**Keep the News. Mute the Ads.**

## Activation sound restored

The female voice announcement has been removed. A short, locally synthesized two-tone **chime** confirms successful detection of the saved channel logo, including when the video layout is reacquired. It is played independently of the muted TV tab.

The eight-second calibration countdown beeps remain unchanged. You can check the sound using **Settings → Test confirmation chime**. No voice sound files are bundled.

## Otherwise unchanged

Logo detection, tab mute/unmute behavior, saved per-channel calibration, fullscreen handling, grey/green/red LM icon states, and ContactProject.org attribution under Apache 2.0 remain intact.

## Install or update

Extract the Chrome ZIP, then go to `chrome://extensions`, turn on **Developer mode** and choose **Load unpacked**, selecting the extracted `LogoMute` folder containing `manifest.json`. To retain existing settings, copy the new files into your current extension directory and select **Reload** instead of uninstalling.

Automated tests pass; live stream playback must be confirmed in Chrome.
