# LogoMute — Keep the News. Mute the Ads.

**Easy instructions for Google Chrome on a desktop or laptop computer.** LogoMute is a **desktop Chrome extension**. It is not an Android or iPhone app.

## What does LogoMute do?

Many live television channels display a station logo while programmes are playing. On some channels, that logo disappears during commercial breaks.

LogoMute monitors a small area of the television picture selected by the user. When the station logo disappears, LogoMute automatically mutes the sound of the selected Chrome tab. When the logo returns, the sound is restored.

LogoMute does **not** skip commercials, hide advertisements, or modify the television broadcast. It simply controls audio playback locally within Google Chrome.

Because broadcasters use their logos differently, LogoMute may not detect every commercial break.

## 1. Install LogoMute

1. Download the **LogoMute extension ZIP** to your computer.
2. Open your **Downloads** folder, right-click the ZIP, and choose **Extract All**.
3. Open **Google Chrome** and type `chrome://extensions` into the address bar. Press **Enter**.
4. Turn on **Developer mode** (upper right).
5. Click **Load unpacked**, then select the extracted **LogoMute** folder.
6. Find the **puzzle-piece** icon near Chrome's address bar. Pin **LogoMute** so you can see its icon.

That's it. Leave the extracted folder where it is; Chrome uses those files to run LogoMute.

**Updating an existing installation:** Replace the files inside your existing LogoMute folder, then click **Reload** on the LogoMute card at `chrome://extensions`. Do not remove the extension if you want to keep your saved channel settings.

## 2. Open a television channel

You don't have to hunt for a TV website. LogoMute already includes a **Watch channels** link that opens **[USNewsON](https://usnewson.com/watch/)**.

Click the LogoMute icon, choose **Watch channels**, and pick a channel—such as CNN, MS NOW, or FOX, where available.

**Prefer a different TV website?** You can change this link in **Settings → Channel directory shortcut**. The address and button name are both editable.

LogoMute can also work on other websites, as long as the station logo disappears during advertisements and Chrome can capture the video picture. It won't work on every stream.

## 3. Teach LogoMute your channel's logo (one-time setup)

Do this the first time you watch each channel. **The logo needs to be visible while you save it.** Once saved, you can start LogoMute at any time—even during a commercial.

### Step 1 — Save the preview logo

1. Open the channel in the smaller, normal player view, during a programme with the station logo visible.
2. Click the LogoMute toolbar icon.
3. Click **1. Select preview logo**.
4. Draw a rectangle around the station logo. **The rectangle can be a little larger than the logo**; it does not need to trace its exact outline. Leave a small margin, preferably with the logo near the centre, but avoid scrolling headlines and player controls.
5. Click **Save**.

The popup should say **Logo: SAVED** in green.

### Step 2 — Capture the full-screen logo

1. Click LogoMute again and choose **2. Capture full-screen logo · 8 sec**.
2. The LogoMute popup closes automatically so it can't cover the TV player's full-screen button.
3. Enter full-screen **within two minutes**.
4. Move the mouse away from the picture and **listen to the eight-second countdown beeps**.
5. After eight seconds, LogoMute takes a still screenshot and opens its calibration window.

The wait gives the website's playback controls time to disappear.

### Step 3 — Save the full-screen logo

In the captured picture, mark the station logo with **two clicks on opposite corners**, or use the **corner/position/size controls below the picture** if mouse selection doesn't work. The box can be slightly larger than the logo; leave a small margin around it. Click **Save full-screen logo**.

LogoMute closes the calibration window, returns to the TV tab, and **attempts to start monitoring automatically**. You may need to re-enter full-screen if the calibration window caused the player to exit it.

Look for **Full-screen: SAVED** in green. A short **bing** means the logo has been successfully recognized. This confirmation sound is separate from the countdown beeps.

**How precise does the rectangle need to be?** You can draw a moderately larger rectangle (roughly 10–20% larger in width and height is a useful starting point). During initial recognition, LogoMute learns stable logo edges across several frames and reduces the weight of moving picture details. This helps with small margins, but is not infallible: large or changing backgrounds can still interfere. If detection becomes unreliable, make the box smaller and recalibrate while the logo is visible.

