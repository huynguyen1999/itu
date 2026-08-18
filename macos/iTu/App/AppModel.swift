import Foundation
import Observation
import iTuDomain
import iTuOffline
import iTuNetworking

enum AuthenticationState: Equatable, Sendable {
    case restoring
    case authenticated
    case unauthenticated
}

enum AppSection: String, CaseIterable, Identifiable {
    case home
    case today
    case upcoming
    case inbox
    case completed
    case matrix
    case focus
    case calendar
    case habits
    case statistics
    case journal
    case budget
    case gym
    case growth
    case learn
    case trash
    case conflicts
    case notifications
    case profile
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home: "Home"
        case .today: "Today"
        case .upcoming: "Next 7 Days"
        case .inbox: "Inbox"
        case .completed: "Completed"
        case .matrix: "Matrix"
        case .focus: "Focus"
        case .calendar: "Calendar"
        case .habits: "Habits"
        case .statistics: "Statistics"
        case .journal: "Journal"
        case .budget: "Budget"
        case .gym: "Gym"
        case .growth: "Growth"
        case .learn: "Learn"
        case .trash: "Trash"
        case .conflicts: "Conflicts"
        case .notifications: "Notifications"
        case .profile: "Profile"
        case .settings: "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .home: "house"
        case .today: "sun.max"
        case .upcoming: "calendar"
        case .inbox: "tray"
        case .completed: "checkmark.circle"
        case .matrix: "square.grid.2x2"
        case .focus: "timer"
        case .calendar: "calendar"
        case .habits: "repeat"
        case .statistics: "chart.bar"
        case .journal: "book.closed"
        case .budget: "creditcard"
        case .gym: "dumbbell"
        case .growth: "sparkles"
        case .learn: "graduationcap"
        case .trash: "trash"
        case .conflicts: "arrow.triangle.2.circlepath"
        case .notifications: "bell"
        case .profile: "person.crop.circle"
        case .settings: "gearshape"
        }
    }
}

enum PlanningViewMode: String, CaseIterable, Identifiable {
    case list
    case matrix

    var id: String { rawValue }
    var title: String {
        switch self {
        case .list: "List View"
        case .matrix: "Eisenhower Matrix"
        }
    }
}

enum TaskSortOption: String, CaseIterable, Identifiable {
    case manual = "manual"
    case priority = "priority"
    case dueDate = "dueDate"
    case title = "title"

    var id: String { rawValue }
    var title: String {
        switch self {
        case .manual: "Manual order"
        case .priority: "Priority"
        case .dueDate: "Due date"
        case .title: "Title"
        }
    }
}

enum MatrixSortOption: String, CaseIterable, Identifiable, Codable {
    case manual
    case dueDate
    case priority
    case title

    var id: String { rawValue }
    var title: String {
        switch self {
        case .manual: "Manual order"
        case .dueDate: "Due date"
        case .priority: "Priority"
        case .title: "Title"
        }
    }
}

enum TaskGroupOption: String, CaseIterable, Identifiable {
    case list
    case status
    case priority
    case dueDate
    case none

    var id: String { rawValue }
    var title: String {
        switch self {
        case .list: "List"
        case .status: "Status"
        case .priority: "Priority"
        case .dueDate: "Due Date"
        case .none: "None"
        }
    }
}

/// Content presented as a floating panel above the main window, instead of an
/// attached sheet or a separate window.
enum AppOverlay: Equatable, Identifiable {
    case taskEditor(taskID: String)
    case focusSettings
    case focusSoundManagement
    case focusSessionEditor(FocusSession)
    case habitCreate
    case habitEdit(HabitModel)
    case habitDetail(HabitModel)
    case habitGroups

    var id: String {
        switch self {
        case .taskEditor(let taskID): "task-editor-\(taskID)"
        case .focusSettings: "focus-settings"
        case .focusSoundManagement: "focus-sound-management"
        case .focusSessionEditor(let session): "focus-session-editor-\(session.id)"
        case .habitCreate: "habit-create"
        case .habitEdit(let habit): "habit-edit-\(habit.id)"
        case .habitDetail(let habit): "habit-detail-\(habit.id)"
        case .habitGroups: "habit-groups"
        }
    }
}

