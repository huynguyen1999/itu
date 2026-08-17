import Foundation
import iTuOffline

public protocol SyncTransport: Sendable {
    func synchronize(_ request: SyncRequest) async throws -> SyncResponse
}

/// Optional transport metadata used to preserve API retry behavior without
/// coupling the platform-neutral sync target to a networking implementation.
public protocol SyncTransportFailure: Error, Sendable {
    var syncFailureCode: String { get }
    var syncRetryAfter: TimeInterval? { get }
    var syncRetryable: Bool { get }
    var syncRecoverableMutationIDs: [String] { get }
    var syncAcknowledgedMutationIDs: [String] { get }
}

public extension SyncTransportFailure {
    var syncRecoverableMutationIDs: [String] { [] }
    var syncAcknowledgedMutationIDs: [String] { [] }
}
