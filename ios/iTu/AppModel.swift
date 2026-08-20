import Foundation
import Network
import SwiftUI
import iTuDomain
import iTuNetworking
import iTuOffline
import iTuSync

enum IOSProductCalendar {
    static let timezone = iTuCalendarSupport.timezone

    static func dayString(_ date: Date = Date()) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timezone
        formatter.calendar = calendar
        formatter.timeZone = timezone
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: date)
    }
}

struct IOSPhase6OperationContext {
    let store: OfflineStore
    let accountID: String
    fileprivate let generation: Int

    fileprivate init(store: OfflineStore, accountID: String, generation: Int) {
        self.store = store
        self.accountID = accountID
        self.generation = generation
    }
}

@MainActor
final class AppModel: ObservableObject, IOSFocusIntentHandler, IOSProductivityIntentHandler {
    let apiClient: APIClient
    let credentialStore: any CredentialStore
    let offlineLocation: OfflineStoreLocation
    let focusBlocking = IOSFocusBlockingService()

    @Published private(set) var user: UserProfile?
    @Published private(set) var tasks: [ProductivityTask] = []
    @Published private(set) var journalNotes: [JournalNoteModel] = []
    @Published private(set) var habits: [HabitModel] = []
    @Published private(set) var habitOccurrences: [HabitOccurrenceModel] = []
    @Published private(set) var focusSessions: [FocusSession] = []
    @Published private(set) var activeFocusSession: FocusSession?
    @Published private(set) var conflicts: [SyncConflict] = []
    @Published private(set) var pendingMutations: [SyncMutation] = []
    @Published private(set) var syncPhase: IOSSyncPhase = .offline
    @Published private(set) var isOnline = false
    @Published private(set) var errorMessage: String?
    @Published private(set) var syncErrorMessage: String?
    @Published private(set) var healthAuthorizationState: IOSHealthAuthorizationState = .notDetermined
    @Published private(set) var healthImportStatus: IOSHealthImportStatus = .idle
    @Published private(set) var healthLastSuccessfulImportAt: String?
    @Published private(set) var notificationAuthorizationState: IOSNotificationAuthorizationState = .notDetermined
    @Published var safariExtensionConfiguration = IOSSafariExtensionConfigurationStore.load()
    @Published var phase6State = IOSPhase6State()
    @Published private(set) var navigationRequest: IOSNavigationRequest?
    @Published var destination: IOSDestination = .home
    @Published private(set) var isRestoring = true
    @Published var appUpdateState: AppUpdateCheckState = .idle
    @Published var appUpdatePolicy: AppUpdatePolicy?
    @Published var appUpdateLastCheckedAt: Date?

    private var store: OfflineStore?
    let appUpdateCoordinator: AppUpdateCoordinator
    private var syncCore: SyncCoordinatorCore?
    private let webSocketSession: URLSession
    private var socketTask: URLSessionWebSocketTask?
    private var socketReceiveTask: Task<Void, Never>?
    private var periodicSyncTask: Task<Void, Never>?
    private var registrationTask: Task<Void, Never>?
    private var registeredDevice = false
    private var pathMonitor: NWPathMonitor?
    private var outboxTask: Task<Void, Never>?
    private var debounceTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var hydrationTask: Task<Void, Never>?
    private var healthImportTask: Task<Void, Never>?
    private var notificationSyncTask: Task<Void, Never>?
    private var healthPipeline: IOSHealthKitPipeline?
    private var healthObserverCompletions: [IOSHealthObserverCompletion] = []
    private var healthImportToken = 0
    private var inFlightFocusActions: [String: (baseVersion: Int, action: IOSFocusAction, task: Task<FocusSession, Error>)] = [:]
    private var generation = 0
    private let deviceId: String
    private let clientInstanceId = UUID().uuidString

    init(
        apiClient: APIClient? = nil,
        credentialStore: (any CredentialStore)? = nil,
        offlineLocation: OfflineStoreLocation? = nil
    ) {
        let credentials = credentialStore ?? KeychainCredentialStore(serviceIdentifier: "com.itu.ios.session")
        self.credentialStore = credentials
        let client = apiClient ?? APIClient(platform: "IOS", credentialStore: credentials)
        self.apiClient = client
        self.webSocketSession = APIClient.makeSession()
        let updateCoordinator = AppUpdateCoordinator(apiClient: client, platform: .ios)
        self.appUpdateCoordinator = updateCoordinator
        self.appUpdateState = updateCoordinator.state
        self.appUpdatePolicy = updateCoordinator.policy
        self.appUpdateLastCheckedAt = updateCoordinator.lastCheckedAt
        self.offlineLocation = offlineLocation ?? Self.defaultOfflineLocation()
        if let saved = UserDefaults.standard.string(forKey: "com.itu.ios.syncDeviceId"), saved.count >= 12 {
            deviceId = saved
        } else {
            let value = ULID.generate()
            UserDefaults.standard.set(value, forKey: "com.itu.ios.syncDeviceId")
            deviceId = value
        }
        startPathMonitor()
        healthPipeline = IOSHealthKitPipeline()
        healthAuthorizationState = healthPipeline?.authorizationState ?? .unavailable
        IOSAppProcessRegistry.register(self)
        IOSAppProcessRegistry.registerProductivity(self)
    }

    deinit {
        pathMonitor?.cancel()
        outboxTask?.cancel()
        debounceTask?.cancel()
        retryTask?.cancel()
        hydrationTask?.cancel()
        healthImportTask?.cancel()
        notificationSyncTask?.cancel()
        periodicSyncTask?.cancel()
        registrationTask?.cancel()
        socketReceiveTask?.cancel()
        socketTask?.cancel(with: .goingAway, reason: nil)
    }

    static func defaultOfflineLocation(fileManager: FileManager = .default) -> OfflineStoreLocation {
        let root = fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("iTu", isDirectory: true)
        return OfflineStoreLocation(rootURL: root)
    }

