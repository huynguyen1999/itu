import XCTest
import SwiftUI
// import FamilyControls
@testable import iTu
import iTuDomain
import iTuNetworking
import iTuOffline
import iTuDesignCore

final class iTuTests: XCTestCase {
    func testBadRequestSyncFailureIsHeldInTheLocalOutbox() {
        let error = APIError(statusCode: 400, message: "Bad Request")

        XCTAssertFalse(error.syncRetryable)
    }

    func testSyncFailureExposesCommittedMutationIDs() {
        let error = APIError(
            statusCode: 400,
            message: "Bad Request",
            details: ["acknowledgedMutationIds": .array([.string("mutation-1"), .number(2), .string("mutation-2")])]
        )

        XCTAssertEqual(error.syncAcknowledgedMutationIDs, ["mutation-1", "mutation-2"])
    }

    func testTaskWorkflowStatusCyclesThroughPlannedProgressAndCompleted() {
        XCTAssertEqual(TaskStatus.planned.nextIOSWorkflowStatus, .inProgress)
        XCTAssertEqual(TaskStatus.inProgress.nextIOSWorkflowStatus, .completed)
        XCTAssertEqual(TaskStatus.completed.nextIOSWorkflowStatus, .planned)
    }

    func testProductCalendarUsesHoChiMinhDateAtUtcBoundary() {
        let boundary = ISO8601DateFormatter().date(from: "2026-08-16T17:00:00Z")!

        XCTAssertEqual(IOSProductCalendar.timezone.identifier, "Asia/Ho_Chi_Minh")
        XCTAssertEqual(IOSProductCalendar.dayString(boundary), "2026-08-17")
    }

    func testHealthKitNormalizerUsesHCMCDateAndRejectsInvalidAnchor() {
        let boundary = ISO8601DateFormatter().date(from: "2026-08-16T17:00:00Z")!

        XCTAssertEqual(IOSHealthKitNormalizer.localDate(for: boundary), "2026-08-17")
        guard let range = IOSHealthKitNormalizer.dayRange(for: "2026-08-17") else {
            XCTFail("Expected a valid HCMC day range")
            return
        }
        XCTAssertEqual(range.start.timeIntervalSince(boundary), 0, accuracy: 0.001)
        XCTAssertNil(IOSHealthKitAnchorCodec.decode("not-an-anchor"))
    }

    func testHealthKitSleepIntervalsClipAcrossHCMCDays() {
        let start = ISO8601DateFormatter().date(from: "2026-08-16T16:30:00Z")!
        let end = ISO8601DateFormatter().date(from: "2026-08-16T18:30:00Z")!

        let firstDay = IOSHealthKitNormalizer.clippedInterval(start: start, end: end, to: "2026-08-16")!
        let secondDay = IOSHealthKitNormalizer.clippedInterval(start: start, end: end, to: "2026-08-17")!

        XCTAssertEqual(firstDay.end.timeIntervalSince(firstDay.start), 30 * 60, accuracy: 0.001)
        XCTAssertEqual(secondDay.end.timeIntervalSince(secondDay.start), 90 * 60, accuracy: 0.001)
        XCTAssertEqual(
            IOSHealthKitNormalizer.overlappingLocalDates(start: start, end: end),
            ["2026-08-16", "2026-08-17"]
        )
    }

    func testHealthKitStandTimeAndCurrentDeviceFiltering() {
        XCTAssertEqual(IOSHealthKitNormalizer.standHours(fromMinutes: 90), 1.5, accuracy: 0.001)

        let current = HealthDailySummaryModel(deviceId: "device-current", localDate: "2026-08-17")
        let foreign = HealthDailySummaryModel(deviceId: "device-foreign", localDate: "2026-08-17")
        XCTAssertEqual(
            IOSHealthKitNormalizer.currentHealthKitSummaries(
                from: [foreign, current],
                deviceID: "device-current"
            ),
            [current]
        )
    }

