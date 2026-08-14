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

    static func dayOfWeek(from dateString: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: String(dateString.prefix(10))) else { return "Today" }
        let dayFormatter = DateFormatter()
        dayFormatter.dateFormat = "EEEE"
        return dayFormatter.string(from: date)
    }

    static func slashDate(from dateString: String) -> String {
        let prefix = String(dateString.prefix(10))
        let parts = prefix.split(separator: "-")
        guard parts.count == 3 else { return dateString }
        return "\(parts[2]) / \(parts[1]) / \(parts[0])"
    }

    static func brandDate(from dateString: String) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let date = formatter.date(from: String(dateString.prefix(10))) else { return dateString }
        let brandFormatter = DateFormatter()
        brandFormatter.dateFormat = "d MMM yyyy"
        return brandFormatter.string(from: date)
    }

    static func calculateStreak(dates: [String], targetDate: String = iTuCalendarSupport.dayString()) -> Int {
        let dateSet = Set(dates.map { String($0.prefix(10)) })
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        guard let baseDate = formatter.date(from: String(targetDate.prefix(10))) else { return 1 }

        let cal = Calendar.current
        var streak = 0
        var cur = baseDate

        let curStr = formatter.string(from: cur)
        if !dateSet.contains(curStr) {
            cur = cal.date(byAdding: .day, value: -1, to: cur) ?? cur
        }

        while dateSet.contains(formatter.string(from: cur)) {
            streak += 1
            guard let next = cal.date(byAdding: .day, value: -1, to: cur) else { break }
            cur = next
        }

        return max(1, streak)
    }
}

struct JournalAiInsightsModel: Equatable {
    struct Finding: Equatable, Identifiable {
        let id: String
        let title: String
        let body: String
        let confidence: String
        let evidence: [String]
    }

    let headline: String
    let summary: String
    let insights: [Finding]
    let attentionNext: [String]

    init?(json: JSONValue?) {
        guard let json, case let .object(fields) = json else { return nil }
        guard let headline = fields["headline"]?.stringValue,
              let summary = fields["summary"]?.stringValue else { return nil }
        self.headline = headline
        self.summary = summary

        var findings: [Finding] = []
        if let insightsVal = fields["insights"], case let .array(arr) = insightsVal {
            for (idx, item) in arr.enumerated() {
                if case let .object(itemFields) = item {
                    let title = itemFields["title"]?.stringValue ?? ""
                    let body = itemFields["body"]?.stringValue ?? ""
                    let confidence = itemFields["confidence"]?.stringValue ?? "medium"
                    var evidenceList: [String] = []
                    if let evVal = itemFields["evidence"], case let .array(evArr) = evVal {
                        for ev in evArr {
                            if case let .object(evFields) = ev, let label = evFields["label"]?.stringValue {
                                evidenceList.append(label)
                            } else if let str = ev.stringValue {
                                evidenceList.append(str)
                            }
                        }
                    }
                    findings.append(Finding(id: "\(title)-\(idx)", title: title, body: body, confidence: confidence, evidence: evidenceList))
                }
            }
        }
        self.insights = findings

        var next: [String] = []
        if let attentionVal = fields["attentionNext"], case let .array(arr) = attentionVal {
            for item in arr {
                if let str = item.stringValue {
                    next.append(str)
                }
            }
        }
        self.attentionNext = next
    }
}
