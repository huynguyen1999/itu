import Foundation
import Observation

enum StatisticsDomainState: Equatable {
    case idle
    case loading
    case ready
    case unavailable
}

struct StatisticsOverviewSnapshot: Equatable {
    let completedTasks: Int
    let focusMinutes: Int
    let reviews: Int
    let cardsCreated: Int

    init(days: [StudyCalendarDayDTO] = []) {
        completedTasks = days.reduce(0) { $0 + $1.completedTasks }
        focusMinutes = days.reduce(0) { $0 + $1.focusedMinutes }
        reviews = days.reduce(0) { $0 + $1.reviews }
        cardsCreated = days.reduce(0) { $0 + $1.cardsCreated }
    }
}

@MainActor
@Observable
final class StatisticsStore {
    var period = StatisticsPeriod.preset("30 Days")
    var currentHabits: HabitCalendarResponse?
    var comparisonHabits: HabitCalendarResponse?
    var currentGym: GymAnalyticsModel?
    var comparisonGym: GymAnalyticsModel?
    var currentBudget: BudgetStatisticsModel?
    var comparisonBudget: BudgetStatisticsModel?
    var currentOverview = StatisticsOverviewSnapshot()
    var comparisonOverview = StatisticsOverviewSnapshot()
    var domainStates: [String: StatisticsDomainState] = [:]
    var isRefreshing = false

    func state(for domain: StatisticsDomain) -> StatisticsDomainState {
        domainStates[domain.rawValue] ?? .idle
    }

    func refresh(using model: AppModel, period: StatisticsPeriod, force: Bool) {
        self.period = period
        isRefreshing = true
        for domain in StatisticsDomain.allCases { domainStates[domain.rawValue] = .loading }

        Task { @MainActor [weak self, weak model] in
            guard let self, let model else { return }
            await model.refreshCoordinator.run(.statisticsOverview, force: force) {
                async let core: Void = model.refreshStatistics(period: period)
                async let usage: Void = model.refreshUsage(from: period.usageFrom, to: period.usageTo)
                async let habits = try? await model.apiClient.fetchHabitCalendar(from: period.from, to: period.to)
                async let comparisonHabits = try? await model.apiClient.fetchHabitCalendar(from: period.comparisonFrom, to: period.comparisonTo)
                async let gym = try? await model.apiClient.getGymAnalytics(from: period.from, to: period.to)
                async let comparisonGym = try? await model.apiClient.getGymAnalytics(from: period.comparisonFrom, to: period.comparisonTo)
                async let budget = try? await model.apiClient.getBudgetStatistics(from: period.from, to: period.to)
                async let comparisonBudget = try? await model.apiClient.getBudgetStatistics(from: period.comparisonFrom, to: period.comparisonTo)

                _ = await (core, usage)
                self.currentHabits = await habits
                self.comparisonHabits = await comparisonHabits
                self.currentGym = await gym
                self.comparisonGym = await comparisonGym
                self.currentBudget = await budget
                self.comparisonBudget = await comparisonBudget
                self.currentOverview = StatisticsOverviewSnapshot(days: model.statisticsCalendar)
                self.comparisonOverview = StatisticsOverviewSnapshot(days: model.statisticsComparisonCalendar)

                self.domainStates[StatisticsDomain.productivity.rawValue] = model.statisticsCalendarError ? .unavailable : .ready
                self.domainStates[StatisticsDomain.learning.rawValue] = model.statisticsCalendarError ? .unavailable : .ready
                self.domainStates[StatisticsDomain.growth.rawValue] = model.growthStatisticsError ? .unavailable : .ready
                self.domainStates[StatisticsDomain.digital.rawValue] = model.usageStatistics == nil && model.usageError != nil ? .unavailable : .ready
                self.domainStates[StatisticsDomain.habits.rawValue] = self.currentHabits == nil ? .unavailable : .ready
                self.domainStates[StatisticsDomain.gym.rawValue] = self.currentGym == nil ? .unavailable : .ready
                self.domainStates[StatisticsDomain.budget.rawValue] = self.currentBudget == nil ? .unavailable : .ready
            }
            self.isRefreshing = false
        }
    }
}
