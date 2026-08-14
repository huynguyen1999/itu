import Foundation

struct PlanningTaskGroup: Identifiable, Sendable {
    let id: String
    let title: String
    let tasks: [ProductivityTask]

    init(id: String, title: String, tasks: [ProductivityTask]) {
        self.id = id
        self.title = title
        self.tasks = tasks
    }
}

struct PlanningRenderProjection: Sendable {
    let overdueTasks: [ProductivityTask]
    let activeGroups: [PlanningTaskGroup]
    let completedTasks: [ProductivityTask]
    let archivedSkillIDs: Set<String>
}

struct PlanningRenderProjectionKey: Hashable, Sendable {
    let section: String
    let taskListId: String?
    let query: String
    let sortMode: String
    let groupMode: String
    let hideCompleted: Bool
    let modelHideCompleted: Bool
}

enum PlanningTaskProjector {
    static func render(
        tasks: [ProductivityTask],
        section: AppSection,
        sections: [TaskSectionModel] = [],
        lists: [TaskListModel] = [],
        tags: [TagModel] = [],
        tagIdsByTaskID: [String: [String]] = [:],
        settings: PlanningViewSettings,
        hideCompleted: Bool,
        archivedSkillIDs: Set<String> = []
    ) -> PlanningRenderProjection {
        let visible = hideCompleted
            ? tasks.filter { $0.status != .completed && $0.status != .canceled }
            : tasks
        let sorted = sort(visible, by: settings.sortMode)
        let startOfToday = Calendar.current.startOfDay(for: Date())
        var overdue: [ProductivityTask] = []
        var active: [ProductivityTask] = []
        var completed: [ProductivityTask] = []
        for task in sorted {
            if task.status == .completed || task.status == .canceled {
                completed.append(task)
            } else if section == .today,
                      task.status != .archived,
                      let dateValue = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateValue),
                      date < startOfToday {
                overdue.append(task)
            } else {
                active.append(task)
            }
        }
        return PlanningRenderProjection(
            overdueTasks: overdue,
            activeGroups: group(active, by: settings.groupMode, sections: sections, lists: lists, tags: tags, tagIdsByTaskID: tagIdsByTaskID),
            completedTasks: completed,
            archivedSkillIDs: archivedSkillIDs
        )
    }

    static func project(
        tasks: [ProductivityTask],
        sections: [TaskSectionModel] = [],
        lists: [TaskListModel] = [],
        tags: [TagModel] = [],
        tagIdsByTaskID: [String: [String]] = [:],
        settings: PlanningViewSettings
    ) -> [PlanningTaskGroup] {
        var filtered = tasks

        if settings.hideCompleted {
            filtered = filtered.filter { $0.status != .completed && $0.status != .canceled }
        }

        let sorted = sort(filtered, by: settings.sortMode)
        return group(
            sorted,
            by: settings.groupMode,
            sections: sections,
            lists: lists,
            tags: tags,
            tagIdsByTaskID: tagIdsByTaskID
        )
    }

    static func sort(_ tasks: [ProductivityTask], by mode: PlanningSortMode) -> [ProductivityTask] {
        tasks.sorted { lhs, rhs in
            switch mode {
            case .manual:
                return lhs.sortOrder < rhs.sortOrder
            case .due:
                guard let lhsDue = lhs.dueAt else { return false }
                guard let rhsDue = rhs.dueAt else { return true }
                return lhsDue < rhsDue
            case .priority:
                let lhsWeight = lhs.priority == .high ? 3 : (lhs.priority == .medium ? 2 : (lhs.priority == .low ? 1 : 0))
                let rhsWeight = rhs.priority == .high ? 3 : (rhs.priority == .medium ? 2 : (rhs.priority == .low ? 1 : 0))
                if lhsWeight != rhsWeight { return lhsWeight > rhsWeight }
                return lhs.sortOrder < rhs.sortOrder
            case .createdNewest:
                return (lhs.createdAt ?? "") > (rhs.createdAt ?? "")
            case .createdOldest:
                return (lhs.createdAt ?? "") < (rhs.createdAt ?? "")
            case .modifiedNewest:
                return (lhs.updatedAt ?? "") > (rhs.updatedAt ?? "")
            case .modifiedOldest:
                return (lhs.updatedAt ?? "") < (rhs.updatedAt ?? "")
            case .title:
                return lhs.title.localizedCompare(rhs.title) == .orderedAscending
            }
        }
    }

    static func group(
        _ tasks: [ProductivityTask],
        by mode: PlanningGroupMode,
        sections: [TaskSectionModel],
        lists: [TaskListModel],
        tags: [TagModel],
        tagIdsByTaskID: [String: [String]]
    ) -> [PlanningTaskGroup] {
        guard mode != .none else {
            return [PlanningTaskGroup(id: "all", title: "All Tasks", tasks: tasks)]
        }

        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: Date())

        switch mode {
        case .none:
            return [PlanningTaskGroup(id: "all", title: "All Tasks", tasks: tasks)]

        case .status:
            let statuses: [TaskStatus] = [.inbox, .planned, .inProgress, .completed, .canceled, .archived]
            return statuses.compactMap { st in
                let groupTasks = tasks.filter { $0.status == st }
                guard !groupTasks.isEmpty else { return nil }
                let label: String
                switch st {
                case .inbox: label = "Inbox"
                case .planned: label = "Planned"
                case .inProgress: label = "In Progress"
                case .completed: label = "Completed"
                case .canceled: label = "Canceled"
                case .archived: label = "Archived"
                }
                return PlanningTaskGroup(id: st.rawValue, title: label, tasks: groupTasks)
            }

        case .priority:
            let priorities: [TaskPriority] = [.high, .medium, .low, .none]
            return priorities.compactMap { pri in
                let groupTasks = tasks.filter { $0.priority == pri }
                guard !groupTasks.isEmpty else { return nil }
                return PlanningTaskGroup(id: pri.rawValue, title: pri == .none ? "No Priority" : pri.rawValue.capitalized, tasks: groupTasks)
            }

        case .project:
            var groups: [PlanningTaskGroup] = []
            let listMap = Dictionary(uniqueKeysWithValues: lists.map { ($0.id, $0.name) })

            for list in lists {
                let groupTasks = tasks.filter { $0.taskListId == list.id }
                if !groupTasks.isEmpty {
                    groups.append(PlanningTaskGroup(id: list.id, title: list.name, tasks: groupTasks))
                }
            }
            let noListTasks = tasks.filter { task in
                guard let lid = task.taskListId else { return true }
                return listMap[lid] == nil
            }
            if !noListTasks.isEmpty {
                groups.append(PlanningTaskGroup(id: "no-project", title: "No Project", tasks: noListTasks))
            }
            return groups

        case .time:
            var overdue: [ProductivityTask] = []
            var today: [ProductivityTask] = []
            var upcoming: [ProductivityTask] = []
            var noDate: [ProductivityTask] = []

            for task in tasks {
                guard let dateVal = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateVal) else {
                    noDate.append(task)
                    continue
                }
                if calendar.isDateInToday(date) {
                    today.append(task)
                } else if date < startOfToday {
                    overdue.append(task)
                } else {
                    upcoming.append(task)
                }
            }

            var result: [PlanningTaskGroup] = []
            if !overdue.isEmpty { result.append(PlanningTaskGroup(id: "overdue", title: "Overdue", tasks: overdue)) }
            if !today.isEmpty { result.append(PlanningTaskGroup(id: "today", title: "Today", tasks: today)) }
            if !upcoming.isEmpty { result.append(PlanningTaskGroup(id: "upcoming", title: "Upcoming", tasks: upcoming)) }
            if !noDate.isEmpty { result.append(PlanningTaskGroup(id: "no-date", title: "No Date", tasks: noDate)) }
            return result

        case .created:
            var todayCreated: [ProductivityTask] = []
            var earlierCreated: [ProductivityTask] = []

            for task in tasks {
                if let createdStr = task.createdAt,
                   let date = iTuDateSupport.parse(createdStr),
                   calendar.isDateInToday(date) {
                    todayCreated.append(task)
                } else {
                    earlierCreated.append(task)
                }
            }
            var result: [PlanningTaskGroup] = []
            if !todayCreated.isEmpty { result.append(PlanningTaskGroup(id: "created-today", title: "Created Today", tasks: todayCreated)) }
            if !earlierCreated.isEmpty { result.append(PlanningTaskGroup(id: "created-earlier", title: "Created Earlier", tasks: earlierCreated)) }
            return result

        case .section:
            var groups: [PlanningTaskGroup] = []
            let secMap = Dictionary(uniqueKeysWithValues: sections.map { ($0.id, $0.title) })
            for sec in sections {
                let groupTasks = tasks.filter { $0.sectionId == sec.id }
                if !groupTasks.isEmpty {
                    groups.append(PlanningTaskGroup(id: sec.id, title: sec.title, tasks: groupTasks))
                }
            }
            let noSecTasks = tasks.filter { task in
                guard let sid = task.sectionId else { return true }
                return secMap[sid] == nil
            }
            if !noSecTasks.isEmpty {
                groups.append(PlanningTaskGroup(id: "no-section", title: "No Section", tasks: noSecTasks))
            }
            return groups

        case .tag:
            var tagGroups: [String: [ProductivityTask]] = [:]
            var untagged: [ProductivityTask] = []
            let tagMap = Dictionary(uniqueKeysWithValues: tags.map { ($0.id, $0.name) })

            for task in tasks {
                let taskTagNames = (tagIdsByTaskID[task.id] ?? []).compactMap { tagMap[$0] }
                if taskTagNames.isEmpty {
                    untagged.append(task)
                } else {
                    for tagName in taskTagNames {
                        tagGroups[tagName, default: []].append(task)
                    }
                }
            }

            var result: [PlanningTaskGroup] = []
            for (tagName, tList) in tagGroups.sorted(by: { $0.key < $1.key }) {
                result.append(PlanningTaskGroup(id: "tag-\(tagName)", title: "#\(tagName)", tasks: tList))
            }
            if !untagged.isEmpty {
                result.append(PlanningTaskGroup(id: "untagged", title: "Untagged", tasks: untagged))
            }
            return result
        }
    }
}
