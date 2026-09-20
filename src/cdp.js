"use strict";
// Minimal Chrome DevTools Protocol client (Node >= 20.10: global fetch + WebSocket).
const http = require("http");

function listTargets(port) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/json/list", timeout: 3000 }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => {
        if (res.statusCode !== 200) return reject(new Error("CDP HTTP " + res.statusCode));
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(new Error("CDP timeout")); });
  });
}

function pageTargets(port) {
  return listTargets(port).then((list) =>
    list.filter((t) => t.type === "page" && t.webSocketDebuggerUrl));
}

function open(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const t = setTimeout(() => { try { ws.close(); } catch (e) { } reject(new Error("ws timeout")); }, 5000);
    ws.onopen = () => { clearTimeout(t); resolve(ws); };
    ws.onerror = () => { clearTimeout(t); reject(new Error("ws error")); };
  });
}

function client(ws, timeoutMs) {
  let id = 0;
  const pending = new Map();
  const limit = timeoutMs || 10000;
  ws.onmessage = (ev) => {
    let m;
    try { m = JSON.parse(ev.data); } catch (e) { return; }
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id);
      pending.delete(m.id);
      clearTimeout(p.timer);
      m.error ? p.reject(new Error(m.error.message || JSON.stringify(m.error))) : p.resolve(m.result);
    }
  };
  return {
    rpc(method, params) {
      return new Promise((resolve, reject) => {
        const i = ++id;
        // A wedged or navigating renderer queues commands forever; fail loudly instead of hanging
        // the caller, so `ckit doctor` reports FAIL rather than sitting there silently.
        const timer = setTimeout(() => {
          if (pending.delete(i)) reject(new Error("CDP command timed out after " + limit + "ms: " + method +
            " (is Cline mid-navigation or frozen?)"));
        }, limit);
        pending.set(i, { resolve, reject, timer });
        ws.send(JSON.stringify({ id: i, method, params: params || {} }));
      });
    },
    close() { try { ws.close(); } catch (e) { } }
  };
}

// run fn(api) against every page target; returns per-target results
async function eachPage(port, fn) {
  const pages = await pageTargets(port);
  const out = [];
  for (const p of pages) {
    let api;
    try {
      const ws = await open(p.webSocketDebuggerUrl);
      api = client(ws);
      out.push({ target: p, result: await fn(api, p) });
    } catch (e) {
      out.push({ target: p, error: e.message });
    } finally {
      if (api) api.close();
    }
  }
  return out;
}

module.exports = { listTargets, pageTargets, open, client, eachPage };
