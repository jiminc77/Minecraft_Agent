#!/bin/bash
# Open the booth page full screen on the monitor attached to spark. Alt+F4 closes it.
# Firefox is detached, so closing the terminal that ran this script keeps the page open.
# Waits for the gateway so Firefox does not land on an error page during boot.
ROOT=/home/user/Workspace/Minecraft_Agent
PROFILE=$ROOT/kiosk-profile
until curl -sf -m 3 http://127.0.0.1:8772/health >/dev/null; do
  echo "부스 페이지를 기다리는 중..."; sleep 5
done
mkdir -p "$PROFILE"
# Skip first-run pages, crash-restore prompts and popups that would cover the booth page.
cat > "$PROFILE/user.js" <<'PREFS'
user_pref("browser.aboutwelcome.enabled", false);
user_pref("trailhead.firstrun.didSeeAboutWelcome", true);
user_pref("browser.startup.homepage_override.mstone", "ignore");
user_pref("datareporting.policy.dataSubmissionPolicyBypassNotification", true);
user_pref("toolkit.telemetry.reportingpolicy.firstRun", false);
user_pref("browser.sessionstore.resume_from_crash", false);
user_pref("browser.translations.automaticallyPopup", false);
user_pref("signon.rememberSignons", false);
user_pref("app.update.auto", false);
PREFS
# A killed Firefox otherwise shows an "Open previous tabs?" bar over the page.
rm -rf "$PROFILE/sessionstore.jsonlz4" "$PROFILE/sessionstore-backups"
setsid -f firefox --kiosk --no-remote --profile "$PROFILE" http://127.0.0.1:8772 >/dev/null 2>&1
echo "부스 화면을 띄웠습니다. 이 터미널은 닫아도 됩니다."
