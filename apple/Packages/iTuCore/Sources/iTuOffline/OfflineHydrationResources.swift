import Foundation
import iTuDomain

public struct OfflineHydrationResources: Sendable {
    public let tasks: [ProductivityTask]?
    public let lists: [TaskListModel]?
    public let sections: [TaskSectionModel]?
    public let tags: [TagModel]?
    public let metadata: [TaskMetadataDTO]?
    public let habits: [HabitModel]?
    public let growth: GrowthOverviewDTO?
    public let skills: [GrowthSkillDTO]?
    public let attributes: [GrowthSkillDTO]?
    public let rewards: [GrowthRewardDTO]?
    public let inventory: [GrowthInventoryDTO]?
    public let ledger: [GrowthLedgerDTO]?
    public let decks: [DeckModel]?
    public let cards: [String: [CardModel]?]
    public let profile: GrowthProfileDTO?
    public let presets: [String: [String: GrowthRewardRuleDTO]]?
    public let taskRules: [GrowthEarningRuleDTO]?
    public let habitRules: [GrowthEarningRuleDTO]?
    public let rewardDefaults: [GrowthTaskRewardDefaultDTO]?
    public let mappings: [GrowthAttributeMappingDTO]?
    public var expenseCategories: [ExpenseCategoryModel]?
    public var monthlyBudgets: [MonthlyBudgetModel]?
    public var expenses: [ExpenseModel]?
    public var recurringExpenses: [RecurringExpenseModel]?
    public var gymExercises: [ExerciseModel]?
    public var gymRoutines: [RoutineModel]?
    public var gymWorkouts: [WorkoutModel]?
    public var journalNotes: [JournalNoteModel]?
    public var journalTags: [JournalTagModel]?
    public var journalTemplates: [JournalTemplateModel]?
    public var habitPreferences: HabitPreferencesModel?

    public init(
        tasks: [ProductivityTask]? = nil,
        lists: [TaskListModel]? = nil,
        sections: [TaskSectionModel]? = nil,
        tags: [TagModel]? = nil,
        metadata: [TaskMetadataDTO]? = nil,
        habits: [HabitModel]? = nil,
        growth: GrowthOverviewDTO? = nil,
        skills: [GrowthSkillDTO]? = nil,
        attributes: [GrowthSkillDTO]? = nil,
        rewards: [GrowthRewardDTO]? = nil,
        inventory: [GrowthInventoryDTO]? = nil,
        ledger: [GrowthLedgerDTO]? = nil,
        decks: [DeckModel]? = nil,
        cards: [String: [CardModel]?] = [:],
        profile: GrowthProfileDTO? = nil,
        presets: [String: [String: GrowthRewardRuleDTO]]? = nil,
        taskRules: [GrowthEarningRuleDTO]? = nil,
        habitRules: [GrowthEarningRuleDTO]? = nil,
        rewardDefaults: [GrowthTaskRewardDefaultDTO]? = nil,
        mappings: [GrowthAttributeMappingDTO]? = nil
    ) {
        self.tasks = tasks
        self.lists = lists
        self.sections = sections
        self.tags = tags
        self.metadata = metadata
        self.habits = habits
        self.growth = growth
        self.skills = skills
        self.attributes = attributes
        self.rewards = rewards
        self.inventory = inventory
        self.ledger = ledger
        self.decks = decks
        self.cards = cards
        self.profile = profile
        self.presets = presets
        self.taskRules = taskRules
        self.habitRules = habitRules
        self.rewardDefaults = rewardDefaults
        self.mappings = mappings
        self.expenseCategories = nil
        self.monthlyBudgets = nil
        self.expenses = nil
        self.recurringExpenses = nil
        self.gymExercises = nil
        self.gymRoutines = nil
        self.gymWorkouts = nil
        self.journalNotes = nil
        self.journalTags = nil
        self.journalTemplates = nil
        self.habitPreferences = nil
    }
}
