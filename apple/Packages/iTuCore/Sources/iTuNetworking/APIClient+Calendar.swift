import Foundation
import iTuDomain

public extension APIClient {
    func fetchCalendarTimeline(from: Date, to: Date) async throws -> [CalendarTimelineItem] {
        let formatter = ISO8601DateFormatter()
        let fromValue = formatter.string(from: from).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? formatter.string(from: from)
        let toValue = formatter.string(from: to).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? formatter.string(from: to)
        let response: CalendarTimelineResponse = try await request(path: "/calendar/timeline?from=\(fromValue)&to=\(toValue)")
        return response.items
    }

    func fetchCalendarSources() async throws -> [ExternalCalendarModel] {
        try await request(path: "/calendar/sources")
    }

    func createIcsCalendar(url: String, name: String) async throws -> ExternalCalendarModel {
        struct CreateIcsPayload: Encodable {
            let url: String
            let name: String
        }
        return try await request(
            path: "/calendar/sources/ics",
            method: "POST",
            body: CreateIcsPayload(url: url, name: name)
        )
    }

    func refreshCalendarSource(id: String) async throws {
        _ = try await request(
            path: "/calendar/sources/\(id)/refresh",
            method: "POST",
            body: Optional<String>.none
        ) as EmptyResponse
    }

    func updateCalendarSource(id: String, visible: Bool?, color: String? = nil) async throws {
        struct UpdateSourcePayload: Encodable {
            let visible: Bool?
            let color: String?
        }
        _ = try await request(
            path: "/calendar/sources/\(id)",
            method: "PATCH",
            body: UpdateSourcePayload(visible: visible, color: color)
        ) as EmptyResponse
    }

    func deleteCalendarSource(id: String) async throws {
        _ = try await request(
            path: "/calendar/sources/\(id)",
            method: "DELETE",
            body: Optional<String>.none
        ) as EmptyResponse
    }
}
