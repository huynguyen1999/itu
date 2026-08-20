import Foundation
import iTuDomain

private struct ServerUsagePreferences: Decodable {
    let trackingEnabled: Bool
    let websiteTrackingEnabled: Bool
    let retentionDays: Int
    let idleThresholdSeconds: Int
    let excludedBundleIds: [String]
}

private struct ServerHabitPreferences: Decodable {
    let dayRolloverCutoffHour: Int
    let weekStartDay: String
}

private struct UserPreferencesResponse: Decodable {
    let usage: ServerUsagePreferences
    let habits: ServerHabitPreferences?
}

public extension APIClient {
    // MARK: - Usage

    func fetchPreferences() async throws -> (usage: UsagePreferences, habits: HabitPreferencesModel) {
        let response: UserPreferencesResponse = try await request(path: "/preferences")
        return (
            UsagePreferences(
                enabled: response.usage.trackingEnabled,
                websiteTrackingEnabled: response.usage.websiteTrackingEnabled,
                retentionDays: response.usage.retentionDays,
                idleThresholdSeconds: response.usage.idleThresholdSeconds,
                excludedBundleIds: response.usage.excludedBundleIds
            ),
            response.habits.map {
                HabitPreferencesModel(dayRolloverCutoffHour: $0.dayRolloverCutoffHour, weekStartDay: $0.weekStartDay)
            } ?? HabitPreferencesModel()
        )
    }

    func uploadUsageSummaries(_ summaries: [UsageSummary], deviceId: String) async throws {
        let body: [String: JSONValue] = [
            "deviceId": .string(deviceId),
            "summaries": .array(summaries.map { summary in
                var payload: [String: JSONValue] = [
                    "source": .string(summary.source.rawValue),
                    "localDate": .string(summary.localDate),
                    "bundleId": .string(summary.bundleId),
                    "displayName": .string(summary.displayName),
                    "timezone": .string(summary.timezone),
                    "activeSeconds": .number(Double(summary.activeSeconds))
                ]
                if summary.hour >= 0 { payload["hour"] = .number(Double(summary.hour)) }
                if let engagedSeconds = summary.engagedSeconds {
                    payload["engagedSeconds"] = .number(Double(engagedSeconds))
                }
                if let pickups = summary.pickups { payload["pickups"] = .number(Double(pickups)) }
                if let notifications = summary.notifications { payload["notifications"] = .number(Double(notifications)) }
                return .object(payload)
            })
        ]
        let _: EmptyResponse = try await request(path: "/usage/summaries/batch", method: "POST", body: body)
    }

    func uploadWebsiteUsageSummaries(_ summaries: [WebsiteUsageSummary], deviceId: String) async throws {
        let body: [String: JSONValue] = [
            "deviceId": .string(deviceId),
            "summaries": .array(summaries.map { summary in
                .object({
                    var payload: [String: JSONValue] = [
                        "source": .string(summary.source.rawValue),
                        "localDate": .string(summary.localDate),
                        "browserDisplayName": .string(summary.browserDisplayName),
                        "hostname": .string(summary.hostname),
                        "timezone": .string(summary.timezone),
                        "activeSeconds": .number(Double(summary.activeSeconds))
                    ]
                    if summary.hour >= 0 { payload["hour"] = .number(Double(summary.hour)) }
                    if let browserBundleId = summary.browserBundleId {
                        payload["browserBundleId"] = .string(browserBundleId)
                    }
                    if let url = summary.url { payload["url"] = .string(url) }
                    return payload
                }())
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
        try await fetchPreferences().usage
    }

    func fetchHabitPreferences() async throws -> HabitPreferencesModel {
        try await fetchPreferences().habits
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

    func uploadScreenTimeEvents(_ events: [ImportedUsageInterval], collectorDeviceId: String) async throws {
        let isoFormatter = ISO8601DateFormatter()
        isoFormatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let body: [String: JSONValue] = [
            "collectorDeviceId": .string(collectorDeviceId),
            "events": .array(events.map { event in
                var payload: [String: JSONValue] = [
                    "eventId": .string(event.eventId),
                    "source": .string(event.source.rawValue),
                    "sourceDeviceId": .string(event.sourceDeviceId),
                    "bundleId": .string(event.bundleId),
                    "displayName": .string(event.displayName),
                    "startedAt": .string(isoFormatter.string(from: event.startedAt)),
                    "endedAt": .string(isoFormatter.string(from: event.endedAt)),
                    "durationSeconds": .number(Double(event.durationSeconds))
                ]
                if let sourceDeviceName = event.sourceDeviceName?.trimmingCharacters(in: .whitespacesAndNewlines), !sourceDeviceName.isEmpty {
                    payload["sourceDeviceName"] = .string(sourceDeviceName)
                }
                return .object(payload)
            })
        ]
        let _: EmptyResponse = try await request(
            path: "/usage/screentime/events/batch",
            method: "POST",
            body: body
        )
    }

    func fetchScreenTimeStatistics(
        from: String? = nil,
        to: String? = nil,
        deviceId: String? = nil,
        timezone: String? = nil
    ) async throws -> ScreenTimeStatistics {
        var path = "/usage/screentime/statistics"
        var query: [String] = []
        if let from { query.append("from=\(from)") }
        if let to { query.append("to=\(to)") }
        if let deviceId, deviceId != "all" { query.append("deviceId=\(escapedPath(deviceId))") }
        if let timezone { query.append("timezone=\(escapedPath(timezone))") }
        if !query.isEmpty { path += "?\(query.joined(separator: "&"))" }
        return try await request(path: path)
    }

    func deleteScreenTimeEvents(deviceId: String? = nil) async throws {
        var path = "/usage/screentime/events"
        if let deviceId, deviceId != "all" {
            path += "?deviceId=\(escapedPath(deviceId))"
        }
        let _: EmptyResponse = try await request(path: path, method: "DELETE")
    }
}

