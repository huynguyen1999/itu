import XCTest
@testable import iTu

@MainActor
final class FocusTimerTests: XCTestCase {
    func testPausedCountdownUsesServerTimestampsAndAccumulatedPause() {
        var session = FocusSession.optimistic(
            id: ULID.generate(),
            task: nil,
            phase: .work,
            plannedSeconds: 1_500,
            startedAt: "2026-07-31T00:00:00Z"
        )
        session.status = .paused
        session.pausedAt = "2026-07-31T00:08:00Z"
        session.accumulatedPauseSecs = 60
        let timer = FocusTimer()

        timer.apply(active: session)

        XCTAssertEqual(timer.elapsedSeconds, 420)
        XCTAssertEqual(timer.displaySeconds, 1_080)
        XCTAssertEqual(timer.formattedRemaining, "18:00")
        XCTAssertTrue(timer.isPaused)
    }

    func testIdleTimerUsesSelectedDuration() {
        let timer = FocusTimer()
        timer.setDuration(minutes: 30)

        XCTAssertEqual(timer.displaySeconds, 1_800)
        XCTAssertEqual(timer.formattedRemaining, "30:00")
        XCTAssertEqual(timer.progressFraction, 0)
    }

    func testOvertimeIsVisibleWhenEnabled() {
        var session = FocusSession.optimistic(
            id: ULID.generate(),
            task: nil,
            phase: .work,
            plannedSeconds: 60,
            startedAt: "2026-07-31T00:00:00Z"
        )
        session.status = .paused
        session.pausedAt = "2026-07-31T00:02:15Z"

        let timer = FocusTimer()
        timer.apply(active: session)

        XCTAssertEqual(timer.formattedRemaining, "+01:15")
        XCTAssertEqual(timer.progressFraction, 1)
    }

    func testCompletionNotificationIsGatedAndDeduplicated() {
        var session = FocusSession.optimistic(
            id: "session-1",
            task: nil,
            phase: .work,
            plannedSeconds: 60,
            startedAt: "2026-08-02T00:00:00Z"
        )

        XCTAssertTrue(FocusTimer.shouldDeliverCompletionNotification(
            enabled: true,
            session: session,
            displaySeconds: 0,
            firedSessionID: nil
        ))
        XCTAssertFalse(FocusTimer.shouldDeliverCompletionNotification(
            enabled: false,
            session: session,
            displaySeconds: 0,
            firedSessionID: nil
        ))
        XCTAssertFalse(FocusTimer.shouldDeliverCompletionNotification(
            enabled: true,
            session: session,
            displaySeconds: 0,
            firedSessionID: session.id
        ))
        session.status = .paused
        XCTAssertFalse(FocusTimer.shouldDeliverCompletionNotification(
            enabled: true,
            session: session,
            displaySeconds: 0,
            firedSessionID: nil
        ))
    }

    func testFocusSoundCatalogDecodesServerContract() throws {
        let data = Data(
            """
            {
              "sounds": [{
                "id": "builtin:rain",
                "name": "Rain",
                "originalName": "rain.mp3",
                "url": "/audio/focus/rain.mp3",
                "mimeType": "audio/mpeg",
                "sizeBytes": 1234,
                "durationSeconds": 120.5,
                "version": 1,
                "category": "Nature",
                "source": "BUILTIN",
                "defaultVolume": 0.42
              }],
              "preferences": [{
                "id": "preference-1",
                "soundKey": "builtin:rain",
                "enabled": true,
                "sortOrder": 2,
                "volume": 35,
                "updatedAt": "2026-08-02T00:00:00Z"
              }]
            }
            """.utf8
        )

        let catalog = try JSONDecoder().decode(FocusSoundCatalog.self, from: data)

        XCTAssertEqual(catalog.sounds.first?.name, "Rain")
        XCTAssertEqual(catalog.preferences.first?.volume, 35)
    }

