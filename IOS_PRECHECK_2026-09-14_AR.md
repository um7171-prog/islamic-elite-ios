# تقرير الفحص قبل إصدار iOS — النخبة الإسلامية
**تاريخ الفحص:** 2026-09-14

## ✅ جاهز للبناء
- `PRODUCT_BUNDLE_IDENTIFIER` متطابق حرفيًا بين `project.pbxproj` و`capacitor.config.ts` و`codemagic.yaml` (`com.techsnds.islamicelite`).
- `CODE_SIGN_STYLE = Automatic` في `project.pbxproj` متسق مع `signingStyle: automatic` في `ExportOptions.plist` وخطوة `xcode-project use-profiles`.
- كل ملفات `.caf` المستخدمة فعليًا في الكود — بما فيها الأصوات الأربعة القابلة للاختيار في `athanSettings.ts` (`athan_makkah/madinah/fajr/ibnMajid.caf`) وأصوات التذكير (`astaghfirullah.caf`, `notif_bell.caf`, `notif_chime.caf`) — موجودة فعليًا في `ios/App/App/` **و** مسجَّلة في "Copy Bundle Resources" داخل `project.pbxproj`.
- آلية الحماية وقت البناء (`nativeSoundFile()` / `isNativeSoundBundled()` في `athanSettings.ts`، مبنية على `__BUNDLED_CAFS__` من `vite.config.ts`) تمنع فعليًا جدولة أي صوت غير مضمَّن فعلًا، وتتراجع للصوت الافتراضي بدل إشعار صامت — تصميم جيد ومطبَّق بالكامل.
- `LocalNotifications.presentationOptions` في `capacitor.config.ts` تتضمن `sound`.
- `ensureNativePermission()` يُستدعى فعليًا قبل أي جدولة (`AthanSettingsCard.tsx`، وداخليًا في `nativeAthan.ts`).
- كل إذن مُعلن في `Info.plist` له مسار كود فعلي يستخدمه: الكاميرا (`DocumentScannerDialog.tsx`, `QRScannerDialog.tsx` عبر `getUserMedia`)، الموقع والحركة (`useQiblaCompass.ts`)، وحفظ الصور (`DownloadManager.tsx`).
- `aps-environment: production` في entitlements يطابق الافتراضي الفعلي في `send-announcement-push` (يستخدم `api.push.apple.com` ما لم يُضبط `APNS_ENV=sandbox` صراحة كمتغير بيئة).
- لا كتابة مباشرة من العميل على جدول `device_tokens` — التسجيل والتعطيل يمران حصرًا عبر `register-device-token` (service role)، وهذا مثبَّت بحماية RLS حديثة جدًا (migration `20260913120100_lock_device_tokens_writes`)، وكل كتابة مُقيَّدة بالتوكن نفسه (`onConflict: "token"` / `.eq("token", token)`) فلا يمكن لطلب واحد التأثير على جهاز آخر.
- `UIBackgroundModes: audio` له استخدام فعلي واضح (تشغيل تلاوة القرآن في الخلفية عبر `QuranDialog.tsx`, `MushafReader.tsx`, `reciters.ts`) — ليس علمًا مُعلنًا بلا مبرر.

## 🔴 أخطاء حرجة تمنع بناء أو رفع IPA
- **متغيرات بيئة Supabase غير مُعرَّفة في `codemagic.yaml`.** يعتمد `src/integrations/supabase/client.ts` على `import.meta.env.VITE_SUPABASE_URL` و`VITE_SUPABASE_PUBLISHABLE_KEY`، وهما يُضمَّنان بشكل ثابت في الحزمة وقت `npm run build` (Vite). لا يوجد `.env` داخل المستودع (مستبعد عمدًا عبر `.gitignore`، وهذا صحيح أمنيًا)، ولا يظهر أي `environment.groups` أو `vars` لهذين المفتاحين في أي من الـ workflows بـ`codemagic.yaml`. إن لم تكونا مُضافتين مباشرة كمتغيرات بيئة في إعدادات Codemagic (خارج المستودع)، فسيُبنى التطبيق بعميل Supabase يحمل قيمًا فارغة — تتعطل حينها كل ميزة تعتمد عليه (تسجيل الدخول، تسجيل push token عبر `register-device-token`، الإعلانات، الترجمة، OCR) دون أي خطأ ظاهر وقت البناء، وغالبًا تظهر كشاشة بيضاء عند التشغيل الفعلي.
  **الإجراء المطلوب:** تأكيد وجود هذين المتغيرين في Codemagic → إعدادات التطبيق/الـ workflow → Environment variables، قبل أي بناء.