    func testHealthObserverCompletionRunsOnlyOnce() {
        var callbackCount = 0
        let completion = IOSHealthObserverCompletion { callbackCount += 1 }

        completion.finish()
        completion.finish()

        XCTAssertEqual(callbackCount, 1)
    }

    func testTaskScheduleDateConversionAndEndValidation() {
        let start = IOSProductCalendar.date(from: "2026-08-17T02:00:00Z")!
        let end = start.addingTimeInterval(30 * 60)

        XCTAssertEqual(IOSProductCalendar.timestamp(from: start), "2026-08-17T02:00:00.000Z")
        XCTAssertNil(IOSProductCalendar.taskScheduleValidation(start: start, end: end))
        XCTAssertEqual(
            IOSProductCalendar.taskScheduleValidation(start: end, end: start),
            "Scheduled end must be at or after scheduled start."
        )
        XCTAssertNil(IOSProductCalendar.taskScheduleValidation(start: nil, end: end))
    }

    @MainActor
    func testDeviceActivityIsDisabledForPersonalDevelopment() {
        let service = IOSDeviceActivityAuthorizationService()

        XCTAssertEqual(service.state, .disabled)
        XCTAssertFalse(IOSDeviceActivityMonitoring.isMonitoring())
    }

    func testDeviceActivityMonitorStatusLoadsOnlyCallbackMetadata() {
        let suiteName = "itu-device-activity-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let updatedAt = Date(timeIntervalSince1970: 1_755_408_000)
        defaults.set("com.itu.ios.daily", forKey: IOSDeviceActivityMonitorStatusStore.activityKey)
        defaults.set("interval-ended", forKey: IOSDeviceActivityMonitorStatusStore.eventKey)
        defaults.set(updatedAt, forKey: IOSDeviceActivityMonitorStatusStore.updatedAtKey)

        let status = IOSDeviceActivityMonitorStatusStore.load(defaults: defaults)

        XCTAssertEqual(status?.activityName, "com.itu.ios.daily")
        XCTAssertEqual(status?.event, "interval-ended")
        XCTAssertEqual(status?.updatedAt, updatedAt)
    }