enum UndoRegistration: Sendable {
    case register
    case suppress
}

enum RefreshDomain: Hashable {
    case tasks
    case focus
    case calendar(String)
    case statistics
    case statisticsOverview(String)
    case usage
    case budget
    case gym
    case journal
    case notifications
    case trash

    var rawValue: String {
        switch self {
        case .tasks: "tasks"
        case .focus: "focus"
        case .calendar(let range): "calendar:\(range)"
        case .statistics: "statistics"
        case .statisticsOverview(let range): "statistics-overview:\(range)"
        case .usage: "usage"
        case .budget: "budget"
        case .gym: "gym"
        case .journal: "journal"
        case .notifications: "notifications"
        case .trash: "trash"
        }
    }
}

@MainActor
final class FeatureRefreshCoordinator {
    private var lastSuccessfulRefresh: [RefreshDomain: Date] = [:]
    private var inFlight: [RefreshDomain: Task<Void, Never>] = [:]

    func run(
        _ domain: RefreshDomain,
        force: Bool = false,
        operation: @escaping @MainActor () async -> Void
    ) async {
        if !force,
           let lastRefresh = lastSuccessfulRefresh[domain],
           Date().timeIntervalSince(lastRefresh) < 5 * 60 {
            return
        }
        if let task = inFlight[domain] {
            await task.value
            return
        }

        AppPerformanceSignposts.emitRefreshStarted(sectionName: domain.rawValue)
        let task = Task { @MainActor [weak self] in
            await operation()
            self?.lastSuccessfulRefresh[domain] = Date()
            AppPerformanceSignposts.emitRefreshCompleted(sectionName: domain.rawValue)
        }
        inFlight[domain] = task
        await task.value
        inFlight[domain] = nil
    }
}

@MainActor
@Observable
final class AppModel {
    /// App-level floating panel presented above the main window content.
    /// Replaces attached sheets and the separate task-editor window so every
    /// editor follows the same TickTick-style overlay presentation.
    var presentedOverlay: AppOverlay?

    var user: UserProfile?
    var tasks: [ProductivityTask] = []
    var taskPaginationConfigured = false
    var taskPageCursor: String?
    var hasMoreTaskPages = false
    var isLoadingMoreTasks = false
    var conflicts: [SyncConflict] = []
    var syncPhase: SyncPhase = .offline
    var selectedSection: AppSection = .home
    var selectedTaskListId: String?
    var planningViewMode: PlanningViewMode = .list
    var sortOption: TaskSortOption = .priority
    var groupOption: TaskGroupOption = .list
    var hideCompletedTasks: Bool = false
    var hideRowDetails: Bool = false
    var activeFocusTask: ProductivityTask?
    var authenticationState: AuthenticationState = .restoring
    var isAuthenticating = false
    var errorMessage: String?
    let settingsStore = SettingsStore()
    let focusTimer = FocusTimer()
    let focusCycleEngine = FocusCycleEngine()
    let focusPolicyEnforcer = FocusPolicyEnforcer()

