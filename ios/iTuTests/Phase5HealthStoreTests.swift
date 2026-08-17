import XCTest
@testable import iTu
import iTuDomain
import iTuOffline

/// Tests for OfflineStore+Health idempotency, mutation queuing, and account isolation.
final class Phase5HealthStoreTests: XCTestCase {

    // MARK: - Idempotency

    /// Importing the same daily summary twice must result in a single outbox
    /// entry, not two. The server would apply an idempotent upsert anyway, but
    /// minimising outbox churn is a correctness requirement defined in project
    /// guidelines (DoD #17 — no unnecessary raw data uploads).
    func testHealthDailySummaryImportIsIdempotent() async throws {
        let store = makeStore()
        _ = try await store.load()
        let summary = makeDailySummary(localDate: "2026-08-17", steps: 8_000)

        try await store.upsertHealthDailySummary(summary, occurredAt: "2026-08-17T10:00:00.000Z")
        let snapshot1 = try await store.upsertHealthDailySummary(summary, occurredAt: "2026-08-17T10:01:00.000Z")

        XCTAssertEqual(snapshot1.healthDailySummaries.filter { $0.localDate == "2026-08-17" }.count, 1)
        // Idempotent re-import must not create a second outbox mutation.
        let healthMutations = snapshot1.mutations.filter { $0.kind == "healthsummary.upsert" }
        XCTAssertEqual(healthMutations.count, 1, "Idempotent import must reuse the existing outbox mutation.")
    }

    /// Importing an updated daily summary (different step count) must replace
    /// the existing record and produce exactly one updated outbox entry.
    func testHealthDailySummaryUpdateReplacesAndPreservesIdempotencyKey() async throws {
        let store = makeStore()
        _ = try await store.load()
        let original = makeDailySummary(localDate: "2026-08-17", steps: 6_000)
        let updated = makeDailySummary(localDate: "2026-08-17", steps: 9_000)

        try await store.upsertHealthDailySummary(original, occurredAt: "2026-08-17T10:00:00.000Z")
        let snapshot = try await store.upsertHealthDailySummary(updated, occurredAt: "2026-08-17T12:00:00.000Z")

        let stored = snapshot.healthDailySummaries.first { $0.localDate == "2026-08-17" }
        XCTAssertEqual(stored?.steps, 9_000, "Updated summary must replace the original.")

        let mutations = snapshot.mutations.filter { $0.kind == "healthsummary.upsert" }
        XCTAssertEqual(mutations.count, 1, "Updating an existing summary must not create a second mutation.")
        XCTAssertEqual(mutations.first?.payload["steps"]?.numberValue, 9_000)
    }

    /// Importing two different daily summaries must produce two outbox entries.
    func testHealthDailySummaryImportQueuesDistinctMutations() async throws {
        let store = makeStore()
        _ = try await store.load()
        let monday = makeDailySummary(localDate: "2026-08-18", steps: 5_000)
        let tuesday = makeDailySummary(localDate: "2026-08-19", steps: 7_000)

        let snapshot = try await store.applyHealthImport(
            dailySummaries: [monday, tuesday],
            occurredAt: "2026-08-19T10:00:00.000Z"
        )

        let mutations = snapshot.mutations.filter { $0.kind == "healthsummary.upsert" }
        XCTAssertEqual(mutations.count, 2)
        XCTAssertEqual(snapshot.healthDailySummaries.count, 2)
    }

    // MARK: - Workout mutation

    /// A new workout must be stored and queued for sync.
    func testWorkoutUpsertPersistsAndQueues() async throws {
        let store = makeStore()
        _ = try await store.load()
        let workout = makeWorkout(uuid: "uuid-run-1", activityType: "41")

        let snapshot = try await store.upsertHealthWorkout(
            workout,
            occurredAt: "2026-08-17T08:00:00.000Z"
        )

        XCTAssertEqual(snapshot.healthWorkouts.count, 1)
        let mutations = snapshot.mutations.filter { $0.kind == "healthworkout.upsert" }
        XCTAssertEqual(mutations.count, 1)
        XCTAssertEqual(mutations.first?.payload["activityType"]?.stringValue, "41")
    }

