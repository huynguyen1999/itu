import Foundation

struct IOSSafariExtensionConfiguration: Codable, Equatable {
    var apiBaseUrl: String
    var dsnKey: String
    var accountId: String
    var installationId: String
    var uploadEnabled: Bool
    var trackingEnabled: Bool
    var privateTrackingEnabled: Bool

    var message: [String: Any] {
        [
            "apiBaseUrl": apiBaseUrl,
            "dsnKey": dsnKey,
            "accountId": accountId,
            "installationId": installationId,
            "uploadEnabled": uploadEnabled,
            "trackingEnabled": trackingEnabled,
            "websiteTrackingEnabled": trackingEnabled,
            "privateTrackingEnabled": privateTrackingEnabled
        ]
    }
}

enum IOSSafariExtensionConfigurationStore {
    static let appGroupIdentifier = "group.com.itu.ios"
    private static let configurationKey = "com.itu.ios.safari.configuration"
    private static let credentialsKey = "com.itu.ios.safari.credentials"
    private static let privatePreferencesKey = "com.itu.ios.safari.private-preferences"
    private static let installationsKey = "com.itu.ios.safari.installation-ids"

    static func load(defaults: UserDefaults? = UserDefaults(suiteName: appGroupIdentifier)) -> IOSSafariExtensionConfiguration {
        guard let data = defaults?.data(forKey: configurationKey),
              let value = try? JSONDecoder().decode(IOSSafariExtensionConfiguration.self, from: data) else {
            return IOSSafariExtensionConfiguration(
                apiBaseUrl: "",
                dsnKey: "",
                accountId: "",
                installationId: "",
                uploadEnabled: false,
                trackingEnabled: false,
                privateTrackingEnabled: false
            )
        }
        return value
    }

    @discardableResult
    static func activate(
        accountId: String,
        apiBaseUrl: String,
        trackingEnabled: Bool,
        defaults: UserDefaults? = UserDefaults(suiteName: appGroupIdentifier)
    ) -> IOSSafariExtensionConfiguration {
        let credentials = defaults?.dictionary(forKey: credentialsKey) as? [String: String] ?? [:]
        let privatePreferences = defaults?.dictionary(forKey: privatePreferencesKey) as? [String: Bool] ?? [:]
        var installations = defaults?.dictionary(forKey: installationsKey) as? [String: String] ?? [:]
        let installationId = installations[accountId] ?? UUID().uuidString
        installations[accountId] = installationId
        defaults?.set(installations, forKey: installationsKey)
        var value = load(defaults: defaults)
        value.apiBaseUrl = apiBaseUrl
        value.dsnKey = credentials[accountId] ?? ""
        value.accountId = accountId
        value.installationId = installationId
        value.uploadEnabled = !value.dsnKey.isEmpty
        value.trackingEnabled = trackingEnabled
        value.privateTrackingEnabled = privatePreferences[accountId] ?? false
        save(value, defaults: defaults)
        return value
    }

    @discardableResult
    static func saveCredential(
        _ dsnKey: String,
        accountId: String,
        defaults: UserDefaults? = UserDefaults(suiteName: appGroupIdentifier)
    ) -> IOSSafariExtensionConfiguration {
        var credentials = defaults?.dictionary(forKey: credentialsKey) as? [String: String] ?? [:]
        credentials[accountId] = dsnKey
        defaults?.set(credentials, forKey: credentialsKey)
        var value = load(defaults: defaults)
        guard value.accountId == accountId else { return value }
        value.dsnKey = dsnKey
        value.uploadEnabled = true
        save(value, defaults: defaults)
        return value
    }

    @discardableResult
    static func setPrivateTracking(
        _ enabled: Bool,
        accountId: String,
        defaults: UserDefaults? = UserDefaults(suiteName: appGroupIdentifier)
    ) -> IOSSafariExtensionConfiguration {
        var preferences = defaults?.dictionary(forKey: privatePreferencesKey) as? [String: Bool] ?? [:]
        preferences[accountId] = enabled
        defaults?.set(preferences, forKey: privatePreferencesKey)
        var value = load(defaults: defaults)
        guard value.accountId == accountId else { return value }
        value.privateTrackingEnabled = enabled
        save(value, defaults: defaults)
        return value
    }

    @discardableResult
    static func update(
        apiBaseUrl: String? = nil,
        trackingEnabled: Bool? = nil,
        uploadEnabled: Bool? = nil,
        defaults: UserDefaults? = UserDefaults(suiteName: appGroupIdentifier)
    ) -> IOSSafariExtensionConfiguration {
        var value = load(defaults: defaults)
        if let apiBaseUrl { value.apiBaseUrl = apiBaseUrl }
        if let trackingEnabled { value.trackingEnabled = trackingEnabled }
        if let uploadEnabled { value.uploadEnabled = uploadEnabled }
        save(value, defaults: defaults)
        return value
    }

    static func response(
        to message: Any?,
        defaults: UserDefaults? = UserDefaults(suiteName: appGroupIdentifier)
    ) -> [String: Any]? {
        guard let request = message as? [String: Any], request["type"] as? String == "getConfiguration" else { return nil }
        return load(defaults: defaults).message
    }

    private static func save(_ value: IOSSafariExtensionConfiguration, defaults: UserDefaults?) {
        guard let data = try? JSONEncoder().encode(value) else { return }
        defaults?.set(data, forKey: configurationKey)
    }
}
