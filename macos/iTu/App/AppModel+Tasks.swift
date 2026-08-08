import Foundation

@MainActor
extension AppModel {
    private func invalidateTaskProjections() {
        cachedTaskSections.removeAll(keepingCapacity: true)
        cachedHomeTodayTasks = nil
        cachedPlanningProjections.removeAll(keepingCapacity: true)
    }

    private func invalidateTaskProjectionsIfDayChanged() {
        let today = Date().formatted(iTuDateSupport.day)
        guard cachedTaskProjectionDay != today else { return }
        cachedTaskProjectionDay = today
        invalidateTaskProjections()
    }

    func createTaskList(name: String, description: String? = nil, color: String = "TEAL") async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            let result = try await offlineStore.createTaskList(name: trimmed, description: description, color: color)
            apply(result.snapshot)
            syncPhase = .pending
        } catch {
            errorMessage = "Could not create task list: \(error.localizedDescription)"
        }
    }

    func updateTaskList(_ list: TaskListModel, name: String, description: String?, color: String?) async {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            apply(try await offlineStore.updateTaskList(id: list.id, name: trimmed, description: description, color: color))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not update task list: \(error.localizedDescription)"
        }
    }

    func deleteTaskList(_ list: TaskListModel) async {
        guard !list.isDefault else { return }
        do {
            apply(try await offlineStore.deleteTaskList(id: list.id))
            if selectedTaskListId == list.id { selectedTaskListId = nil }
            syncPhase = .pending
        } catch {
            errorMessage = "Could not archive task list: \(error.localizedDescription)"
        }
    }

    func createTag(name: String, color: String = "mint") {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "#", with: "")
        guard !trimmed.isEmpty else { return }
        let newTag = TagModel(
            id: UUID().uuidString,
            name: trimmed,
            color: color,
            taskCount: 0
        )
        tags.append(newTag)
    }

    @discardableResult
    func createTask(
        title: String,
        descriptionMarkdown: String = "",
        priority: TaskPriority = .none,
        dueAt: String? = nil,
        taskListId: String? = nil,
        parentId: String? = nil,
        important: Bool = false,
        urgentOverride: Bool? = nil
    ) async -> ProductivityTask? {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        do {
            let result = try await offlineStore.createTask(
                title: trimmed,
                descriptionMarkdown: descriptionMarkdown,
                priority: priority,
                dueAt: dueAt,
                taskListId: taskListId,
                parentId: parentId,
                important: important,
                urgentOverride: urgentOverride
            )
            apply(result.snapshot)
            syncPhase = .pending
            return result.task
        } catch {
            errorMessage = "Could not save the task locally: \(error.localizedDescription)"
            return nil
        }
    }

    func editTask(_ task: ProductivityTask, edits: TaskEdits, undoRegistration: UndoRegistration = .register) async {
        let title = edits.title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !title.isEmpty else { return }
        let normalized = TaskEdits(
            title: title,
            descriptionMarkdown: edits.descriptionMarkdown,
            priority: edits.priority,
            important: edits.important,
            dueAt: edits.dueAt,
            estimatedMinutes: edits.estimatedMinutes,
            scheduledStartAt: edits.scheduledStartAt,
            scheduledEndAt: edits.scheduledEndAt,
            recurrenceRule: edits.recurrenceRule,
            taskListId: edits.taskListId,
            changesTaskListId: edits.changesTaskListId,
            sectionId: edits.sectionId,
            tagIds: edits.tagIds
        )
        let previousEdits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: task.priority,
            important: task.important,
            dueAt: task.dueAt,
            estimatedMinutes: task.estimatedMinutes,
            scheduledStartAt: task.scheduledStartAt,
            scheduledEndAt: task.scheduledEndAt,
            recurrenceRule: task.recurrenceRule,
            taskListId: task.taskListId,
            changesTaskListId: edits.changesTaskListId,
            sectionId: task.sectionId,
            tagIds: modelTagIds(for: task)
        )
        do {
            apply(try await offlineStore.editTask(id: task.id, edits: normalized))
            syncPhase = .pending
            
            if undoRegistration == .register {
                var label = "Updated task"
                var mutType: TaskMutationType = .status
                if edits.priority != task.priority {
                    label = "Priority: \(edits.priority.rawValue.capitalized)"
                    mutType = .priority
                } else if edits.dueAt != task.dueAt {
                    label = "Due date updated"
                    mutType = .dueDate
                } else if edits.changesTaskListId, edits.taskListId != task.taskListId {
                    label = "Moved task"
                    mutType = .taskList
                }
                let record = TaskUndoRecord(
                    label: label,
                    taskId: task.id,
                    mutationType: mutType,
                    previousValues: ["title": task.title]
                ) { [weak self] in
                    Task { @MainActor in
                        guard let self, let current = self.tasks.first(where: { $0.id == task.id }) else { return }
                        await self.editTask(current, edits: previousEdits, undoRegistration: .suppress)
                    }
                }
                TaskUndoCoordinator.shared.registerUndo(record)
            }
        } catch {
            errorMessage = "Could not edit the task locally: \(error.localizedDescription)"
        }
    }

    func moveTaskToList(_ task: ProductivityTask, listId: String?) async {
        let edits = TaskEdits(
            title: task.title,
            descriptionMarkdown: task.descriptionMarkdown,
            priority: task.priority,
            important: task.important,
            dueAt: task.dueAt,
            estimatedMinutes: task.estimatedMinutes,
            scheduledStartAt: task.scheduledStartAt,
            scheduledEndAt: task.scheduledEndAt,
            recurrenceRule: task.recurrenceRule,
            taskListId: listId,
            changesTaskListId: true,
            sectionId: task.sectionId,
            tagIds: modelTagIds(for: task)
        )
        await editTask(task, edits: edits)
    }

    private func modelTagIds(for task: ProductivityTask) -> [String] {
        tagIdsByTaskID[task.id] ?? []
    }

    func reorderTasks(_ orderedIds: [String]) async {
        do {
            apply(try await offlineStore.reorderTasks(orderedIds: orderedIds))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not reorder tasks: \(error.localizedDescription)"
        }
    }

    func setTaskStatus(_ task: ProductivityTask, status: TaskStatus, undoRegistration: UndoRegistration = .register) async {
        let previousStatus = tasks.first(where: { $0.id == task.id })?.status ?? task.status
        let optimisticReceipt = makeOptimisticGrowthReceipt(for: task, newStatus: status)
        let completedAt = status == .completed ? ISO8601DateFormatter().string(from: Date()) : nil
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index].status = status
            tasks[index].completedAt = completedAt
            invalidateTaskProjections()
        }
        do {
            let result = try await offlineStore.setTaskStatus(
                id: task.id,
                status: status,
                completedAt: completedAt
            )
            apply(result.snapshot)
            if let mutationId = result.mutationId, let optimisticReceipt {
                let updated = try await offlineStore.recordOptimisticGrowthReceipt(
                    optimisticReceipt,
                    mutationId: mutationId
                )
                apply(updated)
                enqueueGrowthReceipt(optimisticReceipt, mutationId: mutationId)
            }
            syncPhase = .pending
        } catch {
            if let index = tasks.firstIndex(where: { $0.id == task.id }) {
                tasks[index].status = previousStatus
                tasks[index].completedAt = previousStatus == .completed ? ISO8601DateFormatter().string(from: Date()) : nil
                invalidateTaskProjections()
            }
            errorMessage = "Could not update task status: \(error.localizedDescription)"
            return
        }

        if status == .completed,
           let session = focusTimer.activeSession,
           session.taskId == task.id,
           session.phase == .work {
            await performFocusAction("complete")
        }

        if previousStatus != status && undoRegistration == .register {
            let label: String
            switch status {
            case .completed: label = "Task completed"
            case .inProgress: label = "Task set to In Progress"
            case .planned, .inbox: label = "Task reopened"
            case .canceled: label = "Task canceled"
            case .archived: label = "Task archived"
            }
            let taskId = task.id
            let record = TaskUndoRecord(
                label: label,
                taskId: taskId,
                mutationType: .status,
                previousValues: ["status": previousStatus.rawValue]
            ) { [weak self] in
                guard let self, let current = self.tasks.first(where: { $0.id == taskId }) else { return }
                await self.setTaskStatus(current, status: previousStatus, undoRegistration: .suppress)
            }
            TaskUndoCoordinator.shared.registerUndo(record)
        }
    }

    func cycleTaskStatus(_ task: ProductivityTask) async {
        let nextStatus: TaskStatus
        switch task.status {
        case .inbox, .planned:
            nextStatus = .inProgress
        case .inProgress:
            nextStatus = .completed
        case .completed:
            nextStatus = .planned
        case .canceled, .archived:
            nextStatus = .planned
        }
        await setTaskStatus(task, status: nextStatus)
    }

    func toggleCompletion(_ task: ProductivityTask) async {
        let nextStatus: TaskStatus = task.status == .completed ? .inbox : .completed
        await setTaskStatus(task, status: nextStatus)
    }

    func softDeleteTask(_ task: ProductivityTask, undoRegistration: UndoRegistration = .register) async {
        let deletedAt = ISO8601DateFormatter().string(from: Date())
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index].deletedAt = deletedAt
            invalidateTaskProjections()
        }
        do {
            apply(try await offlineStore.softDeleteTask(id: task.id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not move the task to trash: \(error.localizedDescription)"
        }

        if undoRegistration == .register {
            let taskId = task.id
            let record = TaskUndoRecord(
                label: "Moved \"\(task.title)\" to Trash",
                taskId: taskId,
                mutationType: .softDelete,
                previousValues: [:]
            ) { [weak self] in
                guard let self, let current = self.tasks.first(where: { $0.id == taskId }) else { return }
                await self.restoreTask(current, undoRegistration: .suppress)
            }
            TaskUndoCoordinator.shared.registerUndo(record)
        }
    }

    func restoreTask(_ task: ProductivityTask, undoRegistration: UndoRegistration = .register) async {
        if let index = tasks.firstIndex(where: { $0.id == task.id }) {
            tasks[index].deletedAt = nil
            invalidateTaskProjections()
        }
        do {
            apply(try await offlineStore.restoreTask(id: task.id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not restore the task: \(error.localizedDescription)"
        }
    }

    func deleteTask(_ task: ProductivityTask) async {
        do {
            apply(try await offlineStore.deleteTask(id: task.id))
            syncPhase = .pending
        } catch {
            errorMessage = "Could not delete the task locally: \(error.localizedDescription)"
        }
    }

    func tasks(for section: AppSection) -> [ProductivityTask] {
        invalidateTaskProjectionsIfDayChanged()
        if section == .trash {
            return trashedTasks
        }
        if let cached = cachedTaskSections[section] {
            return cached
        }
        let visible = tasks.filter { $0.deletedAt == nil && $0.parentId == nil }
        let filtered: [ProductivityTask]
        let calendar = Calendar.current
        switch section {
        case .home:
            filtered = visible.filter { task in
                guard task.status != .archived,
                      let dateValue = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateValue) else {
                    return false
                }
                return calendar.isDateInToday(date)
            }
        case .today:
            filtered = visible.filter { task in
                guard task.status != .archived,
                      let dateValue = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateValue) else {
                    return false
                }
                return calendar.isDateInToday(date)
            }
        case .upcoming:
            let startOfToday = calendar.startOfDay(for: Date())
            let endOf7Days = calendar.date(byAdding: .day, value: 7, to: startOfToday) ?? Date()
            filtered = visible.filter { task in
                guard task.status != .archived,
                      let dateValue = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateValue) else {
                    return false
                }
                return date >= startOfToday && date <= endOf7Days
            }
        case .inbox:
            filtered = visible.filter { $0.status != .archived }
        case .matrix:
            filtered = visible.filter { $0.status != .archived }
        case .completed:
            filtered = visible.filter { $0.status == .completed || $0.status == .canceled }
        default:
            filtered = []
        }
        let result = filtered.sorted { lhs, rhs in
            if lhs.important != rhs.important { return lhs.important }
            return lhs.sortOrder < rhs.sortOrder
        }
        cachedTaskSections[section] = result
        return result
    }

    func planningTasks(
        for section: AppSection,
        filterQuery: String,
        taskListId: String?
    ) -> [ProductivityTask] {
        invalidateTaskProjectionsIfDayChanged()
        let hasQuery = !filterQuery.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        let query = filterQuery.lowercased()
        let key = "\(section.rawValue)|\(taskListId ?? "")|\(query)|\(sortOption.rawValue)|\(hideCompletedTasks)"
        if let cached = cachedPlanningProjections[key] {
            return cached
        }

        var visible = tasks(for: section)
        if let taskListId {
            visible = visible.filter { $0.taskListId == taskListId }
        }
        if hasQuery {
            visible = visible.filter { $0.title.lowercased().contains(query) }
        }
        if hideCompletedTasks {
            visible = visible.filter { $0.status != .completed }
        }
        switch sortOption {
        case .manual:
            visible.sort { $0.sortOrder < $1.sortOrder }
        case .priority:
            visible.sort { lhs, rhs in
                let lhsWeight = lhs.priority == .high ? 3 : lhs.priority == .medium ? 2 : lhs.priority == .low ? 1 : 0
                let rhsWeight = rhs.priority == .high ? 3 : rhs.priority == .medium ? 2 : rhs.priority == .low ? 1 : 0
                if lhsWeight != rhsWeight { return lhsWeight > rhsWeight }
                return lhs.sortOrder < rhs.sortOrder
            }
        case .dueDate:
            visible.sort { lhs, rhs in
                guard let lhsDue = lhs.dueAt else { return false }
                guard let rhsDue = rhs.dueAt else { return true }
                return lhsDue < rhsDue
            }
        case .title:
            visible.sort { $0.title.localizedCompare($1.title) == .orderedAscending }
        }
        cachedPlanningProjections[key] = visible
        return visible
    }

    /// Tasks shown in the Home "Today's tasks" section: tasks scheduled or due today
    /// (any status), plus incomplete tasks that are overdue (scheduled or due before today).
    func homeTodayTasks() -> [ProductivityTask] {
        invalidateTaskProjectionsIfDayChanged()
        if let cached = cachedHomeTodayTasks {
            return cached
        }
        let visible = tasks.filter { $0.deletedAt == nil && $0.parentId == nil }
        let calendar = Calendar.current
        let startOfToday = calendar.startOfDay(for: Date())
        let result = visible
            .filter { task in
                guard task.status != .archived,
                      let dateValue = task.scheduledStartAt ?? task.dueAt,
                      let date = iTuDateSupport.parse(dateValue) else {
                    return false
                }
                if calendar.isDateInToday(date) {
                    return true
                }
                guard date < startOfToday else { return false }
                return task.status != .completed && task.status != .canceled
            }
            .sorted { lhs, rhs in
                if lhs.important != rhs.important { return lhs.important }
                return lhs.sortOrder < rhs.sortOrder
            }
        cachedHomeTodayTasks = result
        return result
    }

    var trashedTasks: [ProductivityTask] {
        var merged = Dictionary(uniqueKeysWithValues: (trashSnapshot?.tasks ?? []).map { ($0.id, $0) })
        for task in tasks {
            if task.deletedAt == nil {
                merged.removeValue(forKey: task.id)
            } else {
                merged[task.id] = task
            }
        }
        return merged.values.sorted { ($0.deletedAt ?? "") > ($1.deletedAt ?? "") }
    }


}
