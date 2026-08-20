import Foundation
import iTuDomain
import iTuNetworking

extension AppModel {
    var safariExtensionStatus: String {
        guard !safariExtensionConfiguration.accountId.isEmpty else { return "Sign in to configure" }
        guard !safariExtensionConfiguration.dsnKey.isEmpty else { return "Configuration needed" }
        return safariExtensionConfiguration.uploadEnabled ? "Ready" : "Upload paused"
    }

    func activateSafariExtension(for account: UserProfile) {
        safariExtensionConfiguration = IOSSafariExtensionConfigurationStore.activate(
            accountId: account.id,
            apiBaseUrl: APIConfiguration.baseURL.absoluteString,
            trackingEnabled: usagePreferences?.enabled == true && usagePreferences?.websiteTrackingEnabled == true
        )
    }

    @discardableResult
    func ensureSafariExtensionCredential(rotate: Bool = false) async -> Bool {
        guard let accountId = user?.id, isOnline else { return false }
        if !rotate, !safariExtensionConfiguration.dsnKey.isEmpty { return true }
        do {
            let dsnKey = try await apiClient.generateSafariExtensionDsn()
            guard user?.id == accountId else { return false }
            safariExtensionConfiguration = IOSSafariExtensionConfigurationStore.saveCredential(dsnKey, accountId: accountId)
            return true
        } catch {
            guard user?.id == accountId else { return false }
            setFeatureError("Could not configure Safari Browser Activity: \(error.localizedDescription)")
            return false
        }
    }

    func setSafariPrivateTrackingEnabled(_ enabled: Bool) {
        guard let accountId = user?.id else { return }
        safariExtensionConfiguration = IOSSafariExtensionConfigurationStore.setPrivateTracking(enabled, accountId: accountId)
    }

    func refreshSafariExtensionConfiguration() {
        safariExtensionConfiguration = IOSSafariExtensionConfigurationStore.update(
            apiBaseUrl: APIConfiguration.baseURL.absoluteString,
            trackingEnabled: usagePreferences?.enabled == true && usagePreferences?.websiteTrackingEnabled == true
        )
    }

    func pauseSafariExtensionUpload() {
        safariExtensionConfiguration = IOSSafariExtensionConfigurationStore.update(uploadEnabled: false)
    }
}
