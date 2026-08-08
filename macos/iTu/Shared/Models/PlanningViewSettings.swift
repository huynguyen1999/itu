import Foundation

enum PlanningViewKey: String, Codable, CaseIterable, Sendable {
    case all
    case today
    case inbox
    case upcoming
}

enum PlanningGroupMode: String, Codable, CaseIterable, Sendable {
    case time
    case project
    case tag
    case status
    case priority
    case created
    case section
    case none
}

enum PlanningDisplayMode: String, Codable, CaseIterable, Sendable {
    case list
    // future: kanban
}

struct PlanningViewSettings: Codable, Equatable, Sendable {
    var sortMode: PlanningSortMode
    var groupMode: PlanningGroupMode
    var displayMode: PlanningDisplayMode
    var hideCompleted: Bool
    var hideDetails: Bool
    var collapsedGroups: Set<String>

    init(
        sortMode: PlanningSortMode = .manual,
        groupMode: PlanningGroupMode = .none,
        displayMode: PlanningDisplayMode = .list,
        hideCompleted: Bool = false,
        hideDetails: Bool = false,
        collapsedGroups: Set<String> = []
    ) {
        self.sortMode = sortMode
        self.groupMode = groupMode
        self.displayMode = displayMode
        self.hideCompleted = hideCompleted
        self.hideDetails = hideDetails
        self.collapsedGroups = collapsedGroups
    }

    static func defaultSettings(for key: PlanningViewKey) -> PlanningViewSettings {
        switch key {
        case .all:
            return PlanningViewSettings(sortMode: .priority, groupMode: .project)
        case .today:
            return PlanningViewSettings(sortMode: .manual, groupMode: .time)
        case .inbox:
            return PlanningViewSettings(sortMode: .createdNewest, groupMode: .none)
        case .upcoming:
            return PlanningViewSettings(sortMode: .due, groupMode: .time)
        }
    }
}
