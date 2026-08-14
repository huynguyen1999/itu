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
