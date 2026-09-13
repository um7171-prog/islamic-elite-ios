# بناء تطبيق iOS (IPA) — النخبة الإسلامية

المشروع جاهز للبناء مباشرة دون أي تعديل على الكود.

## المعلومات الأساسية
- **Bundle ID:** `com.techsnds.islamicelite`
- **App Name:** النخبة الإسلامية
- **Deployment target:** iOS 15.0
- **Capacitor:** 8.x (SPM) — الإضافة الوحيدة: `@capacitor/haptics` (متوافقة مع iOS)
- **الاتجاه:** عمودي على الآيفون، حر على الآيباد
- **مجلد الويب المدمج:** `dist/` → يُنسخ إلى `ios/App/App/public`

> تمت إزالة `server.url` من `capacitor.config.ts`، لذا يعمل التطبيق من الحزمة المحلية
> (شرط أساسي لقبول App Store) وليس من رابط المعاينة.

## البناء محلياً على macOS
```bash
npm install
npm run build
npx cap sync ios
npx cap open ios     # يفتح Xcode
```
في Xcode: اختر الـ Team في تبويب Signing & Capabilities، ثم
`Product ▸ Archive ▸ Distribute App ▸ App Store Connect`.

بناء IPA من الطرفية:
```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Release \
  -archivePath build/App.xcarchive archive
xcodebuild -exportArchive -archivePath build/App.xcarchive \
  -exportOptionsPlist ios/ExportOptions.plist -exportPath build/ipa
```

## البناء على Codemagic
الملف `codemagic.yaml` جاهز في جذر المشروع (workflow: `ios-release`).
فعّل توقيع iOS من إعدادات Codemagic (Automatic code signing مع حساب App Store Connect)
وأزل التعليق عن كتلة `ios_signing`.

## الأذونات المعرّفة في Info.plist
الكاميرا، مكتبة الصور، الميكروفون، الموقع، مستشعرات الحركة (القبلة)، وتتبع الإعلانات،
بالإضافة إلى `ITSAppUsesNonExemptEncryption = false` و`UIBackgroundModes` (صوت الأذان + الإشعارات).

## الأيقونات وشاشة البداية
- أيقونة 1024×1024 بدون شفافية: `ios/App/App/Assets.xcassets/AppIcon.appiconset`
- شاشة البداية: `Splash.imageset` (خلفية `#0a1f1a` + الشعار) عبر `LaunchScreen.storyboard`

## ملفات Swift المساعدة
موجودة في `ios/native-helpers/` (جدولة الأذان الأصلية). أضفها إلى هدف `App` في Xcode
عند الحاجة لجدولة إشعارات الأذان محلياً — ليست مطلوبة للبناء.

## ملاحظات المراجعة في App Store
- أدوات تنزيل الوسائط (TikTok/YouTube) قد تُرفض حسب البند 5.2.3؛ يُفضّل إخفاؤها في نسخة المتجر.
- إعلانات AdSense للويب لا تُقبل داخل التطبيقات — استخدم AdMob بدلاً منها قبل الرفع.
