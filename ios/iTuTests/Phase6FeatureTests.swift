import Foundation
import XCTest
@testable import iTu
import iTuDomain
import iTuNetworking
import iTuOffline

final class Phase6FeatureTests: XCTestCase {
    func testEndpointValidationRejectsCredentialsAndNonHTTPURLs() {
        XCTAssertNotNil(Phase6EndpointValidation.url("https://api.example.test"))
        XCTAssertNil(Phase6EndpointValidation.url("https://user:secret@api.example.test"))
        XCTAssertNil(Phase6EndpointValidation.url("file:///tmp/itu"))
        XCTAssertNil(Phase6EndpointValidation.url("not a URL"))
    }

    func testPasswordValidationRequiresCurrentPasswordLengthAndConfirmation() {
        XCTAssertEqual(
            Phase6ProfileValidation.passwordError(current: "", new: "long-enough", confirmation: "long-enough"),
            "Enter your current password."
        )
        XCTAssertEqual(
            Phase6ProfileValidation.passwordError(current: "current", new: "short", confirmation: "short"),
            "The new password must contain at least 8 characters."
        )
        XCTAssertEqual(
            Phase6ProfileValidation.passwordError(current: "current", new: "long-enough", confirmation: "different"),
            "The new passwords do not match."
        )
        XCTAssertNil(Phase6ProfileValidation.passwordError(current: "current", new: "long-enough", confirmation: "long-enough"))
    }

    func testUsageAggregationReportsPartialEngagementCoverage() {
        let first = UsageSummary(
            localDate: "2026-08-17",
            bundleId: "com.example.editor",
            displayName: "Editor",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 120,
            engagedSeconds: 90,
            source: .deviceActivity,
            deviceId: "ios-device"
        )
        let second = UsageSummary(
            localDate: "2026-08-17",
            bundleId: "com.example.browser",
            displayName: "Browser",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 60,
            source: .deviceActivity,
            deviceId: "ios-device"
        )

        let statistics = UsageStatistics.aggregating([first, first, second])

        XCTAssertEqual(statistics.totalActiveSeconds, 180)
        XCTAssertEqual(statistics.totalEngagedSeconds, 90)
        XCTAssertEqual(statistics.engagementCoverage?.observedActiveSeconds, 120)
        XCTAssertEqual(statistics.engagementCoverage?.totalActiveSeconds, 180)
        XCTAssertFalse(statistics.engagementCoverage?.complete ?? true)
    }
}

@MainActor
final class Phase6OperationGenerationTests: XCTestCase {
    override func tearDown() {
        DelayedPhase6URLProtocol.reset()
        super.tearDown()
    }

    func testDelayedNotificationReadDoesNotPublishIntoSwitchedAccount() async throws {
        let model = makeModel()
        let first = makeUser(id: "account-one")
        let second = makeUser(id: "account-two")
        await model.activate(first, reconcileRemote: false)
        model.setPhase6OnlineForTesting(true)

        let request = Task { @MainActor in await model.refreshNotifications() }
        try await waitForRequest()
        await model.activate(second, reconcileRemote: false)
        await request.value

        XCTAssertEqual(model.user?.id, second.id)
        XCTAssertEqual(model.notificationsState, .idle)
    }

    func testDelayedDeleteDoesNotLogOutSwitchedAccount() async throws {
        let model = makeModel()
        let first = makeUser(id: "account-one")
        let second = makeUser(id: "account-two")
        await model.activate(first, reconcileRemote: false)
        model.setPhase6OnlineForTesting(true)

        let deletion = Task { @MainActor in await model.deleteAccount(password: nil) }
        try await waitForRequest()
        await model.activate(second, reconcileRemote: false)
        let deleted = await deletion.value

        XCTAssertFalse(deleted)
        XCTAssertEqual(model.user?.id, second.id)
    }

    func testDelayedNotificationReadDoesNotPublishAfterLogout() async throws {
        let model = makeModel()
        await model.activate(makeUser(id: "account-one"), reconcileRemote: false)
        model.setPhase6OnlineForTesting(true)

        let request = Task { @MainActor in await model.refreshNotifications() }
        try await waitForRequest()
        await model.logout()
        await request.value

        XCTAssertNil(model.user)
        XCTAssertEqual(model.notificationsState, .idle)
    }

    private func makeModel() -> AppModel {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DelayedPhase6URLProtocol.self]
        let credentials = Phase6TestCredentialStore()
        let client = APIClient(
            baseURL: URL(string: "https://example.test")!,
            platform: "IOS",
            session: URLSession(configuration: configuration),
            credentialStore: credentials
        )
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-phase6-operations-\(UUID().uuidString)", isDirectory: true)
        return AppModel(
            apiClient: client,
            credentialStore: credentials,
            offlineLocation: OfflineStoreLocation(rootURL: root)
        )
    }

    private func makeUser(id: String) -> UserProfile {
        UserProfile(id: id, email: id + "@example.test", username: id, displayName: id, avatarUrl: nil, roles: [], permissions: [])
    }

    private func waitForRequest() async throws {
        for _ in 0..<40 {
            if !DelayedPhase6URLProtocol.requests.isEmpty { return }
            try await Task.sleep(for: .milliseconds(5))
        }
        XCTFail("Expected a delayed API request")
    }
}

private struct Phase6TestCredentialStore: CredentialStore {
    func load(_ key: CredentialKey) throws -> String? { nil }
    func save(_ value: String, for key: CredentialKey) throws {}
    func delete(_ key: CredentialKey) throws {}
}

private final class DelayedPhase6URLProtocol: URLProtocol, @unchecked Sendable {
    private static let lock = NSLock()
    nonisolated(unsafe) private static var storedRequests: [URLRequest] = []

    static var requests: [URLRequest] {
        lock.lock()
        defer { lock.unlock() }
        return storedRequests
    }

    static func reset() {
        lock.lock()
        storedRequests = []
        lock.unlock()
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        Self.lock.lock()
        Self.storedRequests.append(request)
        Self.lock.unlock()

        DispatchQueue.global().asyncAfter(deadline: .now() + .milliseconds(80)) { [weak self] in
            guard let self else { return }
            let data = self.request.httpMethod == "DELETE" ? Data("{}".utf8) : Data("[]".utf8)
            guard let response = HTTPURLResponse(
                url: self.request.url!,
                statusCode: 200,
                httpVersion: nil,
                headerFields: ["Content-Type": "application/json"]
            ) else { return }
            self.client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            self.client?.urlProtocol(self, didLoad: data)
            self.client?.urlProtocolDidFinishLoading(self)
        }
    }

    override func stopLoading() {}
}
