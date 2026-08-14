import Foundation

private struct GrowthResetResponse: Decodable, Sendable {
    let id: String
}

extension APIClient {
    // MARK: - Growth

    func fetchGrowthOverview() async throws -> GrowthOverviewDTO {
        try await request(path: "/growth/overview")
    }

    func fetchGrowthProfile() async throws -> GrowthProfileDTO {
        try await request(path: "/growth/profile")
    }

    func fetchGrowthRewardPresetSettings() async throws -> [String: [String: GrowthRewardRuleDTO]] {
        try await request(path: "/growth/reward-presets/settings")
    }

    func fetchGrowthTaskRewardDefaults() async throws -> [GrowthTaskRewardDefaultDTO] {
        try await request(path: "/growth/task-reward-defaults")
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
        if let sourceType { query.append("sourceType=\(sourceType.rawValue)") }
        if let sourceId {
            let encodedSourceId = sourceId.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? sourceId
            query.append("sourceId=\(encodedSourceId)")
        }
        let path = query.isEmpty ? "/growth/earning-rules" : "/growth/earning-rules?\(query.joined(separator: "&"))"
        return try await request(path: path)
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
        try await request(path: "/growth/skills")
    }

    func fetchGrowthAttributes() async throws -> [GrowthSkillDTO] {
        try await request(path: "/growth/attributes")
    }

    func fetchGrowthAttributeMappings(skillID: String? = nil) async throws -> [GrowthAttributeMappingDTO] {
        var path = "/growth/attribute-mappings"
        if let skillID {
            let encoded = skillID.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? skillID
            path += "?skillId=\(encoded)"
        }
        return try await request(path: path)
    }

    func fetchGrowthRewards() async throws -> [GrowthRewardDTO] {
        try await request(path: "/growth/rewards")
    }

    func fetchGrowthInventory() async throws -> [GrowthInventoryDTO] {
        try await request(path: "/growth/inventory")
    }

    func fetchGrowthLedger() async throws -> [GrowthLedgerDTO] {
        let page: CursorPageResponse<GrowthLedgerDTO> = try await request(path: "/growth/ledger?limit=50")
        return page.data
    }

    func fetchStudyCalendar(days: Int) async throws -> [StudyCalendarDayDTO] {
        try await request(path: "/dashboard/study-calendar?days=\(max(1, min(days, 365)))")
    }

    func fetchGrowthStatistics(fromDate: String, toDate: String) async throws -> GrowthStatisticsDTO {
        let from = fromDate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? fromDate
        let to = toDate.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? toDate
        return try await request(path: "/growth/statistics?fromDate=\(from)&toDate=\(to)")
    }
}
