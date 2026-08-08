import Foundation

/// Owns the authenticated app session's sync transport and outbox schedule.
@MainActor
final class SyncCoordinator {
    private let apiClient: APIClient
    private var offlineStore: OfflineStore?
    private let deviceId: String
    let clientInstanceId = UUID().uuidString
    private var periodicTask: Task<Void, Never>?
    private var debounceTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var urgentFlushTask: Task<Void, Never>?
    private var outboxTask: Task<Void, Never>?
    private var socketTask: URLSessionWebSocketTask?
    private var socketReceiveTask: Task<Void, Never>?
    private var syncAction: (@MainActor () async -> Void)?
    private var isSyncing = false
    private var followupRequested = false
    private var registeredDevice = false
    private(set) var isActive = false
    private(set) var generation = 0

    init(apiClient: APIClient, offlineStore: OfflineStore? = nil) {
        self.apiClient = apiClient
        self.offlineStore = offlineStore
        if let stored = UserDefaults.standard.string(forKey: "syncDeviceId") {
            deviceId = stored
        } else {
            let generated = ULID.generate()
            UserDefaults.standard.set(generated, forKey: "syncDeviceId")
            deviceId = generated
        }
    }

    func attach(store: OfflineStore) {
        let wasActive = isActive
        let action = syncAction
        generation &+= 1
        cancelTransport()
        offlineStore = store
        registeredDevice = false
        if wasActive, let action { start(periodicAction: action) }
    }

    deinit {
        periodicTask?.cancel()
        debounceTask?.cancel()
        retryTask?.cancel()
        urgentFlushTask?.cancel()
        outboxTask?.cancel()
        socketReceiveTask?.cancel()
        socketTask?.cancel(with: .goingAway, reason: nil)
    }

    func start() {
        start { [weak self] in _ = try? await self?.synchronize() }
    }

