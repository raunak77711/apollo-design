/**
 * Word normalisation shared by the board index and the transcript, so that
 * "Leads" on the board and "lead," in the recording land on the same token.
 */

const STOP = new Set((
  'a an and are as at be been but by can could did do does for from had has have he her his i if in into is it its just ' +
  'me my no not of on or our she so some than that the their them then there these they this those to too up us was we ' +
  'were what when where which who will with would you your youre theyre dont cant isnt aint im ive thats ' +
  'uh um umm uh-huh like really very actually basically okay ok yeah well also about all any more most other out over ' +
  'one two how why because while still even only'
).split(/\s+/));

/** A light stemmer: enough to join lead/leads/leaking/leaked, not a linguistics project. */
export function stem(word) {
  let w = word;
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`;
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('es') && !w.endsWith('ses')) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  return w;
}

/** One spoken or printed word -> a comparable token, or '' when it carries no meaning on its own. */
export function normalizeToken(raw) {
  const w = String(raw ?? '')
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/[^a-z0-9]+/g, '');
  if (!w || STOP.has(w)) return '';
  return stem(w);
}

/** A phrase -> tokens, stop words dropped. */
export function tokenize(text) {
  return String(text ?? '')
    .split(/[\s/\\|→↓×÷=+−\-–—]+/)
    .map(normalizeToken)
    .filter(Boolean);
}
