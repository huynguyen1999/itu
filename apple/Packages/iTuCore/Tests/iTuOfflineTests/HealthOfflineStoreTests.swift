import Foundation
import XCTest
import iTuDomain
@testable import iTuOffline

final class HealthOfflineStoreTests: XCTestCase {
    func testLegacySnapshotDefaultsHealthFields() throws {
        let snapshot = try JSONDecoder().decode(OfflineSnapshot.self, from: Data("{}".utf8))

        XCTAssertTrue(snapshot.healthDailySummaries.isEmpty)
        XCTAssertTrue(snapshot.healthWorkouts.isEmpty)
        XCTAssertEqual(snapshot.healthImportState, HealthImportState())
    }

    func testDailyReplacementIsAbsoluteAndSeparatesDateAndDevice() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()

        let dayOne = daily(deviceID: "phone", date: "2026-08-17", steps: 100)
        let dayTwo = daily(deviceID: "phone", date: "2026-08-18", steps: 200)
        let otherDevice = daily(deviceID: "watch", date: "2026-08-17", steps: 300)
        _ = try await store.replaceHealthDailySummaries([dayOne, dayTwo, otherDevice])

        _ = try await store.replaceHealthDailySummaries([daily(deviceID: "phone", date: "2026-08-17", steps: 150)])
        let values = await store.healthDailySummaries()

