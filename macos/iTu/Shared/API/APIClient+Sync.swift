import Foundation
import iTuNetworking
import iTuOffline
import iTuSync

extension APIClient: @retroactive SyncTransport {
    // MARK: - Sync transport

    public func synchronize(_ requestBody: iTuOffline.SyncRequest) async throws -> iTuOffline.SyncResponse {
        try await request(path: "/sync", method: "POST", body: requestBody)
    }

}

extension APIError: @retroactive SyncTransportFailure {
    public var syncFailureCode: String {
        code ?? (statusCode > 0 ? "HTTP_\(statusCode)" : "SYNC_FAILED")
    }

    public var syncRetryAfter: TimeInterval? { retryAfter }

    public var syncRecoverableMutationIDs: [String] {
        guard details?["reason"]?.stringValue == "MUTATION_ID_REUSED",
              let mutationID = details?["mutationId"]?.stringValue else { return [] }
        return [mutationID]
    }

    public var syncAcknowledgedMutationIDs: [String] {
        details?["acknowledgedMutationIds"]?.arrayValue?.compactMap(\.stringValue) ?? []
    }

    public var syncRetryable: Bool {
        statusCode == 0 || statusCode == 408 || statusCode == 425 || statusCode == 429 || statusCode >= 500
    }
}

extension APIClient {

    func registerSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/register",
            method: "POST",
            body: [
                "deviceId": .string(deviceId),
                "platform": .string(platform),
                "lastKnownSyncCursor": .string(cursor)
            ] as [String: JSONValue]
        )
    }

    func updateSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/\(deviceId)",
            method: "PATCH",
            body: ["lastKnownSyncCursor": .string(cursor)] as [String: JSONValue]
        )
    }
}
