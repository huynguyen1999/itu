import XCTest
@testable import iTu
import iTuDomain
import iTuOffline

@MainActor
final class Phase6GymBudgetGrowthTests: XCTestCase {
    func testBudgetMoneyNormalizesDecimalStringsWithoutFloatingPointMath() {
        XCTAssertEqual(IOSBudgetMoney.normalized(" 0012.3400 "), "12.34")
        XCTAssertEqual(IOSBudgetMoney.sum(["0.10", "0.20", "12.34"]), Decimal(string: "12.64"))
        XCTAssertNil(IOSBudgetMoney.normalized("0", positive: true))
        XCTAssertNil(IOSBudgetMoney.normalized("not-money"))
    }

    func testInvalidGymSetTextDoesNotCreateOrCoerceMutation() {
        XCTAssertEqual(
            IOSGymSetValidation.error(metric: "WEIGHT_REPS", reps: "1x", weight: "10", duration: "", distance: ""),
            "Reps must be a positive whole number."
        )
        XCTAssertNil(IOSGymSetValidation.patch(metric: "WEIGHT_REPS", reps: "1x", weight: "10", duration: "", distance: "", completedAt: nil))
        XCTAssertNotNil(IOSGymSetValidation.patch(metric: "WEIGHT_REPS", reps: "8", weight: "", duration: "", distance: "", completedAt: nil))
        XCTAssertNil(IOSGymSetValidation.patch(metric: "DURATION", reps: "", weight: "", duration: "NaN", distance: "", completedAt: nil))
    }

    func testGymDurationSetCompletionPreservesMetricAndQueuesCanonicalMutation() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("itu-phase6-gym-\(UUID().uuidString)", isDirectory: true)
        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: root))
        let account = UserProfile(id: "gym-account", email: nil, username: "gym", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        await model.activate(account, reconcileRemote: false)

        let created = await model.createGymExercise(name: "Row", metricType: "DURATION")
        XCTAssertTrue(created)
        guard let exercise = model.gymExercises.first,
              let workout = await model.startGymWorkout(),
              let entry = await model.addGymExercise(workoutID: workout.id, exerciseID: exercise.id),
              let set = await model.addGymSet(workoutID: workout.id, workoutExerciseID: entry.id) else {
            return XCTFail("Expected local workout graph")
        }

        let completed = await model.updateGymSet(
            workoutID: workout.id,
            workoutExerciseID: entry.id,
            setID: set.id,
            patch: ["durationSeconds": .number(90)],
            complete: true
        )
        XCTAssertTrue(completed)
        let updated = model.gymWorkouts.first?.exercises?.first?.sets?.first
        XCTAssertEqual(updated?.durationSeconds, 90)
        XCTAssertNil(updated?.reps)
        XCTAssertNil(updated?.weight)
        XCTAssertNotNil(updated?.completedAt)

        let mutation = model.pendingMutations.last { $0.kind == "workout-set.complete" }
        XCTAssertEqual(mutation?.payload["durationSeconds"]?.numberValue, 90)
        XCTAssertEqual(mutation?.baseVersion, set.version)
    }

    func testGrowthRewardRedemptionIsOptimisticAndNonRepeatableIsIdempotent() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("itu-phase6-growth-\(UUID().uuidString)", isDirectory: true)
        let accountID = "growth-account"
        let seededStore = OfflineStore(accountID: accountID, location: OfflineStoreLocation(rootURL: root))
        let reward = GrowthRewardDTO(id: "reward", name: "Tea", description: "", icon: "cup.and.saucer", price: 10, repeatable: false, version: 1, archivedAt: nil, listedInShop: true, _count: GrowthRedemptionCountDTO(redemptions: 0))
        _ = try await seededStore.load()
        _ = try await seededStore.updateGrowthOverview(GrowthOverviewDTO(account: GrowthAccountDTO(level: 1, currentXp: 0, nextLevelXp: 100, coinBalance: 20), skills: nil, recentLedger: nil))
        _ = try await seededStore.updateGrowthRewards([reward])

        let model = AppModel(offlineLocation: OfflineStoreLocation(rootURL: root))
        let account = UserProfile(id: accountID, email: nil, username: "growth", displayName: nil, avatarUrl: nil, roles: [], permissions: [])
        await model.activate(account, reconcileRemote: false)
        guard let item = model.shopItems.first else { return XCTFail("Expected seeded Shop item") }

        let redeemed = await model.redeemGrowthReward(item)
        XCTAssertTrue(redeemed)
        XCTAssertEqual(model.userCoins, 10)
        XCTAssertEqual(model.inventoryItems.first?.quantity, 1)
        let repeated = await model.redeemGrowthReward(item)
        XCTAssertFalse(repeated)
        XCTAssertEqual(model.userCoins, 10)
        XCTAssertEqual(model.pendingMutations.filter { $0.kind == "growthshopreward.redeem" }.count, 1)
    }
}
