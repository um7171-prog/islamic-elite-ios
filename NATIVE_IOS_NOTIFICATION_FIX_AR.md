# إصلاح إشعارات iPhone الأصلي

تم نقل مسار إشعارات iOS للصلاة والمواعيد والأذكار إلى UserNotifications الأصلي في Swift مباشرة.

- الملف الجديد: `ios/App/App/NativeNotificationPlugin.swift`
- يستخدم `UNUserNotificationCenter` و `UNCalendarNotificationTrigger` مباشرة.
- يتحقق من Pending من iOS نفسه بعد الإضافة.
- يحذف فقط نطاق IDs الخاص بكل مجموعة.
- الأصوات المخصصة `.caf` تبقى مدعومة.
- Android يبقى على Capacitor Local Notifications بدون تغيير.
- `AppDelegate` يعرض banner + sound + badge إذا حل موعد الإشعار والتطبيق مفتوح.

ملاحظة البناء: تعذر تشغيل `npm run build` داخل بيئة التسليم لأن registry الداخلي لم يوفر حزمة `tsx` عند محاولة `npx` تنزيلها. هذا عائق في بيئة التسليم وليس خطأ TypeScript ظهر من المشروع. بناء iOS/Swift النهائي يجب أن يتم على Codemagic/macOS كما في workflow الموجود.
