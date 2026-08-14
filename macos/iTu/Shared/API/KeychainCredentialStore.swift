import Foundation
import Security

enum CredentialKey: String, Hashable, Sendable {
    case accessToken
    case refreshToken
}

protocol CredentialStore: Sendable {
    func load(_ key: CredentialKey) throws -> String?
    func save(_ value: String, for key: CredentialKey) throws
    func delete(_ key: CredentialKey) throws
}

enum KeychainError: LocalizedError, Equatable, Sendable {
    case osStatus(OSStatus)

    var errorDescription: String? {
        switch self {
        case let .osStatus(status):
            "Keychain operation failed (status \(status))"
        }
    }
}

struct KeychainCredentialStore: CredentialStore {
    private let serviceName = "com.itu.macos.session"

    func load(_ key: CredentialKey) throws -> String? {
        let query = baseQuery(for: key).merging([
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]) { _, new in new }
        var dataTypeRef: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &dataTypeRef)
        switch status {
        case errSecSuccess:
            guard let data = dataTypeRef as? Data,
                  let value = String(data: data, encoding: .utf8) else {
                throw KeychainError.osStatus(errSecDecode)
            }
            return value
        case errSecItemNotFound:
            return nil
        default:
            throw KeychainError.osStatus(status)
        }
    }

    func save(_ value: String, for key: CredentialKey) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.osStatus(errSecParam)
        }
        let query = baseQuery(for: key)
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [kSecValueData as String: data] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw KeychainError.osStatus(updateStatus)
        }

        let addStatus = SecItemAdd(
            query.merging([
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock
            ]) { _, new in new } as CFDictionary,
            nil
        )
        guard addStatus == errSecSuccess else {
            throw KeychainError.osStatus(addStatus)
        }
    }

    func delete(_ key: CredentialKey) throws {
        let status = SecItemDelete(baseQuery(for: key) as CFDictionary)
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError.osStatus(status)
        }
    }

    private func baseQuery(for key: CredentialKey) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: serviceName,
            kSecAttrAccount as String: key.rawValue
        ]
    }
}
