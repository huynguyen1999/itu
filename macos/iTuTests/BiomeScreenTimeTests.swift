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
        XCTAssertEqual(interval.source, UsageSource.screenTimeBiome)

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

        func scanDevice(
            _ device: ScreenTimeDevice,
            since watermark: Date?,
            initialState: BiomeForegroundState?
        ) async throws -> DeviceScanResult {
            DeviceScanResult(
                intervals: intervalsToReturn,
                nextState: nil,
                latestRecordDate: intervalsToReturn.map(\.endedAt).max(),
                stats: NormalizationStats(rawEventCount: intervalsToReturn.count),
                scannedFilesCount: 1,
                decodedFilesCount: 1
            )
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

        // Run scan
        let scanStatus = await coordinator.runOnce()
        XCTAssertEqual(scanStatus.pendingUploadCount, 1)

        let pendingOutbox = await coordinator.pendingOutboxIntervals()
        XCTAssertEqual(pendingOutbox.count, 1)

        // Test pending vs all outbox behavior
        await store.markUploaded(eventIds: ["MOCK_EID_1"])
        let pendingAfterUpload = await coordinator.pendingOutboxIntervals()
        XCTAssertEqual(pendingAfterUpload.count, 0) // Confirmed: uploaded items are not in pending outbox

        let allAfterUpload = await coordinator.allOutboxIntervals()
        XCTAssertEqual(allAfterUpload.count, 1) // But still retained in allOutbox for offline cache

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
        // Clamped to maxSessionDuration (1800s / 30 minutes) instead of 50400s
        XCTAssertEqual(intervals[0].durationSeconds, Int(BiomeUsageNormalizer.maxSessionDuration))

        XCTAssertEqual(intervals[1].bundleId, "com.google.Chrome")
        XCTAssertEqual(intervals[1].durationSeconds, 100)
    }

    func testUsageNormalizerCapsOvernightPhantomSessionWhenClosedBySleepLockScreen() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_IPHONE_SLEEP")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        let events = [
            // Tubee launched at 2:53 AM
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.tracup.Tubee", starting: true, type: 1),
            // SleepLockScreen fires at 6:35 AM (3h 41m later, 13276s)
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(13276), bundleId: "com.apple.SleepLockScreen", starting: false, type: 1)
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        XCTAssertEqual(intervals.count, 1)
        XCTAssertEqual(intervals[0].bundleId, "com.tracup.Tubee")
        // Clamped to maxSleepBoundarySessionDuration (180s = 3 minutes) instead of 13276s
        XCTAssertEqual(intervals[0].durationSeconds, Int(BiomeUsageNormalizer.maxSleepBoundarySessionDuration))
        XCTAssertEqual(intervals[0].endedAt, t0.addingTimeInterval(BiomeUsageNormalizer.maxSleepBoundarySessionDuration))
    }

    func testUsageNormalizerCapsLockscreenTransientCameraSession() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_IPHONE_CAMERA")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        let events = [
            // Camera launched from lock screen swipe
            BiomeAppInFocusEvent(
                timestamp: t0,
                bundleId: "com.apple.camera",
                starting: true,
                transitionReason: "_SBDashBoardHostedAppEntityViewController",
                type: 1
            ),
            // User puts phone in pocket and opens Gmail 42 minutes later (2548s)
            BiomeAppInFocusEvent(
                timestamp: t0.addingTimeInterval(2548),
                bundleId: "com.google.Gmail",
                starting: true,
                type: 1
            ),
            BiomeAppInFocusEvent(
                timestamp: t0.addingTimeInterval(2600),
                bundleId: "com.google.Gmail",
                starting: false,
                type: 1
            )
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        XCTAssertEqual(intervals.count, 2)
        XCTAssertEqual(intervals[0].bundleId, "com.apple.camera")
        // Clamped to maxLockscreenSessionDuration (120s = 2 minutes) instead of 2548s
        XCTAssertEqual(intervals[0].durationSeconds, Int(BiomeUsageNormalizer.maxLockscreenSessionDuration))
        XCTAssertEqual(intervals[0].endedAt, t0.addingTimeInterval(BiomeUsageNormalizer.maxLockscreenSessionDuration))

        XCTAssertEqual(intervals[1].bundleId, "com.google.Gmail")
        XCTAssertEqual(intervals[1].durationSeconds, 52)
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

    func testStatefulNormalizationCarriesForwardOpenAppAcrossScanChunks() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_IPHONE_CHUNK")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        // Chunk 1: User opens Telegram, but scan finishes before user closes it
        let chunk1Events = [
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "ph.telegra.Telegraph", starting: true)
        ]

        let (chunk1Intervals, nextState, stats1) = BiomeUsageNormalizer.normalize(
            events: chunk1Events,
            for: device,
            initialState: nil
        )

        // Chunk 1 yields 0 finalized intervals, but saves nextState with open Telegram session
        XCTAssertEqual(chunk1Intervals.count, 0)
        XCTAssertNotNil(nextState)
        XCTAssertEqual(nextState?.bundleId, "ph.telegra.Telegraph")
        XCTAssertEqual(nextState?.startedAt, t0)
        XCTAssertEqual(stats1.rawEventCount, 1)

        // Chunk 2 (300 seconds later): User switches from Telegram to Safari, then closes Safari
        let t1 = t0.addingTimeInterval(300)
        let t2 = t0.addingTimeInterval(600)

        let chunk2Events = [
            BiomeAppInFocusEvent(timestamp: t1, bundleId: "com.apple.mobilesafari", starting: true),
            BiomeAppInFocusEvent(timestamp: t2, bundleId: "com.apple.mobilesafari", starting: false)
        ]

        let (chunk2Intervals, finalState, stats2) = BiomeUsageNormalizer.normalize(
            events: chunk2Events,
            for: device,
            initialState: nextState
        )

        // Chunk 2 correctly stitches Telegram from Chunk 1 (t0 -> t1, 300s) and Safari (t1 -> t2, 300s)
        XCTAssertEqual(chunk2Intervals.count, 2)
        XCTAssertEqual(chunk2Intervals[0].bundleId, "ph.telegra.Telegraph")
        XCTAssertEqual(chunk2Intervals[0].startedAt, t0)
        XCTAssertEqual(chunk2Intervals[0].endedAt, t1)
        XCTAssertEqual(chunk2Intervals[0].durationSeconds, 300)

        XCTAssertEqual(chunk2Intervals[1].bundleId, "com.apple.mobilesafari")
        XCTAssertEqual(chunk2Intervals[1].startedAt, t1)
        XCTAssertEqual(chunk2Intervals[1].endedAt, t2)
        XCTAssertEqual(chunk2Intervals[1].durationSeconds, 300)

        XCTAssertNil(finalState)
        XCTAssertEqual(stats2.rawEventCount, 2)
    }

    func testDeduplicationDropsExactDuplicateEventsAndStrayEnds() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_DEDUPE")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        let duplicateEvents = [
            // Stray ending without starting
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(-10), bundleId: "com.apple.Safari", starting: false),
            // Duplicate start events at exact same millisecond
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.apple.Safari", starting: true),
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.apple.Safari", starting: true),
            // Normal end
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(120), bundleId: "com.apple.Safari", starting: false)
        ]

        let (intervals, nextState, stats) = BiomeUsageNormalizer.normalize(
            events: duplicateEvents,
            for: device,
            initialState: nil
        )

        XCTAssertEqual(intervals.count, 1)
        XCTAssertEqual(intervals[0].bundleId, "com.apple.Safari")
        XCTAssertEqual(intervals[0].durationSeconds, 120)
        XCTAssertNil(nextState)
        XCTAssertEqual(stats.duplicatesDroppedCount, 1) // Dropped the duplicate start
        XCTAssertEqual(stats.strayEventsCount, 1) // Dropped the stray end
    }

    func testUsageNormalizerFocusSwitching() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_MAC_FOCUS_SWITCH")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        let events = [
            // User working in Microsoft Edge
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.microsoft.edgemac", starting: true, type: 1),
            // User switches to Antigravity 10 minutes later (600s)
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(600), bundleId: "com.google.antigravity", starting: true, type: 1),
            // User switches back to Edge 1 minute later (660s)
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(660), bundleId: "com.microsoft.edgemac", starting: true, type: 1),
            // User closes Edge 20 minutes later (1860s from t0)
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(1860), bundleId: "com.microsoft.edgemac", starting: false, type: 1)
        ]

        let (intervals, nextState, stats) = BiomeUsageNormalizer.normalize(
            events: events,
            for: device,
            initialState: nil
        )

        // Yields Edge interval (t0 -> 600s, 600s) + Antigravity (600s -> 660s, 60s) + Edge resumed interval (660s -> 1860s, 1200s)
        XCTAssertEqual(intervals.count, 3)
        XCTAssertEqual(intervals[0].bundleId, "com.microsoft.edgemac")
        XCTAssertEqual(intervals[0].durationSeconds, 600)

        XCTAssertEqual(intervals[1].bundleId, "com.google.antigravity")
        XCTAssertEqual(intervals[1].durationSeconds, 60)

        XCTAssertEqual(intervals[2].bundleId, "com.microsoft.edgemac")
        XCTAssertEqual(intervals[2].durationSeconds, 1200)

        XCTAssertNil(nextState)
        XCTAssertEqual(stats.intervalsProducedCount, 3)
    }

    func testUsageNormalizerPreservesLongContinuousSessions() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_LONG_SESSION")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        // 70-minute continuous Safari session (4200s) with explicit matching STOP
        let events = [
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.apple.mobilesafari", starting: true, type: 1),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(4200), bundleId: "com.apple.mobilesafari", starting: false, type: 1)
        ]

        let intervals = BiomeUsageNormalizer.normalize(events: events, for: device)
        XCTAssertEqual(intervals.count, 1)
        XCTAssertEqual(intervals[0].bundleId, "com.apple.mobilesafari")
        XCTAssertEqual(intervals[0].durationSeconds, 4200)
        XCTAssertEqual(intervals[0].endedAt, t0.addingTimeInterval(4200))
    }

    func testUsageNormalizerIgnoresStrayStopWithoutPrecedingStartAfterSystemBoundary() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_OMITTED_START")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        // Lockscreen / Sleep boundary occurs, and later a background process emits STOP for Xcode
        // without a prior START. This must NOT synthesize a phantom multi-hour session.
        let events = [
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.apple.SleepLockScreen", starting: false, type: 1),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(1800), bundleId: "com.apple.dt.Xcode", starting: false, type: 1)
        ]

        let (intervals, _, stats) = BiomeUsageNormalizer.normalize(events: events, for: device, initialState: nil)
        XCTAssertEqual(intervals.count, 0)
        XCTAssertEqual(stats.strayEventsCount, 1)
    }

    func testUsageNormalizerIgnoresBackgroundStopForDifferentAppWhileSessionIsActive() {
        let device = ScreenTimeDevice(deviceIdentifier: "DEV_BG_TRANSITION")
        let t0 = Date(timeIntervalSince1970: 1700000000)

        // Tubee is active in foreground. A background helper or process emits STOP for another app.
        // The foreground Tubee session must continue without being overwritten.
        let events = [
            BiomeAppInFocusEvent(timestamp: t0, bundleId: "com.tracup.Tubee", starting: true, type: 1),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(300), bundleId: "com.apple.dt.Xcode", starting: false, type: 1),
            BiomeAppInFocusEvent(timestamp: t0.addingTimeInterval(600), bundleId: "com.tracup.Tubee", starting: false, type: 1)
        ]

        let (intervals, _, stats) = BiomeUsageNormalizer.normalize(events: events, for: device, initialState: nil)
        XCTAssertEqual(intervals.count, 1)
        XCTAssertEqual(intervals[0].bundleId, "com.tracup.Tubee")
        XCTAssertEqual(intervals[0].durationSeconds, 600)
        XCTAssertEqual(stats.strayEventsCount, 1)
    }

    // MARK: - Device Display Name & Discovery Tests

    func testScreenTimeDeviceDisplayName() {
        let customNameDevice = ScreenTimeDevice(deviceIdentifier: "D1", name: "Huy's iPhone", model: "iPhone15,2", platform: "iOS")
        XCTAssertEqual(customNameDevice.displayName, "Huy's iPhone")

        let macDevice = ScreenTimeDevice(deviceIdentifier: "D2", name: nil, model: "24G830", platform: "macOS", isMe: true)
        XCTAssertEqual(macDevice.displayName, "This Mac")

        let iosUnnamedDevice = ScreenTimeDevice(deviceIdentifier: "D3", name: "   ", model: "23D8133", platform: "iOS", isMe: false)
        XCTAssertEqual(iosUnnamedDevice.displayName, "iPhone")

        let genericUnnamedDevice = ScreenTimeDevice(deviceIdentifier: "D4", name: nil, model: "AppleTV14,1", platform: "tvOS", isMe: false)
        XCTAssertEqual(genericUnnamedDevice.displayName, "AppleTV14,1")

        let emptyDevice = ScreenTimeDevice(deviceIdentifier: "D5", name: nil, model: nil, platform: nil, isMe: false)
        XCTAssertEqual(emptyDevice.displayName, "Apple Device")
    }

    func testLiveBiomeDeviceDiscovery() throws {
        let devices = try BiomeDeviceDiscovery.discoverDevices()
        // If sync.db is present on this machine, it must return exactly the enrolled peers
        if FileManager.default.fileExists(atPath: BiomeDeviceDiscovery.syncDatabaseURL.path) {
            XCTAssertEqual(devices.count, 2, "Expected exactly 2 devices (This Mac and iPhone), got \(devices.count): \(devices.map(\.displayName))")
            XCTAssertTrue(devices.contains { $0.isMe }, "Expected local Mac in discovered devices")
            XCTAssertTrue(devices.contains { !$0.isMe }, "Expected remote iPhone in discovered devices")
        }
    }
}


