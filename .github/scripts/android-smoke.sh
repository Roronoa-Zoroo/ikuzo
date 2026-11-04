#!/usr/bin/env bash
# Usage: android-smoke.sh <apk-dir> <package> <output-dir>
# Installs the APK, launches it, and checks the process is still alive after a while.
set -u
APK_DIR=$1
PACKAGE=$2
OUT=$3
WAIT_SECONDS=30
mkdir -p "$OUT"

adb install -r "$(ls "$APK_DIR"/*.apk | head -n 1)"
adb logcat -c
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1
sleep "$WAIT_SECONDS"

adb exec-out screencap -p > "$OUT/screen.png"
adb logcat -d > "$OUT/logcat.txt"

echo "::group::Crash and JavaScript log lines"
grep -E "FATAL EXCEPTION|AndroidRuntime|ReactNativeJS|ReactNative|Hermes|libc  *: Fatal|DEBUG   :|E/unknown|SoLoader|$PACKAGE" "$OUT/logcat.txt" | grep -vE "I/ActivityManager: (Start|Display)" | head -n 300
echo "::endgroup::"

if adb shell pidof "$PACKAGE" > /dev/null; then
  echo "App is running after ${WAIT_SECONDS}s"
else
  echo "::error::App is not running ${WAIT_SECONDS}s after launch (crashed). See the log above or the smoke-test artifact."
  exit 1
fi