## 🟠 مشاكل توقيع أو Codemagic
- تكامل App Store Connect في workflow `ios-release-signed` معرَّف باسم `codemagic_api_key`، وبجانبه تعليق TODO صريح في الملف نفسه: "create an App Store Connect integration ... and put its exact name here". هذا يوحي بأن القيمة قد تكون لا تزال placeholder ولم تُستبدل باسم تكامل فعلي مُهيأ في Codemagic (Team settings → Integrations). إن لم يتطابق الاسم مع تكامل حقيقي، ستفشل خطوة "Fetch signing files" فور أول تشغيل لهذا الـ workflow.
- `agvtool new-marketing-version "1.0.0"` قيمة ثابتة في كلا الـ workflows (الموقَّع وغير الموقَّع). تتفق حاليًا مع `APP_VERSION = "1.0.0"` الثابتة في `vite.config.ts`، لكن لا توجد آلية تلقائية تربط المصدرين — عند الحاجة لرفع 1.0.1 مستقبلًا يجب تذكّر تحديث كلا الموضعين يدويًا، وإلا سيختلف رقم الإصدار المعروض عن رقم iOS الفعلي.
- `$BUILD_NUMBER` يُستخدم في خطوة "Set version and build number" لكن لا تعريف له ضمن أي `vars:` في `codemagic.yaml` — يجب التأكد أنه مضبوط كمتغير بيئة في Codemagic (تلقائي أو يدوي)، وإلا فقد تفشل الخطوة أو يُضبط رقم بناء فارغ/غير صالح.

## 🔔 مشاكل الإشعارات
### إشعارات محلية (الأذان / مواقيت الصلاة)
لا توجد مشاكل حرجة أو متوسطة. الآلية المزدوجة (ملف موجود + مسجَّل في Xcode) مطبَّقة بالكامل وتُختبر ديناميكيًا قبل كل جدولة. عند إضافة صوت جديد مستقبلًا، يجب تكرار نفس الفحص المزدوج قبل استخدامه في `athanSettings.ts`.

### إشعارات عن بُعد (APNs / Push)
لا توجد مشاكل حرجة ظاهرة في مسار APNs نفسه (`send-announcement-push`, `register-device-token`) بناءً على الفحص الثابت.

**توضيح مهم يصحح افتراضًا سابقًا في مرجع هذه المهارة:** دالة `send-prayer-pushes` **ليست** جزءًا من قناة APNs إطلاقًا — هي Web Push (VAPID) لمستخدمي الموقع (PWA) فقط، منفصلة تمامًا عن قناة push الخاصة بتطبيق iOS ولا علاقة لها بمواقيت الصلاة داخل التطبيق نفسه (تلك محلية بالكامل عبر `nativeAthan.ts`). سأحدّث ملف `references/apns-push-checks.md` لإزالة هذا الالتباس في الفحوصات القادمة.

## 🔊 الأصوات والأذونات
- إذن `NSPhotoLibraryAddUsageDescription` مُعلن في `Info.plist`، لكن مسار "الحفظ في المعرض" الوحيد في الكود (`DownloadManager.tsx: saveToGallery`) يعتمد على Web Share API (`navigator.share` مع ملف) الذي يُسلّم الملف لصفحة المشاركة النظامية في iOS — وليس على استدعاء مباشر لمكتبة الصور من كود التطبيق (لا يوجد `@capacitor/camera` أو `@capacitor/filesystem` في `package.json`). يحتاج تأكيدًا على جهاز حقيقي: هل يُستهلك هذا الإذن فعليًا عبر هذا المسار، أم أنه لم يعد ضروريًا بصيغته الحالية؟

## 📱 نقاط تحتاج اختبارًا على جهاز iPhone حقيقي
1. تسليم push فعلي عبر بيئة APNs الإنتاجية (صلاحية مفتاح `.p8` وتطابقه لا يمكن التحقق منهما من الكود).
2. سماع أصوات الأذان/التذكير المخصصة فعليًا عند وصول إشعار حقيقي (وليس فقط التحقق من تسجيلها).
3. صلاحية بروفايل توقيع Distribution ومطابقته الفعلية لـ `aps-environment: production`.
4. نجاح مسار "الحفظ في المعرض" عبر Web Share في حفظ الصورة/الفيديو فعليًا داخل تطبيق الصور.
5. استمرار تشغيل تلاوة القرآن في الخلفية فعليًا عند قفل الشاشة (للتأكد من عمل `UIBackgroundModes: audio` كما هو متوقع).
6. تأكيد أن كل متغيرات Codemagic البيئية (`VITE_SUPABASE_*`, `APNS_KEY_ID/TEAM_ID/PRIVATE_KEY`, `VAPID_*`, `CRON_SECRET`) مضبوطة فعليًا في لوحة Codemagic — غير مرئية من داخل المستودع ولا يمكن فحصها ملفيًا.

## 🏁 الحكم النهائي
**غير جاهز للرفع مباشرة.** يوجد خطر حرج واحد يجب تأكيده قبل أي بناء: أن متغيرات بيئة Supabase (`VITE_SUPABASE_URL` / `VITE_SUPABASE_PUBLISHABLE_KEY`) مُعرَّفة فعليًا في إعدادات Codemagic، وإلا فسيُبنى تطبيق لا يعمل رغم نجاح البناء ظاهريًا. كذلك يجب تأكيد أن تكامل App Store Connect المسمى `codemagic_api_key` مُهيأ فعليًا وليس قيمة placeholder متروكة من التعليق TODO في الملف. أما جانب الإشعارات (المحلية والـ APNs) والأذونات فمبني بعناية حقيقية على مستوى الكود ولا توجد فيه ثغرات حرجة ظاهرة — لكنه يحتاج تأكيدًا فعليًا على جهاز قبل الرفع النهائي كما هو مذكور أعلاه.
