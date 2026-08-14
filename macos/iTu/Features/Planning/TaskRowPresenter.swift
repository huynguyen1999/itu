import Foundation

enum TaskChipKind: String, Equatable, Sendable {
    case due
    case overdueDue
    case reminder
    case lowPriority
    case mediumPriority
    case highPriority
}

struct TaskChipPresentation: Equatable, Sendable, Identifiable {
    let id: String
    let title: String
    let systemImage: String
    let kind: TaskChipKind
}

enum TaskRewardPresentation: Equatable, Sendable, Identifiable {
    case accountXP(Int)
    case skillXP(amount: Int, awards: [GrowthEarningRuleSkillAwardDTO])
    case coins(Int)
    case item(GrowthEarningRuleItemDTO)

    var id: String {
        switch self {
        case let .accountXP(amount): "account-xp-\(amount)"
        case let .skillXP(amount, awards):
            "skill-xp-\(amount)-\(awards.map(\.skillId).joined(separator: ","))"
        case let .coins(amount): "coins-\(amount)"
        case let .item(award): "item-\(award.itemId)"
        }
    }
}

struct TaskRowPresentation: Equatable, Sendable, Identifiable {
    let id: String
    let title: String
    let status: TaskStatus
    let isCompleted: Bool
    let due: TaskChipPresentation?
    let reminder: TaskChipPresentation?
    let priority: TaskChipPresentation?
    let rewards: [TaskRewardPresentation]
    let description: String?

    var metadataCount: Int {
        [due, reminder, priority].compactMap { $0 }.count + rewards.count
    }
}

enum TaskRowPresenter {
    static func make(
        task: ProductivityTask,
        growthRule: GrowthEarningRuleDTO?,
        archivedSkillIDs: Set<String>,
        day: Date,
        hideDetails: Bool,
        calendar: Calendar = .current
    ) -> TaskRowPresentation {
        let due: TaskChipPresentation?
        if let dueAt = task.dueAt {
            let parsedDate = iTuDateSupport.parse(dueAt)
            let overdue = parsedDate.map { isOverdue($0, day: day, calendar: calendar) } == true
            let title: String
            if (task.status == .completed || task.status == .canceled), let parsedDate {
                title = parsedDate.formatted(iTuDateSupport.dueDay)
            } else {
                title = formattedDate(dueAt, parsedDate: parsedDate, day: day, calendar: calendar)
            }
            due = TaskChipPresentation(
                id: "due",
                title: title,
                systemImage: "calendar",
                kind: overdue ? .overdueDue : .due
            )
        } else {
            due = nil
        }

        let reminder: TaskChipPresentation?
        if let scheduledReminder = task.reminders?.first(where: { $0.status == "SCHEDULED" || $0.status == "SNOOZED" }),
           let reminderDate = iTuDateSupport.parse(scheduledReminder.remindAt) {
            reminder = TaskChipPresentation(
                id: "reminder",
                title: formattedDate(scheduledReminder.remindAt, parsedDate: reminderDate, day: day, calendar: calendar, includeOverdue: false),
                systemImage: "bell.fill",
                kind: .reminder
            )
        } else {
            reminder = nil
        }

        let priority: TaskChipPresentation?
        switch task.priority {
        case .none:
            priority = nil
        case .low:
            priority = TaskChipPresentation(id: "priority", title: "low", systemImage: "flag.fill", kind: .lowPriority)
        case .medium:
            priority = TaskChipPresentation(id: "priority", title: "medium", systemImage: "flag.fill", kind: .mediumPriority)
        case .high:
            priority = TaskChipPresentation(id: "priority", title: "high", systemImage: "flag.fill", kind: .highPriority)
        }

        let description = hideDetails ? nil : task.descriptionMarkdown.isEmpty ? nil : task.descriptionMarkdown
        let rewards = hideDetails ? [] : makeRewards(rule: growthRule, archivedSkillIDs: archivedSkillIDs)
        return TaskRowPresentation(
            id: task.id,
            title: task.title,
            status: task.status,
            isCompleted: task.status == .completed,
            due: hideDetails ? nil : due,
            reminder: hideDetails ? nil : reminder,
            priority: hideDetails ? nil : priority,
            rewards: rewards,
            description: description
        )
    }

    private static func makeRewards(
        rule: GrowthEarningRuleDTO?,
        archivedSkillIDs: Set<String>
    ) -> [TaskRewardPresentation] {
        guard let rule else { return [] }

        var rewards: [TaskRewardPresentation] = []
        if rule.accountXp > 0 {
            rewards.append(.accountXP(rule.accountXp))
        }

        let selected = GrowthRewardMath.selectedAwards(rule.skillAwards, archivedSkillIDs: archivedSkillIDs)
        let allocations = GrowthRewardMath.split(accountXp: rule.accountXp, awards: selected)
        let grouped = Dictionary(grouping: zip(selected, allocations).filter { $0.1 > 0 }, by: { $0.1 })
            .map { (amount: $0.key, awards: $0.value.map(\.0)) }
            .sorted { $0.amount > $1.amount }
        rewards.append(contentsOf: grouped.map { .skillXP(amount: $0.amount, awards: $0.awards) })

        if rule.coinReward > 0 {
            rewards.append(.coins(rule.coinReward))
        }
        rewards.append(contentsOf: rule.itemAwards.filter { $0.quantity > 0 }.map(TaskRewardPresentation.item))
        return rewards
    }

    private static func isOverdue(_ date: Date, day: Date, calendar: Calendar) -> Bool {
        date < day && !calendar.isDate(date, inSameDayAs: day)
    }

    private static func formattedDate(
        _ value: String,
        parsedDate: Date?,
        day: Date,
        calendar: Calendar,
        includeOverdue: Bool = true
    ) -> String {
        guard let date = parsedDate else { return value }
        if calendar.isDate(date, inSameDayAs: day) {
            return "Today"
        }
        if includeOverdue && isOverdue(date, day: day, calendar: calendar) {
            let days = calendar.dateComponents(
                [.day],
                from: calendar.startOfDay(for: date),
                to: calendar.startOfDay(for: day)
            ).day ?? 0
            return "\(days) Day\(days == 1 ? "" : "s") Overdue"
        }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}
