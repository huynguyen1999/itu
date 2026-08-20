import Foundation
import iTuDomain

@MainActor
public final class AppUpdateCoordinator {
    public private(set) var state: AppUpdateCheckState = .idle
    public private(set) var policy: AppUpdatePolicy?
    public private(set) var lastCheckedAt: Date?

    public var optionalUpdate: AppUpdatePolicy? {
        guard let policy,
              policy.status == .optionalUpdate,
              dismissedOptionalVersion != policy.latestVersion else { return nil }
        return policy
    }

    public var requiresUpdate: Bool {
        policy?.status == .requiredUpdate
    }

    private let apiClient: APIClient
    private let platform: AppPlatform
    private let channel: AppReleaseChannel
    private let installedVersion: String
    private let defaults: UserDefaults
    private let cacheKey: String
    private var dismissedOptionalVersion: String?
    private var hasCheckedThisLaunch = false

    public init(
        apiClient: APIClient,
        platform: AppPlatform,
        channel: AppReleaseChannel = .stable,
        installedVersion: String? = nil,
        defaults: UserDefaults = .standard
    ) {
        self.apiClient = apiClient
        self.platform = platform
        self.channel = channel
        self.installedVersion = installedVersion
            ?? Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String
            ?? "0.0.0"
        self.defaults = defaults
        self.cacheKey = "iTu.appUpdate.\(platform.rawValue).\(channel.rawValue)"
        loadCache()
    }

    public func checkIfNeeded() async {
        guard !hasCheckedThisLaunch else { return }
        hasCheckedThisLaunch = true
        await check()
    }

    public func checkManually() async {
        await check()
    }

    public func dismissOptionalUpdate() {
        guard let policy else { return }
        dismissedOptionalVersion = policy.latestVersion
        persistCache()
    }

    private func check() async {
        state = .checking
        do {
            let remote = try await apiClient.checkAppVersion(
                platform: platform,
                installedVersion: installedVersion,
                channel: channel
            )
            guard remote.platform == platform,
                  remote.channel == channel,
                  let normalized = remote.recalculated(for: installedVersion),
                  hasSecureUpdateURL(normalized),
                  normalized.status == remote.status else {
                state = .failed(.invalidPolicy)
                return
            }
            policy = normalized
            lastCheckedAt = Date()
            persistCache()
            apply(normalized)
        } catch is URLError {
            state = .failed(.networkUnavailable)
        } catch let error as APIError where error.statusCode == 0 {
            state = .failed(.networkUnavailable)
        } catch {
            state = .failed(.invalidResponse)
        }
    }

    private func loadCache() {
        guard let data = defaults.data(forKey: cacheKey),
              let cache = try? JSONDecoder().decode(Cache.self, from: data),
              let cachedPolicy = cache.policy?.recalculated(for: installedVersion),
              hasSecureUpdateURL(cachedPolicy) else { return }
        policy = cachedPolicy
        lastCheckedAt = cache.lastCheckedAt
        dismissedOptionalVersion = cache.dismissedOptionalVersion
        apply(cachedPolicy)
    }

    private func persistCache() {
        let cache = Cache(
            policy: policy,
            lastCheckedAt: lastCheckedAt,
            dismissedOptionalVersion: dismissedOptionalVersion
        )
        guard let data = try? JSONEncoder().encode(cache) else { return }
        defaults.set(data, forKey: cacheKey)
    }

    private func apply(_ policy: AppUpdatePolicy) {
        switch policy.status {
        case .current: state = .current
        case .optionalUpdate: state = .optional(policy)
        case .requiredUpdate: state = .required(policy)
        }
    }

    private func hasSecureUpdateURL(_ policy: AppUpdatePolicy) -> Bool {
        guard let url = policy.update?.url else { return true }
        return url.scheme?.lowercased() == "https"
    }

    private struct Cache: Codable {
        let policy: AppUpdatePolicy?
        let lastCheckedAt: Date?
        let dismissedOptionalVersion: String?
    }
}
