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
   The other direction is bounded: this tool only ever evaluates in pages whose origin is Cline's own
   webview (`tauri.localhost`), so a stale port number that some other Chromium app has grabbed in the
   meantime does not get our payload. `ckit config --page-origin=<host>` changes the accepted origin;
   `*` accepts any page on the port and exists for debugging, not for normal use.
2. **The port is random per session** and bound to loopback only. It is not exposed to the network.
   It stays open for as long as *that Cline window* runs — `ckit stop` ends the injector but does not
   close the port, because the port belongs to Cline. Quitting Cline closes it.
3. **The port number and Cline path are stored** in `%APPDATA%\cline-kit\config.json` in plain text.
4. **The overlay itself is local.** It is `src/engine.js`, the enabled feature scripts in
   `src/features/`, and the locale dictionaries - all read from disk and composed into one payload.
   The one thing that can come from the network is a newer **dictionary** (data, not code), and while
   the injector is alive it checks for one once a day unless you turn that off (see below).
5. **Remote dictionaries are validated, not trusted.** `src/dict.js` rejects a file that is not an
   object with the expected shape, has more than 20 000 entries, has any key/value longer than 400
   characters, or contains a rule whose regex is longer than 200 characters, is not anchored with
   `^…$`, or fails to compile. A rejected update is dropped and the local dictionary keeps working.
   Regexes are then **measured, not guessed**: each pattern is run against progressively longer inputs
   built from its own alphabet, and anything that breaks a 30 ms budget is rejected. That closes the
   residual risk of a downloaded file freezing the window via catastrophic backtracking - the same
   class of hang the observer-loop guards exist for. The local override file
   (`%APPDATA%\cline-kit\<locale>.local.json`) goes through the identical gate.
6. **The installer edits your shortcuts.** `ckit install` rewrites the target of every `.lnk` that points
   at your `cline-app.exe` - Start Menu, Desktop **and taskbar pins** (`Quick Launch\User Pinned\TaskBar`)
   - after saving each original target and argument list in the config file, so `ckit uninstall` restores
   them exactly. It prints which launch paths it changed and which it could not.

## Turning network updates off

```bash
ckit config --auto-update=off
```

This is off-switch for the only outbound request the tool makes. Note that dictionary auto-update is
**on by default**, so if you want a machine that never touches the network, set this. With it set the
dictionary only changes when you update the tool itself; `ckit update --force` still fetches on demand
and says so in the output.

## Not doing

* No modification, patching, repacking or re-signing of `cline-app.exe`.
* No system-wide environment variables.
* No kernel/service components, no startup driver, no admin rights required.
* No telemetry — the tool makes exactly one optional outbound HTTPS request, to the raw.githubusercontent.com
  URL in your config.

## Reporting a problem

Open an issue. If your concern involves the DevTools port specifically, say so — the mitigations are to
quit Cline (that is what closes the port; `ckit stop` only ends the injector), to disable dictionary
updates with `ckit config --auto-update=off`, or to `ckit uninstall` and relaunch Cline normally.
