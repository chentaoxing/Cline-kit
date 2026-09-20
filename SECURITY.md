# Security Policy

## What this tool does to your machine

`ckit start` launches `cline-app.exe` with one extra environment variable, set **only for that
process tree**:

```
WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=<random port>
```

That gives the Cline window a Chrome DevTools Protocol endpoint. Consequences worth stating plainly:

1. **A local DevTools port is a local control channel.** While Cline is running, any process running as
   your user can attach to `127.0.0.1:<port>` and read or drive the Cline UI — including anything the
   window can see. This is not a vulnerability introduced by this tool (any `--remote-debugging-port`
   user has the same exposure), but it *is* a wider local attack surface than Cline normally has.
2. **The port is random per session** and bound to loopback only. It is not exposed to the network.
3. **The port number and Cline path are stored** in `%APPDATA%\cline-kit\config.json` in plain text.
4. **Injected code is local by default.** The overlay is `src/engine.js` plus a JSON dictionary read from
   disk. Nothing is fetched or executed unless you enable dictionary updates.
5. **Remote dictionaries are validated, not trusted.** `src/dict.js` rejects a file that is not an
   object with the expected shape, has more than 20 000 entries, has any key/value longer than 400
   characters, or contains a rule whose regex is longer than 200 characters, is not anchored with
   `^…$`, or fails to compile. A rejected update is dropped and the local dictionary keeps working.
   Note the residual risk: rule patterns do reach `new RegExp()` in the page, so a malicious dictionary
   could at worst cause CPU waste via a pathological regex — it cannot execute code.
6. **The installer edits your shortcuts.** `ckit install` rewrites the target of any Start Menu or
   Desktop `.lnk` that points at your `cline-app.exe`, after saving the original target and arguments in
   the config file so `ckit uninstall` can restore them.

## Turning network updates off

```bash
ckit config --auto-update=off
```

With this set the tool never contacts GitHub; the dictionary only changes when you update the tool
itself.

## Not doing

* No modification, patching, repacking or re-signing of `cline-app.exe`.
* No system-wide environment variables.
* No kernel/service components, no startup driver, no admin rights required.
* No telemetry — the tool makes exactly one optional outbound HTTPS request, to the raw.githubusercontent.com
  URL in your config.

## Reporting a problem

Open an issue. If your concern involves the DevTools port specifically, say so — the mitigation is to run
`ckit stop` and use Cline in English, or to keep the tool installed but only launch Cline through it
when you need Chinese.