    var isAuthenticated: Bool { user != nil }
    var pendingCount: Int { pendingMutations.count }
    var completedTaskCount: Int { tasks.filter { $0.status == .completed }.count }
    var todayString: String { IOSProductCalendar.dayString() }

    /// Enqueues navigation for `IOSRootView` to pass through its
    /// `requestDestination` dirty-edit guard. The shell should observe
    /// `navigationRequest`, call `consumeNavigationRequest(_:)`, then invoke
    /// its existing `requestDestination(request.destination)` hook:
    /// `.onChange(of: model.navigationRequest) { _, request in guard let request else { return }; model.consumeNavigationRequest(request); requestDestination(request.destination) }`.
    func requestNavigation(to destination: IOSDestination) {
        guard destination != self.destination else { return }
        navigationRequest = IOSNavigationRequest(destination: destination)
    }

    func consumeNavigationRequest(_ request: IOSNavigationRequest) {
        guard navigationRequest?.id == request.id else { return }
        navigationRequest = nil
    }

    func restoreSession() async {
        let runGeneration = generation
        if let cachedUser = SessionCache.loadUser() {
            await activate(cachedUser, reconcileRemote: false)
            guard user?.id == cachedUser.id else {
                isRestoring = false
                return
            }
            isRestoring = false
            let runGeneration = generation
            Task { @MainActor [weak self] in
                await self?.reconcileCachedSession(generation: runGeneration)
            }
            return
        }
        guard (try? await apiClient.hasRefreshToken()) == true else {
            isRestoring = false
            return
        }
        do {
            let session = try await apiClient.restoreSession()
            guard runGeneration == generation else { return }
            await activate(session.user)
        } catch {
            guard runGeneration == generation else { return }
            if let apiError = error as? APIError, apiError.isTerminalAuthFailure {
                await clearCredentials()
            } else {
                errorMessage = error.localizedDescription
            }
        }
        isRestoring = false
    }

    func login(identifier: String, password: String) async {
        let runGeneration = generation
        clearError()
        do {
            let session = try await apiClient.login(identifier: identifier, password: password)
            guard runGeneration == generation else { return }
            await activate(session.user)
            isRestoring = false
        } catch {
            guard runGeneration == generation else { return }
            errorMessage = error.localizedDescription
            isRestoring = false
        }
    }

    func logout() async {
        pauseSafariExtensionUpload()
        await resetAuthenticatedState()
        let runGeneration = generation
        do { try await apiClient.logout() } catch {
            guard runGeneration == generation else { return }
            errorMessage = error.localizedDescription
        }
        guard runGeneration == generation else { return }
        await clearCredentials()
    }

    func clearError() { errorMessage = nil }

    func retrySync() async {
        guard isAuthenticated else { return }
        errorMessage = nil
        syncErrorMessage = nil
        guard isOnline else {
            syncPhase = .offline
            return
        }
        let runGeneration = generation
        await refreshRemoteState(generation: runGeneration)
        await synchronize(generation: runGeneration)
    }

    func refreshHealthAuthorization() {
        healthPipeline?.refreshAuthorizationState()
        healthAuthorizationState = healthPipeline?.authorizationState ?? .unavailable
    }

    func refreshNotificationAuthorization() async {
        notificationAuthorizationState = await IOSLocalNotificationScheduler.shared.authorizationState()
        scheduleLocalNotificationSync()
    }

    func requestNotificationAccess() async {
        _ = await IOSLocalNotificationScheduler.shared.requestAuthorization()
        await refreshNotificationAuthorization()
    }

    func requestHealthAccess() async {
        guard let healthPipeline,
              let accountID = user?.id,
              let store else { return }
        let runGeneration = generation
        let requested = await healthPipeline.requestReadAccess()
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        healthAuthorizationState = healthPipeline.authorizationState
        guard requested else {
            if healthPipeline.authorizationState == .unavailable {
                healthImportStatus = .unavailable
            }
            return
        }
        refreshHealth()
        await healthImportTask?.value
    }

