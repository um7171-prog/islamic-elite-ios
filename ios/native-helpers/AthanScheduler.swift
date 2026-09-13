import Foundation
import UserNotifications
import Adhan

/// Schedules local Athan notifications using UNUserNotificationCenter.
/// Identifier scheme: `athan.<yyyyMMdd>.<prayerKey>.<athan|pre>`
@MainActor
final class AthanScheduler {
    static let shared = AthanScheduler()
    static let trustedWebOrigins = ["https://www.techsnds.com", "https://techsnds.com"]
    private init() { registerCategories() }

    private let center = UNUserNotificationCenter.current()

    // MARK: - Authorization

    /// Request alert/sound/badge. Pass `critical: true` only if your app has
    /// the `com.apple.developer.usernotifications.critical-alerts` entitlement.
    func requestAuthorization(critical: Bool = false) async -> Bool {
        var options: UNAuthorizationOptions = [.alert, .sound, .badge]
        if critical { options.insert(.criticalAlert) }
        do {
            return try await center.requestAuthorization(options: options)
        } catch {
            return false
        }
    }

    func authorizationStatus() async -> UNAuthorizationStatus {
        let settings = await center.notificationSettings()
        return settings.authorizationStatus
    }

    // MARK: - Categories / Actions

    private func registerCategories() {
        let prayed = UNNotificationAction(
            identifier: "ATHAN_PRAYED",
            title: NSLocalizedString("Mark as prayed", comment: ""),
            options: [.foreground]
        )
        let snooze = UNNotificationAction(
            identifier: "ATHAN_SNOOZE",
            title: NSLocalizedString("Snooze 5 min", comment: ""),
            options: []
        )
        let mute = UNNotificationAction(
            identifier: "ATHAN_MUTE_TODAY",
            title: NSLocalizedString("Mute today", comment: ""),
            options: [.destructive]
        )
        let category = UNNotificationCategory(
            identifier: "ATHAN_CATEGORY",
            actions: [prayed, snooze, mute],
            intentIdentifiers: [],
            options: []
        )
        center.setNotificationCategories([category])
    }

    // MARK: - Public API

    struct DayPrayerTimes {
        let date: Date
        let prayers: PrayerTimes   // from Adhan
    }

    /// Cancel all prior Athan notifications and schedule the upcoming `days` days.
    func reschedule(days: [DayPrayerTimes], settings: AthanSettings) async {
        // Always start from a clean slate for our identifiers
        let pending = await center.pendingNotificationRequests()
        let athanIds = pending
            .map { $0.identifier }
            .filter { $0.hasPrefix("athan.") }
        center.removePendingNotificationRequests(withIdentifiers: athanIds)

        guard settings.enabled else { return }

        let mutedKeys = settings.mutedDates
        let prayerOrder: [Prayer] = [.fajr, .dhuhr, .asr, .maghrib, .isha]

        for day in days {
            let dayKey = AthanSettings.todayKey(day.date)
            if mutedKeys.contains(dayKey) { continue }

            for prayer in prayerOrder {
                let time = day.prayers.time(for: prayer)
                if time < Date() { continue }

                // Athan
                await schedule(
                    at: time,
                    prayer: prayer,
                    dayKey: dayKey,
                    isPre: false,
                    settings: settings
                )

                // Pre-reminder
                if settings.preReminderMinutes > 0 {
                    let pre = time.addingTimeInterval(-Double(settings.preReminderMinutes) * 60)
                    if pre > Date() {
                        await schedule(
                            at: pre,
                            prayer: prayer,
                            dayKey: dayKey,
                            isPre: true,
                            settings: settings
                        )
                    }
                }
            }
        }
    }

    func cancelAll() {
        center.removeAllPendingNotificationRequests()
    }

    // MARK: - Internals

    private func schedule(
        at date: Date,
        prayer: Prayer,
        dayKey: String,
        isPre: Bool,
        settings: AthanSettings
    ) async {
        let content = UNMutableNotificationContent()
        let names = Self.localizedName(for: prayer)
        if isPre {
            content.title = String(
                format: NSLocalizedString("Reminder: %@ in %d min", comment: ""),
                names.localized, settings.preReminderMinutes
            )
            content.body = NSLocalizedString("Prepare for prayer", comment: "")
            content.sound = .default
        } else {
            content.title = String(
                format: NSLocalizedString("It's time for %@", comment: ""),
                names.localized
            )
            content.body = NSLocalizedString("Hayya 'ala-s-salah", comment: "")
            let sound: AthanSound = (prayer == .fajr) ? settings.soundFajr : settings.soundOther
            if let file = sound.fileName {
                let name = UNNotificationSoundName(rawValue: file)
                content.sound = settings.criticalAlertsEnabled
                    ? .defaultCriticalSound(withAudioVolume: 1.0)
                    : UNNotificationSound(named: name)
            } else {
                content.sound = .default
            }
        }
        content.categoryIdentifier = "ATHAN_CATEGORY"
        content.userInfo = ["prayer": prayer.rawValue, "day": dayKey, "pre": isPre]

        let comps = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: date
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: comps, repeats: false)

        let id = "athan.\(dayKey).\(prayer.rawValue).\(isPre ? "pre" : "athan")"
        let request = UNNotificationRequest(identifier: id, content: content, trigger: trigger)
        try? await center.add(request)
    }

    private struct LocalizedNames { let en: String; let ar: String
        var localized: String {
            Locale.current.language.languageCode?.identifier == "ar" ? ar : en
        }
    }

    private static func localizedName(for prayer: Prayer) -> LocalizedNames {
        switch prayer {
        case .fajr:    return .init(en: "Fajr",    ar: "الفجر")
        case .sunrise: return .init(en: "Sunrise", ar: "الشروق")
        case .dhuhr:   return .init(en: "Dhuhr",   ar: "الظهر")
        case .asr:     return .init(en: "Asr",     ar: "العصر")
        case .maghrib: return .init(en: "Maghrib", ar: "المغرب")
        case .isha:    return .init(en: "Isha",    ar: "العشاء")
        }
    }
}

// Helper so Prayer can be encoded into userInfo by raw string
private extension Prayer {
    var rawValue: String {
        switch self {
        case .fajr: return "fajr"
        case .sunrise: return "sunrise"
        case .dhuhr: return "dhuhr"
        case .asr: return "asr"
        case .maghrib: return "maghrib"
        case .isha: return "isha"
        }
    }
}
