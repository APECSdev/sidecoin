---
name: fdroid-tester
description: End-to-end F-Droid new-app MR tester. Picks untested MRs from the fdroiddata review-requested queue, obtains the CI-verified APK WITHOUT building, runs functional + network-capture tests on a physical device, and drafts the wiki-template tester report. Use when asked to test/review an F-Droid MR, help the fdroiddata review queue, or validate a new-app submission.
---

# F-Droid MR Tester

Test an `fdroiddata` new-app MR the way the F-Droid wiki ("Internal/Reviewing new apps")
expects, with the fastest reliable path. Validated end-to-end on MR !50926 (APODroid).

## HARD SAFETY RULES (non-negotiable)

1. **NEVER run, install, or store a 3rd-party MR app on the host.** All downloads,
   extraction, analysis, and APK storage happen inside the **APECS Dev VM** (`ssh apecsdev`).
2. The **physical test device** is the only place an MR app is ever installed. It is
   connected to the host by USB; drive it over **network adb from the VM** so the APK
   streams VM → device and never touches host disk.
3. The device is **shared with another team**. Announce sessions, keep them short,
   filter traffic captures to the MR app only, and always restore device state.
4. **Never post to GitLab without explicit user authorization.** Drafts go to
   `/tmp/*.md` files (never indented); the user reviews before anything is posted.

## Environment

| Resource | Detail |
|---|---|
| Staging VM | `ssh apecsdev` (VirtualBox "APECS", host port 2222, user apecs). Docker, git, adb, JDK 21 present. **Corrected 2026-10-23:** MR testing stages ONLY on this VM — the APECS Dev VM. (Earlier sessions staged elsewhere; that setup was retired. Do not use any other VM.) |
| Test device | Pixel 5 (`redfin`), Android 14. USB on host; reachable from VM at `192.168.1.250:5555`. |
| Device VPN | **Mullvad, Always-on, auto-connect on app launch.** See Network capture. |
| Review kit | `~/staging/fdroid-review-kit` on the VM (docker compose). |
| Working dir on VM | `~/staging/<appid>/` per MR. |

First-time device setup (once, needs the device unlocked):
`adb -s 0C151FDD400648 tcpip 5555` (host) → find IP → from VM `adb connect 192.168.1.250:5555`
→ accept the RSA prompt on the device. If it shows `unauthorized`, the user must tap Allow.

## Step 1 — Pick an MR

- Queue: fdroiddata MRs with label `review-requested`, oldest first.
- **Preference: MRs with NO previous testers, or at most 1.** Count testers by fetching
  notes and counting non-author/non-maintainer comments that look like test reports.
- Candidate must have a **green pipeline** (its head sha) — that is what provides the APK.

## Step 2 — Get the APK without building (the big shortcut)

The CI `fdroid build` job on the MR's **source project** already built from source and
verified reproducibility. Its artifact zip contains:
- `tmp/binaries/<appid>_<vercode>.binary.apk` — the **reference binary** (upstream-signed,
  what users get from `Binaries:`). **Install this one.**
- `tmp/<appid>_<vercode>.apk` — the CI's own build (unsigned).

```bash
scripts/get-mr-apk.sh <MR_IID>     # run on the VM; downloads ONLY into the VM
```
It resolves the head pipeline → `fdroid build` job → artifact zip, extracts, and greps
the build log for the two proof lines:
- `compared built binary to supplied reference binary successfully` → reproducible
- `supplied reference binary has allowed signer <sha256>` → matches `AllowedAPKSigningKeys`

Known quirk: the `check apk` job's `gl-code-quality-report.json` artifact 404s via API,
but the `fdroid build` job's artifact zip works fine.

VirusTotal: **search by SHA-256 first** (often already analyzed); only upload if not found.

## Step 3 — Install + functional test (from the VM)

```bash
D=192.168.1.250:5555
adb -s $D install -r <binary.apk>                       # streamed install
adb -s $D shell am start -n <appid>/.<MainActivity>     # launch
```

