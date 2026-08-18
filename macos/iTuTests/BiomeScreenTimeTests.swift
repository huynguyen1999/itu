import XCTest
@testable import iTu
import iTuDomain
import iTuNetworking

final class BiomeScreenTimeTests: XCTestCase {
    func testBiomeReaderSelectsLocalAndRemoteStreams() {
        let localDevice = ScreenTimeDevice(deviceIdentifier: "LOCAL", isMe: true)
        let remoteDevice = ScreenTimeDevice(deviceIdentifier: "REMOTE")

        XCTAssertTrue(BiomeAppInFocusReader.deviceStreamDirectory(for: localDevice).path.hasSuffix("/App.InFocus/local"))
        XCTAssertTrue(BiomeAppInFocusReader.deviceStreamDirectory(for: remoteDevice).path.hasSuffix("/App.InFocus/remote/REMOTE"))
    }

    // MARK: - Protobuf Decoder Tests

    func testProtobufDecoderVarintAndString() {
        // Tag 6 (bundleId string "ph.telegra.Telegraph")
        // Field 6, wire type 2 -> (6 << 3) | 2 = 50 (0x32)
        // Length: 20 (0x14)
        let str = "ph.telegra.Telegraph"
        var data = Data([0x32, UInt8(str.utf8.count)])
        data.append(contentsOf: str.utf8)

        // Tag 3 (starting varint 1)
        // Field 3, wire type 0 -> (3 << 3) | 0 = 24 (0x18)
        // Varint: 1
        data.append(contentsOf: [0x18, 0x01])

        let fields = BiomeProtobufDecoder.decodeFields(from: data)
        XCTAssertEqual(fields.count, 2)

        let stringField = fields.first { $0.fieldNumber == 6 }
        XCTAssertEqual(stringField?.stringValue, "ph.telegra.Telegraph")

        let boolField = fields.first { $0.fieldNumber == 3 }
        XCTAssertEqual(boolField?.boolValue, true)
    }

    // MARK: - SEGB Record Decoder Tests

    func testSEGBRecordDecoderValidPayload() throws {
        // Build a minimal valid SEGB binary
        // 32-byte header: "SEGB", entriesCount = 1, timestamp = 0, reserved = 16 zeros
        var fileData = Data()
        fileData.append(contentsOf: [0x53, 0x45, 0x47, 0x42]) // "SEGB"
        var entriesCount: UInt32 = 1
        fileData.append(Data(bytes: &entriesCount, count: 4))
        var zeroTimestamp: Double = 0
        fileData.append(Data(bytes: &zeroTimestamp, count: 8))
        fileData.append(Data(repeating: 0, count: 16)) // 32 bytes header total

        // Entry payload: 8-byte entry header + protobuf payload
        var entryData = Data(repeating: 0, count: 8) // 8-byte entry header
        // Tag 6: bundleId = "com.apple.mobilesafari"
        let bundle = "com.apple.mobilesafari"
        entryData.append(contentsOf: [0x32, UInt8(bundle.utf8.count)])
        entryData.append(contentsOf: bundle.utf8)
        // Tag 3: starting = 1
        entryData.append(contentsOf: [0x18, 0x01])
        // Tag 4: absoluteTimestamp = 700000000.0 (CFAbsoluteTime)
        var ts: Double = 700000000.0
        entryData.append(contentsOf: [0x21]) // Tag 4 wire type 1: (4 << 3) | 1 = 0x21
        entryData.append(Data(bytes: &ts, count: 8))

        fileData.append(entryData)

        // Trailer record: 16 bytes at EOF
        // endOffsetRel32 (UInt32) = entryData.count
        var endOffsetRel = UInt32(entryData.count)
        fileData.append(Data(bytes: &endOffsetRel, count: 4))
        // state (UInt32) = 1 (written)
        var state: UInt32 = 1
        fileData.append(Data(bytes: &state, count: 4))
        // recordTimestamp (Double)
        fileData.append(Data(bytes: &ts, count: 8))

        let decodedEvents = try BiomeRecordDecoder.decodeAppInFocusEvents(from: fileData)
        XCTAssertEqual(decodedEvents.count, 1)
        XCTAssertEqual(decodedEvents[0].bundleId, "com.apple.mobilesafari")
        XCTAssertEqual(decodedEvents[0].starting, true)
        XCTAssertEqual(decodedEvents[0].timestamp, Date(timeIntervalSinceReferenceDate: 700000000.0))
    }

