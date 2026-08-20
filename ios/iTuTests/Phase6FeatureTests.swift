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

    func testBatchConflictResolutionKeepLocalAndServer() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let location = OfflineStoreLocation(rootURL: root)
        let store = OfflineStore(accountID: "batch-test", location: location)
        _ = try await store.load()

        let conflict1 = SyncConflict(
            mutationId: "mut-1",
            entityType: "task",
            entityId: "task-1",
            reason: "CONCURRENT_UPDATE",
            serverData: .object(["version": .number(2)]),
            localDraft: ["title": .string("Task 1 Local")],
            conflictingFields: ["title"],
            kind: "task.update",
            occurredAt: "2026-08-17T00:00:00Z"
        )
        let conflict2 = SyncConflict(
            mutationId: "mut-2",
            entityType: "task",
            entityId: "task-2",
            reason: "CONCURRENT_UPDATE",
            serverData: .object(["version": .number(2)]),
            localDraft: ["title": .string("Task 2 Local")],
            conflictingFields: ["title"],
            kind: "task.update",
            occurredAt: "2026-08-17T00:00:00Z"
        )

        _ = try await store.resolveConflicts([conflict1, conflict2], keepLocal: true)
        let snap1 = await store.snapshot()
        XCTAssertTrue(snap1.conflicts.isEmpty)
        XCTAssertEqual(snap1.mutations.count, 2)

        let conflict3 = SyncConflict(
            mutationId: "mut-3",
            entityType: "task",
            entityId: "task-3",
            reason: "CONCURRENT_UPDATE",
            serverData: .object(["version": .number(2)]),
            localDraft: ["title": .string("Task 3 Local")],
            conflictingFields: ["title"],
            kind: "task.update",
            occurredAt: "2026-08-17T00:00:00Z"
        )
        _ = try await store.resolveConflicts([conflict3], keepLocal: false)
        let snap2 = await store.snapshot()
        XCTAssertTrue(snap2.conflicts.isEmpty)
        XCTAssertEqual(snap2.mutations.count, 2)
    }

    func testBatchMutationRetryAndDiscard() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        let location = OfflineStoreLocation(rootURL: root)
        let store = OfflineStore(accountID: "batch-test-2", location: location)
        _ = try await store.load()

        _ = try await store.createTask(title: "Task A")
        _ = try await store.createTask(title: "Task B")
        _ = try await store.createTask(title: "Task C")

        let snap1 = await store.snapshot()
        XCTAssertEqual(snap1.mutations.count, 3)

        let mutationIDs = snap1.mutations.map(\.id)
        _ = try await store.discardMutations([mutationIDs[0], mutationIDs[1]])
        let snap2 = await store.snapshot()
        XCTAssertEqual(snap2.mutations.count, 1)
        XCTAssertEqual(snap2.mutations.first?.id, mutationIDs[2])

        _ = try await store.retryMutations([mutationIDs[2]], keepLocal: true)
        let snap3 = await store.snapshot()
        XCTAssertEqual(snap3.mutations.count, 1)
        XCTAssertNotEqual(snap3.mutations.first?.id, mutationIDs[2])
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
