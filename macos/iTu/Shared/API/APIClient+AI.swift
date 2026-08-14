import Foundation

private struct AiCredentialDeleteResponse: Decodable, Sendable {
    let success: Bool
}

extension APIClient {
    // MARK: - AI credentials

    func fetchAiCredentials() async throws -> [AiCredential] {
        try await request(path: "/ai/credentials")
    }

    func addAiCredential(apiKey: String) async throws -> AiCredential {
        try await request(
            path: "/ai/credentials",
            method: "POST",
            body: ["apiKey": .string(apiKey)] as [String: JSONValue]
        )
    }

    func updateAiCredential(id: String, apiKey: String? = nil, enabled: Bool? = nil) async throws -> AiCredential {
        var body: [String: JSONValue] = [:]
        if let apiKey { body["apiKey"] = .string(apiKey) }
        if let enabled { body["enabled"] = .bool(enabled) }
        return try await request(
            path: "/ai/credentials/\(escapedPath(id))",
            method: "PATCH",
            body: body
        )
    }

    func removeAiCredential(id: String) async throws {
        let _: AiCredentialDeleteResponse = try await request(
            path: "/ai/credentials/\(escapedPath(id))",
            method: "DELETE"
        )
    }

    func testAiCredential(id: String) async throws -> AiCredential {
        try await request(
            path: "/ai/credentials/\(escapedPath(id))/test",
            method: "POST"
        )
    }
}
