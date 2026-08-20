import Foundation
import XCTest
import iTuDomain
@testable import iTuNetworking

@MainActor
final class APIClientPhase6Tests: XCTestCase {
    override func tearDown() {
        StubURLProtocol.reset()
        super.tearDown()
    }

    func testBudgetRequestPreservesEscapedQueryAndMethod() async throws {
        StubURLProtocol.responseData = Data("[]".utf8)
        let client = makeClient()

        _ = try await client.getBudgetExpenses(
            period: "2026-08",
            categoryID: "category/one",
            search: "coffee tea"
        )

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "GET")
        XCTAssertEqual(
            request.url?.absoluteString,
            "https://example.test/budget/expenses?period=2026-08&categoryId=category/one&search=coffee%20tea"
        )
    }

    func testUsageBatchEncodingIncludesOptionalFields() async throws {
        StubURLProtocol.responseData = Data("{}".utf8)
        let client = makeClient()
        let summary = UsageSummary(
            localDate: "2026-08-17",
            hour: 9,
            bundleId: "com.example.editor",
            displayName: "Editor",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 120,
            engagedSeconds: 90,
            source: .deviceActivity,
            pickups: 2,
            notifications: 3
        )

        try await client.uploadUsageSummaries([summary], deviceId: "ios-device")

        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/usage/summaries/batch")
        let body = try XCTUnwrap(StubURLProtocol.bodyData(for: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: Any])
        XCTAssertEqual(json["deviceId"] as? String, "ios-device")
        let summaries = try XCTUnwrap(json["summaries"] as? [[String: Any]])
        XCTAssertEqual(summaries.first?["source"] as? String, "DEVICE_ACTIVITY")
        XCTAssertEqual((summaries.first?["engagedSeconds"] as? NSNumber)?.intValue, 90)
        XCTAssertEqual((summaries.first?["pickups"] as? NSNumber)?.intValue, 2)
        XCTAssertEqual((summaries.first?["notifications"] as? NSNumber)?.intValue, 3)
    }

    func testSafariExtensionDsnRequestSelectsSafariCredential() async throws {
        StubURLProtocol.responseData = Data(#"{"dsnKey":"itu_dsn_test"}"#.utf8)

        let dsnKey = try await makeClient().generateSafariExtensionDsn()

        XCTAssertEqual(dsnKey, "itu_dsn_test")
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.httpMethod, "POST")
        XCTAssertEqual(request.url?.path, "/usage/websites/dsn")
        let body = try XCTUnwrap(StubURLProtocol.bodyData(for: request))
        let json = try XCTUnwrap(JSONSerialization.jsonObject(with: body) as? [String: String])
        XCTAssertEqual(json["kind"], "SAFARI_IOS")
    }

    func testStudyAndNotificationPathsDecodePortableWireTypes() async throws {
        StubURLProtocol.responseData = Data("{\"data\":[],\"meta\":{\"hasNextPage\":false,\"nextCursor\":null}}".utf8)
        let client = makeClient()
        let decks = try await client.fetchDecks()
        XCTAssertTrue(decks.isEmpty)

        StubURLProtocol.responseData = Data("{}".utf8)
        try await client.markAllNotificationsRead()

        XCTAssertEqual(StubURLProtocol.requests.map { $0.url?.path }, [
            "/decks",
            "/productivity/notifications/read-all"
        ])
        XCTAssertEqual(StubURLProtocol.requests.map(\.httpMethod), ["GET", "POST"])
    }

    func testAppVersionCheckUsesPublicEndpointAndDecodesPolicy() async throws {
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":null,"update":null}"#.utf8)
        let client = makeClient()

        let policy = try await client.checkAppVersion(platform: .ios, installedVersion: "0.4.0")

        XCTAssertEqual(policy.status, .optionalUpdate)
        let request = try XCTUnwrap(StubURLProtocol.requests.first)
        XCTAssertEqual(request.url?.path, "/app-version/check")
        XCTAssertNil(request.value(forHTTPHeaderField: "Authorization"))
        XCTAssertEqual(request.url?.query, "platform=ios&version=0.4.0&channel=stable")
    }

    func testUpdateCoordinatorCachesAndDismissesOptionalVersion() async throws {
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":null,"update":{"url":"https://updates.example.test/ios"}}"#.utf8)
        let suiteName = "iTu.AppUpdateCoordinatorTests"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        let client = makeClient()
        let coordinator = await MainActor.run {
            AppUpdateCoordinator(
                apiClient: client,
                platform: .ios,
                installedVersion: "0.4.0",
                defaults: defaults
            )
        }

        await coordinator.checkIfNeeded()
        let optional = await MainActor.run { coordinator.optionalUpdate }
        XCTAssertEqual(optional?.latestVersion, "0.5.0")

        await MainActor.run { coordinator.dismissOptionalUpdate() }
        let dismissedOptional = await MainActor.run { coordinator.optionalUpdate }
        XCTAssertNil(dismissedOptional)

        let reloaded = await MainActor.run {
            AppUpdateCoordinator(
                apiClient: client,
                platform: .ios,
                installedVersion: "0.4.0",
                defaults: defaults
            )
        }
        let reloadedOptional = await MainActor.run { reloaded.optionalUpdate }
        XCTAssertNil(reloadedOptional)
        defaults.removePersistentDomain(forName: suiteName)
    }

    func testRequiredPolicyRemainsEffectiveWhenRefreshFails() async throws {
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.2.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"REQUIRED_UPDATE","release":null,"update":{"url":"https://updates.example.test/ios"}}"#.utf8)
        let suiteName = "iTu.AppUpdateCoordinatorRequiredTests"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        let client = makeClient()
        let coordinator = await MainActor.run {
            AppUpdateCoordinator(
                apiClient: client,
                platform: .ios,
                installedVersion: "0.2.0",
                defaults: defaults
            )
        }

        await coordinator.checkIfNeeded()
        let initiallyRequiresUpdate = await MainActor.run { coordinator.requiresUpdate }
        XCTAssertTrue(initiallyRequiresUpdate)

        StubURLProtocol.statusCode = 503
        await coordinator.checkManually()
        let remainsRequired = await MainActor.run { coordinator.requiresUpdate }
        let stateAfterFailure = await MainActor.run { coordinator.state }
        XCTAssertTrue(remainsRequired)
        XCTAssertEqual(stateAfterFailure, .failed(.invalidResponse))
        defaults.removePersistentDomain(forName: suiteName)
    }

    func testCachedOptionalPolicyRemainsVisibleWhenRefreshFails() async throws {
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":null,"update":{"url":"https://updates.example.test/ios"}}"#.utf8)
        let suiteName = "iTu.AppUpdateCoordinatorOptionalOfflineTests"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        let coordinator = await MainActor.run {
            AppUpdateCoordinator(
                apiClient: makeClient(),
                platform: .ios,
                installedVersion: "0.4.0",
                defaults: defaults
            )
        }

        await coordinator.checkIfNeeded()
        StubURLProtocol.statusCode = 503
        await coordinator.checkManually()

        let optional = await MainActor.run { coordinator.optionalUpdate }
        XCTAssertEqual(optional?.latestVersion, "0.5.0")
        defaults.removePersistentDomain(forName: suiteName)
    }

    func testDismissalIsScopedToTheDismissedReleaseVersion() async throws {
        let suiteName = "iTu.AppUpdateCoordinatorVersionScopeTests"
        let defaults = try XCTUnwrap(UserDefaults(suiteName: suiteName))
        defaults.removePersistentDomain(forName: suiteName)
        let client = makeClient()
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":null,"update":{"url":"https://updates.example.test/ios"}}"#.utf8)

        let coordinator = await MainActor.run {
            AppUpdateCoordinator(apiClient: client, platform: .ios, installedVersion: "0.4.0", defaults: defaults)
        }
        await coordinator.checkIfNeeded()
        await MainActor.run { coordinator.dismissOptionalUpdate() }

        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.1","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":null,"update":{"url":"https://updates.example.test/ios"}}"#.utf8)
        let refreshed = await MainActor.run {
            AppUpdateCoordinator(apiClient: client, platform: .ios, installedVersion: "0.4.0", defaults: defaults)
        }
        await refreshed.checkIfNeeded()

        let newRelease = await MainActor.run { refreshed.optionalUpdate }
        XCTAssertEqual(newRelease?.latestVersion, "0.5.1")
        defaults.removePersistentDomain(forName: suiteName)
    }

    func testCoordinatorRejectsInsecureUpdateURL() async throws {
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"OPTIONAL_UPDATE","release":null,"update":{"url":"http://updates.example.test/ios"}}"#.utf8)
        let coordinator = await MainActor.run {
            AppUpdateCoordinator(apiClient: makeClient(), platform: .ios, installedVersion: "0.4.0")
        }

        await coordinator.checkIfNeeded()

        let state = await MainActor.run { coordinator.state }
        XCTAssertEqual(state, .failed(.invalidPolicy))
    }

    func testCoordinatorRejectsMalformedPolicyResponse() async throws {
        StubURLProtocol.responseData = Data(#"{"platform":"ios","channel":"stable","installedVersion":"0.4.0","latestVersion":"0.5.0","minimumSupportedVersion":"0.3.0","status":"UNKNOWN","release":null,"update":null}"#.utf8)
        let coordinator = await MainActor.run {
            AppUpdateCoordinator(apiClient: makeClient(), platform: .ios, installedVersion: "0.4.0")
        }

        await coordinator.checkIfNeeded()

        let state = await MainActor.run { coordinator.state }
        XCTAssertEqual(state, .failed(.invalidResponse))
    }

    private func makeClient() -> APIClient {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        return APIClient(
            baseURL: URL(string: "https://example.test")!,
            session: URLSession(configuration: configuration),
            credentialStore: EmptyCredentialStore()
        )
    }
}

