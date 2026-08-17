import Foundation
import iTuDomain

public enum SessionCache {
    private static let userKey = "lastAuthenticatedUser"
    public static let credentialStore: any CredentialStore = KeychainCredentialStore()

    public static func loadUser() -> UserProfile? {
        guard let data = UserDefaults.standard.data(forKey: userKey) else { return nil }
        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    public static func saveUser(_ user: UserProfile) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        UserDefaults.standard.set(data, forKey: userKey)
    }

    public static func saveTokens(accessToken: String, refreshToken: String? = nil) throws {
        if let refreshToken {
            try credentialStore.save(refreshToken, for: .refreshToken)
        }
        try credentialStore.save(accessToken, for: .accessToken)
    }

    public static func loadTokens() throws -> (accessToken: String?, refreshToken: String?) {
        (
            accessToken: try credentialStore.load(.accessToken),
            refreshToken: try credentialStore.load(.refreshToken)
        )
    }

    public static func clearCachedProfile() {
        UserDefaults.standard.removeObject(forKey: userKey)
    }

    public static func clearCredentials() throws {
        var firstError: Error?
        for key in [CredentialKey.accessToken, .refreshToken] {
            do {
                try credentialStore.delete(key)
            } catch {
                firstError = firstError ?? error
            }
        }
        if let firstError { throw firstError }
    }

    public static func clearSession() throws {
        clearCachedProfile()
        try clearCredentials()
    }
}
