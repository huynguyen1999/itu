import Foundation

extension APIClient {
    // MARK: - Focus

    func activeFocus() async throws -> FocusSession? {
        try await request(path: "/productivity/focus-sessions/active")
    }

    func focusHistory() async throws -> [FocusSession] {
        try await request(path: "/productivity/focus-sessions/history")
    }

    func focusSummary() async throws -> FocusSummary {
        try await request(path: "/productivity/focus-sessions/summary")
    }

    func fetchFocusSounds() async throws -> FocusSoundCatalog {
        try await request(path: "/productivity/focus-sounds")
    }

    func updateFocusSoundPreference(
        soundKey: String,
        enabled: Bool? = nil,
        sortOrder: Int? = nil,
        volume: Double? = nil
    ) async throws -> FocusSoundPreference {
        var body: [String: JSONValue] = [:]
        if let enabled { body["enabled"] = .bool(enabled) }
        if let sortOrder { body["sortOrder"] = .number(Double(sortOrder)) }
        if let volume { body["volume"] = .number(volume) }
        let encodedKey = soundKey.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? soundKey
        return try await request(
            path: "/productivity/focus-sounds/\(encodedKey)/preferences",
            method: "PATCH",
            body: body
        )
    }

    func uploadFocusSound(name: String, fileData: Data, fileName: String, mimeType: String) async throws -> FocusSound {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"name\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(name)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"file\"; filename=\"\(fileName)\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: \(mimeType)\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return try await requestRawBody(
            path: "/productivity/focus-sounds",
            method: "POST",
            contentType: "multipart/form-data; boundary=\(boundary)",
            bodyData: body
        )
    }

    func updateFocusSound(id: String, name: String) async throws -> FocusSound {
        let body: [String: JSONValue] = ["name": .string(name)]
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await request(path: "/productivity/focus-sounds/\(encodedId)", method: "PATCH", body: body)
    }

    func deleteFocusSound(id: String) async throws {
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let _: EmptyResponse = try await request(path: "/productivity/focus-sounds/\(encodedId)", method: "DELETE")
    }
}