    func testSEGBRecordDecoderInvalidHeaderThrows() {
        let badData = Data(repeating: 0xAA, count: 64)
        XCTAssertThrowsError(try BiomeRecordDecoder.decodeAppInFocusEvents(from: badData)) { error in
            XCTAssertEqual(error as? BiomeRecordDecoderError, .invalidMagicHeader)
        }
    }

    // MARK: - Normalizer & Stitching Tests

    func testUsageNormalizerStitchesStartAndEndEvents() {
        let device = ScreenTimeDevice(
            deviceIdentifier: "TEST-DEVICE-UUID-1",
            name: "Huy's iPhone",
            model: "iPhone 16 Pro",
            platform: "iOS"
        )

        let start = Date(timeIntervalSince1970: 1700000000)
        let end = Date(timeIntervalSince1970: 1700000300) // 300 seconds

        let events = [
            BiomeAppInFocusEvent(timestamp: start, bundleId: "ph.telegra.Telegraph", starting: true),
            BiomeAppInFocusEvent(timestamp: end, bundleId: "ph.telegra.Telegraph", starting: false)
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        XCTAssertEqual(intervals.count, 1)

        let interval = intervals[0]
        XCTAssertEqual(interval.sourceDeviceId, "TEST-DEVICE-UUID-1")
        XCTAssertEqual(interval.sourceDeviceName, "Huy's iPhone")
        XCTAssertEqual(interval.bundleId, "ph.telegra.Telegraph")
        XCTAssertEqual(interval.displayName, "Telegram")
        XCTAssertEqual(interval.startedAt, start)
        XCTAssertEqual(interval.endedAt, end)
        XCTAssertEqual(interval.durationSeconds, 300)
        XCTAssertEqual(interval.source, .screenTimeBiome)

        // Deterministic event ID check
        let expectedID = ImportedUsageInterval.deterministicEventID(
            sourceDeviceId: "TEST-DEVICE-UUID-1",
            bundleId: "ph.telegra.Telegraph",
            startedAt: start,
            endedAt: end
        )
        XCTAssertEqual(interval.eventId, expectedID)
    }

    func testUsageNormalizerAutoClosesWhenAppSwitches() {
        let device = ScreenTimeDevice(deviceIdentifier: "TEST-DEVICE-UUID-2")

        let t0 = Date(timeIntervalSince1970: 1700000000)
        let t1 = Date(timeIntervalSince1970: 1700000120) // Safari opened 120s later without explicit Telegram end
        let t2 = Date(timeIntervalSince1970: 1700000300) // Safari closed at 300s

        let events = [
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "ph.telegra.Telegraph", starting: true),
            BiomeAppInFocusEvent(timestamp: t1, bundleId: "com.apple.mobilesafari", starting: true),
            BiomeAppInFocusEvent(timestamp: t2, bundleId: "com.apple.mobilesafari", starting: false)
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        XCTAssertEqual(intervals.count, 2)

        XCTAssertEqual(intervals[0].bundleId, "ph.telegra.Telegraph")
        XCTAssertEqual(intervals[0].startedAt, t0)
        XCTAssertEqual(intervals[0].endedAt, t1)
        XCTAssertEqual(intervals[0].durationSeconds, 120)

        XCTAssertEqual(intervals[1].bundleId, "com.apple.mobilesafari")
        XCTAssertEqual(intervals[1].startedAt, t1)
        XCTAssertEqual(intervals[1].endedAt, t2)
        XCTAssertEqual(intervals[1].durationSeconds, 180)
    }

    // MARK: - State Store Outbox Tests

    func testBiomeImportStateStoreOutboxFlow() async {
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = BiomeImportStateStore(storageDirectory: tempDir)

        let start = Date(timeIntervalSince1970: 1700000000)
        let end = Date(timeIntervalSince1970: 1700000060)
        let interval = ImportedUsageInterval(
            eventId: "EID_TEST_1",
            source: .screenTimeBiome,
            sourceDeviceId: "DEVICE_1",
            bundleId: "com.apple.mobilesafari",
            displayName: "Safari",
            startedAt: start,
            endedAt: end,
            durationSeconds: 60
        )

        let inserted = await store.saveIntervalsToOutbox([interval])
        XCTAssertEqual(inserted, 1)

        let pendingCount = await store.pendingCount()
        XCTAssertEqual(pendingCount, 1)

        let pendingItems = await store.pendingOutboxItems()
        XCTAssertEqual(pendingItems.count, 1)
        XCTAssertEqual(pendingItems[0].eventId, "EID_TEST_1")
        XCTAssertEqual(pendingItems[0].uploadState, .pending)

        // Duplicate insert ignored
        let duplicateInserted = await store.saveIntervalsToOutbox([interval])
        XCTAssertEqual(duplicateInserted, 0)

        // Mark uploaded
        await store.markUploaded(eventIds: ["EID_TEST_1"])
        let pendingAfter = await store.pendingCount()
        XCTAssertEqual(pendingAfter, 0)

        let totalAfter = await store.totalImportedCount()
        XCTAssertEqual(totalAfter, 1)

        // Clean up temp dir
        try? FileManager.default.removeItem(at: tempDir)
    }

    // MARK: - Mock Coordinator Tests

    final class MockScreenTimeSource: ScreenTimeUsageSource, @unchecked Sendable {
        var devicesToReturn: [ScreenTimeDevice] = []
        var intervalsToReturn: [ImportedUsageInterval] = []

        func discoverDevices() async throws -> [ScreenTimeDevice] {
            devicesToReturn
        }

        func intervals(for device: ScreenTimeDevice, since watermark: Date?) async throws -> [ImportedUsageInterval] {
            intervalsToReturn
        }
    }

    func testCoordinatorRunOnceWithMockSource() async {
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = BiomeImportStateStore(storageDirectory: tempDir)

        let mockSource = MockScreenTimeSource()
        mockSource.devicesToReturn = [
            ScreenTimeDevice(deviceIdentifier: "MOCK_IOS_DEVICE", name: "iPhone 16", model: "iPhone", platform: "iOS")
        ]
        let start = Date()
        let end = start.addingTimeInterval(120)
        mockSource.intervalsToReturn = [
            ImportedUsageInterval(
                eventId: "MOCK_EID_1",
                source: .screenTimeBiome,
                sourceDeviceId: "MOCK_IOS_DEVICE",
                bundleId: "com.apple.mobilesafari",
                displayName: "Safari",
                startedAt: start,
                endedAt: end,
                durationSeconds: 120
            )
        ]

        let coordinator = BiomeImportCoordinator(
            source: mockSource,
            stateStore: store,
            apiClientProvider: nil,
            macSyncDeviceIdProvider: nil
        )

        // Run checkStatus
        let status = await coordinator.checkStatus()
        XCTAssertEqual(status.pendingUploadCount, 0)

        let outbox = await coordinator.allOutboxIntervals()
        XCTAssertTrue(outbox.isEmpty)

        try? FileManager.default.removeItem(at: tempDir)
    }

    func testAsUsageSummariesSlicesCorrectly() {
        let interval = ImportedUsageInterval(
            eventId: "TEST-EID",
            source: .screenTimeBiome,
            sourceDeviceId: "DEVICE_1",
            bundleId: "ph.telegra.Telegraph",
            displayName: "Telegram",
            startedAt: Date(timeIntervalSince1970: 1700000000), // fixed instant
            endedAt: Date(timeIntervalSince1970: 1700001800),   // +1800s (30m)
            durationSeconds: 1800
        )

        let summaries = interval.asUsageSummaries(timeZone: TimeZone(identifier: "UTC")!)
        XCTAssertFalse(summaries.isEmpty)
        let totalSeconds = summaries.reduce(0) { $0 + $1.activeSeconds }
        XCTAssertEqual(totalSeconds, 1800)
        XCTAssertEqual(summaries[0].bundleId, "ph.telegra.Telegraph")
        XCTAssertEqual(summaries[0].displayName, "Telegram")
        XCTAssertEqual(summaries[0].source, .screenTimeBiome)
    }

    func testParseTimestampSupportsBothEpochs() {
        // Unix timestamp (seconds since 1970)
        let unixTs: Double = 1787038600
        let dateFromUnix = BiomeRecordDecoder.parseTimestamp(unixTs)
        XCTAssertEqual(dateFromUnix.timeIntervalSince1970, unixTs, accuracy: 1.0)

        // CFAbsoluteTime (seconds since 2001)
        let cfTs: Double = 700000000
        let dateFromCF = BiomeRecordDecoder.parseTimestamp(cfTs)
        XCTAssertEqual(dateFromCF.timeIntervalSinceReferenceDate, cfTs, accuracy: 1.0)
    }

    func testPruneInvalidTimestamps() async {
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        let store = BiomeImportStateStore(storageDirectory: tempDir)

        let validDate = Date()
        let corruptedFutureDate = Date(timeIntervalSinceReferenceDate: 1787038600) // Year 2057

        let validInterval = ImportedUsageInterval(
            eventId: "EID_VALID",
            source: .screenTimeBiome,
            sourceDeviceId: "DEV1",
            bundleId: "com.apple.safari",
            displayName: "Safari",
            startedAt: validDate,
            endedAt: validDate.addingTimeInterval(60),
            durationSeconds: 60
        )
        let corruptInterval = ImportedUsageInterval(
            eventId: "EID_CORRUPT",
            source: .screenTimeBiome,
            sourceDeviceId: "DEV1",
            bundleId: "com.apple.safari",
            displayName: "Safari",
            startedAt: corruptedFutureDate,
            endedAt: corruptedFutureDate.addingTimeInterval(60),
            durationSeconds: 60
        )

        _ = await store.saveIntervalsToOutbox([validInterval, corruptInterval])
        let beforePrune = await store.pendingCount()
        XCTAssertEqual(beforePrune, 2)

        await store.pruneInvalidTimestamps()
        let afterPrune = await store.pendingCount()
        XCTAssertEqual(afterPrune, 1)

        await store.clearOutbox()
        let afterClear = await store.pendingCount()
        XCTAssertEqual(afterClear, 0)

        try? FileManager.default.removeItem(at: tempDir)
    }

    func testUsageNormalizerExcludesSystemProcessesAndClampsDuration() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_TEST")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        let events = [
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "loginwindow", starting: true, type: 3),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(10), bundleId: "com.apple.controlcenter", starting: true, type: 3),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(20), bundleId: "com.apple.Safari", starting: true, type: 1),
            // Unclosed Safari session lasting 14 hours (50400s)
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(50400), bundleId: "com.google.Chrome", starting: true, type: 1),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(50500), bundleId: "com.google.Chrome", starting: false, type: 1)
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        // loginwindow and controlcenter should be ignored
        XCTAssertEqual(intervals.count, 2)
        XCTAssertEqual(intervals[0].bundleId, "com.apple.Safari")
        // Clamped to maxSessionDuration (43,200s / 12 hours) instead of 50400s
        XCTAssertEqual(intervals[0].durationSeconds, Int(BiomeUsageNormalizer.maxSessionDuration))

        XCTAssertEqual(intervals[1].bundleId, "com.google.Chrome")
        XCTAssertEqual(intervals[1].durationSeconds, 100)
    }

    func testUsageNormalizerClosesSessionOnLockScreenAndSpringboardBoundary() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_IPHONE")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        let events = [
            // User opens Tubee for 24 minutes (1440s)
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.tracup.Tubee", starting: true, type: 1),
            // User locks iPhone after 24 minutes
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(1440), bundleId: "com.apple.springboard", starting: true, type: 3),
            // Phone is locked in pocket for 5 hours (18000s). User unlocks and opens Safari.
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(18000), bundleId: "com.apple.mobilesafari", starting: true, type: 1),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(18300), bundleId: "com.apple.mobilesafari", starting: false, type: 1)
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        XCTAssertEqual(intervals.count, 2)

        // Tubee is closed at 24 minutes (1440s) instead of staying open for 5 hours
        XCTAssertEqual(intervals[0].bundleId, "com.tracup.Tubee")
        XCTAssertEqual(intervals[0].durationSeconds, 1440)

        // Safari is 300s (5 minutes)
        XCTAssertEqual(intervals[1].bundleId, "com.apple.mobilesafari")
        XCTAssertEqual(intervals[1].durationSeconds, 300)
    }
}
