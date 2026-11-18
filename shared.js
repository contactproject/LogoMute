/* Shared URL key and preferences. No external dependencies. */
function logoMutePageKey(input) {
  const u = new URL(input);
  u.hash = '';
  const unwanted = ['fbclid', 'gclid', 'igshid', 'si', 'feature', 't', 'start'];
  for (const key of [...u.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('utm_') || unwanted.includes(key.toLowerCase())) {
      u.searchParams.delete(key);
    }
  }
  u.searchParams.sort();
  return u.origin + u.pathname + u.search;
}
const LOGOMUTE_DEFAULTS = Object.freeze({
  sensitivity: 1,
  muteAfterMs: 1700,
  restoreAfterMs: 900
});
