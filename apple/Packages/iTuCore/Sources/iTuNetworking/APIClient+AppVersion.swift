import Foundation
import iTuDomain

public extension APIClient {
    func checkAppVersion(
        platform: AppPlatform,
        installedVersion: String,
        channel: AppReleaseChannel = .stable
    ) async throws -> AppUpdatePolicy {
        let path = "/app-version/check?platform=\(platform.rawValue)&version=\(escapedPath(installedVersion))&channel=\(channel.rawValue)"
        return try await request(path: path, authorize: false)
    }
}
