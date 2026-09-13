#!/usr/bin/env bash
# فحص ملف IPA *بعد التوقيع* للتأكد من وجود aps-environment وصحة الـProvisioning Profile.
# الاستخدام (على جهاز macOS):  ./scripts/verify-ipa-entitlements.sh /path/to/App-signed.ipa
set -euo pipefail

IPA="${1:-}"
EXPECTED_BUNDLE_ID="com.techsnds.islamicelite"

if [[ -z "$IPA" || ! -f "$IPA" ]]; then
  echo "الاستخدام: $0 /path/to/signed.ipa"; exit 1
fi

WORK="$(mktemp -d)"; trap 'rm -rf "$WORK"' EXIT
unzip -qq "$IPA" -d "$WORK"
APP="$(find "$WORK/Payload" -maxdepth 1 -name '*.app' | head -1)"
[[ -n "$APP" ]] || { echo "❌ لم يتم العثور على .app داخل الـIPA"; exit 1; }

echo "== 1) هوية التطبيق =="
BID="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleIdentifier' "$APP/Info.plist")"
echo "Bundle ID: $BID"
[[ "$BID" == "$EXPECTED_BUNDLE_ID" ]] && echo "✅ مطابق" || { echo "❌ غير مطابق (المتوقع $EXPECTED_BUNDLE_ID)"; FAIL=1; }

echo
echo "== 2) الـEntitlements داخل التوقيع الفعلي =="
ENT="$WORK/entitlements.plist"
codesign -d --entitlements :- "$APP" > "$ENT" 2>/dev/null || true
if grep -q "aps-environment" "$ENT"; then
  APS="$(/usr/libexec/PlistBuddy -c 'Print :aps-environment' "$ENT" 2>/dev/null || echo '?')"
  echo "✅ aps-environment موجود = $APS"
  [[ "$APS" == "production" ]] && echo "   → توقيع Production / TestFlight / App Store" \
                               || echo "   → توقيع Development (يتطلب APNS_ENV=sandbox في الخادم)"
else
  echo "❌ aps-environment غير موجود — إشعارات لوحة التحكم لن تصل. الـentitlement سقط أثناء التوقيع."
  FAIL=1
fi

echo
echo "== 3) الـProvisioning Profile المضمّن =="
PROFILE="$APP/embedded.mobileprovision"
if [[ -f "$PROFILE" ]]; then
  security cms -D -i "$PROFILE" > "$WORK/profile.plist" 2>/dev/null
  echo "الاسم: $(/usr/libexec/PlistBuddy -c 'Print :Name' "$WORK/profile.plist")"
  echo "ينتهي في: $(/usr/libexec/PlistBuddy -c 'Print :ExpirationDate' "$WORK/profile.plist")"
  APPID="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$WORK/profile.plist")"
  echo "application-identifier: $APPID"
  [[ "$APPID" == *".$EXPECTED_BUNDLE_ID" ]] && echo "✅ الملف مطابق للـBundle ID" || { echo "❌ الملف لا يطابق الـBundle ID"; FAIL=1; }
  if /usr/libexec/PlistBuddy -c 'Print :Entitlements:aps-environment' "$WORK/profile.plist" >/dev/null 2>&1; then
    echo "✅ Push Notifications مفعّلة داخل الـProfile ($(/usr/libexec/PlistBuddy -c 'Print :Entitlements:aps-environment' "$WORK/profile.plist"))"
  else
    echo "❌ الـProfile لا يحتوي على Push Notifications — فعّلها في App ID ثم أعد توليد الملف."
    FAIL=1
  fi
else
  echo "❌ لا يوجد embedded.mobileprovision — الـIPA غير موقّع."
  FAIL=1
fi

echo
echo "== 4) صلاحية التوقيع =="
codesign --verify --deep --strict --verbose=2 "$APP" 2>&1 | tail -5 || FAIL=1

echo
[[ "${FAIL:-0}" == "0" ]] && echo "🎉 الـIPA جاهز لاستقبال إشعارات لوحة التحكم." \
                          || { echo "⚠️ يوجد فشل أعلاه — راجع البنود المعلّمة بـ ❌"; exit 2; }
