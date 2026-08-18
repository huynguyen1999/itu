import SwiftUI
import iTuDomain

public struct DestinationView: View {
    @EnvironmentObject private var model: AppModel
    public let destination: IOSDestination

    public init(destination: IOSDestination) {
        self.destination = destination
    }

    public var body: some View {
        destinationContent
            .navigationBarTitleDisplayMode(.inline)
    }

    @ViewBuilder
    private var destinationContent: some View {
        switch destination {
        case .home:          HomeView()
        case .plan:          PlanView()
        case .focus:         FocusView()
        case .calendar:      CalendarView()
        case .habits:        HabitsView()
        case .more:          MoreView()
        case .learn:         LearnView()
        case .gym:           GymView()
        case .budget:        BudgetView()
        case .growth:        GrowthView()
        case .journal:       JournalView()
        case .matrix:        Phase6MatrixView()
        case .statistics:    Phase6StatisticsView(model: model)
        case .health:        HealthDashboardView(model: model)
        case .notifications: Phase6NotificationsView(model: model)
        case .conflicts:     Phase6ConflictsView(model: model)
        case .trash:         Phase6TrashView(model: model)
        case .profile:       Phase6ProfileView(model: model)
        case .settings:      Phase6SettingsView(model: model)
        }
    }
}