    func testEventKitAuthorizationStateOnlyAllowsFullCalendarReadAccess() {
        XCTAssertEqual(IOSEventKitAuthorizationState(status: .notDetermined), .notDetermined)
        XCTAssertEqual(IOSEventKitAuthorizationState(status: .denied), .denied)
        XCTAssertFalse(IOSEventKitAuthorizationState.writeOnly.canRead)

        if #available(iOS 17.0, *) {
            XCTAssertEqual(IOSEventKitAuthorizationState(status: .fullAccess), .authorized)
            XCTAssertEqual(IOSEventKitAuthorizationState(status: .writeOnly), .writeOnly)
            XCTAssertTrue(IOSEventKitAuthorizationState.authorized.canRead)
        }
    }

    @MainActor
    func testFocusBlockingOnlyAppliesDuringAnActiveFocusSession() {
        let active = FocusSession.optimistic(
            id: "focus-active",
            task: nil,
            phase: .work,
            plannedSeconds: 1_500,
            startedAt: "2026-08-17T00:00:00Z"
        )
        var paused = active
        paused.status = .paused

        XCTAssertTrue(IOSFocusBlockingService.shouldApply(for: active))
        XCTAssertFalse(IOSFocusBlockingService.shouldApply(for: paused))
        XCTAssertFalse(IOSFocusBlockingService.shouldApply(for: nil))
    }

    @MainActor
    func testFocusBlockingKeepsActiveStateWhenSelectionChanges() {
        let suiteName = "itu-focus-blocking-test-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suiteName)!
        defer { defaults.removePersistentDomain(forName: suiteName) }
        let service = IOSFocusBlockingService(defaults: defaults)
        let active = FocusSession.optimistic(
            id: "focus-active-selection",
            task: nil,
            phase: .work,
            plannedSeconds: 1_500,
            startedAt: "2026-08-17T00:00:00Z"
        )

        service.setAccount("account-1")
        service.apply(for: active)
        service.setSelection(IOSFocusActivitySelection())

        XCTAssertTrue(service.isFocusActive)
        XCTAssertFalse(service.isApplied)
    }

    func testDeviceActivityReportNormalizesHourlyApplicationsAndWebsites() {
        let window = DeviceActivityUsageWindow(localDate: "2026-08-17", hour: 9)
        let snapshot = DeviceActivityReportSnapshot(
            capturedAt: "2026-08-17T10:00:00Z",
            windows: [window],
            applications: [DeviceActivityReportApplication(
                window: window,
                bundleId: "com.example.editor",
                displayName: "Editor",
                activeSeconds: 120,
                pickups: 2,
                notifications: 3
            )],
            websites: [DeviceActivityReportWebsite(window: window, hostname: "example.com", activeSeconds: 45)]
        )

        let imported = IOSDeviceActivityUsageNormalizer.normalize(snapshot, deviceID: "ios-device")

        XCTAssertEqual(imported.windows, [window])
        XCTAssertEqual(imported.applications.first?.source, .deviceActivity)
        XCTAssertEqual(imported.applications.first?.deviceId, "ios-device")
        XCTAssertEqual(imported.applications.first?.pickups, 2)
        XCTAssertEqual(imported.websites.first?.hostname, "example.com")
        XCTAssertEqual(imported.websites.first?.browserDisplayName, "Screen Time")
    }

    func testDeviceActivityImportReplacesEmptyBucketsWithoutDuplicatingRows() async throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("itu-device-activity-\(UUID().uuidString)", isDirectory: true)
        let store = OfflineStore(accountID: "device-activity-test", baseURL: root)
        _ = try await store.load()
        let window = DeviceActivityUsageWindow(localDate: "2026-08-17", hour: 9)
        let application = UsageSummary(
            localDate: window.localDate,
            hour: window.hour,
            bundleId: "com.example.editor",
            displayName: "Editor",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 120,
            source: .deviceActivity
        )
        let website = WebsiteUsageSummary(
            localDate: window.localDate,
            hour: window.hour,
            browserDisplayName: "Screen Time",
            hostname: "example.com",
            timezone: "Asia/Ho_Chi_Minh",
            activeSeconds: 45,
            source: .deviceActivity
        )

        _ = try await store.replaceDeviceActivityUsage(
            deviceId: "ios-device",
            summaries: [application],
            websiteSummaries: [website],
            windows: [window]
        )
        _ = try await store.replaceDeviceActivityUsage(
            deviceId: "ios-device",
            summaries: [application],
            windows: [window]
        )

        let snapshot = await store.snapshot()
        XCTAssertEqual(snapshot.usageSummaries.filter { $0.source == .deviceActivity }.count, 1)
        XCTAssertTrue(snapshot.websiteUsageSummaries.filter { $0.source == .deviceActivity }.isEmpty)
    }

    func testFinishFocusUsesActionPayloadAndOldBaseVersion() {
        let session = FocusSession.optimistic(
            id: "focus-1",
            task: nil,
            phase: .work,
            plannedSeconds: 1_500,
            startedAt: "2026-08-17T00:00:00Z"
        )
        let mutation = AppModel.finishFocusMutation(
            for: session,
            occurredAt: "2026-08-17T00:25:00Z",
            idempotencyKey: "idem-1"
        )

        XCTAssertEqual(mutation.kind, "focussession.action")
        XCTAssertEqual(mutation.baseVersion, session.version)
        XCTAssertEqual(mutation.payload["action"]?.stringValue, "complete")
        XCTAssertEqual(mutation.payload["occurredAt"]?.stringValue, "2026-08-17T00:25:00Z")
        XCTAssertEqual(mutation.payload["idempotencyKey"]?.stringValue, "idem-1")
        XCTAssertEqual(mutation.payload["expectedVersion"]?.numberValue, Double(session.version))
    }

    func testFocusPauseResumePreservesPauseDurationAndOldVersions() throws {
        let session = FocusSession.optimistic(
            id: "focus-2",
            task: nil,
            phase: .work,
            plannedSeconds: 1_500,
            startedAt: "2026-08-17T00:00:00Z",
            ownerDeviceId: "ios"
        )
        let paused = try IOSFocusCommands.apply(
            .pause,
            to: session,
            occurredAt: "2026-08-17T00:10:00Z",
            idempotencyKey: "pause-1"
        )
        XCTAssertEqual(paused.session.status, .paused)
        XCTAssertEqual(paused.mutation.baseVersion, session.version)
        XCTAssertEqual(paused.mutation.payload["expectedVersion"]?.numberValue, Double(session.version))

        let resumed = try IOSFocusCommands.apply(
            .resume,
            to: paused.session,
            occurredAt: "2026-08-17T00:12:00Z",
            idempotencyKey: "resume-1"
        )
        XCTAssertEqual(resumed.session.status, .active)
        XCTAssertEqual(resumed.session.accumulatedPauseSecs, 120)
        XCTAssertEqual(resumed.mutation.baseVersion, paused.session.version)
        XCTAssertEqual(resumed.mutation.payload["expectedVersion"]?.numberValue, Double(paused.session.version))
    }

    func testWidgetSnapshotStoreRejectsAccountMismatch() throws {
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("itu-widget-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: fileURL) }
        let snapshot = WidgetSnapshot(
            accountID: "account-one",
            generatedAt: "2026-08-17T00:00:00Z",
            localDate: "2026-08-17",
            taskTotal: 1,
            taskCompleted: 0,
            taskRemaining: 1,
            habitsRemaining: 0
        )
        try WidgetSnapshotStore(fileURL: fileURL, expectedAccountID: "account-one").save(snapshot)
        XCTAssertThrowsError(try WidgetSnapshotStore(fileURL: fileURL, expectedAccountID: "account-two").load()) { error in
            XCTAssertEqual(error as? WidgetSnapshotStoreError, .accountMismatch(expected: "account-two", actual: "account-one"))
        }
    }

    func testWidgetDeriverUsesProductCalendarAndOnlyCountsDueHabitOccurrences() {
        let boundary = ISO8601DateFormatter().date(from: "2026-08-16T17:00:00Z")!
        var snapshot = OfflineSnapshot()
        snapshot.tasks = [ProductivityTask.optimistic(
            id: "task-boundary",
            title: "Boundary task",
            dueAt: "2026-08-16T17:30:00Z"
        )]
        snapshot.habits = [
            HabitModel(id: "habit-due", name: "Due habit", isCompletedToday: false),
            HabitModel(id: "habit-not-due", name: "Weekly habit", frequency: .weekly, targetDaysPerWeek: 1, weekdays: [1], isCompletedToday: false)
        ]
        snapshot.habitOccurrences = [HabitOccurrenceModel(
            id: "occurrence-due",
            habitId: "habit-due",
            occurrenceDate: "2026-08-16T17:30:00Z"
        )]

        let result = IOSWidgetSnapshotDeriver.make(from: snapshot, accountID: "account-one", now: boundary)

        XCTAssertEqual(result.localDate, "2026-08-17")
        XCTAssertEqual(result.taskTotal, 1)
        XCTAssertEqual(result.habitsRemaining, 1)
    }

    @MainActor
    func testNavigationDestinationsExposePhase6Sections() {
        XCTAssertEqual(IOSDestination.allCases.map(\.rawValue), [
            "home", "plan", "focus", "calendar", "habits", "more", "learn", "gym", "budget", "growth",
            "journal", "matrix", "statistics", "health", "notifications", "conflicts", "trash", "profile", "settings"
        ])
        XCTAssertEqual(IOSRootView.phoneDestinations, [
            .home, .plan, .focus, .habits, .calendar, .learn, .gym, .budget, .growth, .journal,
            .matrix, .statistics, .health, .notifications, .conflicts, .trash, .profile, .settings, .more
        ])
        XCTAssertEqual(IOSRootView.rootDestination(for: .calendar), .calendar)
        XCTAssertEqual(IOSRootView.rootDestination(for: .focus), .focus)
    }

    func testMoreSectionsKeepSecondaryWorkspacesGrouped() {
        XCTAssertEqual(IOSMoreSection.allCases.map(\.title), ["Tracking", "Learning & Growth", "System"])
    }

    func testProductCalendarTimelineGroupsOnlyScheduledAndDueTasksForDay() {
        let boundary = ProductivityTask.optimistic(
            id: "boundary",
            title: "HCMC boundary",
            dueAt: "2026-08-16T17:00:00Z"
        )
        var scheduled = ProductivityTask.optimistic(
            id: "scheduled",
            title: "Scheduled task",
            dueAt: "2026-08-18T00:00:00Z"
        )
        scheduled.scheduledStartAt = "2026-08-17T09:00:00Z"
        scheduled.scheduledEndAt = "2026-08-17T09:30:00Z"
        let due = ProductivityTask.optimistic(
            id: "due",
            title: "Due task",
            dueAt: "2026-08-17T12:00:00Z"
        )
        let otherDay = ProductivityTask.optimistic(
            id: "other-day",
            title: "Tomorrow",
            dueAt: "2026-08-18T12:00:00Z"
        )

        let items = IOSProductCalendar.timeline(
            for: [due, otherDay, scheduled, boundary],
            day: "2026-08-17"
        )

        XCTAssertEqual(items.map(\.id), ["boundary", "scheduled", "due"])
        XCTAssertEqual(items[1].endAt, "2026-08-17T09:30:00Z")
        XCTAssertEqual(items.last?.isDue, true)
    }

    func testJournalReviewsRemainReadOnlyForQuickCapture() {
        let note = JournalNoteModel(
            id: "note",
            userId: "user",
            title: "Note",
            contentMarkdown: "Body",
            entryDate: "2026-08-17",
            updatedAt: "2026-08-17T10:00:00Z"
        )
        let review = JournalNoteModel(
            id: "review",
            userId: "user",
            kind: "DAILY_REVIEW",
            title: "Review",
            contentMarkdown: "Generated",
            entryDate: "2026-08-17",
            updatedAt: "2026-08-17T10:00:00Z",
            dailyReview: JournalDailyReviewModel(
                entryId: "review",
                periodDate: "2026-08-17",
                summarySnapshot: [:]
            )
        )

        XCTAssertTrue(AppModel.canEditJournalNote(note))
        XCTAssertFalse(AppModel.canEditJournalNote(review))
    }

    func testOfflineTaskMutationsCreateEditAndComplete() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("itu-task-mutations-\(UUID().uuidString)")
        let store = OfflineStore(accountID: "task-account", baseURL: root)
        _ = try await store.load()
        let created = try await store.createTask(title: "Draft")
        let edits = TaskEdits(
            title: "Edited",
            descriptionMarkdown: "Details",
            priority: .high,
            important: true,
            dueAt: "2026-08-17T12:00:00Z",
            estimatedMinutes: 25
        )
        let edited = try await store.editTask(id: created.task.id, edits: edits)
        let completed = try await store.setTaskStatus(
            id: created.task.id,
            status: .completed,
            completedAt: "2026-08-17T12:25:00Z"
        )
        let completedSnapshot = completed.snapshot

        XCTAssertEqual(edited.tasks.first?.title, "Edited")
        XCTAssertEqual(completedSnapshot.tasks.first?.status, .completed)
        XCTAssertEqual(completedSnapshot.mutations.map(\.kind), ["task.create", "task.update"])
        XCTAssertEqual(completedSnapshot.mutations[1].payload["dueAt"]?.stringValue, "2026-08-17T12:00:00Z")
        XCTAssertEqual(completedSnapshot.mutations[1].payload["status"]?.stringValue, TaskStatus.completed.rawValue)
    }

    func testOfflineJournalQuickCaptureIsVisibleAndQueued() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("itu-journal-\(UUID().uuidString)")
        let store = OfflineStore(accountID: "journal-account", baseURL: root)
        _ = try await store.load()
        let note = JournalNoteModel(
            id: "note-1",
            userId: "journal-account",
            title: "Quick capture",
            contentMarkdown: "Remember this offline",
            entryDate: "2026-08-17",
            updatedAt: "2026-08-17T10:00:00Z"
        )
        let mutation = SyncMutation(
            id: "journal-create-1",
            kind: "journal.create",
            entityId: note.id,
            payload: [
                "id": .string(note.id),
                "kind": .string(note.kind),
                "title": .string(note.title),
                "contentMarkdown": .string(note.contentMarkdown),
                "entryDate": .string(note.entryDate),
                "timezone": .string(note.timezone),
                "tagIds": .array([])
            ],
            occurredAt: note.updatedAt
        )

        let snapshot = try await store.saveJournalNote(note, mutation: mutation)

        XCTAssertEqual(snapshot.journalNotes.first?.contentMarkdown, "Remember this offline")
        XCTAssertEqual(snapshot.mutations.first?.kind, "journal.create")
        XCTAssertEqual(snapshot.mutations.first?.payload["entryDate"]?.stringValue, "2026-08-17")
    }

    func testDeepLinksRouteCanonicalDestinations() {
        XCTAssertEqual(IOSDeepLink(url: URL(string: "itu://today")!)?.destinationRawValue, "home")
        XCTAssertEqual(IOSDeepLink(url: URL(string: "itu://focus/session-1")!)?.destinationRawValue, "focus")
        XCTAssertEqual(IOSDeepLink(url: URL(string: "itu://habits")!)?.destinationRawValue, "habits")
        XCTAssertEqual(IOSDeepLink(url: URL(string: "itu://statistics")!)?.destinationRawValue, "statistics")
        XCTAssertEqual(IOSDeepLink(url: URL(string: "itu://settings")!)?.destinationRawValue, "settings")
        XCTAssertNil(IOSDeepLink(url: URL(string: "https://example.test/focus")!))
    }

    func testOfflineStoreSeparatesAccountsAndReloadsTasks() async throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("itu-tests-\(UUID().uuidString)")
        let location = OfflineStoreLocation(rootURL: root)
        let first = OfflineStore(accountID: "account-one", location: location)
        _ = try await first.load()
        let created = try await first.createTask(title: "Persisted Task")
        let reloaded = OfflineStore(accountID: "account-one", location: location)
        let reloadedSnapshot = try await reloaded.load()
        XCTAssertTrue(reloadedSnapshot.tasks.contains { $0.id == created.task.id })

        let other = OfflineStore(accountID: "account-two", location: location)
        let otherSnapshot = try await other.load()
        XCTAssertTrue(otherSnapshot.tasks.isEmpty)
    }

    func testIOSAPIClientUsesIOSPlatformAndSyncContract() async {
        let credentials = TestCredentialStore()
        let client = APIClient(baseURL: URL(string: "https://example.test")!, platform: "IOS", credentialStore: credentials)
        XCTAssertEqual(client.platform, "IOS")
        let request = SyncRequest(deviceId: "device", clientInstanceId: "instance", cursor: "0", mutations: [])
        XCTAssertEqual(request.cursor, "0")
        XCTAssertEqual(request.mutations.count, 0)
    }

    func testThemeAdapterConvertsTokenChannels() {
        let color = iTuTheme.color(iTuDesignTokens.teal, scheme: .light)
        XCTAssertNotNil(color)
        let value = iTuDesignTokens.teal.light
        XCTAssertEqual(value.red, 0x16)
        XCTAssertEqual(value.green, 0x7F)
    }
}

private struct TestCredentialStore: CredentialStore {
    func load(_ key: CredentialKey) throws -> String? { nil }
    func save(_ value: String, for key: CredentialKey) throws {}
    func delete(_ key: CredentialKey) throws {}
}