    func writeGymWorkoutToHealthKit(id: String) async -> IOSHealthKitWriteResult? {
        guard let healthPipeline,
              let workout = gymWorkouts.first(where: { $0.id == id }) else { return nil }
        if healthAuthorizationState != .requested {
            guard await healthPipeline.requestReadAccess() else {
                healthAuthorizationState = healthPipeline.authorizationState
                return nil
            }
            healthAuthorizationState = healthPipeline.authorizationState
        }
        do {
            return try await healthPipeline.writeGymWorkout(workout)
        } catch {
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func refreshHealth(observerCompletion: IOSHealthObserverCompletion? = nil) {
        guard let store,
              let accountID = user?.id,
              healthAuthorizationState == .requested else {
            if healthPipeline?.authorizationState == .unavailable {
                healthImportStatus = .unavailable
            }
            observerCompletion?.finish()
            return
        }
        if let observerCompletion {
            healthObserverCompletions.append(observerCompletion)
        }
        guard healthImportTask == nil else { return }
        let runGeneration = generation
        healthImportToken &+= 1
        let runToken = healthImportToken
        healthImportTask = Task { @MainActor [weak self, store] in
            await self?.importHealth(
                store: store,
                accountID: accountID,
                generation: runGeneration,
                token: runToken
            )
        }
    }

    func refreshHealthAndWait() async -> Bool {
        guard store != nil, user != nil, healthAuthorizationState == .requested else { return false }
        refreshHealth()
        let importTask = healthImportTask
        await withTaskCancellationHandler {
            await importTask?.value
        } onCancel: {
            importTask?.cancel()
        }
        guard !Task.isCancelled else { return false }
        switch healthImportStatus {
        case .imported, .partial: return true
        default: return false
        }
    }

    func activate(_ account: UserProfile, reconcileRemote: Bool = true) async {
        generation &+= 1
        let runGeneration = generation
        outboxTask?.cancel()
        debounceTask?.cancel()
        retryTask?.cancel()
        hydrationTask?.cancel()
        healthImportTask?.cancel()
        if let notificationSyncTask {
            notificationSyncTask.cancel()
            await notificationSyncTask.value
        }
        healthImportTask = nil
        notificationSyncTask = nil
        periodicSyncTask?.cancel()
        registrationTask?.cancel()
        socketReceiveTask?.cancel()
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
        registeredDevice = false
        await IOSLocalNotificationScheduler.shared.sync(tasks: [], activeFocus: nil)
        healthImportToken &+= 1
        finishHealthObserverCompletions()
        healthPipeline?.stop()
        syncCore?.invalidate()
        inFlightFocusActions.values.forEach { $0.task.cancel() }
        inFlightFocusActions.removeAll()
        await IOSFocusLiveActivityCoordinator.endAll()
        IOSWidgetSnapshotBridge.clear()
        focusBlocking.setAccount(account.id)
        navigationRequest = nil
        let accountStore = OfflineStore(accountID: account.id, location: offlineLocation)
        store = accountStore
        user = account
        phase6State = IOSPhase6State()
        activateSafariExtension(for: account)
        errorMessage = nil
        syncErrorMessage = nil
        syncCore = SyncCoordinatorCore(
            store: accountStore,
            transport: apiClient,
            deviceId: deviceId,
            clientInstanceId: clientInstanceId
        )
        do {
            let snapshot = try await accountStore.load()
            guard runGeneration == generation, user?.id == account.id else { return }
            apply(snapshot)
        } catch {
            guard runGeneration == generation, user?.id == account.id else { return }
            errorMessage = "Could not load local data: \(error.localizedDescription)"
        }
        guard runGeneration == generation, user?.id == account.id else { return }
        startHealthPipeline(for: accountStore, accountID: account.id, generation: runGeneration)
        periodicSyncTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard !Task.isCancelled else { return }
                guard let self, self.generation == runGeneration, self.user?.id == account.id, self.isOnline else { return }
                await self.synchronize(generation: runGeneration)
            }
        }
        if isOnline {
            scheduleWebSocketRegistration(generation: runGeneration)
        }
        outboxTask = Task { [weak self, accountStore] in
            for await _ in await accountStore.outboxEvents() {
                guard !Task.isCancelled else { return }
                await MainActor.run {
                    guard let self, self.generation == runGeneration, self.user?.id == account.id else { return }
                    self.syncPhase = .pending
                    self.requestDebouncedSync(generation: runGeneration)
                }
            }
        }
        if reconcileRemote && isOnline {
            hydrationTask = Task { @MainActor [weak self] in
                defer {
                    if self?.generation == runGeneration { self?.hydrationTask = nil }
                }
                guard let self,
                      self.generation == runGeneration,
                      self.user?.id == account.id else { return }
                await self.refreshRemoteState(generation: runGeneration)
                await self.synchronize(generation: runGeneration)
            }
        } else {
            syncPhase = pendingMutations.isEmpty ? .offline : .pending
        }
    }