    var habits: [HabitModel] = []
    var habitPreferences = HabitPreferencesModel()
    var habitTimeBlocks: [HabitTimeBlockModel] = []
    var habitStatsByID: [String: HabitStatsModel] = [:]
    var habitOccurrences: [HabitOccurrenceModel] = []
    /// O(1) lookup for the visible habit grid. Rebuilt with each offline snapshot.
    var habitOccurrencesByHabitAndDay: [String: HabitOccurrenceModel] = [:]
    /// Server-projected calendar states include unsaved pending/missed days.
    var habitCalendarByHabitAndDay: [String: HabitDayStateModel] = [:]
    var habitOccurrencesLoading = false
    var habitOccurrencesErrorMessage: String?
    var pendingHabitQuickLog: HabitQuickLogRequest?
    var userCoins: Int = 0
    var growthLevel: Int?
    var growthCurrentXp: Int?
    var growthNextLevelXp: Int?
    var growthProgressXp: Int?
    var growthRequiredXp: Int?
    var attributes: [UserAttribute] = []
    var skills: [SkillNode] = []
    var shopItems: [ShopItem] = []
    var inventoryItems: [InventoryItem] = []
    var transactions: [LedgerTransaction] = []
    var decks: [DeckModel] = []
    var cardsByDeckId: [String: [CardModel]] = [:]
    var studySessionHistory: [StudySessionHistoryItem] = []
    var studySessionDetails: [String: StudySessionDetails] = [:]
    var notifications: [AppNotificationModel] = []
    var trashSnapshot: TrashSnapshotModel?
    var trashIsLoading = false
    var trashErrorMessage: String?
    var growthProfile: GrowthProfileDTO?
    var growthRewardPresets: [String: [String: GrowthRewardRuleDTO]] = [:]
    var growthTaskRewardDefaults: [String: GrowthTaskRewardDefaultDTO] = [:]
    var growthEarningRules: [String: GrowthEarningRuleDTO] = [:]
    var growthAttributeMappings: [String: [GrowthAttributeMappingDTO]] = [:]
    var growthResetPreview: GrowthResetPreviewDTO?
    var growthResetLoading = false
    var growthResetError: String?
    var statisticsCalendar: [StudyCalendarDayDTO] = []
    var statisticsComparisonCalendar: [StudyCalendarDayDTO] = []
    var growthStatistics: GrowthStatisticsDTO?
    var growthStatisticsComparison: GrowthStatisticsDTO?
    var statisticsComparisonAvailable = false
    var statisticsLoading = false
    var statisticsError = false
    var statisticsCalendarError = false
    var growthStatisticsError = false
    var statisticsErrorMessage: String?
    var growthReceiptQueue: [PresentedGrowthReceipt] = []
    var noticeQueue: [AppNotice] = []
    var budgetSummary: BudgetSummaryModel?
    var expenseCategories: [ExpenseCategoryModel] = []
    var expenses: [ExpenseModel] = []
    var recurringExpenses: [RecurringExpenseModel] = []
    var gymOverview: GymOverviewModel?
    var gymRoutines: [RoutineModel] = []
    var gymExercises: [ExerciseModel] = []
    var gymWorkouts: [WorkoutModel] = []
    var monthlyBudgets: [MonthlyBudgetModel] = []
    var budgetReport: BudgetReportModel?
    var gymExerciseStats: [String: ExerciseStatsModel] = [:]
    var budgetPreferences = BudgetPreferencesModel()
    var gymPreferences = GymPreferencesModel()
    var journalNotes: [JournalNoteModel] = []
    var journalTags: [JournalTagModel] = []
    var journalTemplates: [JournalTemplateModel] = []
    var journalRevisionsByEntryID: [String: [JournalEntryRevisionModel]] = [:]
    var journalPreferences = JournalPreferencesModel()
    var calendarPreferences = CalendarPreferencesModel()
    var usageStatistics: UsageStatistics?
    var websiteUsageStatistics: WebsiteUsageStatistics?
    var localUsageSummaries: [UsageSummary] = []
    var localWebsiteUsageSummaries: [WebsiteUsageSummary] = []
    var usageIsLocalOnly = false
    var usageLoading = false
    var usageError: String?
    var websiteUsageError: String?
    var screenTimeStatus = ScreenTimeImportStatus()
    @ObservationIgnored var usageServerStatistics: UsageStatistics?
    @ObservationIgnored var websiteUsageTracker: WebsiteUsageTracker?
    @ObservationIgnored var biomeCoordinator: BiomeImportCoordinator?
    @ObservationIgnored var screenTimeSyncTimer: Timer?
    @ObservationIgnored var usageUploadTask: Task<Void, Never>?
    @ObservationIgnored var usageUploadInFlight: Task<Bool, Never>?
    @ObservationIgnored var usageUploadGeneration = 0
    @ObservationIgnored var usageCheckpointTimer: Timer?
    @ObservationIgnored let refreshCoordinator = FeatureRefreshCoordinator()

    func enqueueNotice(_ notice: AppNotice) {
        noticeQueue.append(notice)
    }

