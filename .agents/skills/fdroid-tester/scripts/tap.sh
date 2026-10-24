#!/bin/bash
# tap.sh DEVICE "text or content-desc"
# Dumps the current UI, finds the node whose text or content-desc equals the given
# string, and taps the center of its bounds. Robust against resource-ids that inject
# stray digits (e.g. android:id/button1) into naive number extraction.
set -euo pipefail
D="${1:?usage: tap.sh DEVICE \"text\"}"; WANT="${2:?}"
SER=/sdcard/tap_$$.xml

adb -s "$D" shell uiautomator dump "$SER" >/dev/null 2>&1
adb -s "$D" shell cat "$SER" > "$SER"
adb -s "$D" shell rm -f "$SER" >/dev/null 2>&1

# Find the node line, keep ONLY the bounds="..." numbers (not the whole line),
# so resource-ids like button1 can't pollute the coordinates.
LINE=$(grep -oE "<node[^>]*(text|content-desc)=\"${WANT}\"[^>]*>" "$SER" | head -1 || true)
if [ -z "$LINE" ]; then echo "ERROR: node not found: $WANT" >&2; rm -f "$SER"; exit 1; fi
BNDS=$(echo "$LINE" | grep -oE 'bounds="\[[0-9]+,[0-9]+\]\[[0-9]+,[0-9]+\]"' | head -1)
if [ -z "$BNDS" ]; then echo "ERROR: node has no bounds: $WANT" >&2; rm -f "$SER"; exit 1; fi
NUMS=$(echo "$BNDS" | grep -oE '[0-9]+')
set -- $NUMS
X=$(( ($1 + $3) / 2 ))
Y=$(( ($2 + $4) / 2 ))
rm -f "$SER"
echo "tapping '$WANT' at ($X,$Y)  [bounds $1,$2 -> $3,$4]"
adb -s "$D" shell input tap "$X" "$Y"
