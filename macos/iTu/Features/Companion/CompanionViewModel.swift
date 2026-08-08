import Foundation
import SwiftUI
import Observation

struct CompanionCommandItem {
    let keyword: String
    let title: String
    let icon: String
    let action: @MainActor () -> Void
}

@MainActor
@Observable
final class CompanionViewModel {
    let model: AppModel
    let router: AppNavigationRouter
    let dismissCompanion: () -> Void

    var searchText: String = "" {
        didSet {
            selectedIndex = 0
        }
    }

    var selectedIndex: Int = 0
    var isQuickCapturing: Bool = false
    var quickCaptureText: String = ""
    
    var items: [CompanionListItem] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        if query.isEmpty {
            return buildDefaultItems()
        } else {
            return buildSearchResults(query: query)
        }
    }

    init(model: AppModel, router: AppNavigationRouter, dismissCompanion: @escaping () -> Void) {
        self.model = model
        self.router = router
        self.dismissCompanion = dismissCompanion
    }

    func refreshItems() {
        // Automatically updated via computed property `items`
    }

    func startFocus(for task: ProductivityTask) async {
        await model.prepareFocus(for: task)
        if model.focusTimer.activeSession == nil {
            await model.startFocus()
        }
    }

    private func buildDefaultItems() -> [CompanionListItem] {
        var list: [CompanionListItem] = []

        // 1. NEXT SECTION
        if let task = nextTask {
            list.append(CompanionListItem(
                id: "next-task-\(task.id)",
                section: .next,
                title: task.title,
                subtitle: task.priority != .none ? "Priority: \(task.priority.rawValue.capitalized)" : nil,
                icon: task.priority == .high ? "exclamationmark.circle.fill" : "circle",
                action: { [weak self] in
                    Task {
                        await self?.startFocus(for: task)
                    }
                }
            ))
        } else {
            list.append(CompanionListItem(
                id: "next-empty",
                section: .next,
                title: "All caught up!",
                subtitle: "No high priority tasks scheduled for today.",
                icon: "checkmark.circle",
                action: {}
            ))
        }

        // 2. HABITS SECTION
        let activeHabits = model.habits.filter { $0.archivedAt == nil }
        if activeHabits.isEmpty {
            list.append(CompanionListItem(
                id: "habits-empty",
                section: .habits,
                title: "No active habits",
                subtitle: "Create habits in the main window to build routine",
                icon: "repeat",
                action: {}
            ))
        } else {
            for habit in activeHabits {
                list.append(CompanionListItem(
                    id: "habit-\(habit.id)",
                    section: .habits,
                    title: habit.name,
                    subtitle: habit.isCompletedToday ? "Completed today" : "Check in",
                    icon: habit.isCompletedToday ? "checkmark.circle.fill" : "circle",
                    action: { [weak self] in
                        Task {
                            await self?.model.toggleHabitCheckIn(habit)
                        }
                    }
                ))
            }
        }

        // 3. FOCUS SECTION (always present)
        if let activeSession = model.focusTimer.activeSession {
            let title = activeSession.customTitle ?? activeSession.taskTitleSnapshot ?? "Focus Session"
            let durationStr = formatDuration(activeSession)

            list.append(CompanionListItem(
                id: "focus-header",
                section: .focus,
                title: title,
                subtitle: durationStr,
                icon: "timer",
                action: {}
            ))

            if activeSession.status == .active {
                list.append(CompanionListItem(
                    id: "focus-pause",
                    section: .focus,
                    title: "Pause",
                    subtitle: nil,
                    icon: "pause.fill",
                    action: { [weak self] in
                        Task {
                            await self?.model.performFocusAction("pause")
                        }
                    }
                ))
            } else if activeSession.status == .paused {
                list.append(CompanionListItem(
                    id: "focus-resume",
                    section: .focus,
                    title: "Resume",
                    subtitle: nil,
                    icon: "play.fill",
                    action: { [weak self] in
                        Task {
                            await self?.model.performFocusAction("resume")
                        }
                    }
                ))
            }

            list.append(CompanionListItem(
                id: "focus-complete",
                section: .focus,
                title: "Complete",
                subtitle: nil,
                icon: "checkmark.circle.fill",
                action: { [weak self] in
                    Task {
                        await self?.model.performFocusAction("complete")
                    }
                }
            ))

            list.append(CompanionListItem(
                id: "focus-abandon",
                section: .focus,
                title: "Abandon",
                subtitle: nil,
                icon: "xmark.circle.fill",
                action: { [weak self] in
                    Task {
                        await self?.model.performFocusAction("abandon")
                    }
                }
            ))

            list.append(CompanionListItem(
                id: "focus-extend",
                section: .focus,
                title: "+5 min",
                subtitle: nil,
                icon: "plus.circle",
                action: { [weak self] in
                    Task {
                        await self?.model.performFocusAction("extend", extendSeconds: 300)
                    }
                }
            ))
        } else {
            list.append(CompanionListItem(
                id: "focus-empty",
                section: .focus,
                title: "No active session",
                subtitle: "Select a duration and start focus",
                icon: "clock.badge.exclamationmark",
                action: {}
            ))

            list.append(CompanionListItem(
                id: "focus-start",
                section: .focus,
                title: "Start Focus",
                subtitle: nil,
                icon: "play.fill",
                action: { [weak self] in
                    Task {
                        await self?.model.startFocus()
                    }
                }
            ))
        }

        return list
    }

    private func buildSearchResults(query: String) -> [CompanionListItem] {
        var list: [CompanionListItem] = []

        // 1. QUICK CAPTURE
        list.append(CompanionListItem(
            id: "quick-capture",
            section: .quickCapture,
            title: "Create task: \"\(query)\"",
            subtitle: "Press Return to add to Inbox",
            icon: "plus.circle.fill",
            action: { [weak self] in
                guard let self = self else { return }
                Task {
                    _ = await self.model.createTask(title: query)
                    self.searchText = ""
                }
            }
        ))

        // 2. COMMANDS & ACTIONS
        let commands: [CompanionCommandItem] = [
            CompanionCommandItem(keyword: "Start focus", title: "Start focus", icon: "timer", action: { [weak self] in
                Task {
                    await self?.model.startFocus()
                }
            }),
            CompanionCommandItem(keyword: "Start break", title: "Start break", icon: "cup.and.saucer.fill", action: {
                _ = FocusCommandService.shared.startShortBreak()
            }),
            CompanionCommandItem(keyword: "Add task", title: "Add task", icon: "plus", action: { [weak self] in
                self?.isQuickCapturing = true
            }),
            CompanionCommandItem(keyword: "Open today's tasks", title: "Open today's tasks", icon: "sun.max", action: { [weak self] in
                self?.router.openMainWindow()
                self?.model.selectedSection = .today
                self?.dismissCompanion()
            }),
            CompanionCommandItem(keyword: "Open Eisenhower matrix", title: "Open Eisenhower matrix", icon: "square.grid.2x2", action: { [weak self] in
                self?.router.openMainWindow()
                self?.model.selectedSection = .matrix
                self?.dismissCompanion()
            }),
            CompanionCommandItem(keyword: "Open habits", title: "Open habits", icon: "repeat", action: { [weak self] in
                self?.router.openMainWindow()
                self?.model.selectedSection = .habits
                self?.dismissCompanion()
            }),
            CompanionCommandItem(keyword: "Open settings", title: "Open settings", icon: "gearshape", action: { [weak self] in
                self?.router.openSettings()
                self?.dismissCompanion()
            }),
            CompanionCommandItem(keyword: "Open full iTu", title: "Open full iTu", icon: "house", action: { [weak self] in
                self?.router.openMainWindow()
                self?.dismissCompanion()
            })
        ]

        for cmd in commands {
            if cmd.keyword.lowercased().contains(query.lowercased()) {
                list.append(CompanionListItem(
                    id: "cmd-\(cmd.keyword)",
                    section: .commands,
                    title: cmd.title,
                    subtitle: "Command",
                    icon: cmd.icon,
                    action: cmd.action
                ))
            }
        }

        // 3. TASKS
        let matchingTasks = model.tasks
            .filter { $0.deletedAt == nil }
            .filter { $0.title.lowercased().contains(query.lowercased()) }
            .sorted { (t1, t2) -> Bool in
                let p1 = t1.priority == .high ? 3 : (t1.priority == .medium ? 2 : (t1.priority == .low ? 1 : 0))
                let p2 = t2.priority == .high ? 3 : (t2.priority == .medium ? 2 : (t2.priority == .low ? 1 : 0))
                if p1 != p2 { return p1 > p2 }
                return (t1.createdAt ?? "") > (t2.createdAt ?? "")
            }
            .prefix(5)

        for task in matchingTasks {
            list.append(CompanionListItem(
                id: "task-\(task.id)",
                section: .tasks,
                title: task.title,
                subtitle: task.status == .completed ? "Completed" : "Task",
                icon: task.status == .completed ? "checkmark.circle.fill" : "circle",
                action: { [weak self] in
                    self?.router.openTask(id: task.id)
                    self?.dismissCompanion()
                }
            ))
        }

        // 4. HABITS
        let matchingHabits = model.habits
            .filter { $0.name.lowercased().contains(query.lowercased()) }
            .prefix(3)

        for habit in matchingHabits {
            list.append(CompanionListItem(
                id: "habit-\(habit.id)",
                section: .habits,
                title: habit.name,
                subtitle: "Habit",
                icon: "repeat",
                action: { [weak self] in
                    self?.router.openMainWindow()
                    self?.model.selectedSection = .habits
                    self?.dismissCompanion()
                }
            ))
        }

        return list
    }

    func moveSelectionDown() {
        guard !items.isEmpty else { return }
        selectedIndex = (selectedIndex + 1) % items.count
    }

    func moveSelectionUp() {
        guard !items.isEmpty else { return }
        selectedIndex = (selectedIndex - 1 + items.count) % items.count
    }

    func resetSelection() {
        selectedIndex = 0
    }

    func executeSelection() {
        guard selectedIndex >= 0 && selectedIndex < items.count else { return }
        items[selectedIndex].action()
    }

    func selectNextSection() {
        guard !items.isEmpty else { return }
        let currentSection = items[selectedIndex].section
        var nextIndex = (selectedIndex + 1) % items.count
        while nextIndex != selectedIndex {
            if items[nextIndex].section != currentSection {
                selectedIndex = nextIndex
                return
            }
            nextIndex = (nextIndex + 1) % items.count
        }
    }

    func selectItem(at index: Int) {
        guard index >= 0 && index < items.count else { return }
        selectedIndex = index
        executeSelection()
    }

    var nextTask: ProductivityTask? {
        model.homeTodayTasks()
            .filter { $0.status != .completed && $0.status != .canceled && $0.deletedAt == nil }
            .sorted { (t1, t2) -> Bool in
                let p1 = t1.priority == .high ? 3 : (t1.priority == .medium ? 2 : (t1.priority == .low ? 1 : 0))
                let p2 = t2.priority == .high ? 3 : (t2.priority == .medium ? 2 : (t2.priority == .low ? 1 : 0))
                if p1 != p2 { return p1 > p2 }
                return t1.sortOrder < t2.sortOrder
            }
            .first
    }

    private func formatDuration(_ session: FocusSession) -> String {
        let startedAt = session.startedAt
        guard let startDate = ISO8601DateFormatter().date(from: startedAt) else { return "" }
        let now = Date()
        let totalElapsed = Int(now.timeIntervalSince(startDate))
        let activeElapsed = max(0, totalElapsed - session.accumulatedPauseSecs)

        let minutes = activeElapsed / 60
        let seconds = activeElapsed % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

struct CompanionListItem: Identifiable, Equatable {
    let id: String
    let section: CompanionSection
    let title: String
    let subtitle: String?
    let icon: String
    let action: @MainActor () -> Void

    static func == (lhs: CompanionListItem, rhs: CompanionListItem) -> Bool {
        lhs.id == rhs.id && lhs.title == rhs.title && lhs.subtitle == rhs.subtitle && lhs.icon == rhs.icon
    }
}

enum CompanionSection: String {
    case next = "NEXT"
    case habits = "HABITS"
    case focus = "FOCUS"
    case quickCapture = "QUICK CAPTURE"
    case tasks = "TASKS"
    case commands = "COMMANDS"
}
