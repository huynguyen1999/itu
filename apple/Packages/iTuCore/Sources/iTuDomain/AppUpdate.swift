import Foundation

public enum AppPlatform: String, Codable, CaseIterable, Equatable, Hashable, Sendable {
    case ios
    case macos
}

public enum AppReleaseChannel: String, Codable, CaseIterable, Equatable, Hashable, Sendable {
    case stable
}

public enum AppUpdateStatus: String, Codable, Equatable, Hashable, Sendable {
    case current = "CURRENT"
    case optionalUpdate = "OPTIONAL_UPDATE"
    case requiredUpdate = "REQUIRED_UPDATE"
}

public struct AppVersion: Comparable, Codable, Hashable, Sendable, CustomStringConvertible {
    public let components: [Int]

    public init(_ rawValue: String) throws {
        let parts = rawValue.split(separator: ".", omittingEmptySubsequences: false)
        let components = parts.compactMap { Int($0) }
        guard !parts.isEmpty,
              components.count == parts.count,
              parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isNumber) && $0.count <= 9 }) else {
            throw AppVersionError.invalid(rawValue)
        }
        self.components = components
    }

    public init?(optionalRawValue rawValue: String) {
        try? self.init(rawValue)
    }

    public var description: String { components.map(String.init).joined(separator: ".") }

    public static func == (lhs: AppVersion, rhs: AppVersion) -> Bool {
        !(lhs < rhs) && !(rhs < lhs)
    }

    public static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        let count = max(lhs.components.count, rhs.components.count)
        for index in 0..<count {
            let left = index < lhs.components.count ? lhs.components[index] : 0
            let right = index < rhs.components.count ? rhs.components[index] : 0
            if left != right { return left < right }
        }
        return false
    }

    public func hash(into hasher: inout Hasher) {
        var normalized = components
        while normalized.last == 0 { normalized.removeLast() }
        hasher.combine(normalized)
    }
}

public enum AppVersionError: LocalizedError, Equatable, Sendable {
    case invalid(String)

    public var errorDescription: String? {
        switch self {
        case let .invalid(value): "Invalid app version: \(value)"
        }
    }
}

public struct AppRelease: Codable, Equatable, Sendable {
    public let version: String
    public let releasedAt: String
    public let title: String
    public let notes: [String]

    public init(version: String, releasedAt: String, title: String, notes: [String]) {
        self.version = version
        self.releasedAt = releasedAt
        self.title = title
        self.notes = notes
    }
}

public struct AppUpdateLink: Codable, Equatable, Sendable {
    public let url: URL

    public init(url: URL) {
        self.url = url
    }
}

public struct AppUpdatePolicy: Codable, Equatable, Sendable {
    public let platform: AppPlatform
    public let channel: AppReleaseChannel
    public let installedVersion: String
    public let latestVersion: String
    public let minimumSupportedVersion: String
    public let status: AppUpdateStatus
    public let release: AppRelease?
    public let update: AppUpdateLink?

    public init(
        platform: AppPlatform,
        channel: AppReleaseChannel,
        installedVersion: String,
        latestVersion: String,
        minimumSupportedVersion: String,
        status: AppUpdateStatus,
        release: AppRelease? = nil,
        update: AppUpdateLink? = nil
    ) {
        self.platform = platform
        self.channel = channel
        self.installedVersion = installedVersion
        self.latestVersion = latestVersion
        self.minimumSupportedVersion = minimumSupportedVersion
        self.status = status
        self.release = release
        self.update = update
    }

    public func recalculated(for installedVersion: String) -> AppUpdatePolicy? {
        guard let installed = AppVersion(optionalRawValue: installedVersion),
              let latest = AppVersion(optionalRawValue: latestVersion),
              let minimum = AppVersion(optionalRawValue: minimumSupportedVersion) else { return nil }
        let status: AppUpdateStatus
        if installed < minimum {
            status = .requiredUpdate
        } else if installed < latest {
            status = .optionalUpdate
        } else {
            status = .current
        }
        return AppUpdatePolicy(
            platform: platform,
            channel: channel,
            installedVersion: installedVersion,
            latestVersion: latestVersion,
            minimumSupportedVersion: minimumSupportedVersion,
            status: status,
            release: release,
            update: update
        )
    }
}

public enum AppUpdateCheckFailure: String, Codable, Equatable, Sendable {
    case networkUnavailable
    case invalidResponse
    case invalidPolicy
}

public enum AppUpdateCheckState: Equatable, Sendable {
    case idle
    case checking
    case current
    case optional(AppUpdatePolicy)
    case required(AppUpdatePolicy)
    case failed(AppUpdateCheckFailure)
}