        XCTAssertEqual(values.first(where: { $0.id == dayOne.id })?.steps, 150)
        XCTAssertEqual(values.first(where: { $0.id == dayTwo.id })?.steps, 200)
        XCTAssertEqual(values.first(where: { $0.id == otherDevice.id })?.steps, 300)
    }

    func testRepeatedHealthInputsDoNotAddRecordsOrMutations() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let value = daily(deviceID: "phone", date: "2026-08-17", steps: 100)

        _ = try await store.replaceHealthDailySummaries([value])
        let first = await store.snapshot()
        _ = try await store.replaceHealthDailySummaries([value])
        let second = await store.snapshot()

        XCTAssertEqual(second.healthDailySummaries, first.healthDailySummaries)
        XCTAssertEqual(second.mutations.count, 1)
        XCTAssertEqual(second.mutations.first?.kind, "healthsummary.upsert")
        XCTAssertEqual(second.mutations.first?.payload["steps"], .number(100))
    }

    func testWorkoutUpsertAndDeletionQueueExactMutations() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let workout = HealthWorkoutSummaryModel(
            deviceId: "phone",
            healthKitUUID: "workout-1",
            activityType: "RUNNING",
            startAt: "2026-08-17T01:00:00Z",
            endAt: "2026-08-17T01:30:00Z",
            durationSeconds: 1_800,
            energyKcal: 250,
            sourceBundle: "com.apple.health",
            deviceName: "iPhone"
        )

        _ = try await store.upsertHealthWorkout(workout)
        var snapshot = await store.snapshot()
        XCTAssertEqual(snapshot.mutations.count, 1)
        XCTAssertEqual(snapshot.mutations[0].kind, "healthworkout.upsert")
        XCTAssertEqual(snapshot.mutations[0].entityId, workout.id)
        XCTAssertEqual(snapshot.mutations[0].payload["healthKitUUID"], .string("workout-1"))
        XCTAssertEqual(snapshot.mutations[0].payload["durationSeconds"], .number(1_800))
        XCTAssertNotNil(snapshot.mutations[0].payload["idempotencyKey"]?.stringValue)

        _ = try await store.deleteHealthWorkouts([workout])
        snapshot = await store.snapshot()
        XCTAssertTrue(snapshot.healthWorkouts.isEmpty)
        XCTAssertEqual(snapshot.mutations.count, 1)
        XCTAssertEqual(snapshot.mutations[0].kind, "healthworkout.delete")
        XCTAssertNil(snapshot.mutations[0].payload["deviceId"])
        XCTAssertEqual(snapshot.mutations[0].payload["source"], .string("HEALTH_KIT"))
        XCTAssertEqual(snapshot.mutations[0].payload["healthKitUUID"], .string("workout-1"))
    }

    func testImportAnchorPersistsWithDataAndReloads() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        var importState = HealthImportState(dailySummaryAnchor: "opaque-daily", workoutAnchor: "opaque-workout")
        importState.lastSuccessfulImportAt = "2026-08-17T01:00:00Z"

        _ = try await store.applyHealthImport(
            dailySummaries: [daily(deviceID: "phone", date: "2026-08-17", steps: 123)],
            importState: importState,
            occurredAt: "2026-08-17T01:00:00Z"
        )
        let reloaded = try await OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root)).load()

        XCTAssertEqual(reloaded.healthImportState, importState)
        XCTAssertEqual(reloaded.healthDailySummaries.first?.steps, 123)
    }

    func testOutboxUsesBackendHealthContract() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let summary = HealthDailySummaryModel(
            deviceId: "ios-device",
            localDate: "2026-08-17",
            steps: 1_200,
            walkingRunningDistanceMeters: 900,
            activeEnergyKcal: 340,
            exerciseMinutes: 30,
            standHours: 8,
            sleepMinutes: 420,
            sleepStartAt: "2026-08-16T22:00:00.000Z",
            sleepEndAt: "2026-08-17T05:00:00.000Z",
            restingHeartRateBpm: 58,
            hrvMilliseconds: 42,
            workoutCount: 1,
            workoutMinutes: 30,
            workoutEnergyKcal: 250
        )
        let workout = HealthWorkoutSummaryModel(
            deviceId: "ios-device",
            healthKitUUID: "workout-1",
            activityType: "RUNNING",
            startAt: "2026-08-17T06:00:00.000Z",
            endAt: "2026-08-17T06:30:00.000Z",
            durationSeconds: 1_800,
            energyKcal: 250,
            sourceBundle: "com.apple.Health",
            deviceName: "iPhone"
        )

        _ = try await store.upsertHealthDailySummary(summary)
        _ = try await store.upsertHealthWorkout(workout)
        let mutations = (await store.snapshot()).mutations
        XCTAssertEqual(HealthSource.healthKit.rawValue, "HEALTH_KIT")
        XCTAssertEqual(
            payloadWithoutIdempotency(mutations[0].payload),
            [
                "source": .string("HEALTH_KIT"), "localDate": .string("2026-08-17"),
                "steps": .number(1_200), "walkingRunningDistanceMeters": .number(900),
                "activeEnergyKcal": .number(340), "exerciseMinutes": .number(30),
                "standHours": .number(8), "sleepMinutes": .number(420),
                "sleepStart": .string("2026-08-16T22:00:00.000Z"),
                "sleepEnd": .string("2026-08-17T05:00:00.000Z"),
                "restingHeartRateBpm": .number(58), "hrvMilliseconds": .number(42),
                "workoutCount": .number(1), "workoutMinutes": .number(30),
                "workoutEnergyKcal": .number(250)
            ]
        )
        XCTAssertEqual(
            payloadWithoutIdempotency(mutations[1].payload),
            [
                "source": .string("HEALTH_KIT"), "healthKitUUID": .string("workout-1"),
                "activityType": .string("RUNNING"),
                "startedAt": .string("2026-08-17T06:00:00.000Z"),
                "endedAt": .string("2026-08-17T06:30:00.000Z"),
                "durationSeconds": .number(1_800), "energyKcal": .number(250),
                "sourceBundleId": .string("com.apple.Health"), "deviceName": .string("iPhone")
            ]
        )

        _ = try await store.deleteHealthWorkout(deviceId: "ios-device", healthKitUUID: "workout-1")
        let delete = (await store.snapshot()).mutations[1]
        XCTAssertEqual(
            payloadWithoutIdempotency(delete.payload),
            ["source": .string("HEALTH_KIT"), "healthKitUUID": .string("workout-1")]
        )
    }

    func testSyncHydratesIncrementalHealthChangesAndDeletes() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let summaryData = summaryChangeData(steps: 100)
        let workoutData = workoutChangeData()

        _ = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [
                SyncChange(cursor: 1, entityType: "healthsummary", entityId: "ios-device:2026-08-17", deleted: false, data: summaryData),
                SyncChange(cursor: 2, entityType: "healthworkout", entityId: "ios-device:workout-1", deleted: false, data: workoutData)
            ],
            cursor: "2"
        )
        var summaries = await store.healthDailySummaries()
        var workouts = await store.healthWorkouts()
        XCTAssertEqual(summaries.first?.deviceId, "ios-device")
        XCTAssertEqual(summaries.first?.steps, 100)
        XCTAssertEqual(workouts.first?.startAt, "2026-08-17T06:00:00.000Z")

        _ = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [
                SyncChange(cursor: 3, entityType: "healthsummary", entityId: "ios-device:2026-08-17", deleted: false, data: summaryChangeData(steps: 150)),
                SyncChange(cursor: 4, entityType: "healthworkout", entityId: "ios-device:workout-1", deleted: true, data: workoutData)
            ],
            cursor: "4"
        )
        summaries = await store.healthDailySummaries()
        workouts = await store.healthWorkouts()
        XCTAssertEqual(summaries.first?.steps, 150)
        XCTAssertTrue(workouts.isEmpty)
    }

    func testSyncPreservesPendingLocalHealthMutation() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "health", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        _ = try await store.upsertHealthDailySummary(daily(deviceID: "ios-device", date: "2026-08-17", steps: 200))

        _ = try await store.applySync(
            acknowledgedMutationIds: [],
            conflicts: [],
            changes: [SyncChange(
                cursor: 1,
                entityType: "healthsummary",
                entityId: "ios-device:2026-08-17",
                deleted: false,
                data: summaryChangeData(steps: 99)
            )],
            cursor: "1"
        )

        let summaries = await store.healthDailySummaries()
        let snapshot = await store.snapshot()
        XCTAssertEqual(summaries.first?.steps, 200)
        XCTAssertEqual(snapshot.mutations.first?.kind, "healthsummary.upsert")
    }

    private func daily(deviceID: String, date: String, steps: Int) -> HealthDailySummaryModel {
        HealthDailySummaryModel(deviceId: deviceID, localDate: date, steps: steps)
    }

    private func payloadWithoutIdempotency(_ payload: [String: JSONValue]) -> [String: JSONValue] {
        payload.filter { $0.key != "idempotencyKey" }
    }

    private func summaryChangeData(steps: Int) -> JSONValue {
        .object([
            "source": .string("HEALTH_KIT"), "syncDeviceId": .string("ios-device"),
            "localDate": .string("2026-08-17"), "steps": .number(Double(steps)),
            "walkingRunningDistanceMeters": .number(900), "activeEnergyKcal": .number(340),
            "exerciseMinutes": .number(30), "standHours": .null, "sleepMinutes": .number(420),
            "sleepStart": .string("2026-08-16T22:00:00.000Z"), "sleepEnd": .string("2026-08-17T05:00:00.000Z"),
            "restingHeartRateBpm": .null, "hrvMilliseconds": .null,
            "workoutCount": .number(1), "workoutMinutes": .number(30), "workoutEnergyKcal": .number(250)
        ])
    }

    private func workoutChangeData() -> JSONValue {
        .object([
            "source": .string("HEALTH_KIT"), "syncDeviceId": .string("ios-device"),
            "healthKitUUID": .string("workout-1"), "activityType": .string("RUNNING"),
            "startedAt": .string("2026-08-17T06:00:00.000Z"),
            "endedAt": .string("2026-08-17T06:30:00.000Z"), "durationSeconds": .number(1_800),
            "energyKcal": .number(250), "sourceBundleId": .string("com.apple.Health"),
            "deviceName": .string("iPhone")
        ])
    }

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("iTuHealthTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
}
