import Combine
// FamilyControls and ManagedSettings are commented out for personal development team builds
// import FamilyControls
import Foundation
// import ManagedSettings
import iTuDomain

// Placeholder struct for FamilyActivitySelection when FamilyControls is disabled
struct IOSFocusActivitySelection: Equatable, Codable, Sendable {
    var applicationCount: Int = 0
}

@MainActor
final class IOSFocusBlockingService: ObservableObject {
    @Published private(set) var selection = IOSFocusActivitySelection()
    @Published private(set) var isApplied = false
    private(set) var isFocusActive = false

    private let defaults: UserDefaults?
    // private let settingsStore: ManagedSettingsStore
    private var accountID: String?

    init(
        defaults: UserDefaults? = UserDefaults(suiteName: "group.com.itu.ios")
        // settingsStore: ManagedSettingsStore = ManagedSettingsStore()
    ) {
        self.defaults = defaults
        // self.settingsStore = settingsStore
    }

    var selectedTargetCount: Int {
        selection.applicationCount
    }

    var hasSelection: Bool { selectedTargetCount > 0 }

    func setAccount(_ accountID: String?) {
        isFocusActive = false
        removeShields()
        self.accountID = accountID
        selection = loadSelection(for: accountID)
    }

    func setSelection(_ selection: IOSFocusActivitySelection) {
        self.selection = selection
        saveSelection(selection, for: accountID)
        applyCurrentSelection()
    }

    func apply(for focus: FocusSession?) {
        isFocusActive = focus?.status == .active
        applyCurrentSelection()
    }

    static func shouldApply(for focus: FocusSession?) -> Bool {
        focus?.status == .active
    }

    private func applyCurrentSelection() {
        // Shielding APIs commented out for personal team builds
        /*
        guard isFocusActive, hasSelection else {
            removeShields()
            return
        }
        settingsStore.shield.applications = ...
        isApplied = true
        */
        isApplied = false
    }

    private func removeShields() {
        /*
        settingsStore.shield.applications = nil
        settingsStore.shield.applicationCategories = nil
        settingsStore.shield.webDomains = nil
        settingsStore.shield.webDomainCategories = nil
        */
        isApplied = false
    }

    private func key(for accountID: String?) -> String? {
        guard let accountID, !accountID.isEmpty else { return nil }
        let safeID = accountID.replacingOccurrences(of: "[^A-Za-z0-9_-]", with: "_", options: .regularExpression)
        return "focus-blocking-selection-v1-\(safeID)"
    }

    private func loadSelection(for accountID: String?) -> IOSFocusActivitySelection {
        guard let key = key(for: accountID),
              let data = defaults?.data(forKey: key),
              let value = try? JSONDecoder().decode(IOSFocusActivitySelection.self, from: data) else {
            return IOSFocusActivitySelection()
        }
        return value
    }

    private func saveSelection(_ selection: IOSFocusActivitySelection, for accountID: String?) {
        guard let key = key(for: accountID),
              let data = try? JSONEncoder().encode(selection) else { return }
        defaults?.set(data, forKey: key)
    }
}
