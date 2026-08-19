/**
 * Dealing with other people's servers.
 *
 * Every slow part of a generation is a call to an API Apollo does not run, and
 * the failure that actually hurts is not an error — it's silence. A provider
 * that answers "no" in 200ms costs nothing. One that holds the socket open
 * until a CDN gives up costs 40 seconds, and the pipeline pays that price once
 * per query, per image slot, per attempt. Six of those is a user staring at
 * "Finding the perfect visuals" for eight minutes.
 *
 * So two rules, applied to every outbound call:
 *
 *   1. Nothing waits forever. Node's fetch has no deadline short enough to
 *      matter here, so each call carries an explicit one.
 *   2. Nothing pays for the same failure twice. An upstream that just failed
 *      hard is remembered as down and skipped until its cooldown expires,
 *      instead of being re-tried on every one of the dozen calls a single
 *      design makes.
 *
 * Being down is never fatal: the curator falls back to the other library, then
 * to a typographic layout, and the art director falls back to the heuristic
 * planner. This module only decides how *fast* the pipeline finds that out.
 */

/** Thrown when a call passes its deadline, as distinct from being cancelled. */
export class TimeoutError extends Error {
  constructor(ms) {
    super(`timed out after ${ms}ms`);
    this.name = 'TimeoutError';
    this.timeoutMs = ms;
  }
}

/**
 * An abort signal that fires at `ms`, or when the caller's own `signal` does.
 *
 * Returned alongside the timeout signal itself so the caller can tell the two
 * apart afterwards: a deadline is a provider being unwell and worth a cooldown,
 * a caller abort is the user navigating away and worth nothing at all.
 */
export function deadline(ms, signal) {
  const timeout = AbortSignal.timeout(ms);
  return { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, timeout };
}

/** `fetch`, but it always comes back. */
export async function fetchWithTimeout(url, { timeoutMs = 8000, signal, ...init } = {}) {
  const { signal: composed, timeout } = deadline(timeoutMs, signal);
  try {
    return await fetch(url, { ...init, signal: composed });
  } catch (err) {
    // The caller's own abort must stay an AbortError so callers can keep
    // ignoring it; only a genuine deadline becomes a TimeoutError.
    if (timeout.aborted && !signal?.aborted) throw new TimeoutError(timeoutMs);
    throw err;
  }
}

/* ---------------------------- upstream health ---------------------------- */

const COOLDOWNS = {
  /** An outage or a deadline. Long enough to not re-pay it during one design. */
  unavailable: 5 * 60_000,
  /** Rate limited — usually a short window, so look again sooner. */
  throttled: 60_000,
  /** A bad key or an exhausted quota. Nothing we do will fix it this session. */
  rejected: 30 * 60_000,
};

const down = new Map(); // name -> { until, reason }

/** Classify an upstream failure, or return null if it says nothing about health. */
export function classify(err) {
  if (err instanceof TimeoutError || err?.name === 'TimeoutError') return 'unavailable';
  if (err?.name === 'AbortError') return null; // we cancelled it; not their fault
  const status = err?.status;
  if (status === 429) return 'throttled';
  if (status === 401 || status === 402 || status === 403) return 'rejected';
  if (status >= 500) return 'unavailable'; // 522 included: Cloudflare gave up on the origin
  if (status >= 400) return null; // a bad query is not an outage
  return 'unavailable'; // DNS, TLS, connection reset
}

/**
 * Record a failure. Returns true if the upstream is now considered down, so
 * the caller can log the transition once rather than on every failed call.
 */
export function markFailure(name, err) {
  const reason = classify(err);
  if (!reason) return false;
  const already = isDown(name);
  down.set(name, { until: Date.now() + COOLDOWNS[reason], reason, message: err?.message || String(err) });
  return !already;
}

export function isDown(name) {
  const entry = down.get(name);
  if (!entry) return false;
  if (Date.now() >= entry.until) {
    down.delete(name);
    return false;
  }
  return true;
}

/** Why an upstream is being skipped, for logging. */
export function downReason(name) {
  const entry = down.get(name);
  if (!entry) return '';
  return `${entry.reason} — ${entry.message}`;
}

/** A successful call clears the cooldown early. */
export function markSuccess(name) {
  down.delete(name);
}

/** An Error carrying the HTTP status, so `classify` can tell an outage from a bad query. */
export function statusError(message, status) {
  const err = new Error(message);
  err.status = status;
  return err;
}