    func dismissCurrentNotice() {
        if !noticeQueue.isEmpty {
            noticeQueue.removeFirst()
        }
    }

    enum NotificationRoutePath {
        static let home = "/"
        static let plan = "/plan"
        static let today = "/plan/today"
        static let inbox = "/inbox"
        static let upcoming = "/upcoming"
        static let matrix = "/matrix"
        static let focus = "/focus"
        static let habits = "/habits"
        static let statistics = "/statistics"
        static let growth = "/growth"
        static let learn = "/learn"
        static let trash = "/trash"
        static let profile = "/profile"
        static let settings = "/settings"
    }

    var taskLists: [TaskListModel] = []
    var sections: [TaskSectionModel] = []
    var tags: [TagModel] = []
    var tagIdsByTaskID: [String: [String]] = [:]

    @ObservationIgnored let apiClient: APIClient
    @ObservationIgnored let syncCoordinator: SyncCoordinator
    @ObservationIgnored var offlineStore: OfflineStore

    init() {
        let cachedUser = SessionCache.loadUser()
        user = cachedUser
        authenticationState = cachedUser == nil ? .restoring : .authenticated
        FocusCommandService.shared.register(timer: focusTimer, cycleEngine: focusCycleEngine, settingsStore: settingsStore)
        FocusURLRouter.shared.setHydrated(true, authenticated: cachedUser != nil)
        apiClient = APIClient()
        offlineStore = OfflineStore(accountID: cachedUser?.id ?? "anonymous", location: Self.offlineStoreLocation)
        syncCoordinator = SyncCoordinator(apiClient: apiClient, offlineStore: offlineStore)
        setupUsageTracking()
        settingsStore.onFocusSettingsChanged = { [weak self] settings in
            self?.applyFocusSettings(settings)
        }
        applyFocusSettings(settingsStore.focusSettings)
    }

    /// Single entry point for applying focus settings, regardless of which UI
    /// mutated them. Reconfigures the timer and re-enforces the live policy.
    func applyFocusSettings(_ settings: FocusSettings) {
        focusCycleEngine.configure(cyclesBeforeLongBreak: settings.cyclesBeforeLongBreak)
        focusTimer.configure(settings: settings)
        updateFocusPolicy(settings: settings)
    }

    var pendingCount: Int {
        currentSnapshot.mutations.count
    }

    var pendingMutations: [SyncMutation] {
        currentSnapshot.mutations
    }

    @ObservationIgnored var currentSnapshot = OfflineSnapshot()
    @ObservationIgnored var hydrationTask: Task<Void, Never>?
    @ObservationIgnored var lastHydratedAt: Date?
    @ObservationIgnored var focusRefreshTask: Task<Void, Never>?
    @ObservationIgnored var focusLastRefreshAt: Date?
    @ObservationIgnored var habitOccurrenceRefreshTasks: [String: Task<Void, Never>] = [:]
    @ObservationIgnored var habitOccurrenceRefreshDates: [String: Date] = [:]
    @ObservationIgnored var habitOccurrenceLoadingKeys: Set<String> = []
    @ObservationIgnored var cachedTaskSections: [AppSection: [ProductivityTask]] = [:]
    @ObservationIgnored var cachedHomeTodayTasks: [ProductivityTask]?
    @ObservationIgnored var cachedPlanningRenderProjections: [PlanningRenderProjectionKey: PlanningRenderProjection] = [:]
    @ObservationIgnored var cachedMatrixRenderProjections: [MatrixProjectionKey: MatrixProjection] = [:]
    @ObservationIgnored var archivedSkillIDs: Set<String> = []
    @ObservationIgnored var cachedTaskProjectionDay: String?
    @ObservationIgnored var cachedMatrixProjectionMinute: Int?
    @ObservationIgnored private(set) var sessionGeneration = 0

