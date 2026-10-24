#!/bin/bash
# get-mr-apk.sh MR_IID
# Fetches the CI-verified APK for an fdroiddata MR WITHOUT building: finds the head
# pipeline's `fdroid build` job on the MR source project, downloads its artifact zip,
# extracts tmp/binaries/<appid>_<code>.binary.apk (the CI-verified reference binary),
# and prints the reproducibility/signer proof lines from the build log.
# RUN THIS ON THE STAGING VM ONLY (MR apps must never land on the host).
set -euo pipefail
IID="${1:?usage: get-mr-apk.sh MR_IID}"
FD="36528"
TOKEN="${FDROID_TOKEN:?export FDROID_TOKEN=<gitlab PAT>}"
api() { curl -s -H "PRIVATE-TOKEN: $TOKEN" "$@"; }

echo "== MR $IID details =="
MR=$(api "https://gitlab.com/api/v4/projects/$FD/merge_requests/$IID")
SP=$(echo "$MR"  | python3 -c 'import json,sys;print(json.load(sys.stdin)["source_project_id"])')
SHA=$(echo "$MR" | python3 -c 'import json,sys;print(json.load(sys.stdin)["sha"])')
TITLE=$(echo "$MR" | python3 -c 'import json,sys;print(json.load(sys.stdin)["title"])')
echo "  $TITLE  (source project $SP, head sha ${SHA:0:8})"

echo "== head pipeline =="
PL=$(api "https://gitlab.com/api/v4/projects/$SP/pipelines?sha=$SHA&per_page=5")
PID=$(echo "$PL" | python3 -c '
import json,sys
pls=json.load(sys.stdin)
ok=[p for p in pls if p["status"]=="success"]
print(ok[0]["id"] if ok else "")')
[ -n "$PID" ] || { echo "NO GREEN PIPELINE for sha $SHA" >&2; exit 1; }
echo "  pipeline $PID (success)"

echo "== fdroid build job =="
JOBS=$(api "https://gitlab.com/api/v4/projects/$SP/pipelines/$PID/jobs?per_page=100")
JID=$(echo "$JOBS" | python3 -c '
import json,sys
for j in json.load(sys.stdin):
    if j.get("name")=="fdroid build": print(j["id"]); break')
[ -n "$JID" ] || { echo "NO fdroid build job" >&2; exit 1; }
echo "  job $JID"

APPID=$(api "https://gitlab.com/api/v4/projects/$SP/repository/files/metadata%2F.list/raw?ref=$SHA" >/dev/null 2>&1 && true)
APPID=$(echo "$MR" | python3 -c 'import json,sys;print(json.load(sys.stdin)["source_branch"])')
DIR="$HOME/staging/$APPID"
mkdir -p "$DIR"; cd "$DIR"

echo "== download + extract (VM only) =="
api "https://gitlab.com/api/v4/projects/$SP/jobs/$JID/artifacts" -o artifacts.zip
unzip -o -q artifacts.zip && rm artifacts.zip
echo "== proof lines from build log =="
api "https://gitlab.com/api/v4/projects/$SP/jobs/$JID/trace" -o build.log
grep -E "compared built binary|successfully verified|allowed signer|success: " build.log | head -5 || true
echo "== artifacts =="
ls -la tmp/binaries/ 2>/dev/null || true
ls -la tmp/*.apk 2>/dev/null || true
echo "== sha256 =="
sha256sum tmp/binaries/*.apk 2>/dev/null || true
echo "APK to install: $DIR/tmp/binaries/$(ls tmp/binaries 2>/dev/null | head -1)"
