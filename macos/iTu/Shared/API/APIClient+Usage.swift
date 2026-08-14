import Foundation

private struct ServerUsagePreferences: Decodable {
    let trackingEnabled: Bool
    let websiteTrackingEnabled: Bool
    let retentionDays: Int
    let idleThresholdSeconds: Int
    let excludedBundleIds: [String]
}

private struct UserPreferencesResponse: Decodable {
    let usage: ServerUsagePreferences
}

extension APIClient {
    // MARK: - Usage

    func uploadUsageSummaries(_ summaries: [UsageSummary], deviceId: String) async throws {
        let body: [String: JSONValue] = [
            "deviceId": .string(deviceId),
            "summaries": .array(summaries.map { summary in
                var payload: [String: JSONValue] = [
                    "localDate": .string(summary.localDate),
                    "bundleId": .string(summary.bundleId),
                    "displayName": .string(summary.displayName),
                    "timezone": .string(summary.timezone),
                    "activeSeconds": .number(Double(summary.activeSeconds))
                ]
                if let hour = summary.hour { payload["hour"] = .number(Double(hour)) }
                if let engagedSeconds = summary.engagedSeconds {
                    payload["engagedSeconds"] = .number(Double(engagedSeconds))
                }
                return .object(payload)
            })
        ]
        let _: EmptyResponse = try await request(path: "/usage/summaries/batch", method: "POST", body: body)
    }

    func uploadWebsiteUsageSummaries(_ summaries: [WebsiteUsageSummary], deviceId: String) async throws {
        let body: [String: JSONValue] = [
            "deviceId": .string(deviceId),
            "summaries": .array(summaries.map { summary in
                .object([
                    "localDate": .string(summary.localDate),
                    "browserBundleId": .string(summary.browserBundleId),
                    "browserDisplayName": .string(summary.browserDisplayName),
                    "hostname": .string(summary.hostname),
                    "timezone": .string(summary.timezone),
                    "activeSeconds": .number(Double(summary.activeSeconds))
                ])
            })
        ]
        let _: EmptyResponse = try await request(path: "/usage/websites/summaries/batch", method: "POST", body: body)
    }

    func fetchUsageAppIdentities() async throws -> [UsageAppIdentity] {
        try await request(path: "/usage/apps")
    }

    func uploadUsageAppIcon(bundleId: String, displayName: String, fileData: Data) async throws -> UsageAppIdentity {
        let boundary = "Boundary-\(UUID().uuidString)"
        var body = Data()
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"displayName\"\r\n\r\n".data(using: .utf8)!)
        body.append("\(displayName)\r\n".data(using: .utf8)!)
        body.append("--\(boundary)\r\n".data(using: .utf8)!)
        body.append("Content-Disposition: form-data; name=\"image\"; filename=\"\(bundleId).png\"\r\n".data(using: .utf8)!)
        body.append("Content-Type: image/png\r\n\r\n".data(using: .utf8)!)
        body.append(fileData)
        body.append("\r\n--\(boundary)--\r\n".data(using: .utf8)!)
        return try await requestRawBody(
            path: "/usage/apps/\(escapedPath(bundleId))/icon",
            method: "PUT",
            contentType: "multipart/form-data; boundary=\(boundary)",
            bodyData: body
        )
    }

    func fetchUsage(from: String? = nil, to: String? = nil) async throws -> UsageStatistics {
        var path = "/usage/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func fetchWebsiteUsage(from: String? = nil, to: String? = nil) async throws -> WebsiteUsageStatistics {
        var path = "/usage/websites/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func fetchWebsiteUsageStatistics(from: String? = nil, to: String? = nil) async throws -> WebsiteUsageStatistics {
        var path = "/usage/websites/statistics"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func deleteUsage(from: String? = nil, to: String? = nil) async throws {
        var path = "/usage/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        let _: EmptyResponse = try await request(path: path, method: "DELETE")
    }

    func deleteWebsiteUsage(from: String? = nil, to: String? = nil) async throws {
        var path = "/usage/websites/summaries"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        let _: EmptyResponse = try await request(path: path, method: "DELETE")
    }

    func fetchUsagePreferences() async throws -> UsagePreferences {
        let response: UserPreferencesResponse = try await request(path: "/preferences")
        return UsagePreferences(
            enabled: response.usage.trackingEnabled,
            websiteTrackingEnabled: response.usage.websiteTrackingEnabled,
            retentionDays: response.usage.retentionDays,
            idleThresholdSeconds: response.usage.idleThresholdSeconds,
            excludedBundleIds: response.usage.excludedBundleIds
        )
    }

    func updateUsagePreferences(_ preferences: UsagePreferences) async throws {
        let _: EmptyResponse = try await request(path: "/preferences/usage", method: "PATCH", body: [
            "trackingEnabled": .bool(preferences.enabled),
            "websiteTrackingEnabled": .bool(preferences.enabled && preferences.websiteTrackingEnabled),
            "retentionDays": .number(Double(preferences.retentionDays)),
            "idleThresholdSeconds": .number(Double(preferences.idleThresholdSeconds)),
            "excludedBundleIds": .array(preferences.excludedBundleIds.map(JSONValue.string))
        ] as [String: JSONValue])
    }
}