    /// Kept as a narrow lifecycle seam for the model and deterministic fakes.
    func start(periodicAction: @escaping @MainActor () async -> Void) {
        syncAction = periodicAction
        isActive = true
        outboxTask?.cancel()
        if let offlineStore {
            outboxTask = Task { [weak self] in
                for await event in await offlineStore.outboxEvents() {
                    guard !Task.isCancelled else { return }
                    if case let .enqueued(urgent) = event { self?.requestFlush(urgent: urgent) }
                }
            }
        }
        periodicTask?.cancel()
        periodicTask = Task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(300))
                guard !Task.isCancelled else { return }
                await periodicAction()
            }
        }
        ConnectivityMonitor.shared.onReconnected = { [weak self] in
            self?.requestFlush(urgent: true)
        }
        Task { [weak self] in await self?.registerAndConnect() }
    }

    func stop() {
        generation &+= 1
        cancelTransport()
        syncAction = nil
        isActive = false
        registeredDevice = false
    }

    private func cancelTransport() {
        periodicTask?.cancel(); periodicTask = nil
        debounceTask?.cancel(); debounceTask = nil
        retryTask?.cancel(); retryTask = nil
        urgentFlushTask?.cancel(); urgentFlushTask = nil
        outboxTask?.cancel(); outboxTask = nil
        socketReceiveTask?.cancel(); socketReceiveTask = nil
        socketTask?.cancel(with: .goingAway, reason: nil); socketTask = nil
    }

    /// Requests an outbox flush. Normal writes share a 1.5 second debounce;
    /// status/delete and explicit recovery actions can request an immediate run.
    func requestFlush(urgent: Bool = false) {
        guard isActive, let syncAction else { return }
        debounceTask?.cancel()
        if urgent {
            urgentFlushTask?.cancel()
            urgentFlushTask = Task { [weak self] in
                await syncAction()
                guard !Task.isCancelled else { return }
                self?.urgentFlushTask = nil
            }
            return
        }
        debounceTask = Task {
            try? await Task.sleep(for: .milliseconds(1500))
            guard !Task.isCancelled else { return }
            await syncAction()
        }
    }

    func synchronize() async throws -> SyncResult {
        AppPerformanceSignposts.recordSyncRun()
        guard let offlineStore else { throw APIError(statusCode: 0, message: "Sync is not attached") }
        if isSyncing {
            followupRequested = true
            let snapshot = await offlineStore.snapshot()
            return SyncResult(snapshot: snapshot, outcomes: [], conflicts: snapshot.conflicts, cursor: snapshot.cursor)
        }
        isSyncing = true
        defer {
            isSyncing = false
            if followupRequested {
                followupRequested = false
                requestFlush(urgent: true)
            }
        }

        let runGeneration = generation
        let before = await offlineStore.snapshot()
        guard runGeneration == generation else { return SyncResult(snapshot: before, outcomes: [], conflicts: before.conflicts, cursor: before.cursor) }
        scheduleEarliestRetry(for: before.mutations, generation: runGeneration)
        let readyMutations = before.mutations.filter { mutation in
            guard let nextRetryAt = mutation.nextRetryAt,
                  let date = Self.parseDate(nextRetryAt) else { return true }
            return date <= Date()
        }
        do {
            let response = try await apiClient.synchronize(SyncRequest(
                deviceId: deviceId,
                clientInstanceId: clientInstanceId,
                cursor: before.cursor,
                mutations: readyMutations.map(SyncMutationPayload.init)
            ))
            guard runGeneration == generation else { return SyncResult(snapshot: await offlineStore.snapshot(), outcomes: [], conflicts: [], cursor: before.cursor) }
            let snapshot = try await offlineStore.applySync(response)
            try? await apiClient.updateSyncDevice(deviceId: deviceId, cursor: response.cursor)
            if socketTask == nil { await registerAndConnect() }
            return SyncResult(
                snapshot: snapshot,
                outcomes: response.mutationOutcomes ?? [],
                conflicts: response.conflicts,
                cursor: response.cursor,
                changes: response.changes
            )
        } catch {
            let isOffline = ConnectivityMonitor.shared.state == .offline
            let code = Self.syncErrorCode(error)
            let apiError = error as? APIError
            let retryable = apiError.map { $0.statusCode == 0 || $0.statusCode == 408 || $0.statusCode == 425 || $0.statusCode == 429 || $0.statusCode >= 500 } ?? true
            if runGeneration == generation && !isOffline {
                _ = try? await offlineStore.recordMutationFailures(
                    readyMutations.map(\.id), code: code, retryAfter: apiError?.retryAfter, retryable: retryable
                )
                scheduleEarliestRetry(for: await offlineStore.snapshot().mutations, generation: runGeneration)
            }
            throw error
        }
    }

    /// Compatibility entry point for existing callers while ownership moves
    /// into this coordinator.
    func synchronize(store: OfflineStore) async throws -> SyncResult {
        attach(store: store)
        return try await synchronize()
    }

    private func registerAndConnect() async {
        guard socketTask == nil, await apiClient.token() != nil, let offlineStore else { return }
        do {
            let cursor = await offlineStore.snapshot().cursor
            try await apiClient.registerSyncDevice(deviceId: deviceId, cursor: cursor)
            registeredDevice = true
            await connectWebSocket()
        } catch {
            // Reachability is reflected by the next sync; never fabricate an
            // authenticated/online phase because device registration failed.
        }
    }

    private func connectWebSocket() async {
        guard registeredDevice, socketTask == nil, let token = await apiClient.token() else { return }
        var components = URLComponents(url: APIConfiguration.baseURL, resolvingAgainstBaseURL: false)
        components?.scheme = APIConfiguration.baseURL.scheme == "https" ? "wss" : "ws"
        components?.path = "/ws/sync"
        components?.queryItems = [
            URLQueryItem(name: "token", value: token),
            URLQueryItem(name: "deviceId", value: deviceId),
            URLQueryItem(name: "clientInstanceId", value: clientInstanceId)
        ]
        guard let url = components?.url else { return }
        let webSocket = URLSession.shared.webSocketTask(with: url)
        socketTask = webSocket
        webSocket.resume()
        let connectionGeneration = generation
        socketReceiveTask = Task { [weak self] in await self?.receiveMessages(from: webSocket, generation: connectionGeneration) }
    }

    private func receiveMessages(from webSocket: URLSessionWebSocketTask, generation connectionGeneration: Int) async {
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
                    requestFlush(urgent: true)
                }
            } catch {
                guard connectionGeneration == generation else { return }
                socketTask = nil; socketReceiveTask = nil
                guard !Task.isCancelled else { return }
                try? await Task.sleep(for: .seconds(3))
                await registerAndConnect()
                return
            }
        }
    }

    private func scheduleEarliestRetry(for mutations: [SyncMutation], generation runGeneration: Int) {
        retryTask?.cancel()
        guard isActive, let earliest = mutations.compactMap({ mutation -> Date? in
            guard let value = mutation.nextRetryAt else { return nil }
            return Self.parseDate(value)
        }).min(), earliest > Date() else { retryTask = nil; return }
        retryTask = Task { [weak self] in
            let delay = max(0, earliest.timeIntervalSinceNow)
            try? await Task.sleep(for: .seconds(delay))
            guard let self, !Task.isCancelled, self.generation == runGeneration else { return }
            self.retryTask = nil
            self.requestFlush(urgent: true)
        }
    }

    private static func parseDate(_ value: String) -> Date? {
        ISO8601DateFormatter().date(from: value)
    }

    private static func isCursorNewer(_ incoming: String, than local: String) -> Bool {
        if let incomingNumber = UInt64(incoming), let localNumber = UInt64(local) {
            return incomingNumber > localNumber
        }
        return incoming != local && incoming > local
    }

    private static func syncErrorCode(_ error: Error) -> String {
        if let apiError = error as? APIError {
            return apiError.code ?? (apiError.statusCode > 0 ? "HTTP_\(apiError.statusCode)" : "SYNC_FAILED")
        }
        return "SYNC_FAILED"
    }
}

private struct SyncInvalidationMessage: Decodable {
    let type: String
    let cursor: String
}
