import SwiftUI

struct StatisticsDomainMetric: Identifiable {
    let id: String
    let label: String
    let value: String
    let comparison: String?
}

struct StatisticsDomainSummarySection: View {
    @Environment(AppModel.self) private var model
    let store: StatisticsStore
    let displaySettings: StatisticsDisplaySettings

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 220), spacing: 14)], spacing: 14) {
            if isVisible(.productivity) {
                card(.productivity, title: "Productivity", description: "Tasks and focus", destination: .today, icon: "checkmark.circle", metrics: [
                    metric("Tasks", store.currentOverview.completedTasks, previous: store.comparisonOverview.completedTasks),
                    metric("Focus", minutes(store.currentOverview.focusMinutes), comparison: delta(store.currentOverview.focusMinutes, store.comparisonOverview.focusMinutes))
                ])
            }
            if isVisible(.habits) {
                card(.habits, title: "Habits", description: "Scheduled consistency", destination: .habits, icon: "checklist", metrics: [
                    metric("Completed", habitCompleted, previous: comparisonHabitCompleted),
                    metric("Scheduled", habitScheduled)
                ])
            }
            if isVisible(.learning) {
                card(.learning, title: "Learning", description: "Reviews and cards", destination: .learn, icon: "book.closed", metrics: [
                    metric("Reviews", store.currentOverview.reviews, previous: store.comparisonOverview.reviews),
                    metric("Created", store.currentOverview.cardsCreated, previous: store.comparisonOverview.cardsCreated)
                ])
            }
            if isVisible(.gym) {
                card(.gym, title: "Gym", description: "Training volume", destination: .gym, icon: "figure.strengthtraining.traditional", metrics: [
                    metric("Workouts", store.currentGym?.totalWorkouts ?? 0, previous: store.comparisonGym?.totalWorkouts),
                    metric("Minutes", store.currentGym?.totalTrainingMinutes ?? 0, previous: store.comparisonGym?.totalTrainingMinutes)
                ])
            }
            if isVisible(.budget) {
                card(.budget, title: "Budget", description: "Spending in range", destination: .budget, icon: "creditcard", metrics: [
                    metric("Spent", money(store.currentBudget?.spent), comparison: moneyDelta(store.currentBudget?.spent, store.comparisonBudget?.spent)),
                    metric("Expenses", store.currentBudget?.expenseCount ?? 0, previous: store.comparisonBudget?.expenseCount)
                ])
            }
            if isVisible(.growth) {
                card(.growth, title: "Growth", description: "Experience and skills", destination: .growth, icon: "bolt.fill", metrics: [
                    metric("XP", model.growthStatistics?.totalXp ?? 0, previous: model.growthStatisticsComparison?.totalXp),
                    metric("Attributes", model.growthStatistics?.attributes.count ?? 0)
                ])
            }
            if isVisible(.digital) {
                card(.digital, title: "Digital activity", description: "App and website usage", destination: .settings, icon: "rectangle.inset.filled", metrics: [
                    metric("App active", duration(model.usageStatistics?.totalActiveSeconds)),
                    metric("Websites", model.websiteUsageStatistics?.topHostnames.count ?? 0)
                ])
            }
        }
    }

    private func isVisible(_ domain: StatisticsDomain) -> Bool {
        displaySettings.visibleDomains.contains(domain.rawValue)
    }

    private func metric(_ label: String, _ value: Int, previous: Int? = nil) -> StatisticsDomainMetric {
        StatisticsDomainMetric(id: label, label: label, value: String(value), comparison: delta(value, previous))
    }

    private func metric(_ label: String, _ value: String, comparison: String? = nil) -> StatisticsDomainMetric {
        StatisticsDomainMetric(id: label, label: label, value: value, comparison: comparison)
    }

    private var habitCompleted: Int {
        store.currentHabits?.days.filter { $0.status == .completed }.count ?? 0
    }

    private var habitScheduled: Int {
        store.currentHabits?.days.filter(\.scheduled).count ?? 0
    }

    private var comparisonHabitCompleted: Int? {
        store.comparisonHabits?.days.filter { $0.status == .completed }.count
    }

    private func card(
        _ domain: StatisticsDomain,
        title: String,
        description: String,
        destination: AppSection,
        icon: String,
        metrics: [StatisticsDomainMetric]
    ) -> some View {
        Button {
            model.selectedSection = destination
        } label: {
            VStack(alignment: .leading, spacing: 12) {
                HStack(spacing: 8) {
                    Image(systemName: icon)
                        .foregroundStyle(iTuTheme.teal)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(title).font(.system(size: 14, weight: .semibold))
                        Text(description).font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                let state = store.state(for: domain)
                if state == .unavailable {
                    Text("Unavailable")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.coral)
                } else if state == .idle || state == .loading {
                    Text("—")
                        .font(.system(size: 16, weight: .semibold, design: .rounded))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    HStack(spacing: 20) {
                        ForEach(metrics) { item in
                            VStack(alignment: .leading, spacing: 3) {
                                Text(item.label).font(.system(size: 10)).foregroundStyle(iTuTheme.inkDim)
                                Text(item.value).font(.system(size: 16, weight: .semibold, design: .rounded))
                                if let comparison = item.comparison {
                                    Text(comparison).font(.system(size: 9, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
                                }
                            }
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .iTuPanel(radius: 14)
        .accessibilityLabel("\(title), view details")
    }

    private func minutes(_ value: Int) -> String {
        value >= 60 ? "\(value / 60)h \(value % 60)m" : "\(value)m"
    }

    private func money(_ value: Double?) -> String {
        value.map { String(format: "%.2f", $0) } ?? "0.00"
    }

    private func duration(_ seconds: Int?) -> String {
        guard let seconds else { return "0m" }
        return seconds >= 3600 ? "\(seconds / 3600)h \(seconds / 60 % 60)m" : "\(seconds / 60)m"
    }

    private func delta(_ current: Int, _ previous: Int?) -> String? {
        guard let previous else { return nil }
        let value = current - previous
        return "\(value >= 0 ? "+" : "")\(value) vs previous"
    }

    private func moneyDelta(_ current: Double?, _ previous: Double?) -> String? {
        guard let current, let previous else { return nil }
        let value = current - previous
        return "\(value >= 0 ? "+" : "")\(String(format: "%.2f", value)) vs previous"
    }
}
