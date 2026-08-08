import Foundation

enum PlanningSortMode: String, Codable, CaseIterable, Identifiable, Sendable {
    case manual
    case due
    case priority
    case createdNewest
    case createdOldest
    case modifiedNewest
    case modifiedOldest
    case title

    var id: String { rawValue }

    var title: String {
        switch self {
        case .manual: return "Manual"
        case .due: return "Due Date"
        case .priority: return "Priority"
        case .createdNewest: return "Created (Newest)"
        case .createdOldest: return "Created (Oldest)"
        case .modifiedNewest: return "Modified (Newest)"
        case .modifiedOldest: return "Modified (Oldest)"
        case .title: return "Title"
        }
    }
}
