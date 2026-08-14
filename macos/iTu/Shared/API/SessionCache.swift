import Foundation

enum SessionCache {
    private static let userKey = "lastAuthenticatedUser"
    static let credentialStore: any CredentialStore = KeychainCredentialStore()

    static func loadUser() -> UserProfile? {
        guard let data = UserDefaults.standard.data(forKey: userKey) else { return nil }
        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    static func saveUser(_ user: UserProfile) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        UserDefaults.standard.set(data, forKey: userKey)
    }

    static func saveTokens(accessToken: String, refreshToken: String? = nil) throws {
        if let refreshToken {
            try credentialStore.save(refreshToken, for: .refreshToken)
        }
        try credentialStore.save(accessToken, for: .accessToken)
    }

    static func loadTokens() throws -> (accessToken: String?, refreshToken: String?) {
        (
            accessToken: try credentialStore.load(.accessToken),
            refreshToken: try credentialStore.load(.refreshToken)
        )
    }

    static func clearCachedProfile() {
        UserDefaults.standard.removeObject(forKey: userKey)
    }

    static func clearCredentials() throws {
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

    static func clearSession() throws {
        clearCachedProfile()
        try clearCredentials()
    }
}