    func testAudioCatalogUsesPreferencesWithoutFabricatingSounds() {
        let enabled = focusSound(id: "builtin:rain", name: "Rain", defaultVolume: 0.42)
        let disabled = focusSound(id: "builtin:cafe", name: "Café", defaultVolume: 0.32)
        let catalog = FocusSoundCatalog(
            sounds: [disabled, enabled],
            preferences: [
                FocusSoundPreference(
                    id: "preference-1",
                    soundKey: enabled.id,
                    enabled: true,
                    sortOrder: 1,
                    volume: 35,
                    updatedAt: "2026-08-02T00:00:00Z"
                ),
                FocusSoundPreference(
                    id: "preference-2",
                    soundKey: disabled.id,
                    enabled: false,
                    sortOrder: 0,
                    volume: 25,
                    updatedAt: "2026-08-02T00:00:00Z"
                ),
            ]
        )

        let player = AudioPlayerManager.shared
        player.stop()
        player.configure(catalog: catalog)

        XCTAssertEqual(player.sounds.map(\.id), [enabled.id])
        XCTAssertEqual(player.selectedSound?.id, enabled.id)
        XCTAssertEqual(player.volume, 0.35, accuracy: 0.001)
        XCTAssertFalse(player.hasLoadedSelectedSound)
    }

    func testBuiltInCatalogProvidesAllFourSoundsOffline() {
        let player = AudioPlayerManager.shared
        player.stop()
        player.configureBuiltInDefaults()

        XCTAssertEqual(player.sounds.map(\.id), [
            "builtin:rain",
            "builtin:forest",
            "builtin:cafe",
            "builtin:brown-noise"
        ])
        XCTAssertEqual(player.selectedSound?.id, "builtin:rain")
    }

    func testUploadedFocusSoundCatalogAndManagerFiltering() {
        let builtin = focusSound(id: "builtin:rain", name: "Rain", defaultVolume: 0.42)
        let uploaded = FocusSound(
            id: "sound-uploaded-1",
            name: "My Custom Waves",
            originalName: "waves.mp3",
            url: "/media/audio/sound-uploaded-1",
            mimeType: "audio/mpeg",
            sizeBytes: 9999,
            durationSeconds: 180,
            version: 1,
            category: "Uploaded",
            source: "uploaded",
            defaultVolume: 0.5
        )

        let catalog = FocusSoundCatalog(
            sounds: [builtin, uploaded],
            preferences: []
        )

        let player = AudioPlayerManager.shared
        player.stop()
        player.configure(catalog: catalog)

        XCTAssertEqual(player.sounds.count, 2)
        XCTAssertTrue(player.sounds.contains(where: { $0.id == uploaded.id }))
        XCTAssertEqual(player.sounds.first(where: { $0.id == uploaded.id })?.source, "uploaded")
    }

    func testAudioPlayerManagerSelectsNextAvailableSoundWhenSelectedSoundDeleted() {
        let sound1 = focusSound(id: "builtin:rain", name: "Rain", defaultVolume: 0.42)
        let sound2 = focusSound(id: "builtin:waves", name: "Waves", defaultVolume: 0.5)

        let initialCatalog = FocusSoundCatalog(sounds: [sound1, sound2], preferences: [])
        let player = AudioPlayerManager.shared
        player.configure(catalog: initialCatalog)
        player.selectSound(sound1)

        XCTAssertEqual(player.selectedSound?.id, sound1.id)

        // Simulate deleting sound1 -> catalog reconfigured with only sound2
        let updatedCatalog = FocusSoundCatalog(sounds: [sound2], preferences: [])
        player.configure(catalog: updatedCatalog)

        XCTAssertEqual(player.selectedSound?.id, sound2.id)
    }

    func testOvertimeIsClampedWhenDisabled() {
        var session = FocusSession.optimistic(
            id: ULID.generate(),
            task: nil,
            phase: .work,
            plannedSeconds: 60,
            startedAt: "2026-07-31T00:00:00Z"
        )
        session.status = .paused
        session.pausedAt = "2026-07-31T00:02:15Z"

        let timer = FocusTimer()
        timer.overtimeEnabled = false
        timer.apply(active: session)

        XCTAssertEqual(timer.displaySeconds, 0)
        XCTAssertEqual(timer.formattedRemaining, "00:00")
        XCTAssertEqual(timer.progressFraction, 1)

        timer.overtimeEnabled = true
        XCTAssertEqual(timer.displaySeconds, -75)
        XCTAssertEqual(timer.formattedRemaining, "+01:15")
    }

