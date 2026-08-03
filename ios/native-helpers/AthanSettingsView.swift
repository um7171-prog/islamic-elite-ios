import SwiftUI
import UserNotifications

struct AthanSettingsView: View {
    @Bindable var settings: AthanSettings
    var onChange: () -> Void = {}

    @State private var permission: UNAuthorizationStatus = .notDetermined

    private let preReminderOptions = [0, 5, 10, 15, 20]

    var body: some View {
        Form {
            Section {
                Toggle(isOn: Binding(
                    get: { settings.enabled },
                    set: { newValue in
                        Task {
                            if newValue {
                                let granted = await AthanScheduler.shared
                                    .requestAuthorization(critical: settings.criticalAlertsEnabled)
                                guard granted else { return }
                            }
                            settings.enabled = newValue
                            persist()
                        }
                    }
                )) {
                    Label("Athan Notifications", systemImage: "bell.badge.fill")
                }

                if permission != .authorized {
                    Label("Notification permission required", systemImage: "exclamationmark.triangle")
                        .foregroundStyle(.orange)
                        .font(.caption)
                }
            }

            Section("Pre-reminder") {
                Picker("Minutes before", selection: $settings.preReminderMinutes) {
                    ForEach(preReminderOptions, id: \.self) { m in
                        Text(m == 0 ? "Off" : "\(m) min").tag(m)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: settings.preReminderMinutes) { _, _ in persist() }
            }

            Section("Sound") {
                Picker("Fajr", selection: $settings.soundFajr) {
                    ForEach(AthanSound.allCases) { Text($0.rawValue.capitalized).tag($0) }
                }
                .onChange(of: settings.soundFajr) { _, _ in persist() }

                Picker("Other prayers", selection: $settings.soundOther) {
                    ForEach(AthanSound.allCases) { Text($0.rawValue.capitalized).tag($0) }
                }
                .onChange(of: settings.soundOther) { _, _ in persist() }

                Toggle("Critical alerts (override silent)", isOn: $settings.criticalAlertsEnabled)
                    .onChange(of: settings.criticalAlertsEnabled) { _, _ in persist() }
            }

            Section {
                let today = AthanSettings.todayKey()
                let isMuted = settings.mutedDates.contains(today)
                Button(role: isMuted ? .none : .destructive) {
                    if isMuted { settings.mutedDates.remove(today) }
                    else       { settings.mutedDates.insert(today) }
                    persist()
                } label: {
                    Label(
                        isMuted ? "Unmute today" : "Mute today",
                        systemImage: isMuted ? "speaker.wave.2" : "speaker.slash"
                    )
                }
            }
        }
        .navigationTitle("Athan")
        .task {
            let s = await UNUserNotificationCenter.current().notificationSettings()
            permission = s.authorizationStatus
        }
    }

    private func persist() {
        settings.save()
        onChange()
    }
}
