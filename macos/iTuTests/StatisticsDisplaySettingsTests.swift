import Foundation
import XCTest
@testable import iTu

final class StatisticsDisplaySettingsTests: XCTestCase {
    func testDefaultsAndBackwardCompatibleDecodeClampCounts() throws {
        let defaults = StatisticsDisplaySettings()
        XCTAssertEqual(defaults.defaultRange, "30 Days")
        XCTAssertTrue(defaults.showAppUsage)
        XCTAssertTrue(defaults.showWebsiteUsage)
        XCTAssertTrue(defaults.showEngagement)
        XCTAssertEqual(defaults.topAppsCount, 5)
        XCTAssertEqual(defaults.websiteSliceCount, 7)
        XCTAssertEqual(defaults.chartDensity, .comfortable)

        let data = Data("{\"topAppsCount\":99,\"websiteSliceCount\":0}".utf8)
        let decoded = try JSONDecoder().decode(StatisticsDisplaySettings.self, from: data)
        XCTAssertEqual(decoded.topAppsCount, 10)
        XCTAssertEqual(decoded.websiteSliceCount, 1)
        XCTAssertEqual(decoded.defaultRange, "30 Days")
    }

    func testWebsiteSlicesKeepTopNAndCombineOther() {
        let values = [
            StatisticsWebsiteSlice(hostname: "a.example", activeSeconds: 50),
            StatisticsWebsiteSlice(hostname: "b.example", activeSeconds: 40),
            StatisticsWebsiteSlice(hostname: "c.example", activeSeconds: 10)
        ]
        XCTAssertEqual(
            StatisticsDisplayHelpers.topWebsiteSlices(values, limit: 2),
            [
                StatisticsWebsiteSlice(hostname: "a.example", activeSeconds: 50),
                StatisticsWebsiteSlice(hostname: "b.example", activeSeconds: 40),
                StatisticsWebsiteSlice(hostname: "Other", activeSeconds: 10)
            ]
        )
    }

    func testWebsitePrivacyFilterAndTitleFallback() {
        let details = [
            WebsiteUsageURLDetail(url: "https://normal.example", hostname: "normal.example", activeSeconds: 5, latestTitle: "Normal", isPrivate: false),
            WebsiteUsageURLDetail(url: "https://private.example", hostname: "private.example", activeSeconds: 7, latestTitle: "  ", isPrivate: true)
        ]
        XCTAssertEqual(StatisticsDisplayHelpers.filteredWebsiteDetails(details, filter: .normal).map(\.url), ["https://normal.example"])
        XCTAssertEqual(StatisticsDisplayHelpers.filteredWebsiteDetails(details, filter: .private).map(\.url), ["https://private.example"])
        XCTAssertEqual(StatisticsDisplayHelpers.websiteTitle(details[0]), "Normal")
        XCTAssertEqual(StatisticsDisplayHelpers.websiteTitle(details[1]), "https://private.example")
    }

    func testWebsitePrivacyFilterDoesNotFallBackWhenFilteredDetailsAreEmpty() {
        let fallback = [StatisticsWebsiteSlice(hostname: "example.com", activeSeconds: 120)]
        XCTAssertTrue(
            StatisticsDisplayHelpers.websiteSlices(
                filteredDetails: [],
                privacyFilter: .private,
                fallback: fallback,
                limit: 7
            ).isEmpty
        )
    }
}
