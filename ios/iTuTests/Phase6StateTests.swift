import XCTest
@testable import iTu
import iTuDomain
import iTuNetworking
import iTuOffline
import iTuSync

@MainActor
final class Phase6StateTests: XCTestCase {
    func testSnapshotProjectionKeepsOfflineDomainsTogether() {
        var snapshot = OfflineSnapshot()
        snapshot.decks = [DeckModel(id: "deck", title: "Learn", description: "", cardCount: 1, dueCount: 1, color: "teal", icon: "book.closed")]
        snapshot.cardsByDeckId = ["deck": []]
        snapshot.expenseCategories = [ExpenseCategoryModel(id: "category", userId: "user", name: "Food", icon: nil, color: nil, sortOrder: 0, archivedAt: nil, version: 1)]
        snapshot.journalTags = [JournalTagModel(id: "tag", userId: "user", name: "Idea", color: "teal", createdAt: "2026-08-17", updatedAt: "2026-08-17")]
        snapshot.healthDailySummaries = [HealthDailySummaryModel(deviceId: "device", localDate: "2026-08-17")]
        snapshot.usageSummaries = [UsageSummary(localDate: "2026-08-17", bundleId: "com.example.app", displayName: "App", timezone: "Asia/Ho_Chi_Minh", activeSeconds: 60)]

        var state = IOSPhase6State()
        state.apply(snapshot)

        XCTAssertEqual(state.decks.map(\.id), ["deck"])
        XCTAssertEqual(state.expenseCategories.map(\.id), ["category"])
        XCTAssertEqual(state.journalTags.map(\.id), ["tag"])
        XCTAssertEqual(state.healthDailySummaries.map(\.localDate), ["2026-08-17"])
        XCTAssertEqual(state.usageStatistics?.totalActiveSeconds, 60)
        XCTAssertEqual(state.usageStatisticsState, .loaded)
        XCTAssertTrue(state.usageStatisticsIsLocalOnly)
    }

    func testRemoteStateDoesNotPretendTrashIsOffline() {
        let state = IOSPhase6State()

        XCTAssertNil(state.trashSnapshot)
        XCTAssertEqual(state.trashState, .idle)
        XCTAssertEqual(state.notificationsState, .idle)
    }

    func testHydrationProjectsHabitTimeBlocks() {
        let block = HabitTimeBlockModel(
            id: "morning",
            name: "Morning",
            icon: "sun.max",
            color: "teal",
            startLocal: "08:00",
            endLocal: "10:00",
            sortOrder: 1
        )
        let result = AccountHydrationResult(
            snapshot: OfflineSnapshot(),
            taskPage: nil,
            usagePreferences: nil,
            habitPreferences: nil,
            habitTimeBlocks: [block],
            studySessionHistory: nil,
            notifications: []
        )
        let model = AppModel()

        model.applyHydration(result)

        XCTAssertEqual(model.habitTimeBlocks, [block])
    }

    func testNavigationRequestIsConsumableByTheShellGuard() {
        let model = AppModel()
        model.requestNavigation(to: .statistics)

        guard let request = model.navigationRequest else {
            return XCTFail("Expected a published navigation request")
        }
        XCTAssertEqual(request.destination, .statistics)

        model.consumeNavigationRequest(request)
        XCTAssertNil(model.navigationRequest)
    }

    func testOfflineMutationDropsResultAfterAccountSwitch() async {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-phase6-mutation-\(UUID().uuidString)", isDirectory: true)
        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: root))
        let first = UserProfile(id: "account-one", email: nil, username: "one", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        let second = UserProfile(id: "account-two", email: nil, username: "two", displayName: nil, avatarUrl: nil, roles: [], permissions: [])

        await model.activate(first, reconcileRemote: false)
        let mutation = Task { @MainActor in
            await model.performOfflineMutation { store in
                try await Task.sleep(for: .milliseconds(40))
                let result = try await store.createTask(title: "Stale")
                return result.snapshot
            }
        }
        await Task.yield()
        await model.activate(second, reconcileRemote: false)

        let applied = await mutation.value
        XCTAssertFalse(applied)
        XCTAssertEqual(model.user?.id, second.id)
        XCTAssertTrue(model.tasks.isEmpty)
    }

    func testOfflineMutationDropsResultAfterLogout() async {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-phase6-logout-\(UUID().uuidString)", isDirectory: true)
        let model = AppModel(
            credentialStore: Phase6EmptyCredentialStore(),
            offlineLocation: OfflineStoreLocation(rootURL: root)
        )
        let account = UserProfile(id: "account-one", email: nil, username: "one", displayName: nil, avatarUrl: nil, roles: [], permissions: [])

        await model.activate(account, reconcileRemote: false)
        let mutation = Task { @MainActor in
            await model.performOfflineMutation { store in
                try await Task.sleep(for: .milliseconds(40))
                let result = try await store.createTask(title: "Stale")
                return result.snapshot
            }
        }
        await Task.yield()
        await model.logout()

        let applied = await mutation.value
        XCTAssertFalse(applied)
        XCTAssertNil(model.user)
        XCTAssertTrue(model.tasks.isEmpty)
    }

    func testFocusIntentRestoresCachedAccountBeforeColdStartMutation() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-phase6-focus-cold-start-\(UUID().uuidString)", isDirectory: true)
        let account = UserProfile(id: "focus-cold-start", email: nil, username: "focus", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        let credentials = Phase6EmptyCredentialStore()
        let previousUser = SessionCache.loadUser()
        defer {
            if let previousUser { SessionCache.saveUser(previousUser) } else { SessionCache.clearCachedProfile() }
            try? FileManager.default.removeItem(at: root)
        }

        let original = AppModel(credentialStore: credentials, offlineLocation: OfflineStoreLocation(rootURL: root))
        await original.activate(account, reconcileRemote: false)
        _ = try await original.startFocusFromIntent()
        SessionCache.saveUser(account)

        let coldModel = AppModel(credentialStore: credentials, offlineLocation: OfflineStoreLocation(rootURL: root))
        await coldModel.prepareForFocusIntent()

        let paused = try await coldModel.performFocusIntent(.pause)
        XCTAssertEqual(paused.status, .paused)
        XCTAssertEqual(coldModel.activeFocusSession?.status, .paused)
    }
}

private struct Phase6EmptyCredentialStore: CredentialStore {
    func load(_ key: CredentialKey) throws -> String? { nil }
    func save(_ value: String, for key: CredentialKey) throws {}
    func delete(_ key: CredentialKey) throws {}
}
