import Foundation

struct BrowserActivityState: Codable, Equatable, Sendable {
    let protocolVersion: Int
    let browserBundleId: String
    let sequence: UInt64
    let state: String
    let hostname: String?
    let incognito: Bool
    let connected: Bool
    let updatedAt: String

    static let protocolVersion = 1
    static let edgeBundleID = "com.microsoft.edgemac"
    static let appGroupID = "group.com.itu.browser-activity"
    static let fileName = "browser-activity.json"

    var updatedDate: Date? {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: updatedAt) ?? ISO8601DateFormatter().date(from: updatedAt)
    }

    static var appGroupURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID)?
            .appendingPathComponent(fileName)
    }

    static func load(from url: URL) -> BrowserActivityState? {
        guard let data = try? Data(contentsOf: url), data.count <= 16 * 1024 else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }

    static func normalizeHostname(_ value: String) -> String? {
        let hostname = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            .trimmingCharacters(in: CharacterSet(charactersIn: "."))
        guard hostname.count <= 253, !hostname.isEmpty else { return nil }
        let labels = hostname.split(separator: ".", omittingEmptySubsequences: false)
        guard !labels.isEmpty else { return nil }
        for label in labels {
            guard (1...63).contains(label.count),
                  label.first!.isASCII,
                  label.last!.isASCII,
                  label.first!.isLetter || label.first!.isNumber,
                  label.last!.isLetter || label.last!.isNumber,
                  label.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" }) else { return nil }
        }
        return hostname
    }
}
