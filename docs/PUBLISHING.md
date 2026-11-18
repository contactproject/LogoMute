# Publishing LogoMute on GitHub

## Create a repository

1. Sign in to GitHub and click **New repository**.
2. Name it `LogoMute` (or another name of your choice). Add a description such as “Desktop Chrome extension that mutes TV commercials using channel-logo recognition.”
3. Create the repository **without** adding a second README; this project already includes one.
4. Extract the **LogoMute GitHub project ZIP** and upload its **contents** to the repository root via GitHub's **Add file → Upload files**, or commit from your local Git client.
5. Check that the repository root includes `manifest.json`, `background.js`, `popup.html`, and the `icons` directory.

## Create an installable release ZIP

The separate **LogoMute extension ZIP** is the correct download for end users. It contains the unpacked extension files, with `manifest.json` at the archive root.

On GitHub: open **Releases → Draft a new release**, choose a version tag (for example `v0.10.5`), give it a clear title, and attach the extension ZIP as a release asset. Publish when satisfied with testing.

Users should **extract** that ZIP and use **Load unpacked** in desktop Chrome. It is **not** a signed Chrome Web Store package; do not imply it can be installed by double-clicking the ZIP.

## Check before publishing

- Test `npm test` in the source project with Node.js installed.
- Install a fresh extension copy on desktop Chrome and confirm that the popup loads and Help opens.
- Verify preview logo selection, full-screen calibration, the eight-second countdown, and confirmation chime.
- Test start-during-commercial, sound restoration, and STOP on a TV channel.
- Confirm CNN defaults to Tolerant but user choices persist.
- Inspect the permissions and privacy statement.
- Verify the complete Apache-2.0 `LICENSE` and ContactProject.org `NOTICE` are present at the repository root and included in the release ZIP.

## License and attribution

LogoMute is licensed under **Apache-2.0**, with Copyright © 2026 ContactProject.org. Publish the `LICENSE` and `NOTICE` files with source releases and retain them in distribution archives. When modifying files, add prominent change notices where required by the license.

## Existing users

If you are already running LogoMute, replace files in the same installed folder and click **Reload** at `chrome://extensions`. A new *Load unpacked* installation may create a different extension ID and separate local storage, so users should not expect their saved profiles to transfer automatically.
