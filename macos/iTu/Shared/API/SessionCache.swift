import Foundation
import Security

enum SessionCache {
    private static let userKey = "lastAuthenticatedUser"
    private static let serviceName = "com.itu.macos.session"

    static func loadUser() -> UserProfile? {
        guard let data = UserDefaults.standard.data(forKey: userKey) else { return nil }
        return try? JSONDecoder().decode(UserProfile.self, from: data)
    }

    static func saveUser(_ user: UserProfile) {
        guard let data = try? JSONEncoder().encode(user) else { return }
        UserDefaults.standard.set(data, forKey: userKey)
    }

    static func saveTokens(accessToken: String, refreshToken: String? = nil) {
        saveKeychainItem(key: "accessToken", value: accessToken)
        if let refreshToken {
            saveKeychainItem(key: "refreshToken", value: refreshToken)
        }
    }

    static func loadTokens() -> (accessToken: String?, refreshToken: String?) {
        let access = loadKeychainItem(key: "accessToken")
        let refresh = loadKeychainItem(key: "refreshToken")
        return (access, refresh)
    }

    static func clearUser() {
        UserDefaults.standard.removeObject(forKey: userKey)
        deleteKeychainItem(key: "accessToken")
        deleteKeychainItem(key: "refreshToken")
    }

    // MARK: - Keychain Helpers

    private static func saveKeychainItem(key: String, value: String) {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
        var newQuery = query
        newQuery[kSecValueData as String] = data
        newQuery[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlock
        SecItemAdd(newQuery as CFDictionary, nil)
    }

    private static func loadKeychainItem(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        guard status == errSecSuccess, let data = dataTypeRef as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }

    private static func deleteKeychainItem(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
    }
}
