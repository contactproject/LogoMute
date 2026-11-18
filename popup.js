const $ = id => document.getElementById(id);
let currentTab = null;
let busy = false;
let lastError = null;
let monitorAction = 'start';
const DEFAULT_DIRECTORY = Object.freeze({ label: 'Watch channels', url: 'https://usnewson.com/watch/' });
let directory = { ...DEFAULT_DIRECTORY };

function normalizeDirectory(label, url) {
  const finalLabel = String(label ?? '').trim();
  if (!finalLabel || finalLabel.length > 70) throw new Error('Enter a link label (up to 70 characters).');
  let parsed;
  try { parsed = new URL(String(url || '').trim()); }
  catch (_) { throw new Error('Enter a valid full website URL, beginning with https://.'); }
  if (!['https:', 'http:'].includes(parsed.protocol) || !parsed.hostname ||
      parsed.username || parsed.password || parsed.href.length > 1000) {
    throw new Error('Use a normal http:// or https:// website link without login details.');
  }
  return { label: finalLabel, url: parsed.href };
}

function showDirectory() {
  $('watch-link').textContent = directory.label + ' ↗';
  $('watch-link').href = directory.url;
  $('watch-link').title = directory.url;
  if (document.activeElement !== $('directory-label')) $('directory-label').value = directory.label;
  if (document.activeElement !== $('directory-url')) $('directory-url').value = directory.url;
}
async function loadDirectory() {
  const stored = (await chrome.storage.local.get('channelDirectory')).channelDirectory;
  try { directory = normalizeDirectory(stored?.label ?? DEFAULT_DIRECTORY.label, stored?.url ?? DEFAULT_DIRECTORY.url); }
  catch (_) { directory = { ...DEFAULT_DIRECTORY }; }
  showDirectory();
}
function renderAction(profile, status, sameTab) {
  const hasPreview = Boolean(profile?.savedAt);
  const hasFullscreen = Boolean(profile?.fullscreenSavedAt);
  const complete = hasPreview && hasFullscreen;
  const button = $('monitor-toggle');
  const description = $('monitor-action-description');
  let colorState = 'state-off';
  let caption;
  monitorAction = sameTab ? 'stop' : 'start';
  if (sameTab && status.muteReason && status.muteReason !== 'not-muted') {
    colorState = 'state-muted';
    caption = status.muteReason === 'awaiting-logo'
      ? 'Waiting for saved logo · Sound muted · Click STOP to restore'
      : status.muteReason === 'tracking-lost'
        ? 'TRACKING LOST · Sound muted · Click STOP to restore'
        : 'COMMERCIAL MUTED · Click STOP to restore sound';
  } else if (sameTab) {
    colorState = 'state-monitoring';
    caption = status.stage === 'watching'
      ? 'Monitoring active · Sound on · Click STOP to finish'
      : 'Monitoring active · Finding logo · Click STOP to finish';
  } else if (complete) {
    colorState = 'state-ready';
    caption = status.running ? 'Ready · Click START to switch from the other tab' : 'Ready · Preview + full-screen logos saved';
  } else if (hasPreview) {
    colorState = 'state-partial';
    caption = 'Preview saved · Full-screen not calibrated (preview can start)';
  } else {
    colorState = 'state-off';
    caption = 'Not ready · Choose a channel logo first';
  }
  button.className = 'monitor-toggle ' + colorState;
  button.textContent = sameTab ? 'STOP' : 'START';
  button.disabled = busy || (!sameTab && !hasPreview);
  button.setAttribute('aria-label', (sameTab ? 'Stop monitoring' : 'Start monitoring') + '. ' + caption);
  description.textContent = caption;
}


