import Foundation
import XCTest
import iTuDomain
@testable import iTuOffline

final class OfflineStoreTests: XCTestCase {
    func testAccountFilesAreSeparated() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }

        _ = try await OfflineStore(accountID: "account/one", location: OfflineStoreLocation(rootURL: root)).load()
        _ = try await OfflineStore(accountID: "account/two", location: OfflineStoreLocation(rootURL: root)).load()

        let names = try FileManager.default.contentsOfDirectory(atPath: root.path).sorted()
        XCTAssertEqual(names, ["offline-account_one-v1.json", "offline-account_two-v1.json"])
    }

    func testMutationPersistsAndReloads() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let mutation = mutation(id: "mutation-1", kind: "task.create", entityID: "task-1")

        let store = OfflineStore(accountID: "account", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let persisted = try await store.enqueue(mutation)
        let reloaded = try await OfflineStore(accountID: "account", location: OfflineStoreLocation(rootURL: root)).load()

        XCTAssertEqual(persisted.mutations, reloaded.mutations)
    }

    func testConsecutiveUpdatesCoalesce() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()

        _ = try await store.enqueue(mutation(id: "mutation-1", kind: "task.update", entityID: "task-1", payload: ["title": .string("first")]))
        let snapshot = try await store.enqueue(mutation(id: "mutation-2", kind: "task.update", entityID: "task-1", payload: ["status": .string("DONE")]))

        XCTAssertEqual(snapshot.mutations.count, 1)
        XCTAssertEqual(snapshot.mutations[0].id, "mutation-1")
        XCTAssertEqual(snapshot.mutations[0].payload["title"], .string("first"))
        XCTAssertEqual(snapshot.mutations[0].payload["status"], .string("DONE"))
    }

    func testCursorIsMonotonicAndAcknowledgementRemovesMutation() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()
        let mutation = mutation(id: "mutation-1", kind: "task.create", entityID: "task-1")
        _ = try await store.enqueue(mutation)

        _ = try await store.applySync(
            acknowledgedMutationIds: [], conflicts: [], changes: [], cursor: "5"
        )
        let snapshot = try await store.applySync(
            acknowledgedMutationIds: [mutation.id], conflicts: [], changes: [], cursor: "3"
        )

        XCTAssertEqual(snapshot.cursor, "5")
        XCTAssertTrue(snapshot.mutations.isEmpty)
    }

    func testLegacyHabitMutationMigratesOnLoad() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let legacy = mutation(
            id: "mutation-1",
            kind: "habit.checkin",
            entityID: "habit-1",
            payload: ["isCompletedToday": .bool(true), "occurredAt": .string("2026-08-17T00:00:00Z")]
        )
        var snapshot = OfflineSnapshot()
        snapshot.mutations = [legacy]
        let encoder = JSONEncoder()
        let fileURL = root.appendingPathComponent("offline-account-v1.json")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try encoder.encode(snapshot).write(to: fileURL)

        let migrated = try await OfflineStore(accountID: "account", location: OfflineStoreLocation(rootURL: root)).load()

        XCTAssertEqual(migrated.mutations.first?.kind, "habitoccurrence.checkin")
        XCTAssertEqual(migrated.mutations.first?.entityId, migrated.habitOccurrences.first?.id)
        XCTAssertNotEqual(migrated.mutations.first?.id, legacy.id)
    }

    func testDeviceActivityReplacementIsAbsolutePerWindowAndSource() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let store = OfflineStore(accountID: "account", location: OfflineStoreLocation(rootURL: root))
        _ = try await store.load()

        let firstHour = UsageSummary(
            localDate: "2026-08-17", hour: 9, bundleId: "app.a", displayName: "A", timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 100, engagedSeconds: 80, source: .deviceActivity
        )
        let omitted = UsageSummary(
            localDate: "2026-08-17", hour: 9, bundleId: "app.b", displayName: "B", timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 50, source: .deviceActivity
        )
        let adjacent = UsageSummary(
            localDate: "2026-08-17", hour: 10, bundleId: "app.c", displayName: "C", timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 25, source: .deviceActivity
        )
        _ = try await store.replaceDeviceActivityUsage([firstHour, omitted, adjacent], deviceId: "ios-device")
        _ = try await store.replaceDeviceActivityUsage(
            deviceId: "ios-device",
            summaries: [UsageSummary(
                localDate: "2026-08-17", hour: 9, bundleId: "app.a", displayName: "A", timezone: "Asia/Ho_Chi_Minh",
                activeSeconds: 140, engagedSeconds: 100
            )]
        )

        let after = await store.usageSummaries()
        XCTAssertEqual(after.count, 2)
        XCTAssertEqual(after.first(where: { $0.bundleId == "app.a" })?.activeSeconds, 140)
        XCTAssertNil(after.first(where: { $0.bundleId == "app.b" }))
        XCTAssertEqual(after.first(where: { $0.bundleId == "app.c" })?.activeSeconds, 25)
        XCTAssertTrue(after.allSatisfy { $0.source == .deviceActivity && $0.deviceId == "ios-device" })

        _ = try await store.replaceDeviceActivityUsage(
            deviceId: "ios-device",
            summaries: [UsageSummary(
                localDate: "2026-08-17", hour: 9, bundleId: "app.a", displayName: "A", timezone: "Asia/Ho_Chi_Minh",
                activeSeconds: 140
            )]
        )
        let replaced = await store.usageSummaries()
        XCTAssertEqual(replaced.filter { $0.bundleId == "app.a" }.count, 1)

        _ = try await store.upsertUsage(UsageSummary(
            localDate: "2026-08-17", hour: 9, bundleId: "app.a", displayName: "Mac", timezone: "Asia/Ho_Chi_Minh", activeSeconds: 10
        ))
        let separated = await store.usageSummaries()
        XCTAssertEqual(separated.filter { $0.bundleId == "app.a" }.count, 2)
    }

    func testLoadRemovesLegacyDeviceActivityWebsitesButKeepsBrowserRows() async throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let location = OfflineStoreLocation(rootURL: root)
        let store = OfflineStore(accountID: "account", location: location)
        _ = try await store.load()
        _ = try await store.upsertWebsiteUsage(WebsiteUsageSummary(
            localDate: "2026-08-17", hour: 9, browserDisplayName: "DeviceActivity", hostname: "screen.example",
            timezone: "Asia/Ho_Chi_Minh", activeSeconds: 20, source: .deviceActivity, deviceId: "ios-device"
        ))
        _ = try await store.upsertWebsiteUsage(WebsiteUsageSummary(
            localDate: "2026-08-17", hour: 9, browserBundleId: "com.apple.mobilesafari", browserDisplayName: "Safari",
            hostname: "browser.example", timezone: "Asia/Ho_Chi_Minh", activeSeconds: 30, source: .browser,
            deviceId: "safari-installation"
        ))

        let reloaded = OfflineStore(accountID: "account", location: location)
        _ = try await reloaded.load()
        let websites = await reloaded.websiteUsageSummaries()
        XCTAssertEqual(websites.map(\.hostname), ["browser.example"])
    }

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("iTuOfflineTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private func mutation(
        id: String,
        kind: String,
        entityID: String,
        payload: [String: JSONValue] = [:]
    ) -> SyncMutation {
        SyncMutation(id: id, kind: kind, entityId: entityID, payload: payload, occurredAt: "2026-08-17T00:00:00Z")
    }
}
