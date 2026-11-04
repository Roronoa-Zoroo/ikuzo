#!/usr/bin/env bash
# Usage: android-smoke.sh <apk-dir> <package> <output-dir>
# Installs the APK, launches it, taps through the bottom tabs and fails on any
# JavaScript error or native crash, or if the app is no longer running.
set -u
APK_DIR=$1
PACKAGE=$2
OUT=$3
START_WAIT=20
TAB_WAIT=8
mkdir -p "$OUT"

adb install -r "$(ls "$APK_DIR"/*.apk | head -n 1)"
adb logcat -c
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1
sleep "$START_WAIT"
adb exec-out screencap -p > "$OUT/0-launch.png"

# Bottom tab bar: five equal-width tabs along the bottom edge of the screen.
read -r WIDTH HEIGHT < <(adb shell wm size | sed -E 's/.*: ([0-9]+)x([0-9]+).*/\1 \2/')
TAB_Y=$((HEIGHT - HEIGHT / 30))
for TAB in 0 1 2 3 4; do
  X=$((WIDTH * (2 * TAB + 1) / 10))
  adb shell input tap "$X" "$TAB_Y"
  sleep "$TAB_WAIT"
  adb exec-out screencap -p > "$OUT/tab-$TAB.png"
done

adb logcat -d > "$OUT/logcat.txt"

echo "::group::Crash and JavaScript log lines"
grep -E "FATAL EXCEPTION|AndroidRuntime: |ReactNativeJS|unknown:ReactNative|libc  *: Fatal|DEBUG   :" "$OUT/logcat.txt" \
  | grep -vE "START com.android.internal|Using default boot image|Leaving lock profiling|Calling main entry|VM exiting" \
  | head -n 300
echo "::endgroup::"

FAILED=0
if grep -qE "E ReactNativeJS|E unknown:ReactNative" "$OUT/logcat.txt"; then
  echo "::error::JavaScript errors were logged. See the log above or the smoke-test artifact."
  FAILED=1
fi
if grep -q "FATAL EXCEPTION" "$OUT/logcat.txt"; then
  echo "::error::The app crashed (FATAL EXCEPTION)."
  FAILED=1
fi
if ! adb shell pidof "$PACKAGE" > /dev/null; then
  echo "::error::The app is no longer running."
  FAILED=1
fi
if [ "$FAILED" -eq 0 ]; then
  echo "App launched, all tabs opened, no errors logged."
fi
exit "$FAILED"
