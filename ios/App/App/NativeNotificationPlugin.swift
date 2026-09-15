import Foundation
import Capacitor
import UserNotifications

@objc(NativeNotificationPlugin)
public class NativeNotificationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeNotificationPlugin"
    public let jsName = "NativeNotification"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "ensurePermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleGroup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pendingGroup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelGroup", returnType: CAPPluginReturnPromise)
    ]

    private let center = UNUserNotificationCenter.current()

    private struct ParsedNotification {
        let id: Int
        let title: String
        let body: String
        let atMs: Double
        let sound: String
        let extra: [String: Any]?
    }

    private func intValue(_ value: Any?) -> Int? {
        if let number = value as? NSNumber { return number.intValue }
        if let value = value as? Int { return value }
        if let value = value as? Double { return Int(value) }
        if let value = value as? String { return Int(value) }
        return nil
    }

    private func doubleValue(_ value: Any?) -> Double? {
        if let number = value as? NSNumber { return number.doubleValue }
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? String { return Double(value) }
        return nil
    }

    @objc func ensurePermission(_ call: CAPPluginCall) {
        center.getNotificationSettings { settings in
            print("[notify:native] ensurePermission — authorizationStatus=\(settings.authorizationStatus.rawValue)")
            switch settings.authorizationStatus {
            case .authorized:
                call.resolve(["granted": true, "status": "authorized"])
            case .provisional:
                call.resolve(["granted": false, "status": "provisional"])
            case .ephemeral:
                call.resolve(["granted": false, "status": "ephemeral"])
            case .notDetermined:
                print("[notify:native] status notDetermined — calling requestAuthorization (this is the ONLY place this custom plugin ever prompts)")
                self.center.requestAuthorization(options: [.alert, .sound, .badge]) { granted, error in
                    if let error = error {
                        print("[notify:native] requestAuthorization ERROR: \(error.localizedDescription)")
                        call.reject("Notification permission error: \(error.localizedDescription)")
                        return
                    }
                    print("[notify:native] requestAuthorization result — granted=\(granted)")
                    call.resolve(["granted": granted, "status": granted ? "authorized" : "denied"])
                }
            default:
                call.resolve(["granted": false, "status": "denied"])
            }
        }
    }

    @objc func scheduleGroup(_ call: CAPPluginCall) {
        guard let minId = call.getInt("minId"), let maxId = call.getInt("maxId") else {
            call.reject("Missing notification id range")
            return
        }

        let raw = call.getArray("items", JSObject.self) ?? []
        let nowMs = Date().timeIntervalSince1970 * 1000

        let parsed: [ParsedNotification] = raw.compactMap { item in
            guard let id = self.intValue(item["id"]),
                  id >= minId, id <= maxId,
                  let title = item["title"] as? String,
                  let body = item["body"] as? String,
                  let atMs = self.doubleValue(item["atMs"]),
                  atMs > nowMs + 1000 else {
                return nil
            }

            return ParsedNotification(
                id: id,
                title: title,
                body: body,
                atMs: atMs,
                sound: (item["sound"] as? String) ?? "default",
                extra: item["extra"] as? [String: Any]
            )
        }

        let desiredIds = Set(parsed.map { String($0.id) })

        center.getPendingNotificationRequests { existing in
            let existingInRange = existing.compactMap { request -> String? in
                guard let id = Int(request.identifier), id >= minId, id <= maxId else { return nil }
                return request.identifier
            }

            // Remove only stale requests. Requests with the same identifier are
            // replaced by UNUserNotificationCenter.add(), so a transient add
            // failure cannot wipe every previously valid notification first.
            let stale = existingInRange.filter { !desiredIds.contains($0) }
            if !stale.isEmpty {
                self.center.removePendingNotificationRequests(withIdentifiers: stale)
            }

            // An empty rebuild intentionally clears this feature's range.
            guard !parsed.isEmpty else {
                self.center.getPendingNotificationRequests { pending in
                    let ids = pending.compactMap { request -> Int? in
                        guard let id = Int(request.identifier), id >= minId, id <= maxId else { return nil }
                        return id
                    }.sorted()
                    call.resolve(["acceptedIds": [], "verifiedIds": ids, "errors": []])
                }
                return
            }

            let group = DispatchGroup()
            let lock = NSLock()
            var accepted: [Int] = []
            var errors: [String] = []

            for item in parsed {
                let content = UNMutableNotificationContent()
                content.title = item.title
                content.body = item.body
                content.sound = item.sound == "default"
                    ? .default
                    : UNNotificationSound(named: UNNotificationSoundName(rawValue: item.sound))
                if let extra = item.extra {
                    content.userInfo = extra
                }

                let target = Date(timeIntervalSince1970: item.atMs / 1000)
                var calendar = Calendar(identifier: .gregorian)
                calendar.timeZone = .current
                let components = calendar.dateComponents(
                    [.year, .month, .day, .hour, .minute, .second],
                    from: target
                )
                let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
                let request = UNNotificationRequest(
                    identifier: String(item.id),
                    content: content,
                    trigger: trigger
                )

                group.enter()
                self.center.add(request) { error in
                    lock.lock()
                    if let error = error {
                        errors.append("#\(item.id):\(error.localizedDescription)")
                    } else {
                        accepted.append(item.id)
                    }
                    lock.unlock()
                    group.leave()
                }
            }

            group.notify(queue: .global()) {
                self.center.getPendingNotificationRequests { pending in
                    let ids = pending.compactMap { request -> Int? in
                        guard let id = Int(request.identifier), id >= minId, id <= maxId else { return nil }
                        return id
                    }.sorted()

                    print(
                        "[notify:native] range=\(minId)-\(maxId) raw=\(raw.count) parsed=\(parsed.count) accepted=\(accepted.count) pending=\(ids.count) errors=\(errors.count)"
                    )
                    call.resolve([
                        "acceptedIds": accepted.sorted(),
                        "verifiedIds": ids,
                        "errors": errors
                    ])
                }
            }
        }
    }

    @objc func pendingGroup(_ call: CAPPluginCall) {
        guard let minId = call.getInt("minId"), let maxId = call.getInt("maxId") else {
            call.reject("Missing range")
            return
        }

        center.getPendingNotificationRequests { pending in
            let ids = pending.compactMap { request -> Int? in
                guard let id = Int(request.identifier), id >= minId, id <= maxId else { return nil }
                return id
            }.sorted()
            call.resolve(["ids": ids])
        }
    }

    @objc func cancelGroup(_ call: CAPPluginCall) {
        guard let minId = call.getInt("minId"), let maxId = call.getInt("maxId") else {
            call.reject("Missing range")
            return
        }

        center.getPendingNotificationRequests { pending in
            let ids = pending.compactMap { request -> String? in
                guard let id = Int(request.identifier), id >= minId, id <= maxId else { return nil }
                return request.identifier
            }
            self.center.removePendingNotificationRequests(withIdentifiers: ids)
            call.resolve()
        }
    }
}
