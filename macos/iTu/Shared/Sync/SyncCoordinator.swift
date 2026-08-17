import Foundation
import iTuNetworking
import iTuSync

/// Owns the authenticated app session's sync transport and outbox schedule.
@MainActor
final class SyncCoordinator {
    private let apiClient: APIClient
    private let webSocketSession: URLSession
    private var offlineStore: OfflineStore?
    private let deviceId: String
    var syncDeviceId: String { deviceId }
    let clientInstanceId: String
    private var periodicTask: Task<Void, Never>?
    private var debounceTask: Task<Void, Never>?
    private var retryTask: Task<Void, Never>?
    private var urgentFlushTask: Task<Void, Never>?
    private var outboxTask: Task<Void, Never>?
    private var registrationTask: Task<Void, Never>?
    private var registrationTaskID: UUID?
    private var socketTask: URLSessionWebSocketTask?
    private var socketReceiveTask: Task<Void, Never>?
    private var syncAction: (@MainActor () async -> Void)?
    private let syncCore: SyncCoordinatorCore
    private var registeredDevice = false
    private(set) var isActive = false
    private(set) var generation = 0

    init(apiClient: APIClient, offlineStore: OfflineStore? = nil) {
        self.apiClient = apiClient
        webSocketSession = APIClient.makeSession()
        self.offlineStore = offlineStore
        let clientInstanceId = UUID().uuidString
        self.clientInstanceId = clientInstanceId
        if let stored = UserDefaults.standard.string(forKey: "syncDeviceId") {
            deviceId = stored
        } else {
            let generated = ULID.generate()
            UserDefaults.standard.set(generated, forKey: "syncDeviceId")
            deviceId = generated
        }
        syncCore = SyncCoordinatorCore(
            store: offlineStore,
            transport: apiClient,
            deviceId: deviceId,
            clientInstanceId: clientInstanceId
        )
    }

    func attach(store: OfflineStore) {
        let wasActive = isActive
        let action = syncAction
        generation &+= 1
        cancelTransport()
        offlineStore = store
        syncCore.attach(store: store, generation: generation)
        registeredDevice = false
        if wasActive, let action { start(periodicAction: action) }
    }

    deinit {
        periodicTask?.cancel()
        debounceTask?.cancel()
        retryTask?.cancel()
        urgentFlushTask?.cancel()
        outboxTask?.cancel()
        registrationTask?.cancel()
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
        let runGeneration = generation
        outboxTask?.cancel()
        if let offlineStore {
            outboxTask = Task { [weak self] in
                for await event in await offlineStore.outboxEvents() {
                    guard !Task.isCancelled else { return }
                    guard let self, self.isActive, self.generation == runGeneration else { return }
                    if case let .enqueued(urgent) = event { self.requestFlush(urgent: urgent) }
                }
            }
        }
        periodicTask?.cancel()
        periodicTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(15))
                guard !Task.isCancelled else { return }
                guard let self, self.isActive, self.generation == runGeneration else { return }
                await periodicAction()
            }
        }
        ConnectivityMonitor.shared.onReconnected = { [weak self] in
            guard let self, self.isActive, self.generation == runGeneration else { return }
            self.requestFlush(urgent: true)
        }
        scheduleRegistration(generation: runGeneration)
    }

    func stop() {
        generation &+= 1
        syncCore.invalidate()
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
        registrationTask?.cancel(); registrationTask = nil
        registrationTaskID = nil
        socketReceiveTask?.cancel(); socketReceiveTask = nil
        socketTask?.cancel(with: .goingAway, reason: nil); socketTask = nil
        ConnectivityMonitor.shared.onReconnected = nil
    }

    /// Requests an outbox flush. Normal writes share a 1.5 second debounce;
    /// status/delete and explicit recovery actions can request an immediate run.
    func requestFlush(urgent: Bool = false) {
        guard isActive, let syncAction else { return }
        let runGeneration = generation
        debounceTask?.cancel()
        if urgent {
            urgentFlushTask?.cancel()
            urgentFlushTask = Task { [weak self] in
                guard let self, self.isActive, self.generation == runGeneration else { return }
                await syncAction()
                guard !Task.isCancelled, self.isActive, self.generation == runGeneration else { return }
                self.urgentFlushTask = nil
            }
            return
        }
        debounceTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(1500))
            guard let self, !Task.isCancelled, self.isActive, self.generation == runGeneration else { return }
            await syncAction()
        }
    }

    func synchronize() async throws -> SyncResult {
        AppPerformanceSignposts.recordSyncRun()
        let runGeneration = generation
        guard let offlineStore else { throw APIError(statusCode: 0, message: "Sync is not attached") }
        let before = await offlineStore.snapshot()
        guard runGeneration == generation else { return SyncResult(snapshot: before, outcomes: [], conflicts: before.conflicts, cursor: before.cursor) }
        scheduleEarliestRetry(for: before.mutations, generation: runGeneration)
        do {
            let outcome = try await syncCore.synchronize {
                await ConnectivityMonitor.shared.state != .offline
            }
            let result = outcome.result
            guard runGeneration == generation else {
                return SyncResult(snapshot: await offlineStore.snapshot(), outcomes: [], conflicts: [], cursor: result.cursor)
            }
            guard outcome.performed else { return result }
            try? await apiClient.updateSyncDevice(deviceId: deviceId, cursor: result.cursor)
            guard runGeneration == generation else {
                return SyncResult(snapshot: await offlineStore.snapshot(), outcomes: [], conflicts: [], cursor: result.cursor)
            }
            if socketTask == nil { scheduleRegistration(generation: runGeneration) }
            if syncCore.consumeFollowupRequest() { requestFlush(urgent: true) }
            return result
        } catch {
            if runGeneration == generation {
                scheduleEarliestRetry(for: await offlineStore.snapshot().mutations, generation: runGeneration)
                if syncCore.consumeFollowupRequest() { requestFlush(urgent: true) }
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

    private func scheduleRegistration(generation runGeneration: Int) {
        guard isActive, generation == runGeneration, registrationTask == nil else { return }
        let taskID = UUID()
        registrationTaskID = taskID
        registrationTask = Task { [weak self] in
            await self?.registerAndConnect(generation: runGeneration)
            guard let self, self.registrationTaskID == taskID else { return }
            self.registrationTask = nil
            self.registrationTaskID = nil
        }
    }

    private func registerAndConnect(generation runGeneration: Int) async {
        guard isActive, generation == runGeneration, socketTask == nil,
              await apiClient.token() != nil, let offlineStore else { return }
        do {
            let cursor = await offlineStore.snapshot().cursor
            guard isActive, generation == runGeneration, socketTask == nil else { return }
            try await apiClient.registerSyncDevice(deviceId: deviceId, cursor: cursor)
            guard isActive, generation == runGeneration, socketTask == nil else { return }
            registeredDevice = true
            await connectWebSocket(generation: runGeneration)
        } catch {
            // Reachability is reflected by the next sync; never fabricate an
            // authenticated/online phase because device registration failed.
        }
    }

    private func connectWebSocket(generation connectionGeneration: Int) async {
        guard isActive, generation == connectionGeneration, registeredDevice,
              socketTask == nil, let token = await apiClient.token() else { return }
        guard isActive, generation == connectionGeneration, registeredDevice, socketTask == nil else { return }
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
                guard connectionGeneration == self.generation, self.isActive else { return }
                self.scheduleRegistration(generation: connectionGeneration)
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

}

private struct SyncInvalidationMessage: Decodable {
    let type: String
    let cursor: String
}
