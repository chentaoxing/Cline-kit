// Pure helpers for the context-meter feature: no DOM, no React, no browser globals.
// Loaded twice from the same file - CommonJS for scripts/selftest.js, and prepended to the browser
// script by src/features/index.js, where it lands on window.__ckitContextLogic.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else if (root) root.__ckitContextLogic = factory();
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  // "Used" is input + output tokens. That is Cline's own definition, copied from its component so the
  // overlay and the app can never disagree about what the bar means.
  function usedTokens(u) {
    return Math.max(0, (Number(u && u.tokensIn) || 0) + (Number(u && u.tokensOut) || 0));
  }

  // 61183 -> "61.2k", 166910 -> "166.9k", 2621440 -> "2.6M". Below 10k one decimal is worth it because
  // that is where a percentage is still meaningful to read off.
  function fmtTokens(n) {
    n = Math.max(0, Math.round(Number(n) || 0));
    if (n < 1000) return String(n);
    if (n < 1e6) return (n / 1e3).toFixed(n < 1e4 ? 1 : 0) + "k";
    return (n / 1e6).toFixed(1) + "M";
  }

  /**
   * Turn Cline's usage object into what the meter can show.
   *
   * The important case is the missing one: several of Cline's free models report no contextWindow at
   * all (verified against the running app - the key is simply absent for cline-free/kimi-k3,
   * muse-spark and deepseek), which is why Cline's own meter renders nothing there. A missing limit
   * kills the percentage but not the hit rate, so this returns pct=null and keeps hit, rather than
   * inventing a window size to divide by.
   */
  function summarize(u, opts) {
    if (!u || typeof u !== "object") return null;
    opts = opts || {};
    var used = usedTokens(u);
    if (used <= 0) return null;                       // nothing sent yet - there is nothing to show
    var fromApp = Number(u.contextWindow) || 0;
    var fallback = Number(opts.fallbackLimit) || 0;
    var limit = fromApp > 0 ? fromApp : (fallback > 0 ? fallback : 0);
    var pct = limit > 0 ? Math.min(100, Math.round(used / limit * 100)) : null;
    var cached = Math.min(Number(u.cacheReadTokens) || 0, Number(u.tokensIn) || 0);
    var hit = (Number(u.tokensIn) || 0) > 0 ? Math.round(cached / u.tokensIn * 1000) / 10 : null;
    return {
      used: used, limit: limit, pct: pct, hit: hit,
      // Where the limit came from matters to the reader: a configured number is a guess, the app's is fact.
      limitSource: fromApp > 0 ? "app" : (limit > 0 ? "config" : "none"),
      usedText: fmtTokens(used), limitText: limit > 0 ? fmtTokens(limit) : ""
    };
  }

  // Same thresholds Cline's own ring uses (>=75% red, >=50% orange), so a colour means the same thing
  // in both places. Literal colours because the app's stylesheet only contains the Tailwind classes
  // it actually used - a bg-* utility we make up here would simply not exist.
  function fillColor(pct) {
    if (pct == null) return "currentColor";
    if (pct >= 75) return "#ef4444";
    if (pct >= 50) return "#f97316";
    return "currentColor";
  }

  return { usedTokens, fmtTokens, summarize, fillColor };
});