Assert via **text, never screenshots** — with ONE mandatory exception: a post-tap
screencap is REQUIRED before any "dead/unresponsive" finding (learning 17):
```bash
adb -s $D shell uiautomator dump /sdcard/ui.xml >/dev/null
adb -s $D shell cat /sdcard/ui.xml > ui.xml   # then grep locally on the VM
```

Checklist (wiki):
- starts, no crash (check `topResumedActivity` + logcat for FATAL)
- main features work (drive taps with `scripts/tap.sh`), e.g. "Set as wallpaper now" →
  verify side effect via `dumpsys wallpaper` (component changed), scheduler via
  `dumpsys jobscheduler`, browser via `topResumedActivity`
- unique icon (resource-level check + user's visual pass)
- no EULA/terms screens; no runtime-permission prompts; permissions match behavior
- article links open in the **system browser** (no in-app webview)

`scripts/tap.sh $D "text or content-desc"` — finds the node by text/content-desc in a
fresh dump and taps its center. Pitfalls it handles: resource-ids like `button1` inject
stray digits into bounds parsing; Compose apps expose no clickable/checked flags.
Other gotchas: dumps go stale after layout changes (re-dump each time); use
`pm clear <appid>` to force a cold start when testing network.

## Step 4 — Network capture (PCAPdroid)

Device has **Mullvad Always-on** — a second VPN app cannot start until it is disabled.
The `settings put/delete` adb hack does NOT take; use the **Settings UI** (the path
PCAPdroid's own dialog requires):

1. Settings → VPN → Mullvad gear → toggle **Always-on VPN off**.
2. Drop the Mullvad session: launch Mullvad → Disconnect, or `am force-stop net.mullvad.mullvadvpn`.
3. Install PCAPdroid from f-droid.org (published app, allowed): grab
   `https://f-droid.org/repo/com.emanuelef.remote_capture_<code>.apk`.
4. **Target apps → select ONLY the MR app** (device is shared — never capture others).
5. Start → accept "Active VPN detected" OK → explainer OK → **system consent dialog OK**.
6. `pm clear <appid>` for a cold start, launch the app, wait ~10 s, open PCAPdroid
   Connections tab, dump the list (text) — that is the host evidence. Expect exactly
   the hosts the recipe declares.
7. **Restore:** tap Stop → launch Mullvad (tap Connect) → re-enable **Always-on** in the
   Settings UI → verify `tun*` is owned by Mullvad's uid again.

## Step 5 — Static checks (review kit, on the VM)

```bash
cd ~/staging/fdroid-review-kit
docker compose build                       # after first clone or src change
nohup docker compose run --rm review --mr <IID> --cache-dir /out/cache > /tmp/rk-<IID>.log 2>&1 &
# poll output/report.md — first run pulls the fdroidserver image, slow; run detached, never block
```
Its official-`lint` step may time out on the image pull — **cite the CI `fdroid lint`
job on the MR's own pipeline instead** (it is the same check, already green).

## Step 6 — Report

Format = the wiki's HTML-table template, checkbox semantics `[x]` = "statement is true"
(negative/violation items stay unchecked when no violation). Short preamble like the
community style: device + method + headline findings. Include: tested version/commit,
SHA-256 of the installed binary, observed host list, reproducibility/signer proof, any
metadata nits for the author (e.g. missing `featureGraphic.png`).

Write to `/tmp/review-<IID>-<app>.md`, show the user, **post only on explicit approval**:
```bash
curl -s -X POST -H "PRIVATE-TOKEN: $TOKEN" \
  --data-urlencode "body@/tmp/review-<IID>.md" \
  "https://gitlab.com/api/v4/projects/36528/merge_requests/<IID>/notes"
```

## Restore checklist (before ending a session)

- [ ] PCAPdroid capture stopped (no second `tun` iface; the remaining one is Mullvad's)
- [ ] Mullvad connected + Always-on back ON via Settings UI
- [ ] MR app left installed only if the user wants to try it; otherwise `pm uninstall <appid>`
- [ ] No MR artifacts anywhere on the host (`ls /tmp/apod*` etc. clean)

## Session learnings (2026-10, MR 51875)

Operational facts learned the hard way; fold into the rhythm above.

1. **VM may be powered off or hung.** `ssh apecsdev` with a short `ConnectTimeout` first; if hung, `VBoxManage list vms` / `startvm "APECS" --type headless` from the host. A boot splash that doesn't clear in ~10 min needs `VBoxManage controlvm APECS poweroff` then a fresh start (ACPI `powerbutton` may be ignored). Screenshot the console only if genuinely stuck.
2. **The VM has no LAN route (VirtualBox NAT, 10.0.2.15).** `adb connect <device>` from the VM fails. Reverse-forward the *host's* adb server instead: kill the VM's own adb server, then `ssh -f -N -R 5037:127.0.0.1:5037 apecsdev`, and prefix every VM adb call with `ADB_SERVER_SOCKET=tcp:localhost:5037`. `adb forward` (device-port tunnels) works through the same forwarded server.
3. **The Pixel's current wlan IP is 192.168.87.243** (192.168.1.250 in First-run setup is stale; check `ip addr show wlan0` on-device).
4. **Wi-Fi client isolation:** the host cannot reach device-hosted TCP servers (e.g. a tested app's LAN web server) even on the same /24 — curl/ping fail. Use `adb forward tcp:<p> tcp:<p>` and curl `127.0.0.1:<p>`.
5. **PCAPdroid may be missing** — install `https://f-droid.org/repo/com.emanuelef.remote_capture_<versionCode>.apk`. Its app-filter picker search matches **package names only** (search `tsm`, not `Tennis`). Starting via the `CaptureCtrl` intent walks a **three-dialog chain** — control-request ALLOW → PCAPdroid's own VPN explainer OK → system `vpndialogs` consent OK — each racy and auto-dismissing; fire fixed-coordinate taps (ALLOW ~(768,1370), OK ~(915,1441)) in one tight chain with no dumps in between.
6. **Mullvad VPN auto-reconnects and steals the VPN slot** (its tunnel appears as a tun owned by uid 10260 with 10.64.x DNS), killing PCAPdroid starts. `am force-stop net.mullvad.mullvadvpn` before capturing; **relaunch + reconnect Mullvad afterwards** (restore checklist).
7. **If PCAPdroid's engine never creates its tunnel** (observed on this device: `W Main: Capture start failed` in logcat, `com.android.vpndialogs` never launched, reproduces across reinstall + `cmd appops set ... ACTIVATE_VPN default`; unresolved — Mullvad works because its consent predates the breakage). Its in-app **drawer → Log** view shows failures but no reasons on the F-Droid build. Fall back to **kernel-level per-UID socket monitoring**: sample `/proc/net/{tcp,tcp6,udp,udp6}` at 1 Hz, filter by the app uid (`pm list packages -U <pkg>`), exclude the app's own LISTEN ports. Strong evidence for zero-outbound claims. **Never narrate local tooling failures in the posted report** — state the method and results; our device problems are not the author's concern.
8. **fdroid-review-kit:** compose service is `review`, not `fdroid-review-kit` (`docker compose run --rm review --mr <IID>`). The container can hang after writing `output/report.md`+`report.json` — poll the files, not the process. Beware `pgrep -f` self-matching your own ssh command string (match something that can't appear in your shell line).
9. **uiautomator on Compose apps:** most labels live in `content-desc`, not `text`; a two-pass (exact text → substring/content-desc) tap helper is essential — a working one is `~/staging/tap.py` on the VM. Custom canvases (e.g. a score view) expose nothing; assert around them via stable controls.
10. **Shared device discipline:** another team's apps can surface mid-session (e.g. `app.evonext.debug` crash/relaunch loop). Never interact with them; re-`am start` the target package and re-check `topResumedActivity` before each step. Stray fixed-coordinate taps can launch whatever is under them when dialogs race.

## Session learnings (2026-10, MR 50945, bombvault)

11. **WebView buttons can report ZERO-HEIGHT bounds while the IME is shown** (`[44,1364][1036,1364]`) — taps at those coordinates miss. Before declaring any button "dead", dismiss the IME (BACK closes keyboard only on non-modal screens; ESC can close whole bottom-sheets), re-dump, and check both real bounds AND `enabled=` — a disabled button (e.g. Pair until the phrase validates) also looks "dead". Pair of near-misses this causes: false bug reports and missed real ones.
12. **`input text` is subject to Gboard autocorrect** — it silently rewrote word 12 of a 12-word phrase (visible only by dumping the field and diffing positions). For exact strings (seed phrases, codes), type with raw `input keyevent KEYCODE_A…Z` (29–54) + 62 for space; keyevents bypass IME composition. WebView fields here ignored MOVE_HOME/MOVE_END and FORWARD_DEL; backward DEL (67) works when the field is truly focused — but editing a dirty WebView field is unreliable: `pm clear` and retype from scratch instead.
13. **Companion-server reviews are fully scriptable on the VM** once docker exists: run the official image, drive its API with curl (no auth before a login password is set), keep generated secrets in 0600 files and never print them (they WILL leak into context via UI dumps anyway — treat them as disposable and tear the server down at session end). Pairing evidence beats speculation: the member list (`relay: true`) + capture rows answered the "when is the relay contacted" question definitively.
14. **`glab api ... | ssh apecsdev 'cat > file'` streams artifacts token-free** — glab's token is keyring-backed and not extractable; running glab on the host and piping bytes into the VM satisfies both the no-tokens-on-VM and no-artifacts-on-host rules.
15. **apecsdev base tooling now present:** docker.io + compose v2 + openjdk-21 (apt, sudo), Android platform-tools AND build-tools (aapt/apksigner/dexdump) user-space in `~/opt` + `~/bin`, review kit in `~/staging/fdroid-review-kit`, `tap.py`, PCAPdroid APK. adb still needs the reverse-forward: `ssh -f -N -R 5037:127.0.0.1:5037 apecsdev` + `ADB_SERVER_SOCKET=tcp:localhost:5037`. The vboxadd kernel-module build warning after `dpkg --configure -a` is cosmetic for headless use.
16. **Pixel 5 WiFi dropped mid-session once** (`Active default network: none`, no inet on wlan0); `svc wifi`/`cmd wifi` could not re-associate — needed manual reconnect on the device. If captures show literal silence, verify the device is online before blaming the app.
17. **Instrumentation can NEVER prove a button dead in a WebView app — a post-tap screencap is mandatory.** The BombVault "Scan QR code" false positive (filed, then withdrawn after the author disputed it): the button opened an in-WebView consent modal ("Camera access is needed…" → "Allow access" → system prompt). Window focus stayed on `MainActivity`, logcat was silent, the permission grant never fired, and uiautomator saw **8 nodes, zero WebView content** — every signal I cited as "dead" evidence is blind to WebView-rendered UI, and no screenshot was taken after the tap. **Rule: before reporting any element as dead/unresponsive, `adb exec-out screencap -p` BEFORE and AFTER the tap and LOOK at both.** This is the one exception to "assert via text, never screenshots" (that rule governs selectors; visual confirmation governs negative findings). The author re-tested on a real phone, quoted the modal text back, and asked a question ("did that window appear?") the report could not answer — a review-report killer.
18. **Re-verify review asks against CURRENT upstream metadata before repeating them.** The "name the default relay in the description" ask was fixed upstream in 9.9.1 (Oct 9) yet repeated in the Oct 23 report because it was copied from the Oct 6 static review. Before listing any "the description should mention X" nit, fetch the app's fastlane/Triple-T `full_description.txt` at the TESTED tag and check. Recipe files with no `Description:` field inherit the upstream store metadata — look there, not in the recipe.