    /// Invalidates in-flight account work before changing the authenticated
    /// session. Keeping the mutation here avoids exposing the generation
    /// counter to extensions that only need to cancel stale projections.
    func invalidateSession() {
        sessionGeneration &+= 1
        hydrationTask?.cancel()
        hydrationTask = nil
        lastHydratedAt = nil
        focusRefreshTask?.cancel()
        focusRefreshTask = nil
        focusLastRefreshAt = nil
        focusTimer.isLoading = false
        habitOccurrenceRefreshTasks.values.forEach { $0.cancel() }
        habitOccurrenceRefreshTasks.removeAll()
        habitOccurrenceRefreshDates.removeAll()
        habitOccurrenceLoadingKeys.removeAll()
        habitOccurrencesLoading = false
        taskPageCursor = nil
        hasMoreTaskPages = false
        taskPaginationConfigured = false
        isLoadingMoreTasks = false
        cachedMatrixRenderProjections.removeAll(keepingCapacity: true)
        cachedMatrixProjectionMinute = nil
    }

    func switchAccountIfNeeded(to profile: UserProfile) async throws {
        let accountChanged = user?.id != profile.id
        if accountChanged {
            stopUsageTracking()
            invalidateSession()
            TaskUndoCoordinator.shared.clearHistory()
            let store = OfflineStore(accountID: profile.id, location: Self.offlineStoreLocation)
            offlineStore = store
            syncCoordinator.attach(store: store)
            let switchGeneration = sessionGeneration
            let snapshot: OfflineSnapshot
            do {
                snapshot = try await store.load()
            } catch {
                guard switchGeneration == sessionGeneration else { return }
                throw error
            }
            guard switchGeneration == sessionGeneration else { return }
            apply(snapshot)
            guard switchGeneration == sessionGeneration else { return }
        }
        user = profile
        SessionCache.saveUser(profile)
        if accountChanged { setupUsageTracking() }
    }

    func loadLocalState() async {
        let runGeneration = sessionGeneration
        let accountID = user?.id
        let store = offlineStore
        do {
            let snapshot = try await store.load()
            guard !Task.isCancelled,
                  runGeneration == sessionGeneration,
                  offlineStore === store,
                  user?.id == accountID else { return }
            apply(snapshot)
        } catch {
            guard !Task.isCancelled,
                  runGeneration == sessionGeneration,
                  offlineStore === store,
                  user?.id == accountID else { return }
            errorMessage = "Could not load offline data: \(error.localizedDescription)"
        }
    }

    func apply(_ snapshot: OfflineSnapshot) {
        AppPerformanceSignposts.recordModelApply()
        let tasksChanged = tasks != snapshot.tasks
        currentSnapshot = snapshot
        applyTaskProjection(snapshot, tasksChanged: tasksChanged)
        applyHabitProjection(snapshot)
        applyLearningProjection(snapshot)
        applyGrowthProjection(snapshot)
        applyBudgetGymProjection(snapshot)
        applyJournalProjection(snapshot)
        applyUsageProjection(snapshot)
        applyFocusProjection(snapshot)
    }

    private func applyTaskProjection(_ snapshot: OfflineSnapshot, tasksChanged: Bool) {
        if tasksChanged {
            tasks = snapshot.tasks
            cachedTaskSections.removeAll(keepingCapacity: true)
            cachedHomeTodayTasks = nil
            cachedPlanningRenderProjections.removeAll(keepingCapacity: true)
            cachedMatrixRenderProjections.removeAll(keepingCapacity: true)
            cachedTaskProjectionDay = nil
            cachedMatrixProjectionMinute = nil
        }
        if conflicts != snapshot.conflicts { conflicts = snapshot.conflicts }
        if taskLists != snapshot.taskLists { taskLists = snapshot.taskLists; cachedPlanningRenderProjections.removeAll(keepingCapacity: true) }
        if sections != snapshot.sections { sections = snapshot.sections; cachedPlanningRenderProjections.removeAll(keepingCapacity: true) }
        if tags != snapshot.tags { tags = snapshot.tags; cachedPlanningRenderProjections.removeAll(keepingCapacity: true) }
        if tagIdsByTaskID != snapshot.tagIdsByTaskID { tagIdsByTaskID = snapshot.tagIdsByTaskID; cachedPlanningRenderProjections.removeAll(keepingCapacity: true) }
    }

