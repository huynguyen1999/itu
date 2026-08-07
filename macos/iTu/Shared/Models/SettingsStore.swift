import Foundation
import Observation
import AppKit
import UserNotifications

@MainActor
@Observable
final class SystemNotificationManager {
    static let shared = SystemNotificationManager()

    private let center = UNUserNotificationCenter.current()
    private(set) var authorizationStatus: UNAuthorizationStatus = .notDetermined

    private init() {}

    var isAuthorized: Bool {
        authorizationStatus == .authorized || authorizationStatus == .provisional
    }

    var statusLabel: String {
        switch authorizationStatus {
        case .authorized, .provisional: "macOS system notifications are enabled."
        case .denied: "macOS system notifications are blocked."
        case .notDetermined: "Desktop alerts are not enabled yet."
        @unknown default: "Notification permission is unavailable."
        }
    }

    func refreshStatus() async {
        let status = await withCheckedContinuation { continuation in
            center.getNotificationSettings { settings in
                continuation.resume(returning: settings.authorizationStatus)
            }
        }
        authorizationStatus = status
    }

    func requestAuthorization() async {
        _ = await withCheckedContinuation { continuation in
            center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                continuation.resume(returning: granted)
            }
        }
        await refreshStatus()
    }

    func openSystemSettings() {
        guard let url = URL(string: "x-apple.systempreferences:com.apple.Notifications-Settings.extension") else { return }
        NSWorkspace.shared.open(url)
    }

    func deliver(title: String, body: String, identifier: String) {
        guard isAuthorized else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = .default
        center.add(UNNotificationRequest(identifier: identifier, content: content, trigger: nil))
    }
}

enum DefaultTaskDate: String, Codable, CaseIterable, Identifiable {
    case none = "NONE"
    case today = "TODAY"
    case tomorrow = "TOMORROW"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .none: "No date"
        case .today: "Today at 6:00 PM"
        case .tomorrow: "Tomorrow at 6:00 PM"
        }
    }
}

enum AppThemeMode: String, Codable, CaseIterable, Identifiable {
    case system = "system"
    case light = "light"
    case dark = "dark"

    var id: String { rawValue }

    var label: String {
        switch self {
        case .system: "System Default"
        case .light: "Light Mode"
        case .dark: "Dark Mode"
        }
    }
}

struct TaskDefaultsSettings: Codable, Equatable {
    var date: DefaultTaskDate = .none
    var priority: TaskPriority = .none
    var taskListId: String = ""
}

enum MenuBarDisplayMode: String, Codable, CaseIterable, Identifiable, Hashable {
    case remainingTime
    case circularProgress

    var id: String { rawValue }

    var label: String {
        switch self {
        case .remainingTime: "Remaining time"
        case .circularProgress: "Circular progress"
        }
    }
}

struct BlockedApplication: Codable, Hashable, Identifiable {
    var bundleIdentifier: String
    var displayName: String

    var id: String { bundleIdentifier }
}

enum SupportedBrowser: String, Codable, CaseIterable, Identifiable, Hashable {
    case safari
    case chrome
    case edge
    case brave
    case vivaldi
    case opera
    case sidekick
    case arc

    var id: String { rawValue }

    var bundleIdentifier: String {
        switch self {
        case .safari: "com.apple.Safari"
        case .chrome: "com.google.Chrome"
        case .edge: "com.microsoft.edgemac"
        case .brave: "com.brave.Browser"
        case .vivaldi: "com.vivaldi.Vivaldi"
        case .opera: "com.operasoftware.Opera"
        case .sidekick: "com.pushplaylabs.sidekick"
        case .arc: "company.thebrowser.Browser"
        }
    }

    var displayName: String {
        switch self {
        case .safari: "Safari"
        case .chrome: "Google Chrome"
        case .edge: "Microsoft Edge"
        case .brave: "Brave"
        case .vivaldi: "Vivaldi"
        case .opera: "Opera"
        case .sidekick: "Sidekick"
        case .arc: "Arc"
        }
    }

    /// Supported browsers are selected by default; users can narrow this list in Focus Policy.
    static var defaultSelection: [SupportedBrowser] { allCases }
}

