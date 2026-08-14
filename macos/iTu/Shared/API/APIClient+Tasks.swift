import Foundation

struct TaskPage: Sendable {
    let data: [ProductivityTask]
    let hasNextPage: Bool
    let nextCursor: String?
}

extension APIClient {
    // MARK: - Tasks and calendar

    func fetchTaskPage(cursor: String? = nil, limit: Int = 20) async throws -> TaskPage {
        var path = "/productivity/tasks?limit=\(limit)"
        if let cursor { path += "&cursor=\(cursor)" }
        let page: CursorPageResponse<ProductivityTask> = try await request(
            path: path,
            method: "GET",
            body: Optional<String>.none
        )
        return TaskPage(
            data: page.data,
            hasNextPage: page.meta?.hasNextPage == true,
            nextCursor: page.meta?.nextCursor
        )
    }

    func fetchTasks() async throws -> [ProductivityTask] {
        var tasks: [ProductivityTask] = []
        var cursor: String?

        while true {
            let page = try await fetchTaskPage(cursor: cursor)
            tasks.append(contentsOf: page.data)

            guard page.hasNextPage,
                  let nextCursor = page.nextCursor,
                  nextCursor != cursor else {
                return tasks
            }
            cursor = nextCursor
        }
    }

    func fetchCalendarTimeline(from: Date, to: Date) async throws -> [CalendarTimelineItem] {
        let formatter = ISO8601DateFormatter()
        let fromValue = formatter.string(from: from).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? formatter.string(from: from)
        let toValue = formatter.string(from: to).addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? formatter.string(from: to)
        let response: CalendarTimelineResponse = try await request(path: "/calendar/timeline?from=\(fromValue)&to=\(toValue)")
        return response.items
    }

    func fetchTaskLists() async throws -> [TaskListModel] {
        try await request(path: "/productivity/task-lists")
    }

    func fetchTaskSections() async throws -> [TaskSectionModel] {
        try await request(path: "/productivity/task-sections")
    }

    func fetchTaskTags() async throws -> [TagModel] {
        try await request(path: "/productivity/task-tags")
    }

    func fetchTaskMetadata() async throws -> [TaskMetadataDTO] {
        try await request(path: "/productivity/tasks")
    }

    // MARK: - Calendar Sources

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

