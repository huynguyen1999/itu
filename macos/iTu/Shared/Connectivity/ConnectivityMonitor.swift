import Foundation
import Network
import Observation

enum ConnectivityState: Sendable {
    case unknown
    case offline
    case connecting
    case online
}

/// Advisory network reachability monitor driving automatic sync flushing on reconnection.
@MainActor
@Observable
final class ConnectivityMonitor {
    static let shared = ConnectivityMonitor()

    private let pathMonitor = NWPathMonitor()
    private let monitorQueue = DispatchQueue(label: "com.itu.connectivity")

    private(set) var state: ConnectivityState = .unknown
    private var isFirstUpdate = true

    var onReconnected: (@MainActor () -> Void)?

    private init() {
        pathMonitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                self?.handlePathUpdate(path)
            }
        }
        pathMonitor.start(queue: monitorQueue)
    }

    private func handlePathUpdate(_ path: NWPath) {
        let newState: ConnectivityState = path.status == .satisfied ? .online : .offline
        let wasOffline = state == .offline

        if isFirstUpdate {
            isFirstUpdate = false
            state = newState
            return
        }

        guard newState != state else { return }
        state = newState

        if wasOffline && newState == .online {
            onReconnected?()
        }
    }
}