struct FocusSettings: Codable, Equatable, Hashable {
    var defaultWorkMinutes: Int = 30
    var shortBreakMinutes: Int = 5
    var longBreakMinutes: Int = 15
    var cyclesBeforeLongBreak: Int = 4
    var countExceededFocusTime: Bool = true
    var finishSoundEnabled: Bool = true
    var desktopNotificationEnabled: Bool = true
    var compactAudio: Bool = true
    var showMenuBarItem: Bool = true
    var menuBarDisplayMode: MenuBarDisplayMode = .remainingTime
    var autoStartBreaks: Bool = false
    var autoStartWork: Bool = false
    var focusPolicyEnabled: Bool = false
    var blockedApplications: [BlockedApplication] = []
    var blockedWebsitePatterns: [String] = []
    var enabledBrowsers: [SupportedBrowser] = SupportedBrowser.defaultSelection

    var overtimeEnabled: Bool {
        get { countExceededFocusTime }
        set { countExceededFocusTime = newValue }
    }

    private enum CodingKeys: String, CodingKey {
        case defaultWorkMinutes
        case shortBreakMinutes
        case longBreakMinutes
        case cyclesBeforeLongBreak
        case countExceededFocusTime
        case finishSoundEnabled
        case desktopNotificationEnabled
        case compactAudio
        case showMenuBarItem
        case menuBarDisplayMode
        case autoStartBreaks
        case autoStartWork
        case focusPolicyEnabled
        case blockedApplications
        case blockedWebsitePatterns
        case enabledBrowsers
    }

    private enum LegacyCodingKeys: String, CodingKey {
        case overtimeEnabled
    }

    init(
        defaultWorkMinutes: Int = 30,
        shortBreakMinutes: Int = 5,
        longBreakMinutes: Int = 15,
        cyclesBeforeLongBreak: Int = 4,
        countExceededFocusTime: Bool = true,
        finishSoundEnabled: Bool = true,
        desktopNotificationEnabled: Bool = true,
        compactAudio: Bool = true,
        showMenuBarItem: Bool = true,
        menuBarDisplayMode: MenuBarDisplayMode = .remainingTime,
        autoStartBreaks: Bool = false,
        autoStartWork: Bool = false,
        focusPolicyEnabled: Bool = false,
        blockedApplications: [BlockedApplication] = [],
        blockedWebsitePatterns: [String] = [],
        enabledBrowsers: [SupportedBrowser] = SupportedBrowser.defaultSelection
    ) {
        self.defaultWorkMinutes = defaultWorkMinutes
        self.shortBreakMinutes = shortBreakMinutes
        self.longBreakMinutes = longBreakMinutes
        self.cyclesBeforeLongBreak = cyclesBeforeLongBreak
        self.countExceededFocusTime = countExceededFocusTime
        self.finishSoundEnabled = finishSoundEnabled
        self.desktopNotificationEnabled = desktopNotificationEnabled
        self.compactAudio = compactAudio
        self.showMenuBarItem = showMenuBarItem
        self.menuBarDisplayMode = menuBarDisplayMode
        self.autoStartBreaks = autoStartBreaks
        self.autoStartWork = autoStartWork
        self.focusPolicyEnabled = focusPolicyEnabled
        self.blockedApplications = blockedApplications
        self.blockedWebsitePatterns = blockedWebsitePatterns
        self.enabledBrowsers = enabledBrowsers
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let legacyValues = try? decoder.container(keyedBy: LegacyCodingKeys.self)
        let overtimeDecoded = try values.decodeIfPresent(Bool.self, forKey: .countExceededFocusTime)
            ?? (try legacyValues?.decodeIfPresent(Bool.self, forKey: .overtimeEnabled) ?? true)
        self.init(
            defaultWorkMinutes: try values.decodeIfPresent(Int.self, forKey: .defaultWorkMinutes) ?? 30,
            shortBreakMinutes: try values.decodeIfPresent(Int.self, forKey: .shortBreakMinutes) ?? 5,
            longBreakMinutes: try values.decodeIfPresent(Int.self, forKey: .longBreakMinutes) ?? 15,
            cyclesBeforeLongBreak: try values.decodeIfPresent(Int.self, forKey: .cyclesBeforeLongBreak) ?? 4,
            countExceededFocusTime: overtimeDecoded,
            finishSoundEnabled: try values.decodeIfPresent(Bool.self, forKey: .finishSoundEnabled) ?? true,
            desktopNotificationEnabled: try values.decodeIfPresent(Bool.self, forKey: .desktopNotificationEnabled) ?? true,
            compactAudio: try values.decodeIfPresent(Bool.self, forKey: .compactAudio) ?? true,
            showMenuBarItem: try values.decodeIfPresent(Bool.self, forKey: .showMenuBarItem) ?? true,
            menuBarDisplayMode: try values.decodeIfPresent(MenuBarDisplayMode.self, forKey: .menuBarDisplayMode) ?? .remainingTime,
            autoStartBreaks: try values.decodeIfPresent(Bool.self, forKey: .autoStartBreaks) ?? false,
            autoStartWork: try values.decodeIfPresent(Bool.self, forKey: .autoStartWork) ?? false,
            focusPolicyEnabled: try values.decodeIfPresent(Bool.self, forKey: .focusPolicyEnabled) ?? false,
            blockedApplications: try values.decodeIfPresent([BlockedApplication].self, forKey: .blockedApplications) ?? [],
            blockedWebsitePatterns: try values.decodeIfPresent([String].self, forKey: .blockedWebsitePatterns) ?? [],
            enabledBrowsers: try values.decodeIfPresent([SupportedBrowser].self, forKey: .enabledBrowsers) ?? SupportedBrowser.defaultSelection
        )
    }
}