    func testFocusAdjustMutationPayloadEncoding() throws {
        let idempotencyKey = ULID.generate()
        let recordId = ULID.generate()
        let startedAt = "2026-08-03T10:00:00Z"
        let completedAt = "2026-08-03T10:25:00Z"

        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "focussession.adjust",
            entityId: recordId,
            baseVersion: 2,
            payload: [
                "startedAt": .string(startedAt),
                "completedAt": .string(completedAt),
                "taskId": .string("task-123"),
                "idempotencyKey": .string(idempotencyKey),
                "expectedVersion": .number(2)
            ],
            occurredAt: "2026-08-03T10:25:01Z"
        )

        let data = try JSONEncoder().encode(mutation)
        let decoded = try JSONDecoder().decode(SyncMutation.self, from: data)

        XCTAssertEqual(decoded.kind, "focussession.adjust")
        XCTAssertEqual(decoded.entityId, recordId)
        XCTAssertEqual(decoded.payload["startedAt"]?.stringValue, startedAt)
        XCTAssertEqual(decoded.payload["completedAt"]?.stringValue, completedAt)
        XCTAssertEqual(decoded.payload["taskId"]?.stringValue, "task-123")
        XCTAssertEqual(decoded.payload["idempotencyKey"]?.stringValue, idempotencyKey)
        XCTAssertEqual(decoded.payload["expectedVersion"]?.numberValue, 2)
    }

    func testCrossDevicePulledFocusSessionStateReconciliation() {
        let timer = FocusTimer()

        // 1. Pulled active session from remote device
        var activeSession = FocusSession.optimistic(
            id: "remote-session-1",
            task: nil,
            phase: .work,
            plannedSeconds: 1500,
            startedAt: "2026-08-03T12:00:00Z"
        )
        activeSession.status = .active
        timer.apply(active: activeSession)

        XCTAssertTrue(timer.isRunning)
        XCTAssertFalse(timer.isPaused)
        XCTAssertEqual(timer.activeSession?.id, "remote-session-1")

        // 2. Pulled paused session from remote device
        var pausedSession = activeSession
        pausedSession.status = .paused
        pausedSession.pausedAt = "2026-08-03T12:10:00Z"
        pausedSession.accumulatedPauseSecs = 30
        timer.apply(active: pausedSession)

        XCTAssertFalse(timer.isRunning)
        XCTAssertTrue(timer.isPaused)
        XCTAssertEqual(timer.elapsedSeconds, 570) // 600s - 30s pause
        XCTAssertEqual(timer.displaySeconds, 930) // 1500s - 570s = 930s

        timer.apply(active: nil)
        XCTAssertFalse(timer.isRunning)
        XCTAssertFalse(timer.isPaused)
        XCTAssertNil(timer.activeSession)
        XCTAssertEqual(timer.displaySeconds, 1800)
    }

    func testCustomTitleAndTagSelectionInFocusTimer() {
        let timer = FocusTimer()
        XCTAssertEqual(timer.currentTitle, "Focus")

        timer.customTitle = "postgresql"
        XCTAssertEqual(timer.currentTitle, "postgresql")

        timer.selectedTagIds = ["tag-1", "tag-2"]
        XCTAssertEqual(timer.selectedTagIds.count, 2)

        timer.setExactDuration(seconds: 1500)
        XCTAssertEqual(timer.displaySeconds, 1500)
        XCTAssertEqual(timer.formattedRemaining, "25:00")
    }

    private func focusSound(id: String, name: String, defaultVolume: Double) -> FocusSound {
        FocusSound(
            id: id,
            name: name,
            originalName: "\(name).mp3",
            url: "/audio/focus/\(id).mp3",
            mimeType: "audio/mpeg",
            sizeBytes: 1,
            durationSeconds: nil,
            version: 1,
            category: "Nature",
            source: "BUILTIN",
            defaultVolume: defaultVolume
        )
    }
}