    private func applyHabitProjection(_ snapshot: OfflineSnapshot) {
        if habits != snapshot.habits { habits = snapshot.habits }
        if habitPreferences != snapshot.habitPreferences { habitPreferences = snapshot.habitPreferences }
        if habitOccurrences != snapshot.habitOccurrences {
            habitOccurrences = snapshot.habitOccurrences
            habitOccurrencesByHabitAndDay = snapshot.habitOccurrences.reduce(into: [:]) { index, occurrence in
                index[Self.habitOccurrenceKey(habitId: occurrence.habitId, day: occurrence.localDayString)] = occurrence
            }
        }
    }

    private func applyLearningProjection(_ snapshot: OfflineSnapshot) {
        if cardsByDeckId != snapshot.cardsByDeckId { cardsByDeckId = snapshot.cardsByDeckId }
        if decks != snapshot.decks { decks = snapshot.decks }
    }

    private func applyGrowthProjection(_ snapshot: OfflineSnapshot) {
        if userCoins != snapshot.userCoins { userCoins = snapshot.userCoins }
        if growthLevel != snapshot.growthLevel { growthLevel = snapshot.growthLevel }
        if growthCurrentXp != snapshot.growthCurrentXp { growthCurrentXp = snapshot.growthCurrentXp }
        if growthNextLevelXp != snapshot.growthNextLevelXp { growthNextLevelXp = snapshot.growthNextLevelXp }
        if growthProgressXp != snapshot.growthProgressXp { growthProgressXp = snapshot.growthProgressXp }
        if growthRequiredXp != snapshot.growthRequiredXp { growthRequiredXp = snapshot.growthRequiredXp }
        let attributes = snapshot.attributes.filter {
            $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
        }
        let skills = snapshot.skills.filter { $0.archivedAt == nil }
        let archivedSkillIDs = Set(snapshot.skills.filter { $0.archivedAt != nil }.map(\.id))
        if self.attributes != attributes { self.attributes = attributes }
        if self.skills != skills { self.skills = skills; cachedPlanningRenderProjections.removeAll(keepingCapacity: true) }
        if self.archivedSkillIDs != archivedSkillIDs { self.archivedSkillIDs = archivedSkillIDs; cachedPlanningRenderProjections.removeAll(keepingCapacity: true) }
        if transactions != snapshot.transactions { transactions = snapshot.transactions }
        if shopItems != snapshot.shopItems { shopItems = snapshot.shopItems }
        if inventoryItems != snapshot.inventoryItems { inventoryItems = snapshot.inventoryItems }
        if growthProfile != snapshot.growthProfile { growthProfile = snapshot.growthProfile }
        if growthRewardPresets != snapshot.growthRewardPresets { growthRewardPresets = snapshot.growthRewardPresets }
        if growthTaskRewardDefaults != snapshot.growthTaskRewardDefaults { growthTaskRewardDefaults = snapshot.growthTaskRewardDefaults }
        if growthEarningRules != snapshot.growthEarningRules {
            growthEarningRules = snapshot.growthEarningRules
            cachedPlanningRenderProjections.removeAll(keepingCapacity: true)
        }
        if growthAttributeMappings != snapshot.growthAttributeMappings { growthAttributeMappings = snapshot.growthAttributeMappings }
    }

    private func applyBudgetGymProjection(_ snapshot: OfflineSnapshot) {
        let expenseCategories = snapshot.expenseCategories.filter { $0.archivedAt == nil }
        let expenses = snapshot.expenses.filter { $0.deletedAt == nil }
        let gymExercises = snapshot.gymExercises.filter { $0.deletedAt == nil }
        let gymRoutines = snapshot.gymRoutines.filter { $0.deletedAt == nil && $0.archivedAt == nil }
        let gymWorkouts = snapshot.gymWorkouts.filter { $0.deletedAt == nil }
        if self.expenseCategories != expenseCategories { self.expenseCategories = expenseCategories }
        if monthlyBudgets != snapshot.monthlyBudgets { monthlyBudgets = snapshot.monthlyBudgets }
        if self.expenses != expenses { self.expenses = expenses }
        if recurringExpenses != snapshot.recurringExpenses { recurringExpenses = snapshot.recurringExpenses }
        if self.gymExercises != gymExercises { self.gymExercises = gymExercises }
        if self.gymRoutines != gymRoutines { self.gymRoutines = gymRoutines }
        if self.gymWorkouts != gymWorkouts { self.gymWorkouts = gymWorkouts }
        if budgetPreferences != snapshot.budgetPreferences { budgetPreferences = snapshot.budgetPreferences }
        if gymPreferences != snapshot.gymPreferences { gymPreferences = snapshot.gymPreferences }
        rebuildBudgetSummary(period: budgetSummary?.period ?? iTuCalendarSupport.monthString())
    }

