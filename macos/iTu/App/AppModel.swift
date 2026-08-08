import Foundation
import Observation

enum AppSection: String, CaseIterable, Identifiable {
    case home
    case today
    case upcoming
    case inbox
    case completed
    case matrix
    case focus
    case habits
    case statistics
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
        case .habits: "Habits"
        case .statistics: "Statistics"
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
        case .habits: "repeat"
        case .statistics: "chart.bar"
        case .growth: "sparkles"
        case .learn: "book.closed"
        case .trash: "trash"
        case .conflicts: "exclamationmark.triangle"
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

@MainActor
@Observable
final class AppModel {
    /// App-level floating panel presented above the main window content.
    /// Replaces attached sheets and the separate task-editor window so every
    /// editor follows the same TickTick-style overlay presentation.
    var presentedOverlay: AppOverlay?

    var user: UserProfile?
    var tasks: [ProductivityTask] = []
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
    var isBootstrapping = true
    var isAuthenticating = false
    var errorMessage: String?
    let settingsStore = SettingsStore()
    let focusTimer = FocusTimer()
    let focusCycleEngine = FocusCycleEngine()
    let focusPolicyEnforcer = FocusPolicyEnforcer()

    var habits: [HabitModel] = []
    var habitTimeBlocks: [HabitTimeBlockModel] = []
    var habitStatsByID: [String: HabitStatsModel] = [:]
    var habitOccurrences: [HabitOccurrenceModel] = []
    /// O(1) lookup for the visible habit grid. Rebuilt with each offline snapshot.
    var habitOccurrencesByHabitAndDay: [String: HabitOccurrenceModel] = [:]
    var habitOccurrencesLoading = false
    var habitOccurrencesErrorMessage: String?
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
    var growthStatistics: GrowthStatisticsDTO?
    var statisticsLoading = false
    var statisticsError = false
    var growthReceiptQueue: [PresentedGrowthReceipt] = []
    var noticeQueue: [AppNotice] = []

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
        FocusCommandService.shared.register(timer: focusTimer, cycleEngine: focusCycleEngine, settingsStore: settingsStore)
        FocusURLRouter.shared.setHydrated(true, authenticated: cachedUser != nil)
        apiClient = APIClient()
        offlineStore = OfflineStore(accountID: cachedUser?.id ?? "anonymous")
        syncCoordinator = SyncCoordinator(apiClient: apiClient, offlineStore: offlineStore)
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
    @ObservationIgnored var cachedPlanningProjections: [String: [ProductivityTask]] = [:]
    @ObservationIgnored var cachedTaskProjectionDay: String?
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
    }

    func switchAccountIfNeeded(to profile: UserProfile) async throws {
        if user?.id != profile.id {
            invalidateSession()
            TaskUndoCoordinator.shared.clearHistory()
            offlineStore = OfflineStore(accountID: profile.id)
            syncCoordinator.attach(store: offlineStore)
            apply(try await offlineStore.load())
        }
        user = profile
        SessionCache.saveUser(profile)
    }

    func loadLocalState() async {
        do {
            apply(try await offlineStore.load())
        } catch {
            errorMessage = "Could not load offline data: \(error.localizedDescription)"
        }
    }

    func apply(_ snapshot: OfflineSnapshot) {
        AppPerformanceSignposts.recordModelApply()
        let tasksChanged = tasks != snapshot.tasks
        currentSnapshot = snapshot
        if tasksChanged {
            if !snapshot.tasks.isEmpty || tasks.isEmpty {
                tasks = snapshot.tasks
            }
            cachedTaskSections.removeAll(keepingCapacity: true)
            cachedHomeTodayTasks = nil
            cachedPlanningProjections.removeAll(keepingCapacity: true)
            cachedTaskProjectionDay = nil
        }
        conflicts = snapshot.conflicts
        habits = snapshot.habits
        habitOccurrences = snapshot.habitOccurrences
        habitOccurrencesByHabitAndDay = snapshot.habitOccurrences.reduce(into: [:]) { index, occurrence in
            index[Self.habitOccurrenceKey(habitId: occurrence.habitId, day: occurrence.localDayString)] = occurrence
        }
        cardsByDeckId = snapshot.cardsByDeckId
        taskLists = snapshot.taskLists
        sections = snapshot.sections
        tags = snapshot.tags
        tagIdsByTaskID = snapshot.tagIdsByTaskID
        decks = snapshot.decks
        userCoins = snapshot.userCoins
        growthLevel = snapshot.growthLevel
        growthCurrentXp = snapshot.growthCurrentXp
        growthNextLevelXp = snapshot.growthNextLevelXp
        growthProgressXp = snapshot.growthProgressXp
        growthRequiredXp = snapshot.growthRequiredXp
        attributes = snapshot.attributes.filter {
            $0.name.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() != "general"
        }
        skills = snapshot.skills.filter { $0.archivedAt == nil }
        transactions = snapshot.transactions
        shopItems = snapshot.shopItems
        inventoryItems = snapshot.inventoryItems
        growthProfile = snapshot.growthProfile
        growthRewardPresets = snapshot.growthRewardPresets
        growthTaskRewardDefaults = snapshot.growthTaskRewardDefaults
        growthEarningRules = snapshot.growthEarningRules
        growthAttributeMappings = snapshot.growthAttributeMappings
        let active = snapshot.focusSessions.first {
            $0.status == .active || $0.status == .paused
        }
        focusTimer.apply(active: active)
        updateFocusPolicy()
        focusTimer.history = snapshot.focusSessions.filter {
            $0.status == .completed || $0.status == .abandoned
        }
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
