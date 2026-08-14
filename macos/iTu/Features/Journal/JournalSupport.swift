import SwiftUI

enum JournalDestination: String, Hashable, CaseIterable {
    case overview = "OVERVIEW"
    case dailyNotes = "DAILY_NOTES"
    case dailyReviews = "DAILY_REVIEWS"
    case weeklyReviews = "WEEKLY_REVIEWS"
    case notes = "NOTES"
    case templates = "TEMPLATES"

    var title: String {
        switch self {
        case .overview: return "Overview"
        case .dailyNotes: return "Daily Notes"
        case .dailyReviews: return "Daily Reviews"
        case .weeklyReviews: return "Weekly Reviews"
        case .notes: return "All Notes"
        case .templates: return "Templates"
        }
    }

    var icon: String {
        switch self {
        case .overview: return "square.grid.2x2"
        case .dailyNotes: return "calendar"
        case .dailyReviews: return "sun.max"
        case .weeklyReviews: return "sparkles"
        case .notes: return "doc.text"
        case .templates: return "square.stack"
        }
    }
}

enum JournalSupport {
    static func wordCount(for text: String) -> Int {
        let words = text.components(separatedBy: .whitespacesAndNewlines).filter { !$0.isEmpty }
        return words.count
    }

    static func characterCount(for text: String) -> Int {
        text.count
    }

    static func readingTimeMinutes(for text: String) -> Int {
        let words = wordCount(for: text)
        return max(1, Int(ceil(Double(words) / 200.0)))
    }
}
