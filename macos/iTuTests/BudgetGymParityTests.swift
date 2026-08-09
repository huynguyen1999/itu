import XCTest
@testable import iTu

final class BudgetGymParityTests: XCTestCase {
    func testMoneyDecimalStringsDecode() throws {
        let data = #"{"id":"tx","userId":"u","type":"EXPENSE","amount":"12.30","currency":"VND","category":"Food","categoryId":null,"merchant":null,"paymentMethod":"CASH","transactionAt":"2026-08-10T00:00:00Z","note":null}"#.data(using: .utf8)!
        let value = try JSONDecoder().decode(BudgetTransactionModel.self, from: data)
        XCTAssertEqual(value.amount, 12.3, accuracy: 0.001)
    }

    func testRestTimerStartsAndStopsLocally() {
        var timer = GymRestTimer()
        timer.start(seconds: 120)
        XCTAssertTrue(timer.isRunning)
        timer.stop()
        XCTAssertFalse(timer.isRunning)
    }
}