private struct EmptyCredentialStore: CredentialStore {
    func load(_: CredentialKey) throws -> String? { nil }
    func save(_: String, for _: CredentialKey) throws {}
    func delete(_: CredentialKey) throws {}
}

private final class StubURLProtocol: URLProtocol {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var storedRequests: [URLRequest] = []
    nonisolated(unsafe) private static var storedResponseData = Data("{}".utf8)
    nonisolated(unsafe) private static var storedStatusCode = 200

    static var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return storedRequests
    }

    static var responseData: Data {
        get {
            lock.lock()
            defer { lock.unlock() }
            return storedResponseData
        }
        set {
            lock.lock()
            storedResponseData = newValue
            lock.unlock()
        }
    }

    static var statusCode: Int {
        get {
            lock.lock()
            defer { lock.unlock() }
            return storedStatusCode
        }
        set {
            lock.lock()
            storedStatusCode = newValue
            lock.unlock()
        }
    }

    static func reset() {
        lock.lock()
        storedRequests = []
        storedResponseData = Data("{}".utf8)
        storedStatusCode = 200
        lock.unlock()
    }

    static func bodyData(for request: URLRequest) -> Data? {
        if let body = request.httpBody { return body }
        guard let stream = request.httpBodyStream else { return nil }
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.storedRequests.append(request)
        let data = Self.storedResponseData
        Self.lock.unlock()

        let response = HTTPURLResponse(
            url: request.url!,
            statusCode: Self.statusCode,
            httpVersion: nil,
            headerFields: ["Content-Type": "application/json"]
        )!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}
}
