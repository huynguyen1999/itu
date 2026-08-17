import Foundation
import iTuDomain

public struct TaskPage: Sendable {
    public let data: [ProductivityTask]
    public let metadata: [TaskMetadataDTO]
    public let hasNextPage: Bool
    public let nextCursor: String?

    public init(
        data: [ProductivityTask],
        metadata: [TaskMetadataDTO],
        hasNextPage: Bool,
        nextCursor: String?
    ) {
        self.data = data
        self.metadata = metadata
        self.hasNextPage = hasNextPage
        self.nextCursor = nextCursor
    }
}

private struct TaskPageRecord: Decodable, Sendable {
    let task: ProductivityTask
    let metadata: TaskMetadataDTO

    private enum CodingKeys: String, CodingKey {
        case sectionId
        case tags
    }

    init(from decoder: Decoder) throws {
        task = try ProductivityTask(from: decoder)
        let values = try decoder.container(keyedBy: CodingKeys.self)
        let sectionId = try values.decodeIfPresent(String.self, forKey: .sectionId)
        metadata = TaskMetadataDTO(
            id: task.id,
            sectionId: task.sectionId ?? sectionId,
            tags: try values.decodeIfPresent([TaskTagAssignmentDTO].self, forKey: .tags) ?? []
        )
    }
}

public extension APIClient {
    func fetchTaskPage(cursor: String? = nil, limit: Int = 20) async throws -> TaskPage {
        var path = "/productivity/tasks?limit=\(limit)"
        if let cursor { path += "&cursor=\(cursor)" }
        let page: CursorPageResponse<TaskPageRecord> = try await request(
            path: path,
            method: "GET",
            body: Optional<String>.none
        )
        return TaskPage(
            data: page.data.map(\.task),
            metadata: page.data.map(\.metadata),
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

    func fetchTaskLists() async throws -> [TaskListModel] {
        try await request(path: "/productivity/task-lists")
    }

    func fetchTaskSections() async throws -> [TaskSectionModel] {
        try await request(path: "/productivity/task-sections")
    }

    func fetchTaskTags() async throws -> [TagModel] {
        try await request(path: "/productivity/task-tags")
    }
}
