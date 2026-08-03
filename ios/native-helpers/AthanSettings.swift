import Foundation
import Observation

enum AthanSound: String, Codable, CaseIterable, Identifiable {
    case makkah, madinah, fajr, defaultSystem
    var id: String { rawValue }

    /// Bundled .caf filename (must be < 30s, included in app bundle).
    var fileName: String? {
        switch self {
        case .makkah:        return "athan_makkah.caf"
        case .madinah:       return "athan_madinah.caf"
        case .fajr:          return "athan_fajr.caf"
        case .defaultSystem: return nil
        }
    }
}

@Observable
@MainActor
final class AthanSettings: Codable {
    var enabled: Bool = false
    var preReminderMinutes: Int = 0          // 0, 5, 10, 15, 20
    var soundFajr: AthanSound = .fajr
    var soundOther: AthanSound = .makkah
    var criticalAlertsEnabled: Bool = false
    var mutedDates: Set<String> = []         // "yyyy-MM-dd" in user's calendar

    enum CodingKeys: String, CodingKey {
        case enabled, preReminderMinutes, soundFajr, soundOther, criticalAlertsEnabled, mutedDates
    }

    private static let key = "athan.settings.v1"

    static func load() -> AthanSettings {
        guard
            let data = UserDefaults.standard.data(forKey: key),
            let decoded = try? JSONDecoder().decode(AthanSettings.self, from: data)
        else { return AthanSettings() }
        return decoded
    }

    func save() {
        if let data = try? JSONEncoder().encode(self) {
            UserDefaults.standard.set(data, forKey: Self.key)
        }
    }

    static func todayKey(_ date: Date = Date()) -> String {
        let f = DateFormatter()
        f.calendar = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: date)
    }
}
