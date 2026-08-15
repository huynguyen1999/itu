import SwiftUI

struct StatisticsOverviewSection: View {
    @Environment(AppModel.self) private var model
    let store: StatisticsStore
    let displaySettings: StatisticsDisplaySettings

    private var currentHabits: (completed: Int, scheduled: Int) {
        let days = store.currentHabits?.days ?? []
        return (days.filter { $0.status == .completed }.count, days.filter(\.scheduled).count)
    }
    private var comparisonHabits: (completed: Int, scheduled: Int) {
        let days = store.comparisonHabits?.days ?? []
        return (days.filter { $0.status == .completed }.count, days.filter(\.scheduled).count)
    }

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 160), spacing: 12)], spacing: 12) {
            let tasks = store.currentOverview.completedTasks
            let previousTasks = store.comparisonOverview.completedTasks
            let focus = store.currentOverview.focusMinutes
            let previousFocus = store.comparisonOverview.focusMinutes
            let habitRate = habitPercentage(currentHabits)
            let previousHabitRate = habitPercentage(comparisonHabits)
            let reviews = store.currentOverview.reviews
            let previousReviews = store.comparisonOverview.reviews
            let spentCents = Int(((store.currentBudget?.spent ?? 0) * 100).rounded())
            let previousSpentCents = Int(((store.comparisonBudget?.spent ?? 0) * 100).rounded())
            tile("Tasks completed", value: "\(tasks)", current: tasks, previous: previousTasks, icon: "checkmark.circle.fill", color: iTuTheme.mint, domain: .productivity)
            tile("Focus duration", value: minutes(focus), current: focus, previous: previousFocus, icon: "clock", color: iTuTheme.teal, domain: .productivity)
            tile("Habits", value: habitValue(currentHabits), current: habitRate, previous: previousHabitRate, icon: "checklist", color: iTuTheme.mint, domain: .habits, suffix: " pp")
            tile("Reviews", value: "\(reviews)", current: reviews, previous: previousReviews, icon: "book.closed", color: iTuTheme.amber, domain: .learning)
            tile("Workouts", value: number(store.currentGym?.totalWorkouts), current: store.currentGym?.totalWorkouts ?? 0, previous: store.comparisonGym?.totalWorkouts, icon: "figure.strengthtraining.traditional", color: iTuTheme.coral, domain: .gym)
            tile("Spent", value: money(store.currentBudget?.spent), current: spentCents, previous: previousSpentCents, icon: "creditcard", color: iTuTheme.teal, domain: .budget, suffix: " cents")
            tile("XP gained", value: number(model.growthStatistics?.totalXp), current: model.growthStatistics?.totalXp ?? 0, previous: model.growthStatisticsComparison?.totalXp, icon: "bolt.fill", color: iTuTheme.amber, domain: .growth)
            tile("App activity", value: duration(model.usageStatistics?.totalActiveSeconds), current: model.usageStatistics?.totalActiveSeconds ?? 0, previous: nil, icon: "rectangle.inset.filled", color: iTuTheme.teal, domain: .digital)
        }
    }

    @ViewBuilder
    private func tile(_ title: String, value: String, current: Int, previous: Int?, icon: String, color: Color, domain: StatisticsDomain, suffix: String = "") -> some View {
        if displaySettings.visibleDomains.contains(domain.rawValue) {
            let state = store.state(for: domain)
            StatSummaryTile(
                title: title,
                value: state == .loading ? "—" : state == .unavailable ? "Unavailable" : value,
                comparison: comparison(current: current, previous: previous, suffix: suffix),
                icon: icon,
                color: color
            )
        }
    }

    private func comparison(current: Int, previous: Int?, suffix: String) -> String? {
        guard displaySettings.showTrendComparison, let previous else { return nil }
        let delta = current - previous
        if suffix == " cents" { return "\(delta >= 0 ? "+" : "")\(String(format: "%.2f", Double(delta) / 100)) vs previous" }
        return "\(delta >= 0 ? "+" : "")\(delta)\(suffix) vs previous"
    }

    private func calendarValue(_ value: Int) -> String { "\(value)" }
    private func number(_ value: Int?) -> String { value.map(String.init) ?? "0" }
    private func money(_ value: Double?) -> String { value.map { String(format: "%.2f", $0) } ?? "0.00" }
    private func duration(_ seconds: Int?) -> String { seconds.map { "\($0 / 60)m" } ?? "0m" }
    private func minutes(_ value: Int) -> String { value == 0 ? "0m" : "\(value / 60)h \(value % 60)m" }
    private func habitValue(_ value: (completed: Int, scheduled: Int)) -> String { value.scheduled == 0 ? "—" : "\(Int((Double(value.completed) / Double(value.scheduled) * 100).rounded()))%" }
    private func habitPercentage(_ value: (completed: Int, scheduled: Int)) -> Int { value.scheduled == 0 ? 0 : Int((Double(value.completed) / Double(value.scheduled) * 100).rounded()) }
}