async function ask(type, more = {}) {
  // A bounded wait avoids leaving a disabled Start button indefinitely.
  let timeoutId;
  const response = chrome.runtime.sendMessage({ target: 'background', type, ...more });
  const result = await Promise.race([
    response,
    new Promise((_, reject) => { timeoutId = setTimeout(() => reject(new Error('LogoMute did not respond. Try again after reloading the TV tab.')), type === 'START' ? 23000 : 6500); })
  ]).finally(() => clearTimeout(timeoutId));
  if (!result?.ok) throw new Error(result?.error || 'Unexpected extension error.');
  return result;
}
function info(text, kind = '') {
  $('message').textContent = text;
  $('message').className = 'message ' + kind;
}
function setLogoSaveState(id, saved) {
  const indicator = $(id);
  indicator.textContent = saved ? 'SAVED' : 'NOT SAVED';
  indicator.className = 'logo-save-state ' + (saved ? 'logo-save-yes' : 'logo-save-no');
  indicator.setAttribute('aria-label', saved ? 'Logo saved' : 'Logo not saved');
}
function validPage(url) {
  try { return ['http:', 'https:'].includes(new URL(url).protocol); }
  catch (_) { return false; }
}
function setBusy(v) {
  busy = v;
  for (const id of ['select', 'monitor-toggle', 'arm-fullscreen', 'save-directory']) $(id).disabled = v;
}
async function refresh() {
  if (busy) return;
  if (!currentTab) return;
  const state = await ask('GET_STATE', { tabId: currentTab.id, url: currentTab.url });
  const { profile, status, settings } = state;
  setLogoSaveState('profile-status', Boolean(profile?.savedAt));
  setLogoSaveState('fullscreen-profile-status', Boolean(profile?.fullscreenSavedAt));
  const sameTab = status.running && status.tabId === currentTab.id;
  $('monitor-status').textContent = sameTab
    ? (status.muted ? 'Muted' : status.fullscreenSafeMode ? 'Finding logo…' : status.stage === 'learning logo' || status.stage === 'finding logo' ? 'Learning…' : 'Watching')
    : status.running ? 'Other tab' : 'Off';
  $('match-status').textContent = sameTab && typeof status.score === 'number' && typeof status.threshold === 'number'
    ? `${Math.round(status.score * 100)}% (trigger ${Math.round(status.threshold * 100)}%)`
    : '—';
  $('stage-status').textContent = status.stage || 'off';
  $('logo-state-status').textContent = sameTab ? (status.logoState || 'checking') + (status.logoRelocating ? ' · re-finding position' : '') : '—';
  $('frame-status').textContent = status.lastFrameAt ? new Date(status.lastFrameAt).toLocaleTimeString() : '—';
  $('test-mute').disabled = status.running;
  $('select').disabled = sameTab;
  $('arm-fullscreen').disabled = !profile;
  renderAction(profile, status, sameTab);

  $('select').textContent = profile ? '1. Reselect preview logo' : '1. Select preview logo';
  if (!document.activeElement || !['sensitivity', 'delay', 'debugMuteOnLostLogo'].includes(document.activeElement.id)) {
    $('sensitivity').value = String(settings.sensitivity);
    $('delay').value = String(settings.muteAfterMs);
    $('debugMuteOnLostLogo').checked = settings.debugMuteOnLostLogo !== false;
  }
  if (sameTab) {
    if (status.error) info(status.error, 'error');
    else if (status.awaitingFirstLogo) info('Sound muted while LogoMute waits for the saved channel logo. It will unmute when recognized.', 'good');
    else if (status.layoutSettling) info('Full-screen resize detected. Waiting 1 second before searching for the logo.');
    else if (status.muteReason === 'tracking-lost') info('DEBUG: Logo position lost — tab muted until it is re-found.', 'error');
    else if (status.fullscreenSafeMode) info('Finding the logo in full-screen. Sound stays on until the logo is confirmed.');
    else if (status.stage !== 'watching') info('Monitor running — ' + (status.stage || 'starting') + '. Keep the TV visible.');
    else if (status.quality === 'weak') info('Monitoring, but logo match is weak. Try a tighter selection.');
    else if (status.logoState === 'absent' && !status.muted) info('Logo missing — waiting to mute (' + Math.round((status.absentForMs || 0) / 1000) + 's).');
    else if (status.muted) info('Channel logo absent — tab muted.', 'good');
    else info('Monitoring active — tab sound is on.', 'good');
  } else if (status.running) info('Another tab is currently being monitored.');
  else if (status.lastIssue) info(status.lastIssue, 'error');
  else if (profile) info('Logo saved. You can START even during commercials; sound stays muted until the logo returns.');
  else info('Select the channel logo while it is visible on screen.');
  if (lastError) info(lastError, 'error');
}

