import Foundation

struct APIError: LocalizedError, Sendable {
    let statusCode: Int
    let message: String
    let code: String?
    let retryAfter: TimeInterval?

    init(statusCode: Int, message: String, code: String? = nil, retryAfter: TimeInterval? = nil) {
        self.statusCode = statusCode
        self.message = message
        self.code = code
        self.retryAfter = retryAfter
    }

    var errorDescription: String? { message }
}

private struct APIErrorBody: Decodable {
    let message: String?
    let code: String?
}

private struct CursorPageMeta: Decodable {
    let hasNextPage: Bool
    let nextCursor: String?
}

private struct CursorPageResponse<Item: Decodable>: Decodable {
    let data: [Item]
    let meta: CursorPageMeta?
}

private struct DueCardResponse: Decodable {
    let card: CardModel
    let state: DueCardState
}

private struct DueCardState: Decodable {
    let direction: String
}

actor APIClient {
    private let session: URLSession
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var accessToken: String?
    private var refreshTask: Task<AuthSession, Error>?

    init(session: URLSession = .shared) {
        self.session = session
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        let tokens = SessionCache.loadTokens()
        accessToken = tokens.accessToken
    }

    func login(identifier: String, password: String) async throws -> AuthSession {
        let body: [String: JSONValue] = [
            "identifier": .string(identifier),
            "password": .string(password)
        ]
        let session: AuthSession = try await request(
            path: "/auth/login",
            method: "POST",
            body: body,
            authorize: false
        )
        accessToken = session.accessToken
        storeSession(session)
        return session
    }

    func register(identifier: String, password: String, displayName: String) async throws -> AuthSession {
        let identifierKey = identifier.contains("@") ? "email" : "username"
        var body: [String: JSONValue] = [
            identifierKey: .string(identifier),
            "password": .string(password)
        ]
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty {
            body["displayName"] = .string(trimmedName)
        }
        let session: AuthSession = try await request(
            path: "/auth/register",
            method: "POST",
            body: body,
            authorize: false
        )
        accessToken = session.accessToken
        storeSession(session)
        return session
    }

    func restoreSession() async throws -> AuthSession {
        if accessToken == nil {
            accessToken = SessionCache.loadTokens().accessToken
        }
        do {
            let session = try await refresh()
            return session
        } catch {
            if let apiError = error as? APIError, apiError.statusCode == 401 {
                accessToken = nil
                SessionCache.clearUser()
                throw error
            }
            if let user = SessionCache.loadUser() {
                return AuthSession(
                    user: user,
                    accessToken: accessToken ?? "",
                    refreshToken: SessionCache.loadTokens().refreshToken ?? ""
                )
            }
            throw error
        }
    }

    func logout() async {
        _ = try? await request(path: "/auth/logout", method: "POST", body: Optional<String>.none) as EmptyResponse
        accessToken = nil
        SessionCache.clearUser()
    }

    func updateProfile(displayName: String?, username: String?) async throws -> AuthSession {
        let session: AuthSession = try await request(
            path: "/auth/me",
            method: "PATCH",
            body: [
                "displayName": displayName.map(JSONValue.string) ?? .null,
                "username": username.map(JSONValue.string) ?? .null
            ] as [String: JSONValue]
        )
        accessToken = session.accessToken
        storeSession(session)
        return session
    }

    func changePassword(currentPassword: String, newPassword: String) async throws {
        _ = try await request(
            path: "/auth/password",
            method: "POST",
            body: [
                "currentPassword": .string(currentPassword),
                "newPassword": .string(newPassword)
            ] as [String: JSONValue]
        ) as EmptyResponse
    }

    func exportAccountData() async throws -> JSONValue {
        try await request(path: "/auth/data-export", method: "GET", body: Optional<String>.none)
    }

    func deleteAccount(password: String?) async throws {
        _ = try await request(
            path: "/auth/me",
            method: "DELETE",
            body: ["password": password.map(JSONValue.string) ?? .null] as [String: JSONValue]
        ) as EmptyResponse
        SessionCache.clearUser()
    }

    func push(_ requestBody: PushMutationsRequest) async throws -> PushMutationsResponse {
        try await request(path: "/sync/mutations", method: "POST", body: requestBody)
    }

    func registerSyncDevice(deviceId: String, cursor: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/devices/register",
            method: "POST",
            body: [
                "deviceId": .string(deviceId),
                // The server currently accepts WEB as the only platform. Keep
                // the wire contract stable until the additive MACOS enum lands.
                "platform": .string("WEB"),
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

    func pull(deviceId: String, cursor: String) async throws -> PullChangesResponse {
        var components = URLComponents()
        components.path = "/sync/changes"
        components.queryItems = [
            URLQueryItem(name: "deviceId", value: deviceId),
            URLQueryItem(name: "cursor", value: cursor)
        ]
        guard let path = components.string else {
            throw APIError(statusCode: 0, message: "Unable to construct sync URL", code: nil)
        }
        return try await request(path: path, method: "GET", body: Optional<String>.none)
    }

    func token() -> String? {
        accessToken
    }

    func fetchTasks() async throws -> [ProductivityTask] {
        var tasks: [ProductivityTask] = []
        var cursor: String?

        while true {
            var path = "/productivity/tasks?limit=100"
            if let cursor {
                path += "&cursor=\(cursor)"
            }
            let page: CursorPageResponse<ProductivityTask> = try await request(
                path: path,
                method: "GET",
                body: Optional<String>.none
            )
            tasks.append(contentsOf: page.data)

            guard page.meta?.hasNextPage == true,
                  let nextCursor = page.meta?.nextCursor,
                  nextCursor != cursor else {
                return tasks
            }
            cursor = nextCursor
        }
    }

    func fetchTaskLists() async throws -> [TaskListModel] {
        try await request(
            path: "/productivity/task-lists",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchTaskSections() async throws -> [TaskSectionModel] {
        try await request(
            path: "/productivity/task-sections",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchTaskTags() async throws -> [TagModel] {
        try await request(
            path: "/productivity/task-tags",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchTaskMetadata() async throws -> [TaskMetadataDTO] {
        try await request(
            path: "/productivity/tasks",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func activeFocus() async throws -> FocusSession? {
        try await request(
            path: "/productivity/focus-sessions/active",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func focusHistory() async throws -> [FocusSession] {
        try await request(
            path: "/productivity/focus-sessions/history",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func focusSummary() async throws -> FocusSummary {
        try await request(
            path: "/productivity/focus-sessions/summary",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchFocusSounds() async throws -> FocusSoundCatalog {
        try await request(
            path: "/productivity/focus-sounds",
            method: "GET",
            body: Optional<String>.none
        )
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

        let contentType = "multipart/form-data; boundary=\(boundary)"
        return try await requestRawBody(
            path: "/productivity/focus-sounds",
            method: "POST",
            contentType: contentType,
            bodyData: body
        )
    }

    func updateFocusSound(id: String, name: String) async throws -> FocusSound {
        let body: [String: JSONValue] = ["name": .string(name)]
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await request(
            path: "/productivity/focus-sounds/\(encodedId)",
            method: "PATCH",
            body: body
        )
    }

    func deleteFocusSound(id: String) async throws {
        let encodedId = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        let _: EmptyResponse = try await request(
            path: "/productivity/focus-sounds/\(encodedId)",
            method: "DELETE",
            body: Optional<String>.none
        )
    }

    private func requestRawBody<ResponseBody: Decodable>(
        path: String,
        method: String,
        contentType: String,
        bodyData: Data
    ) async throws -> ResponseBody {
        let baseURL = APIConfiguration.baseURL
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError(statusCode: 0, message: "The API URL is invalid", code: nil)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 60
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = bodyData
        if let accessToken {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        var (data, response) = try await session.data(for: req)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }

        if httpResponse.statusCode == 401 {
            _ = try await refresh()
            if let accessToken {
                req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            }
            (data, response) = try await session.data(for: req)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        if ResponseBody.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! ResponseBody
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }


    func downloadFocusSound(path: String) async throws -> Data {
        var request = try makeRequest(path: path, method: "GET", body: Optional<String>.none, authorize: true)
        var (data, response) = try await session.data(for: request)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }
        if httpResponse.statusCode == 401 {
            _ = try await refresh()
            request = try makeRequest(path: path, method: "GET", body: Optional<String>.none, authorize: true)
            (data, response) = try await session.data(for: request)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        return data
    }

    func fetchHabits() async throws -> [HabitModel] {
        try await request(
            path: "/productivity/habits",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchHabitTimeBlocks() async throws -> [HabitTimeBlockModel] {
        try await request(
            path: "/productivity/habit-time-blocks",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func createHabitTimeBlock(name: String) async throws -> HabitTimeBlockModel {
        try await request(
            path: "/productivity/habit-time-blocks",
            method: "POST",
            body: [
                "name": .string(name),
                "icon": .string("ListChecks"),
                "color": .string("SLATE"),
                "startLocal": .string("00:00"),
                "endLocal": .string("23:59")
            ] as [String: JSONValue]
        )
    }

    func fetchHabitOccurrences(from: String, to: String) async throws -> [HabitOccurrenceModel] {
        try await request(
            path: "/productivity/habit-occurrences?from=\(from)&to=\(to)",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchHabitStats(id: String) async throws -> HabitStatsModel {
        try await request(path: "/productivity/habits/\(id)/stats", method: "GET", body: Optional<String>.none)
    }

    func checkInHabitOccurrence(id: String, value: Double, idempotencyKey: String) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habit-occurrences/\(id)/check-in",
            method: "POST",
            body: [
                "value": .number(value),
                "idempotencyKey": .string(idempotencyKey)
            ] as [String: JSONValue]
        )
    }

    func habitOccurrenceAction(
        id: String,
        action: String,
        idempotencyKey: String = ULID.generate()
    ) async throws -> HabitOccurrenceModel {
        try await request(
            path: "/productivity/habit-occurrences/\(id)/\(action)",
            method: "POST",
            body: ["idempotencyKey": .string(idempotencyKey)] as [String: JSONValue]
        )
    }

    func checkInHabit(id: String) async throws -> HabitModel {
        try await request(
            path: "/productivity/habits/\(id)/check-in",
            method: "POST",
            body: Optional<String>.none
        )
    }

    func fetchGrowthOverview() async throws -> GrowthOverviewDTO {
        try await request(
            path: "/growth/overview",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchGrowthProfile() async throws -> GrowthProfileDTO {
        try await request(path: "/growth/profile", method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthRewardPresetSettings() async throws -> [String: [String: GrowthRewardRuleDTO]] {
        try await request(path: "/growth/reward-presets/settings", method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthTaskRewardDefaults() async throws -> [GrowthTaskRewardDefaultDTO] {
        try await request(path: "/growth/task-reward-defaults", method: "GET", body: Optional<String>.none)
    }

    func upsertGrowthTaskRewardDefault(
        taskListId: String?,
        coinReward: Int,
        accountXp: Int,
        enabled: Bool,
        skillAwards: [String: Int],
        itemAwards: [String: Int]
    ) async throws -> GrowthTaskRewardDefaultDTO {
        let body: [String: JSONValue] = [
            "taskListId": taskListId.map(JSONValue.string) ?? .null,
            "coinReward": .number(Double(max(0, coinReward))),
            "accountXp": .number(Double(max(0, accountXp))),
            "enabled": .bool(enabled),
            "skillAwards": .array(skillAwards.filter { $0.value >= 0 }.sorted { $0.key < $1.key }.map {
                .object(["skillId": .string($0.key), "xpReward": .number(Double($0.value))])
            }),
            "itemAwards": .array(itemAwards.filter { $0.value > 0 }.sorted { $0.key < $1.key }.map {
                .object(["itemId": .string($0.key), "quantity": .number(Double($0.value))])
            })
        ]
        return try await request(path: "/growth/task-reward-defaults", method: "POST", body: body)
    }

    func fetchGrowthEarningRules(sourceType: GrowthSourceType? = nil, sourceId: String? = nil) async throws -> [GrowthEarningRuleDTO] {
        var query: [String] = []
        if let sourceType {
            query.append("sourceType=\(sourceType.rawValue)")
        }
        if let sourceId {
            let encodedSourceId = sourceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sourceId
            query.append("sourceId=\(encodedSourceId)")
        }
        let path = query.isEmpty ? "/growth/earning-rules" : "/growth/earning-rules?\(query.joined(separator: "&"))"
        return try await request(path: path, method: "GET", body: Optional<String>.none)
    }

    func previewGrowthReset(scope: GrowthResetScope, skillId: String?) async throws -> GrowthResetPreviewDTO {
        var body: [String: JSONValue] = ["scope": .string(scope.rawValue)]
        if let skillId { body["skillId"] = .string(skillId) }
        return try await request(path: "/growth/reset/preview", method: "POST", body: body)
    }

    func executeGrowthReset(
        scope: GrowthResetScope,
        skillId: String?,
        idempotencyKey: String,
        keepEarningRules: Bool,
        keepShopRewards: Bool
    ) async throws {
        var body: [String: JSONValue] = [
            "scope": .string(scope.rawValue),
            "idempotencyKey": .string(idempotencyKey),
            "keepEarningRules": .bool(keepEarningRules),
            "keepShopRewards": .bool(keepShopRewards)
        ]
        if let skillId { body["skillId"] = .string(skillId) }
        let _: GrowthResetResponse = try await request(path: "/growth/reset", method: "POST", body: body)
    }

    func fetchGrowthSkills() async throws -> [GrowthSkillDTO] {
        try await request(path: "/growth/skills", method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthAttributes() async throws -> [GrowthSkillDTO] {
        try await request(path: "/growth/attributes", method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthAttributeMappings(skillID: String? = nil) async throws -> [GrowthAttributeMappingDTO] {
        var path = "/growth/attribute-mappings"
        if let skillID {
            let encoded = skillID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? skillID
            path += "?skillId=\(encoded)"
        }
        return try await request(path: path, method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthRewards() async throws -> [GrowthRewardDTO] {
        try await request(path: "/growth/rewards", method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthInventory() async throws -> [GrowthInventoryDTO] {
        try await request(path: "/growth/inventory", method: "GET", body: Optional<String>.none)
    }

    func fetchGrowthLedger() async throws -> [GrowthLedgerDTO] {
        let page: CursorPageResponse<GrowthLedgerDTO> = try await request(
            path: "/growth/ledger?limit=50",
            method: "GET",
            body: Optional<String>.none
        )
        return page.data
    }

    func fetchStudyCalendar(days: Int) async throws -> [StudyCalendarDayDTO] {
        try await request(
            path: "/dashboard/study-calendar?days=\(max(1, min(days, 365)))",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchGrowthStatistics(fromDate: String, toDate: String) async throws -> GrowthStatisticsDTO {
        let from = fromDate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? fromDate
        let to = toDate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? toDate
        return try await request(
            path: "/growth/statistics?fromDate=\(from)&toDate=\(to)",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchDecks() async throws -> [DeckModel] {
        let page: CursorPageResponse<DeckModel> = try await request(
            path: "/decks",
            method: "GET",
            body: Optional<String>.none
        )
        return page.data
    }

    func fetchCards(deckId: String) async throws -> [CardModel] {
        let page: CursorPageResponse<CardModel> = try await request(
            path: "/decks/\(deckId)/cards",
            method: "GET",
            body: Optional<String>.none
        )
        return page.data
    }

    func fetchDueCards(deckId: String) async throws -> [CardModel] {
        let items: [DueCardResponse] = try await request(
            path: "/study/due?deckId=\(deckId)",
            method: "GET",
            body: Optional<String>.none
        )
        return items.map { item in
            var card = item.card
            card.reviewDirection = item.state.direction
            return card
        }
    }

    func fetchTrash() async throws -> TrashSnapshotModel {
        try await request(path: "/trash", method: "GET", body: Optional<String>.none)
    }

    func restoreTrashTask(id: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/trash/tasks/\(id)/restore",
            method: "POST",
            body: Optional<String>.none
        )
    }

    func permanentlyDeleteTrashTask(id: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/trash/tasks/\(id)",
            method: "DELETE",
            body: Optional<String>.none
        )
    }

    func permanentlyDeleteTrashDeck(id: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/trash/decks/\(id)",
            method: "DELETE",
            body: Optional<String>.none
        )
    }

    func permanentlyDeleteTrashCard(id: String) async throws {
        let _: EmptyResponse = try await request(
            path: "/trash/cards/\(id)",
            method: "DELETE",
            body: Optional<String>.none
        )
    }

    func fetchStudySessionHistory() async throws -> [StudySessionHistoryItem] {
        let page: CursorPageResponse<StudySessionHistoryItem> = try await request(
            path: "/study/sessions?limit=50",
            method: "GET",
            body: Optional<String>.none
        )
        return page.data
    }

    func fetchStudySessionDetails(sessionId: String) async throws -> StudySessionDetails {
        try await request(
            path: "/study/sessions/\(sessionId)",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func fetchNotifications() async throws -> [AppNotificationModel] {
        try await request(
            path: "/productivity/notifications",
            method: "GET",
            body: Optional<String>.none
        )
    }

    func markNotificationRead(id: String) async throws {
        let _: AppNotificationModel = try await request(
            path: "/productivity/notifications/\(id)/read",
            method: "PATCH",
            body: Optional<String>.none
        )
    }

    func markAllNotificationsRead() async throws {
        let _: EmptyResponse = try await request(
            path: "/productivity/notifications/read-all",
            method: "POST",
            body: Optional<String>.none
        )
    }

    func createTaskReminder(taskId: String, remindAt: String, persistent: Bool = false) async throws -> TaskReminderModel {
        try await request(
            path: "/productivity/tasks/\(taskId)/reminders",
            method: "POST",
            body: [
                "remindAt": .string(remindAt),
                "persistent": .bool(persistent)
            ] as [String: JSONValue]
        )
    }

    func snoozeTaskReminder(id: String, remindAt: String) async throws {
        let _: TaskReminderModel = try await request(
            path: "/productivity/task-reminders/\(id)/snooze",
            method: "POST",
            body: ["remindAt": .string(remindAt)] as [String: JSONValue]
        )
    }

    func dismissTaskReminder(id: String) async throws {
        let _: TaskReminderModel = try await request(
            path: "/productivity/task-reminders/\(id)/dismiss",
            method: "POST",
            body: Optional<String>.none
        )
    }

    func startStudySession(deckId: String, mode: String = "DUE") async throws -> String {
        let sessionId = ULID.generate()
        let _: EmptyResponse = try await request(
            path: "/study/sessions",
            method: "POST",
            body: [
                "id": .string(sessionId),
                "deckId": .string(deckId),
                "mode": .string(mode)
            ] as [String: JSONValue]
        )
        return sessionId
    }

    func submitReview(
        sessionId: String,
        cardId: String,
        grade: String,
        idempotencyKey: String = ULID.generate()
    ) async throws {
        let _: EmptyResponse = try await request(
            path: "/study/sessions/\(sessionId)/reviews",
            method: "POST",
            body: [
                "cardId": .string(cardId),
                "direction": .string("FRONT_TO_BACK"),
                "grade": .string(grade),
                "idempotencyKey": .string(idempotencyKey)
            ] as [String: JSONValue]
        )
    }

    func completeStudySession(sessionId: String, rating: Int) async throws {
        let _: EmptyResponse = try await request(
            path: "/study/sessions/\(sessionId)/complete",
            method: "POST",
            body: ["rating": .number(Double(max(1, min(10, rating))))] as [String: JSONValue]
        )
    }

    private func refresh() async throws -> AuthSession {
        if let refreshTask {
            return try await refreshTask.value
        }
        let storedRefresh = SessionCache.loadTokens().refreshToken
        let body: [String: JSONValue]? = storedRefresh != nil ? ["refreshToken": .string(storedRefresh!)] : nil
        let task = Task<AuthSession, Error> {
            try await request(
                path: "/auth/refresh",
                method: "POST",
                body: body,
                authorize: false,
                retryAfterUnauthorized: false
            )
        }
        refreshTask = task
        defer { refreshTask = nil }
        let refreshed: AuthSession
        do {
            refreshed = try await task.value
        } catch {
            if let apiError = error as? APIError, apiError.statusCode == 401 {
                accessToken = nil
                SessionCache.clearUser()
            }
            throw error
        }
        accessToken = refreshed.accessToken
        storeSession(refreshed)
        return refreshed
    }

    private func storeSession(_ session: AuthSession) {
        SessionCache.saveTokens(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken
        )
    }

    private func request<RequestBody: Encodable, ResponseBody: Decodable>(
        path: String,
        method: String,
        body: RequestBody?,
        authorize: Bool = true,
        retryAfterUnauthorized: Bool = true
    ) async throws -> ResponseBody {
        var request = try makeRequest(path: path, method: method, body: body, authorize: authorize)
        var (data, response) = try await session.data(for: request)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }

        if httpResponse.statusCode == 401, authorize, retryAfterUnauthorized {
            _ = try await refresh()
            request = try makeRequest(path: path, method: method, body: body, authorize: true)
            (data, response) = try await session.data(for: request)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        if ResponseBody.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! ResponseBody
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }

    private func makeRequest<Body: Encodable>(
        path: String,
        method: String,
        body: Body?,
        authorize: Bool
    ) throws -> URLRequest {
        let baseURL = APIConfiguration.baseURL
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError(statusCode: 0, message: "The API URL is invalid", code: nil)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorize, let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    private static func retryAfter(from response: HTTPURLResponse) -> TimeInterval? {
        guard let raw = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
        if let seconds = TimeInterval(raw) { return max(0, seconds) }
        guard let date = HTTPDateFormatter.date(from: raw) else { return nil }
        return max(0, date.timeIntervalSinceNow)
    }
}

private enum HTTPDateFormatter {
    static func date(from value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value)
    }
}

private struct GrowthResetResponse: Decodable, Sendable {
    let id: String
}

struct EmptyResponse: Codable, Sendable {}

enum APIConfiguration {
    private static let baseURLKey = "apiBaseURL"
    private static let fallbackURL = URL(string: "http://localhost:3000")!

    static var baseURL: URL {
        guard
            let value = UserDefaults.standard.string(forKey: baseURLKey),
            let url = URL(string: value)
        else {
            return fallbackURL
        }
        return url
    }

    static func saveBaseURL(_ value: String) throws {
        guard let url = URL(string: value), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
            throw APIError(statusCode: 0, message: "Enter a valid HTTP or HTTPS API URL", code: nil)
        }
        UserDefaults.standard.set(url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: baseURLKey)
    }
}