    @discardableResult
    func createTask(title: String) async -> Bool {
        guard let store,
              let accountID = user?.id,
              !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return false }
        let runGeneration = generation
        do {
            let result = try await store.createTask(title: title)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            apply(result.snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration)
            return true
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func complete(_ task: ProductivityTask) async -> Bool {
        await setTaskStatus(task, status: .completed)
    }

    @discardableResult
    func setTaskStatus(_ task: ProductivityTask, status: TaskStatus) async -> Bool {
        guard let store, let accountID = user?.id else { return false }
        let runGeneration = generation
        do {
            let result = try await store.setTaskStatus(
                id: task.id,
                status: status,
                completedAt: status == .completed ? ISO8601DateFormatter().string(from: Date()) : nil
            )
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            apply(result.snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration)
            return true
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func editTask(_ task: ProductivityTask, edits: TaskEdits) async -> Bool {
        guard let store, let accountID = user?.id else { return false }
        let runGeneration = generation
        do {
            let snapshot = try await store.editTask(id: task.id, edits: edits)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            apply(snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration)
            return true
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func saveJournalNote(
        id: String?,
        title: String,
        contentMarkdown: String,
        entryDate: String
    ) async -> JournalNoteModel? {
        guard let store, let accountID = user?.id else { return nil }
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBody = contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedTitle.isEmpty || !normalizedBody.isEmpty else { return nil }
        let existing = id.flatMap { noteID in journalNotes.first(where: { $0.id == noteID }) }
        guard existing.map(Self.canEditJournalNote) ?? true else { return nil }
        let now = ISO8601DateFormatter().string(from: Date())
        let note = JournalNoteModel(
            id: id ?? ULID.generate(),
            userId: accountID,
            kind: existing?.kind ?? "NOTE",
            title: normalizedTitle,
            contentMarkdown: contentMarkdown,
            entryDate: String(entryDate.prefix(10)),
            updatedAt: now,
            timezone: existing?.timezone ?? iTuCalendarSupport.timezone.identifier,
            templateId: existing?.templateId,
            tagIds: existing?.tagIds ?? [],
            version: existing?.version ?? 1,
            createdAt: existing?.createdAt ?? now,
            deletedAt: nil,
            weeklyReview: nil,
            dailyReview: nil,
            tags: existing?.tags ?? [],
            attachments: existing?.attachments ?? [],
            contextType: existing?.contextType,
            contextId: existing?.contextId,
            contextData: existing?.contextData
        )
        var payload: [String: JSONValue] = [
            "title": .string(note.title),
            "contentMarkdown": .string(note.contentMarkdown),
            "entryDate": .string(note.entryDate),
            "timezone": .string(note.timezone),
            "tagIds": .array(note.tagIds.map(JSONValue.string))
        ]
        if let templateId = note.templateId { payload["templateId"] = .string(templateId) }
        if let contextType = note.contextType { payload["contextType"] = .string(contextType) }
        if let contextId = note.contextId { payload["contextId"] = .string(contextId) }
        if let contextData = note.contextData { payload["contextData"] = contextData }
        if existing == nil {
            payload["id"] = .string(note.id)
            payload["kind"] = .string(note.kind)
        }
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: existing == nil ? "journal.create" : "journal.update",
            entityId: note.id,
            baseVersion: existing?.version,
            payload: payload,
            occurredAt: now
        )
        let runGeneration = generation
        do {
            let snapshot = try await store.saveJournalNote(note, mutation: mutation)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return nil }
            apply(snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration)
            return note
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return nil }
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func startFocus(title: String, plannedSeconds: Int = 25 * 60) async {
        guard store != nil else { return }
        let task = tasks.first { $0.title == title }
        let result = IOSFocusCommands.start(
            task: task,
            title: title,
            plannedSeconds: plannedSeconds,
            ownerDeviceID: "ios",
            occurredAt: iTuDateSupport.string(from: Date())
        )
        do {
            apply(try await saveFocusSessionGuarded(result.session, mutation: result.mutation))
            syncPhase = .pending
            requestDebouncedSync(generation: generation)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func finishFocus(_ session: FocusSession) async {
        guard activeFocusSession?.id == session.id else { return }
        await handleFocusIntent(.complete)
    }

    func handleFocusIntent(_ action: IOSFocusAction) async {
        do { _ = try await performFocusIntent(action) }
        catch { errorMessage = error.localizedDescription }
    }

    /// Live Activity intents can launch a cold app process before the normal
    /// scene task restores its account. Load the cached account and snapshot
    /// before the intent reads the active Focus Session.
    func prepareForFocusIntent() async {
        if user == nil {
            await restoreSession()
            return
        }
        guard activeFocusSession == nil, let store else { return }
        apply(await store.snapshot(), scheduleRetry: false)
    }

    func performFocusIntent(_ action: IOSFocusAction) async throws -> FocusSession {
        guard let session = activeFocusSession else { throw IOSFocusCommandError.noActiveSession }

        if let inFlight = inFlightFocusActions[session.id] {
            if inFlight.baseVersion == session.version && inFlight.action.rawValue == action.rawValue {
                return try await inFlight.task.value
            }
            _ = try await inFlight.task.value
            if let current = inFlightFocusActions[session.id],
               current.baseVersion == inFlight.baseVersion,
               current.action.rawValue == inFlight.action.rawValue {
                inFlightFocusActions[session.id] = nil
            }
            return try await performFocusIntent(action)
        }

        let task = Task { @MainActor [weak self] in
            guard let self else { throw IOSFocusCommandError.unavailableAccount }
            return try await self.applyFocusIntent(action, to: session)
        }
        inFlightFocusActions[session.id] = (session.version, action, task)
        do {
            let result = try await task.value
            if let current = inFlightFocusActions[session.id],
               current.baseVersion == session.version,
               current.action.rawValue == action.rawValue {
                inFlightFocusActions[session.id] = nil
            }
            return result
        } catch {
            if let current = inFlightFocusActions[session.id],
               current.baseVersion == session.version,
               current.action.rawValue == action.rawValue {
                inFlightFocusActions[session.id] = nil
            }
            throw error
        }
    }

    func startFocusFromIntent() async throws -> FocusSession {
        let result = IOSFocusCommands.start(
            task: nil,
            title: nil,
            plannedSeconds: 25 * 60,
            ownerDeviceID: "ios",
            occurredAt: iTuDateSupport.string(from: Date())
        )
        apply(try await saveFocusSessionGuarded(result.session, mutation: result.mutation))
        syncPhase = .pending
        requestDebouncedSync(generation: generation)
        return result.session
    }

    private func applyFocusIntent(_ action: IOSFocusAction, to session: FocusSession) async throws -> FocusSession {
        let result = try IOSFocusCommands.apply(action, to: session, occurredAt: iTuDateSupport.string(from: Date()))
        let snapshot = try await saveFocusSessionGuarded(result.session, mutation: result.mutation)
        apply(snapshot)
        syncPhase = .pending
        requestDebouncedSync(generation: generation)
        return result.session
    }

    private func saveFocusSessionGuarded(_ session: FocusSession, mutation: SyncMutation) async throws -> OfflineSnapshot {
        guard let store, let accountID = user?.id else { throw IOSFocusCommandError.unavailableAccount }
        let runGeneration = generation
        let storeIdentity = ObjectIdentifier(store)
        let snapshot = try await store.saveFocusSession(session, mutation: mutation)
        try Task.checkCancellation()
        guard generation == runGeneration,
              user?.id == accountID,
              self.store.map(ObjectIdentifier.init) == storeIdentity else {
            throw IOSFocusCommandError.unavailableAccount
        }
        return snapshot
    }

    nonisolated static func finishFocusMutation(
        for session: FocusSession,
        occurredAt: String,
        idempotencyKey: String = ULID.generate()
    ) -> SyncMutation {
        (try? IOSFocusCommands.apply(.complete, to: session, occurredAt: occurredAt, idempotencyKey: idempotencyKey).mutation)
            ?? SyncMutation(id: ULID.generate(), kind: "focussession.action", entityId: session.id, baseVersion: session.version, payload: ["action": .string("complete"), "occurredAt": .string(occurredAt), "idempotencyKey": .string(idempotencyKey), "expectedVersion": .number(Double(session.version))], occurredAt: occurredAt)
    }

    nonisolated static func canEditJournalNote(_ note: JournalNoteModel) -> Bool {
        note.kind == "NOTE" && note.dailyReview == nil && note.weeklyReview == nil
    }

    @discardableResult
    func checkIn(_ habit: HabitModel, value: Double = 1) async -> Bool {
        guard let store, let accountID = user?.id else { return false }
        let runGeneration = generation
        do {
            let snapshot = try await store.checkInHabitDate(habitId: habit.id, date: todayString, value: value)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            apply(snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration)
            return true
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return false }
            errorMessage = error.localizedDescription
            return false
        }
    }

    func resolveConflict(_ conflict: SyncConflict, keepLocal: Bool) async {
        guard let store, let accountID = user?.id else { return }
        let runGeneration = generation
        do {
            let snapshot = try await (keepLocal ? store.keepConflict(conflict) : store.discardConflict(conflict.mutationId))
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            apply(snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration, immediate: true)
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            errorMessage = error.localizedDescription
        }
    }

    func resolveConflicts(_ conflicts: [SyncConflict], keepLocal: Bool) async {
        guard let store, let accountID = user?.id, !conflicts.isEmpty else { return }
        let runGeneration = generation
        do {
            let snapshot = try await store.resolveConflicts(conflicts, keepLocal: keepLocal)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            apply(snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration, immediate: true)
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            errorMessage = error.localizedDescription
        }
    }

    func reconcileForeground() async {
        guard isAuthenticated, isOnline else { return }
        _ = await ensureSafariExtensionCredential()
        let runGeneration = generation
        if socketTask == nil {
            scheduleWebSocketRegistration(generation: runGeneration)
        }
        if let hydrationTask {
            await hydrationTask.value
            guard runGeneration == generation else { return }
        }
        await refreshRemoteState(generation: runGeneration)
        await synchronize(generation: runGeneration)
    }

    private func startPathMonitor() {
        let monitor = NWPathMonitor()
        pathMonitor = monitor
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let wasOnline = self.isOnline
                self.isOnline = path.status == .satisfied
                if self.isOnline && !wasOnline {
                    await self.reconcileForeground()
                } else if !self.isOnline && self.isAuthenticated {
                    self.syncPhase = .offline
                }
            }
        }
        monitor.start(queue: DispatchQueue(label: "com.itu.ios.path-monitor"))
    }

    private func refreshRemoteState(generation runGeneration: Int) async {
        guard let store, let accountID = user?.id, runGeneration == generation, isOnline else { return }
        phase6State.notificationsState = .loading
        do {
            let result = try await AccountHydrator(
                apiClient: apiClient,
                offlineStore: store,
                isCurrent: { @MainActor [weak self, store] in
                    guard let self else { return false }
                    return !Task.isCancelled && self.isCurrent(
                        store: store,
                        accountID: accountID,
                        generation: runGeneration
                    )
                }
            ).hydrate()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            applyHydration(result)
            if let occurrences = try? await apiClient.fetchHabitOccurrences(from: todayString, to: todayString) {
                guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
                _ = try await store.updateHabitOccurrences(occurrences, from: todayString, to: todayString)
                guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            }
            if let active = try? await apiClient.fetchActiveFocus() {
                guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
                if let history = try? await apiClient.fetchFocusHistory() {
                    guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
                    _ = try await store.hydrateFocus(active: active, history: history)
                    guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
                }
            }
            let snapshot = await store.snapshot()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            apply(snapshot)
            await refreshJournalRevisions(generation: runGeneration, accountID: accountID, store: store)
            await refreshUsage(generation: runGeneration, accountID: accountID, store: store)
            await refreshTrash(generation: runGeneration, accountID: accountID, store: store)
        } catch {
            if error is CancellationError || error is AccountHydrationError { return }
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.notificationsState = .failed(error.localizedDescription)
            let snapshot = await store.snapshot()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            apply(snapshot)
            recordSyncError("Could not refresh from the server", error)
        }
    }

    private func refreshJournalRevisions(generation runGeneration: Int, accountID: String, store: OfflineStore) async {
        let noteIDs = journalNotes.map(\.id)
        for noteID in noteIDs {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            guard let revisions = try? await apiClient.getJournalRevisions(entryID: noteID) else { continue }
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            _ = try? await store.replaceJournalRevisions(entryID: noteID, values: revisions)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        }
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        let snapshot = await store.snapshot()
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        apply(snapshot)
    }

    /// Refreshes server-backed usage projections while keeping local summaries
    /// available when the server is unreachable or the account is offline.
    func refreshUsage(from: String? = nil, to: String? = nil) async {
        guard let store, let accountID = user?.id else { return }
        let runGeneration = generation
        await refreshUsage(
            from: from,
            to: to,
            generation: runGeneration,
            accountID: accountID,
            store: store
        )
    }

    private func refreshUsage(
        from: String? = nil,
        to: String? = nil,
        generation runGeneration: Int,
        accountID: String,
        store: OfflineStore
    ) async {
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        phase6State.usageStatisticsState = .loading
        phase6State.websiteUsageStatisticsState = .loading

        let local = await store.usageSummaries(from: from, to: to)
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        let localWeb = await store.websiteUsageSummaries(from: from, to: to)
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        guard isOnline else {
            phase6State.usageStatistics = UsageStatistics.aggregating(local)
            phase6State.websiteUsageStatistics = WebsiteUsageStatistics.aggregating(localWeb)
            phase6State.usageStatisticsState = .loaded
            phase6State.websiteUsageStatisticsState = .loaded
            phase6State.usageStatisticsIsLocalOnly = true
            phase6State.websiteUsageStatisticsIsLocalOnly = true
            return
        }

        do {
            let server = try await apiClient.fetchUsage(from: from, to: to)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            let pending = await store.pendingUsageDeltas(from: from, to: to)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.usageStatistics = server.adding(pending)
            phase6State.usageStatisticsState = .loaded
            phase6State.usageStatisticsIsLocalOnly = false
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.usageStatistics = UsageStatistics.aggregating(local)
            phase6State.usageStatisticsState = .failed(error.localizedDescription)
            phase6State.usageStatisticsIsLocalOnly = true
        }

        do {
            let server = try await apiClient.fetchWebsiteUsageStatistics(from: from, to: to)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            let pending = await store.pendingWebsiteUsageDeltas(from: from, to: to)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.websiteUsageStatistics = server.adding(pending)
            phase6State.websiteUsageStatisticsState = .loaded
            phase6State.websiteUsageStatisticsIsLocalOnly = false
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.websiteUsageStatistics = WebsiteUsageStatistics.aggregating(localWeb)
            phase6State.websiteUsageStatisticsState = .failed(error.localizedDescription)
            phase6State.websiteUsageStatisticsIsLocalOnly = true
        }
    }

    private func synchronize(generation runGeneration: Int) async {
        guard let store, let accountID = user?.id, runGeneration == generation, isOnline, let syncCore else {
            if !isOnline, isAuthenticated { syncPhase = .offline }
            return
        }
        syncPhase = .syncing
        do {
            let cursor = (await store.snapshot()).cursor
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            _ = try? await apiClient.registerSyncDevice(deviceId: deviceId, cursor: cursor)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            let outcome = try await syncCore.synchronize()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            guard outcome.performed else {
                apply(outcome.result.snapshot, scheduleRetry: false)
                _ = await uploadPendingJournalAttachments()
                return
            }
            apply(outcome.result.snapshot)
            _ = try? await apiClient.updateSyncDevice(deviceId: deviceId, cursor: outcome.result.cursor)
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            syncErrorMessage = nil
            errorMessage = nil
            let attachmentsUploaded = await uploadPendingJournalAttachments()
            if !attachmentsUploaded { return }
            syncPhase = conflicts.isEmpty ? (pendingMutations.isEmpty ? .upToDate : .pending) : .conflict
            if socketTask == nil && isOnline {
                scheduleWebSocketRegistration(generation: runGeneration)
            }
            requestFollowupIfNeeded(generation: runGeneration)
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            let snapshot = await store.snapshot()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            apply(snapshot)
            recordSyncError("Could not sync with the server", error)
            requestFollowupIfNeeded(generation: runGeneration)
        }
    }

    private func scheduleWebSocketRegistration(generation runGeneration: Int) {
        guard generation == runGeneration, registrationTask == nil, isOnline, user != nil else { return }
        registrationTask = Task { [weak self] in
            await self?.registerAndConnectWebSocket(generation: runGeneration)
            guard let self, self.generation == runGeneration else { return }
            self.registrationTask = nil
        }
    }

    private func registerAndConnectWebSocket(generation runGeneration: Int) async {
        guard generation == runGeneration, socketTask == nil, isOnline,
              await apiClient.token() != nil, let store else { return }
        do {
            let cursor = (await store.snapshot()).cursor
            guard generation == runGeneration, socketTask == nil else { return }
            try await apiClient.registerSyncDevice(deviceId: deviceId, cursor: cursor)
            guard generation == runGeneration, socketTask == nil else { return }
            registeredDevice = true
            await connectWebSocket(generation: runGeneration)
        } catch {
            // Registration will retry on next sync pass
        }
    }

    private func connectWebSocket(generation connectionGeneration: Int) async {
        guard generation == connectionGeneration, registeredDevice,
              socketTask == nil, let token = await apiClient.token() else { return }
        let baseURL = apiClient.baseURL
        var components = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)
        components?.scheme = baseURL.scheme == "https" ? "wss" : "ws"
        components?.path = "/ws/sync"
        components?.queryItems = [
            URLQueryItem(name: "token", value: token),
            URLQueryItem(name: "deviceId", value: deviceId),
            URLQueryItem(name: "clientInstanceId", value: clientInstanceId)
        ]
        guard let url = components?.url else { return }
        let webSocket = webSocketSession.webSocketTask(with: url)
        socketTask = webSocket
        webSocket.resume()
        socketReceiveTask = Task { [weak self] in
            await self?.receiveWebSocketMessages(from: webSocket, generation: connectionGeneration)
        }
    }

    private func receiveWebSocketMessages(from webSocket: URLSessionWebSocketTask, generation connectionGeneration: Int) async {
        while !Task.isCancelled {
            do {
                let message = try await webSocket.receive()
                let data: Data
                switch message {
                case let .data(value): data = value
                case let .string(value): data = Data(value.utf8)
                @unknown default: continue
                }
                if let invalidation = try? JSONDecoder().decode(SyncInvalidationMessage.self, from: data),
                   invalidation.type == "SYNC_AVAILABLE" {
                    guard connectionGeneration == generation else { continue }
                    requestDebouncedSync(generation: connectionGeneration, immediate: true)
                }
            } catch {
                guard connectionGeneration == generation else { return }
                socketTask = nil
                socketReceiveTask = nil
                guard !Task.isCancelled else { return }
                try? await Task.sleep(for: .seconds(3))
                guard connectionGeneration == self.generation, self.isAuthenticated, self.isOnline else { return }
                self.scheduleWebSocketRegistration(generation: connectionGeneration)
                return
            }
        }
    }

    func refreshTrash() async {
        guard let store, let accountID = user?.id else { return }
        let runGeneration = generation
        guard isOnline else {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.trashSnapshot = nil
            phase6State.trashState = .failed("Trash is available when online.")
            return
        }
        await refreshTrash(generation: runGeneration, accountID: accountID, store: store)
    }

    private func refreshTrash(generation runGeneration: Int, accountID: String, store: OfflineStore) async {
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
        phase6State.trashState = .loading
        do {
            let trash = try await apiClient.fetchTrash()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.trashSnapshot = trash
            phase6State.trashState = .loaded
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration) else { return }
            phase6State.trashState = .failed(error.localizedDescription)
        }
    }

    private func reconcileCachedSession(generation runGeneration: Int) async {
        do {
            let session = try await apiClient.restoreSession()
            guard runGeneration == generation else { return }
            guard user?.id == session.user.id else {
                await activate(session.user)
                return
            }
            user = session.user
            await refreshRemoteState(generation: runGeneration)
            await synchronize(generation: runGeneration)
        } catch {
            guard runGeneration == generation else { return }
            if let apiError = error as? APIError, apiError.isTerminalAuthFailure {
                await clearCredentials()
                guard runGeneration == generation else { return }
                await resetAuthenticatedState()
                return
            }
            recordSyncError("Could not reconcile the cached account", error)
        }
    }

    private func requestDebouncedSync(generation runGeneration: Int, immediate: Bool = false) {
        debounceTask?.cancel()
        let delay: Duration = immediate ? .zero : .milliseconds(1_500)
        debounceTask = Task { [weak self] in
            if delay != .zero { try? await Task.sleep(for: delay) }
            guard !Task.isCancelled else { return }
            await self?.synchronize(generation: runGeneration)
        }
    }

    private func requestFollowupIfNeeded(generation runGeneration: Int) {
        guard runGeneration == generation,
              syncCore?.consumeFollowupRequest() == true else { return }
        requestDebouncedSync(generation: runGeneration, immediate: true)
    }

    func apply(_ snapshot: OfflineSnapshot, scheduleRetry: Bool = true) {
        applyPhase6Snapshot(snapshot)
        tasks = snapshot.tasks.sorted { $0.sortOrder < $1.sortOrder }
        journalNotes = snapshot.journalNotes
        habits = snapshot.habits
        habitOccurrences = snapshot.habitOccurrences
        focusSessions = snapshot.focusSessions.sorted { $0.startedAt > $1.startedAt }
        activeFocusSession = focusSessions.first { $0.status == .active || $0.status == .paused }
        focusBlocking.apply(for: activeFocusSession)
        conflicts = snapshot.conflicts
        pendingMutations = snapshot.mutations
        healthLastSuccessfulImportAt = snapshot.healthImportState.lastSuccessfulImportAt
        if healthImportStatus != .importing {
            healthImportStatus = snapshot.healthImportState.lastSuccessfulImportAt == nil ? .idle : .imported
        }
        if scheduleRetry { scheduleEarliestRetry(generation: generation) }
        if let accountID = user?.id {
            let widgetSnapshot = IOSWidgetSnapshotDeriver.make(from: snapshot, accountID: accountID)
            IOSWidgetSnapshotBridge.publish(widgetSnapshot)
            IOSFocusLiveActivityCoordinator.sync(widgetSnapshot.activeFocus)
        }
        scheduleLocalNotificationSync()
    }

    private func scheduleLocalNotificationSync() {
        notificationSyncTask?.cancel()
        guard let accountID = user?.id else { return }
        let runGeneration = generation
        let currentTasks = tasks
        let currentFocus = activeFocusSession
        notificationSyncTask = Task { @MainActor [weak self] in
            guard !Task.isCancelled,
                  let self,
                  self.generation == runGeneration,
                  self.user?.id == accountID else { return }
            await IOSLocalNotificationScheduler.shared.sync(tasks: currentTasks, activeFocus: currentFocus)
        }
    }

    private func scheduleEarliestRetry(generation runGeneration: Int) {
        retryTask?.cancel()
        guard runGeneration == generation,
              let retryDate = pendingMutations.compactMap({ mutation -> Date? in
                  guard let value = mutation.nextRetryAt else { return nil }
                  return ISO8601DateFormatter().date(from: value)
              }).min() else { return }
        let delay = max(0, retryDate.timeIntervalSinceNow)
        retryTask = Task { [weak self] in
            if delay > 0 {
                try? await Task.sleep(for: .seconds(Int64(ceil(delay))))
            }
            guard !Task.isCancelled else { return }
            await self?.synchronize(generation: runGeneration)
        }
    }

    func recordSyncError(_ context: String, _ error: Error) {
        let message = "\(context): \(error.localizedDescription)"
        syncErrorMessage = message
        syncPhase = .error
    }

    private func resetAuthenticatedState() async {
        generation &+= 1
        outboxTask?.cancel()
        debounceTask?.cancel()
        retryTask?.cancel()
        hydrationTask?.cancel()
        healthImportTask?.cancel()
        periodicSyncTask?.cancel()
        periodicSyncTask = nil
        registrationTask?.cancel()
        registrationTask = nil
        socketReceiveTask?.cancel()
        socketReceiveTask = nil
        socketTask?.cancel(with: .goingAway, reason: nil)
        socketTask = nil
        registeredDevice = false
        if let notificationSyncTask {
            notificationSyncTask.cancel()
            await notificationSyncTask.value
        }
        healthImportTask = nil
        notificationSyncTask = nil
        healthImportToken &+= 1
        finishHealthObserverCompletions()
        healthPipeline?.stop()
        syncCore?.invalidate()
        inFlightFocusActions.values.forEach { $0.task.cancel() }
        inFlightFocusActions.removeAll()
        await IOSFocusLiveActivityCoordinator.endAll()
        IOSWidgetSnapshotBridge.clear()
        focusBlocking.setAccount(nil)
        navigationRequest = nil
        syncCore = nil
        store = nil
        user = nil
        destination = .home
        phase6State = IOSPhase6State()
        tasks = []
        journalNotes = []
        habits = []
        habitOccurrences = []
        focusSessions = []
        activeFocusSession = nil
        await IOSLocalNotificationScheduler.shared.sync(tasks: [], activeFocus: nil)
        conflicts = []
        pendingMutations = []
        healthAuthorizationState = healthPipeline?.authorizationState ?? .unavailable
        healthImportStatus = .idle
        healthLastSuccessfulImportAt = nil
        syncPhase = .offline
        errorMessage = nil
        syncErrorMessage = nil
    }

    /// Runs one local-first mutation against the active account store.
    /// The store and account identity are intentionally captured here so
    /// feature extensions cannot apply a result to a switched or logged-out
    /// account.
    @discardableResult
    func performOfflineMutation(
        _ operation: @escaping @Sendable (OfflineStore) async throws -> OfflineSnapshot
    ) async -> Bool {
        guard let store, let accountID = user?.id else { return false }
        let runGeneration = generation
        do {
            let snapshot = try await operation(store)
            guard !Task.isCancelled,
                  isCurrent(store: store, accountID: accountID, generation: runGeneration) else {
                return false
            }
            apply(snapshot)
            syncPhase = .pending
            requestDebouncedSync(generation: runGeneration)
            return true
        } catch is CancellationError {
            return false
        } catch {
            guard !Task.isCancelled,
                  isCurrent(store: store, accountID: accountID, generation: runGeneration) else {
                return false
            }
            errorMessage = error.localizedDescription
            return false
        }
    }

    // Feature extensions keep published state mutation in this declaration so
    // account switching and root-level error presentation remain centralized.
    func setPhase6Notifications(_ values: [AppNotificationModel], state: IOSRemoteResourceState) {
        phase6State.notifications = values
        phase6State.notificationsState = state
    }

    func setPhase6NotificationsState(_ state: IOSRemoteResourceState) {
        phase6State.notificationsState = state
    }

    func markPhase6NotificationRead(id: String, at timestamp: String) {
        guard let index = phase6State.notifications.firstIndex(where: { $0.id == id }) else { return }
        phase6State.notifications[index].readAt = timestamp
    }

    func setPhase6UsagePreferences(_ preferences: UsagePreferences) {
        phase6State.usagePreferences = preferences
        refreshSafariExtensionConfiguration()
    }

    func setUpdatedAuthenticatedUser(_ account: UserProfile) {
        user = account
        SessionCache.saveUser(account)
    }

    func setFeatureError(_ message: String) {
        errorMessage = message
    }

    func phase6OperationContext() -> IOSPhase6OperationContext? {
        guard let store, let accountID = user?.id else { return nil }
        return IOSPhase6OperationContext(store: store, accountID: accountID, generation: generation)
    }

    func isCurrentPhase6Operation(_ context: IOSPhase6OperationContext) -> Bool {
        guard !Task.isCancelled else { return false }
        return isCurrent(store: context.store, accountID: context.accountID, generation: context.generation)
    }

    func setPhase6OnlineForTesting(_ value: Bool) {
        pathMonitor?.cancel()
        pathMonitor = nil
        isOnline = value
    }

    private func clearCredentials() async {
        try? credentialStore.delete(.accessToken)
        try? credentialStore.delete(.refreshToken)
        SessionCache.clearCachedProfile()
        await apiClient.clearAccessToken()
    }

    private func isCurrent(store candidate: OfflineStore, accountID: String, generation runGeneration: Int) -> Bool {
        generation == runGeneration && user?.id == accountID && store.map { ObjectIdentifier($0) } == ObjectIdentifier(candidate)
    }

    private func startHealthPipeline(for accountStore: OfflineStore, accountID: String, generation runGeneration: Int) {
        guard let healthPipeline else { return }
        healthPipeline.refreshAuthorizationState()
        healthAuthorizationState = healthPipeline.authorizationState
        healthPipeline.start { [weak self, accountStore] completion in
            guard let self,
                  self.isCurrent(store: accountStore, accountID: accountID, generation: runGeneration) else {
                completion.finish()
                return
            }
            self.refreshHealth(observerCompletion: completion)
        }
        if healthPipeline.authorizationState == .requested {
            refreshHealth()
        }
    }

    private func importHealth(
        store: OfflineStore,
        accountID: String,
        generation runGeneration: Int,
        token runToken: Int
    ) async {
        defer {
            if runToken == healthImportToken {
                healthImportTask = nil
                finishHealthObserverCompletions()
            }
        }
        guard isCurrent(store: store, accountID: accountID, generation: runGeneration),
              runToken == healthImportToken,
              let healthPipeline,
              healthPipeline.authorizationState == .requested else { return }
        healthImportStatus = .importing
        do {
            let existingState = await store.healthImportState()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration),
                  runToken == healthImportToken else { return }
            let existingSummaries = await store.healthDailySummaries()
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration),
                  runToken == healthImportToken else { return }
            let result = try await healthPipeline.importNow(
                deviceID: deviceId,
                existingSummaries: existingSummaries,
                existingImportState: existingState
            )
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration),
                  runToken == healthImportToken else { return }
            let snapshot = try await store.applyHealthImport(
                dailySummaries: result.dailySummaries,
                workouts: result.workouts,
                deletedWorkouts: result.deletedWorkouts,
                importState: result.importState
            )
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration),
                  runToken == healthImportToken else { return }
            apply(snapshot)
            healthAuthorizationState = healthPipeline.authorizationState
            healthImportStatus = result.partialErrors.isEmpty ? .imported : .partial(result.partialErrors.joined(separator: " "))
        } catch is CancellationError {
            return
        } catch {
            guard isCurrent(store: store, accountID: accountID, generation: runGeneration),
                  runToken == healthImportToken else { return }
            if case IOSHealthKitError.unavailable = error {
                healthImportStatus = .unavailable
            } else {
                healthImportStatus = .failed(error.localizedDescription)
            }
        }
    }

    private func finishHealthObserverCompletions() {
        let completions = healthObserverCompletions
        healthObserverCompletions.removeAll()
        completions.forEach { $0.finish() }
    }
}

private struct SyncInvalidationMessage: Decodable {
    let type: String
    let cursor: String?
}