async function runWithBusy(task) {
  if (busy) return;
  setBusy(true);
  try { await task(); lastError = null; }
  catch (e) { lastError = e.message; info(e.message, 'error'); }
  finally { setBusy(false); try { await refresh(); } catch (_) {} }
}

$('select').addEventListener('click', () => runWithBusy(async () => {
  await ask('CHOOSE_LOGO', { tabId: currentTab.id });
  window.close();
}));
$('arm-fullscreen').addEventListener('click', () => runWithBusy(async () => {
  await ask('ARM_FULLSCREEN_CALIBRATION', { tabId: currentTab.id });
  // The page reminder survives popup closure; the video controls stay accessible.
  window.close();
}));
$('monitor-toggle').addEventListener('click', () => runWithBusy(async () => {
  if (monitorAction === 'stop') {
    info('Stopping and restoring sound…');
    await ask('STOP');
    return;
  }
  if (!currentTab?.id || !validPage(currentTab.url)) {
    throw new Error('Open a TV channel website first.');
  }
  info('Starting monitoring…');
  await ask('START', { tabId: currentTab.id, url: currentTab.url });
  // Keep the control out of the picture once watching succeeds.
  window.close();
}));
$('save-directory').addEventListener('click', () => runWithBusy(async () => {
  const updated = normalizeDirectory($('directory-label').value, $('directory-url').value);
  await chrome.storage.local.set({ channelDirectory: updated });
  directory = updated;
  showDirectory();
  info('Channel directory shortcut saved.', 'good');
}));
$('test-mute').addEventListener('click', () => runWithBusy(async () => {
  await ask('TEST_MUTE', { tabId: currentTab.id });
  info('Tab muted for 2 seconds, then restored.', 'good');
}));
$('test-chime').addEventListener('click', () => runWithBusy(async () => {
  await ask('TEST_CHIME');
  info('Confirmation chime played.', 'good');
}));
$('copy-diagnostic').addEventListener('click', async () => {
  try {
    const state = await ask('GET_STATE', { tabId: currentTab.id, url: currentTab.url });
    const report = { version: chrome.runtime.getManifest().version, hasFullscreenLogo: Boolean(state.profile?.fullscreenSavedAt),
      origin: new URL(currentTab.url).origin, hasLogo: Boolean(state.profile),
      status: state.status, displayedError: lastError };
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    info('Diagnostics copied. Paste them into our chat.', 'good');
  } catch (e) { info('Could not copy diagnostics: ' + e.message, 'error'); }
});
async function saveSettings() {
  try {
    await ask('SETTINGS', {
      tabId: currentTab.id, url: currentTab.url,
      settings: {
        sensitivity: Number($('sensitivity').value),
        muteAfterMs: Number($('delay').value),
        debugMuteOnLostLogo: $('debugMuteOnLostLogo').checked
      }
    });
    lastError = null;
    await refresh();
  } catch (e) { lastError = e.message; info(e.message, 'error'); }
}
$('sensitivity').addEventListener('change', saveSettings);
$('delay').addEventListener('change', saveSettings);
$('debugMuteOnLostLogo').addEventListener('change', saveSettings);

(async function init() {
  try {
    await loadDirectory();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !validPage(tab.url)) {
      info('Open the TV website in a normal Chrome tab first.', 'error');
      $('select').disabled = $('monitor-toggle').disabled = $('arm-fullscreen').disabled = true;
      $('monitor-action-description').textContent = 'Open a TV stream to calibrate and start.';
      return;
    }
    currentTab = tab;
    await refresh();
    setInterval(() => refresh().catch(e => info(e.message, 'error')), 850);
  } catch (e) { info(e.message, 'error'); }
})();
