import Foundation
import iTuOffline

enum SyncPhase: String, Codable, Sendable {
    case offline
    case pending
    case syncing
    case upToDate
    case conflict
}

typealias OutboxEvent = iTuOffline.OutboxEvent
typealias SyncMutation = iTuOffline.SyncMutation
typealias SyncConflict = iTuOffline.SyncConflict
typealias SyncMutationPayload = iTuOffline.SyncMutationPayload
typealias SyncMutationOutcome = iTuOffline.SyncMutationOutcome
typealias SyncResult = iTuOffline.SyncResult
typealias SyncRequest = iTuOffline.SyncRequest
typealias SyncChange = iTuOffline.SyncChange
typealias SyncResponse = iTuOffline.SyncResponse
typealias OfflineSnapshot = iTuOffline.OfflineSnapshot

struct PresentedGrowthReceipt: Identifiable, Equatable, Sendable {
    let id: String
    let receipt: GrowthAwardReceipt
}