struct MatrixSettings: Codable, Equatable {
    var urgentDueWithinDays: Int = 2
    var urgentPriorities: [TaskPriority] = [.high]
    var importantPriorities: [TaskPriority] = [.high]
    var showCompleted: Bool = true
    var showWontDo: Bool = true
    var sortOption: MatrixSortOption = .manual
}

@MainActor
@Observable
final class SettingsStore {
    /// Central settings-change hook so every mutation source (main Settings
    /// page, the macOS Settings window, menu bar) reaches the focus runtime.
    @ObservationIgnored
    var onFocusSettingsChanged: ((FocusSettings) -> Void)?

    var themeMode: AppThemeMode {
        didSet { save() }
    }
    var taskDefaults: TaskDefaultsSettings {
        didSet { save() }
    }
    var focusSettings: FocusSettings {
        didSet {
            save()
            onFocusSettingsChanged?(focusSettings)
        }
    }
    var matrixSettings: MatrixSettings {
        didSet { save() }
    }
    var accountBaseXp: Int {
        didSet { save() }
    }

    private static let userDefaultsKey = "iTu_UserSettingsStore_v1"

    init() {
        if let data = UserDefaults.standard.data(forKey: Self.userDefaultsKey),
           let saved = try? JSONDecoder().decode(SavedSettings.self, from: data) {
            self.themeMode = saved.themeMode
            self.taskDefaults = saved.taskDefaults
            self.focusSettings = saved.focusSettings
            self.matrixSettings = saved.matrixSettings
            self.accountBaseXp = saved.accountBaseXp
        } else {
            self.themeMode = .system
            self.taskDefaults = TaskDefaultsSettings()
            self.focusSettings = FocusSettings()
            self.matrixSettings = MatrixSettings()
            self.accountBaseXp = 0
        }
    }

    func resetTaskDefaults() {
        taskDefaults = TaskDefaultsSettings()
    }

    func resetMatrixSettings() {
        matrixSettings = MatrixSettings()
    }

    private func save() {
        let payload = SavedSettings(
            themeMode: themeMode,
            taskDefaults: taskDefaults,
            focusSettings: focusSettings,
            matrixSettings: matrixSettings,
            accountBaseXp: accountBaseXp
        )
        if let data = try? JSONEncoder().encode(payload) {
            UserDefaults.standard.set(data, forKey: Self.userDefaultsKey)
        }
    }

    private struct SavedSettings: Codable {
        let themeMode: AppThemeMode
        let taskDefaults: TaskDefaultsSettings
        let focusSettings: FocusSettings
        let matrixSettings: MatrixSettings
        let accountBaseXp: Int
    }
}
