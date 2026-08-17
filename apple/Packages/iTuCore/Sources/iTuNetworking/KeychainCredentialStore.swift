import Foundation
import Security

public enum CredentialKey: String, Hashable, Sendable {
    case accessToken
    case refreshToken
}

public protocol CredentialStore: Sendable {
    func load(_ key: CredentialKey) throws -> String?
    func save(_ value: String, for key: CredentialKey) throws
    func delete(_ key: CredentialKey) throws
}

public enum KeychainError: LocalizedError, Equatable, Sendable {
    case osStatus(OSStatus)

    public var errorDescription: String? {
        switch self {
        case let .osStatus(status):
            "Keychain operation failed (status \(status))"
        }
    }
}

public struct KeychainCredentialStore: CredentialStore {
    private let serviceName: String

    public init(serviceIdentifier: String = "com.itu.macos.session") {
        serviceName = serviceIdentifier
    }

    public func load(_ key: CredentialKey) throws -> String? {
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

    public func save(_ value: String, for key: CredentialKey) throws {
        guard let data = value.data(using: .utf8) else {
            throw KeychainError.osStatus(errSecParam)
        }
        let query = baseQuery(for: key)
        let updateStatus = SecItemUpdate(
            query as CFDictionary,
            [
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ] as CFDictionary
        )
        if updateStatus == errSecSuccess { return }
        guard updateStatus == errSecItemNotFound else {
            throw KeychainError.osStatus(updateStatus)
        }

        let addStatus = SecItemAdd(
            query.merging([
                kSecValueData as String: data,
                kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            ]) { _, new in new } as CFDictionary,
            nil
        )
        guard addStatus == errSecSuccess else {
            throw KeychainError.osStatus(addStatus)
        }
    }

    public func delete(_ key: CredentialKey) throws {
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