    private func applyJournalProjection(_ snapshot: OfflineSnapshot) {
        let journalNotes = snapshot.journalNotes.filter { $0.deletedAt == nil }
        let journalTemplates = snapshot.journalTemplates.filter { $0.archivedAt == nil }
        if self.journalNotes != journalNotes { self.journalNotes = journalNotes }
        if journalTags != snapshot.journalTags { journalTags = snapshot.journalTags }
        if self.journalTemplates != journalTemplates { self.journalTemplates = journalTemplates }
        if journalRevisionsByEntryID != snapshot.journalRevisionsByEntryID { journalRevisionsByEntryID = snapshot.journalRevisionsByEntryID }
        if journalPreferences != snapshot.journalPreferences { journalPreferences = snapshot.journalPreferences }
        if calendarPreferences != snapshot.calendarPreferences { calendarPreferences = snapshot.calendarPreferences }
        let preferences = snapshot.journalPreferences
        let editorMode = preferences.defaultEditorMode.uppercased() == "EDIT" ? "SOURCE" : preferences.defaultEditorMode
        if settingsStore.journalDefaultEditorMode != editorMode { settingsStore.journalDefaultEditorMode = editorMode }
        if settingsStore.journalAutoCreateDailyNote != preferences.autoCreateDailyNote { settingsStore.journalAutoCreateDailyNote = preferences.autoCreateDailyNote }
        if settingsStore.journalAutoOpenTodayNote != preferences.autoOpenTodayNote { settingsStore.journalAutoOpenTodayNote = preferences.autoOpenTodayNote }
        if settingsStore.journalWeekStartDay != preferences.weekStartDay { settingsStore.journalWeekStartDay = preferences.weekStartDay }
        if settingsStore.journalAutoCreateWeeklyReview != preferences.autoCreateWeeklyReview { settingsStore.journalAutoCreateWeeklyReview = preferences.autoCreateWeeklyReview }
    }

    private func applyUsageProjection(_ snapshot: OfflineSnapshot) {
        if localUsageSummaries != snapshot.usageSummaries { localUsageSummaries = snapshot.usageSummaries }
        if localWebsiteUsageSummaries != snapshot.websiteUsageSummaries { localWebsiteUsageSummaries = snapshot.websiteUsageSummaries }
    }

    private func applyFocusProjection(_ snapshot: OfflineSnapshot) {
        let active = snapshot.focusSessions.first {
            $0.status == .active || $0.status == .paused
        }
        if focusTimer.activeSession != active { focusTimer.apply(active: active) }
        updateFocusPolicy()
        let history = snapshot.focusSessions.filter {
            $0.status == .completed || $0.status == .abandoned
        }
        if focusTimer.history != history { focusTimer.history = history }
    }

    func localDateString(offset: Int) -> String {
        let date = Calendar.current.date(byAdding: .day, value: offset, to: Date()) ?? Date()
        return date.formatted(iTuDateSupport.day)
    }

    func startSyncLoop() {
        syncCoordinator.start { [weak self] in
            await self?.synchronize()
        }
    }

    func updateFocusPolicy(settings: FocusSettings? = nil) {
        focusPolicyEnforcer.update(
            session: focusTimer.activeSession,
            settings: settings ?? settingsStore.focusSettings
        )
    }
}

private extension AppModel {
    static var offlineStoreLocation: OfflineStoreLocation {
        OfflineStoreLocation(
            rootURL: FileManager.default
                .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
                .appendingPathComponent("iTu", isDirectory: true)
        )
    }
}
