import Foundation

extension APIClient {
    // MARK: - Sync transport

    func synchronize(_ requestBody: SyncRequest) async throws -> SyncResponse {
        try await request(path: "/sync", method: "POST", body: requestBody)
    }

    func registerSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/register",
            method: "POST",
            body: [
                "deviceId": .string(deviceId),
                "platform": .string("MACOS"),
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