## 4. START, STOP, and the colours

The big button at the top tells you what to do:

- **Grey START:** Setup is incomplete. If you've saved the preview logo, you can still try preview-only monitoring.
- **Green START:** LogoMute is ready. Click it to begin.
- **Green STOP:** LogoMute is monitoring, and normal TV sound is playing.
- **Red STOP:** LogoMute has muted the TV tab. Click STOP to stop monitoring and restore sound.

The little **LM** icon in Chrome changes colour too: grey when off, green while monitoring, red when muted.

**Can I start during a commercial? Yes.** After you have saved a channel logo, pressing START immediately mutes the TV tab while LogoMute looks for the saved logo. If the commercial is still on, it stays silent. When the logo reappears and is recognized, sound comes back automatically. It may also be briefly muted if you press START during a programme while the logo is being verified.

## 5. Settings, in plain English

Click **Settings** in the LogoMute popup:

- **Sensitivity for this channel:** **Tolerant** makes false muting less likely, **Balanced** is the usual choice, and **Strict** reacts more readily. LogoMute remembers the choice **separately for each channel**. CNN defaults to Tolerant unless you've previously set something else.
- **Mute after logo absent:** How long to wait before muting—**1**, **1.7**, or **3 seconds**. This setting applies to all channels.
- **Debug: mute if logo tracking is lost:** A troubleshooting switch. It can silence normal programming if the logo isn't found. **Leave OFF for everyday viewing.**
- **Test tab mute (2 seconds):** Checks whether Chrome can mute the TV tab and turn the sound back on.
- **Test confirmation chime:** Plays the little **bing** so you can check the speaker volume.
- **Copy diagnostics:** Copies technical information to share with someone helping you troubleshoot. You can normally ignore the Match/Stage/Detected logo/Last image numbers.
- **Channel directory shortcut:** Change **Link label** and **Website URL**, then click **Save channel link**. The default is **Watch channels → https://usnewson.com/watch/**.

## 6. Does it remember my channels?

Yes. The saved preview and full-screen logo pictures, their positions, and the sensitivity are remembered for **each channel URL**. You don't need to repeat calibration every time you visit, unless the station changes its logo or the website changes its player.

LogoMute monitors **one Chrome TV tab at a time** and needs the TV tab visible to take snapshots. It's particularly suited to a desktop computer dedicated to watching television.

## 7. If something goes wrong

- **Sound goes off during the news:** Turn **Debug** OFF, try **Tolerant** sensitivity, or save the logo again.
- **An advertisement isn't muted:** Check that the station really removes its logo during commercials; some channels don't.
- **Sound stays muted:** Click the red **STOP** button to turn off monitoring and restore sound.
- **No green SAVED status:** Repeat the missing logo-selection step.
- **Player controls appear in the saved full-screen image:** Recalibrate, moving your mouse away during the eight-second countdown.
- **No chime:** Use **Settings → Test confirmation chime** and check your speaker volume.
- **Stream appears black in screenshots:** Some protected video services block capture. LogoMute may not work there.

## 8. Privacy and limitations

LogoMute processes snapshots **locally in Chrome**, with no LogoMute account or upload to a LogoMute server. It does not record whole TV programmes. It mutes only the Chrome tab, not the entire computer. It is experimental; different players and logos can cause occasional mistakes.

**LogoMute — Keep the News. Mute the Ads.**

## 9. Open-source license

LogoMute is Copyright © 2026 ContactProject.org and distributed under the **Apache License, Version 2.0**. See [`LICENSE`](../LICENSE) for the complete license and [`NOTICE`](../NOTICE) for attribution. Modified versions must retain applicable notices and state changes as required by the license.


**Independence notice:** LogoMute is an independent, open-source browser extension developed by [ContactProject.org](https://contactproject.org). It is not affiliated with or endorsed by any television broadcaster or streaming provider.