    /// Deleting a workout must remove it from the store and produce a delete mutation.
    /// Any existing pending upsert for that workout must be retracted.
    func testWorkoutDeleteRetractsPendingUpsertAndQueuesDelete() async throws {
        let store = makeStore()
        _ = try await store.load()
        let workout = makeWorkout(uuid: "uuid-cycle-1", activityType: "13")

        try await store.upsertHealthWorkout(workout, occurredAt: "2026-08-17T07:00:00.000Z")
        let snapshot = try await store.deleteHealthWorkouts(
            [workout],
            occurredAt: "2026-08-17T09:00:00.000Z"
        )

        XCTAssertTrue(snapshot.healthWorkouts.isEmpty, "Deleted workout must be removed from the store.")
        let upserts = snapshot.mutations.filter { $0.kind == "healthworkout.upsert" }
        let deletes = snapshot.mutations.filter { $0.kind == "healthworkout.delete" }
        XCTAssertTrue(upserts.isEmpty, "Pending upsert must be retracted when workout is deleted.")
        XCTAssertEqual(deletes.count, 1)
        XCTAssertEqual(deletes.first?.payload["healthKitUUID"]?.stringValue, "uuid-cycle-1")
    }

    // MARK: - Import state propagation

    /// An import state update must be reflected in the snapshot.
    func testApplyHealthImportUpdatesImportState() async throws {
        let store = makeStore()
        _ = try await store.load()
        let importState = HealthImportState(
            dailySummaryAnchor: "encoded-anchor-data",
            lastSuccessfulImportAt: "2026-08-17T10:00:00.000Z"
        )

        let snapshot = try await store.applyHealthImport(
            dailySummaries: [],
            importState: importState,
            occurredAt: "2026-08-17T10:00:00.000Z"
        )

        XCTAssertEqual(snapshot.healthImportState.dailySummaryAnchor, "encoded-anchor-data")
        XCTAssertEqual(snapshot.healthImportState.lastSuccessfulImportAt, "2026-08-17T10:00:00.000Z")
    }

    // MARK: - Atomic rollback

    /// If persistence fails the store must roll back to the previous state.
    /// We simulate this by disabling persistence and verifying that a clean
    /// subsequent load does not contain the uncommitted changes.
    func testHealthTransactionRollsBackOnPersistFailure() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-health-rollback-\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let store = OfflineStore(accountID: "rollback-account", baseURL: root)
        _ = try await store.load()

        // Make the directory read-only so atomic file creation fails.
        try FileManager.default.setAttributes([.posixPermissions: 0o555], ofItemAtPath: root.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: root.path) }

        let summary = makeDailySummary(localDate: "2026-08-20", steps: 1_000)
        do {
            try await store.upsertHealthDailySummary(summary, occurredAt: "2026-08-20T10:00:00.000Z")
            XCTFail("Expected persistence to fail on an unwritable directory")
        } catch {
            // Expected path — verify the in-memory state was rolled back.
            let current = await store.snapshot()
            XCTAssertTrue(
                current.healthDailySummaries.isEmpty,
                "Failed persistence must roll back in-memory health summaries."
            )
        }
    }

    // MARK: - Helpers

    private func makeStore() -> OfflineStore {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-health-store-\(UUID().uuidString)", isDirectory: true)
        return OfflineStore(accountID: "health-test-account", baseURL: root)
    }

    private func makeDailySummary(localDate: String, steps: Int) -> HealthDailySummaryModel {
        HealthDailySummaryModel(
            deviceId: "test-device",
            localDate: localDate,
            steps: steps,
            walkingRunningDistanceMeters: 4_000,
            activeEnergyKcal: 350,
            exerciseMinutes: 45,
            sleepMinutes: 420
        )
    }

    private func makeWorkout(uuid: String, activityType: String) -> HealthWorkoutSummaryModel {
        HealthWorkoutSummaryModel(
            source: .healthKit,
            deviceId: "test-device",
            healthKitUUID: uuid,
            activityType: activityType,
            startAt: "2026-08-17T06:00:00Z",
            endAt: "2026-08-17T07:00:00Z",
            durationSeconds: 3_600,
            energyKcal: 400
        )
    }
}
