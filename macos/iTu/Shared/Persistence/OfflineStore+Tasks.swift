import Foundation

extension OfflineStore {
    @discardableResult
    func updateTaskLists(_ fetchedLists: [TaskListModel]) throws -> OfflineSnapshot {
        let optimisticByID = Dictionary(uniqueKeysWithValues: state.taskLists.map { ($0.id, $0) })
        state.taskLists = fetchedLists
        try reapplyPendingTaskListMutations(optimisticByID: optimisticByID)
        try persist()
        return state
    }

    @discardableResult
    func updateTaskMetadata(_ metadata: [TaskMetadataDTO]) throws -> OfflineSnapshot {
        for item in metadata {
            state.tagIdsByTaskID[item.id] = item.tags.map { $0.tag.id }
            if let sectionId = item.sectionId,
               let taskIndex = state.tasks.firstIndex(where: { $0.id == item.id }) {
                state.tasks[taskIndex].sectionId = sectionId
            }
        }
        try persist()
        return state
    }

    @discardableResult
    func updateTaskTaxonomy(sections: [TaskSectionModel], tags: [TagModel]) throws -> OfflineSnapshot {
        state.sections = sections
        state.tags = tags
        try persist()
        return state
    }

    @discardableResult
    func createTaskList(name: String, description: String? = nil, color: String = "TEAL") throws -> (list: TaskListModel, snapshot: OfflineSnapshot) {
        let id = ULID.generate()
        let trimmedDescription = description?.trimmingCharacters(in: .whitespacesAndNewlines)
        let list = TaskListModel(
            id: id,
            name: name,
            description: trimmedDescription?.isEmpty == true ? nil : trimmedDescription,
            icon: "list.bullet",
            color: color,
            taskCount: 0,
            version: 1
        )
        state.taskLists.append(list)
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "tasklist.create",
            entityId: id,
            payload: [
                "title": .string(name),
                "description": list.description.map(JSONValue.string) ?? .null,
                "color": .string(color)
            ],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return (list, state)
    }

    @discardableResult
    func updateTaskList(id: String, name: String, description: String?, color: String?) throws -> OfflineSnapshot {
        guard let index = state.taskLists.firstIndex(where: { $0.id == id }) else { return state }
        let original = state.taskLists[index]
        state.taskLists[index].name = name
        state.taskLists[index].description = description
        state.taskLists[index].color = color
        state.taskLists[index].version += 1
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "tasklist.update",
            entityId: id,
            baseVersion: original.version,
            baseValues: [
                "title": .string(original.name),
                "description": original.description.map(JSONValue.string) ?? .null,
                "color": original.color.map(JSONValue.string) ?? .null
            ],
            payload: [
                "title": .string(name),
                "description": description.map(JSONValue.string) ?? .null,
                "color": color.map(JSONValue.string) ?? .null
            ],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
    }

    @discardableResult
    func deleteTaskList(id: String) throws -> OfflineSnapshot {
        guard let list = state.taskLists.first(where: { $0.id == id }), !list.isDefault else { return state }
        state.taskLists.removeAll { $0.id == id }
        appendMutation(SyncMutation(
            id: ULID.generate(),
            kind: "tasklist.delete",
            entityId: id,
            baseVersion: list.version,
            payload: [:],
            occurredAt: ISO8601DateFormatter().string(from: Date())
        ))
        try persist()
        return state
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
    ) throws -> (task: ProductivityTask, snapshot: OfflineSnapshot) {
        let id = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let task = ProductivityTask.optimistic(
            id: id,
            title: title,
            descriptionMarkdown: descriptionMarkdown,
            priority: priority,
            dueAt: dueAt,
            taskListId: taskListId,
            parentId: parentId,
            important: important,
            urgentOverride: urgentOverride
        )
        var payload: [String: JSONValue] = [
            "title": .string(title),
            "priority": .string(priority.rawValue),
            "important": .bool(important),
            "urgentOverride": urgentOverride.map(JSONValue.bool) ?? .null,
            "dueAt": dueAt.map(JSONValue.string) ?? .null,
            "taskListId": taskListId.map(JSONValue.string) ?? .null
        ]
        if !descriptionMarkdown.isEmpty {
            payload["descriptionMarkdown"] = .string(descriptionMarkdown)
        }
        if let parentId {
            payload["parentId"] = .string(parentId)
        }
        let mutation = SyncMutation(
            id: ULID.generate(),
            kind: "task.create",
            entityId: id,
            payload: payload,
            occurredAt: now
        )
        state.tasks.append(task)
        appendMutation(mutation)
        try persist()
        return (task, state)
    }

    @discardableResult
    func setTaskStatus(
        id: String,
        status: TaskStatus,
        completedAt: String?
    ) throws -> (mutationId: String?, snapshot: OfflineSnapshot) {
        guard let index = state.tasks.firstIndex(where: { $0.id == id }) else { return (nil, state) }
        let baseVersion = state.tasks[index].version
        let previousStatus = state.tasks[index].status
        let mutationId = ULID.generate()
        state.tasks[index].status = status
        state.tasks[index].completedAt = completedAt
        state.tasks[index].version += 1
        appendMutation(
            SyncMutation(
                id: mutationId,
                kind: "task.update",
                entityId: id,
                baseVersion: baseVersion,
                baseValues: ["status": .string(previousStatus.rawValue)],
                payload: ["status": .string(status.rawValue)],
                occurredAt: ISO8601DateFormatter().string(from: Date())
            )
        )
        try persist()
        return (mutationId, state)
    }

    @discardableResult
    func editTask(id: String, edits: TaskEdits) throws -> OfflineSnapshot {
        guard let index = state.tasks.firstIndex(where: { $0.id == id }) else { return state }
        let original = state.tasks[index]
        var payload: [String: JSONValue] = [:]
        var baseValues: [String: JSONValue] = [:]

        addChange("title", old: .string(original.title), new: .string(edits.title), payload: &payload, baseValues: &baseValues)
        addChange(
            "descriptionMarkdown",
            old: .string(original.descriptionMarkdown),
            new: .string(edits.descriptionMarkdown),
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "priority",
            old: .string(original.priority.rawValue),
            new: .string(edits.priority.rawValue),
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "important",
            old: .bool(original.important),
            new: .bool(edits.important),
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "dueAt",
            old: original.dueAt.map(JSONValue.string) ?? .null,
            new: edits.dueAt.map(JSONValue.string) ?? .null,
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "scheduledStartAt",
            old: original.scheduledStartAt.map(JSONValue.string) ?? .null,
            new: edits.scheduledStartAt.map(JSONValue.string) ?? .null,
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "scheduledEndAt",
            old: original.scheduledEndAt.map(JSONValue.string) ?? .null,
            new: edits.scheduledEndAt.map(JSONValue.string) ?? .null,
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "estimatedMinutes",
            old: original.estimatedMinutes.map { .number(Double($0)) } ?? .null,
            new: edits.estimatedMinutes.map { .number(Double($0)) } ?? .null,
            payload: &payload,
            baseValues: &baseValues
        )
        addChange(
            "recurrenceRule",
            old: original.recurrenceRule.map(JSONValue.string) ?? .null,
            new: edits.recurrenceRule.map(JSONValue.string) ?? .null,
            payload: &payload,
            baseValues: &baseValues
        )
        if edits.changesTaskListId {
            addChange(
                "taskListId",
                old: original.taskListId.map(JSONValue.string) ?? .null,
                new: edits.taskListId.map(JSONValue.string) ?? .null,
                payload: &payload,
                baseValues: &baseValues
            )
        }
        addChange(
            "sectionId",
            old: original.sectionId.map(JSONValue.string) ?? .null,
            new: edits.sectionId.map(JSONValue.string) ?? .null,
            payload: &payload,
            baseValues: &baseValues
        )
        let originalTagIds = state.tagIdsByTaskID[id] ?? []
        if originalTagIds != edits.tagIds {
            baseValues["tagIds"] = .array(originalTagIds.map(JSONValue.string))
            payload["tagIds"] = .array(edits.tagIds.map(JSONValue.string))
        }
        guard !payload.isEmpty else { return state }

        state.tasks[index].title = edits.title
        state.tasks[index].descriptionMarkdown = edits.descriptionMarkdown
        state.tasks[index].priority = edits.priority
        state.tasks[index].important = edits.important
        state.tasks[index].dueAt = edits.dueAt
        state.tasks[index].scheduledStartAt = edits.scheduledStartAt
        state.tasks[index].scheduledEndAt = edits.scheduledEndAt
        state.tasks[index].estimatedMinutes = edits.estimatedMinutes
        state.tasks[index].recurrenceRule = edits.recurrenceRule
        if edits.changesTaskListId {
            state.tasks[index].taskListId = edits.taskListId
        }
        state.tasks[index].sectionId = edits.sectionId
        state.tagIdsByTaskID[id] = edits.tagIds
        state.tasks[index].version += 1
        appendMutation(
            SyncMutation(
                id: ULID.generate(),
                kind: "task.update",
                entityId: id,
                baseVersion: original.version,
                baseValues: baseValues,
                payload: payload,
                occurredAt: ISO8601DateFormatter().string(from: Date())
            )
        )
        try persist()
        return state
    }

    @discardableResult
    func softDeleteTask(id: String) throws -> OfflineSnapshot {
        guard let index = state.tasks.firstIndex(where: { $0.id == id }) else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        state.tasks[index].deletedAt = now
        state.tasks[index].version += 1
        appendMutation(
            SyncMutation(
                id: ULID.generate(),
                kind: "task.update",
                entityId: id,
                baseVersion: state.tasks[index].version - 1,
                payload: ["deletedAt": .string(now)],
                occurredAt: now
            )
        )
        try persist()
        return state
    }

    @discardableResult
    func restoreTask(id: String) throws -> OfflineSnapshot {
        guard let index = state.tasks.firstIndex(where: { $0.id == id }) else { return state }
        let now = ISO8601DateFormatter().string(from: Date())
        state.tasks[index].deletedAt = nil
        state.tasks[index].version += 1
        appendMutation(
            SyncMutation(
                id: ULID.generate(),
                kind: "task.update",
                entityId: id,
                baseVersion: state.tasks[index].version - 1,
                payload: ["deletedAt": .null],
                occurredAt: now
            )
        )
        try persist()
        return state
    }

    @discardableResult
    func deleteTask(id: String) throws -> OfflineSnapshot {
        guard state.tasks.contains(where: { $0.id == id }) else { return state }
        state.tasks.removeAll { $0.id == id }
        appendMutation(
            SyncMutation(
                id: ULID.generate(),
                kind: "task.delete",
                entityId: id,
                payload: [:],
                occurredAt: ISO8601DateFormatter().string(from: Date())
            )
        )
        try persist()
        return state
    }

    @discardableResult
    func reorderTasks(orderedIds: [String]) throws -> OfflineSnapshot {
        var changed = false
        for (index, id) in orderedIds.enumerated() {
            guard let taskIndex = state.tasks.firstIndex(where: { $0.id == id }) else { continue }
            let sortOrder = Double(index + 1)
            guard state.tasks[taskIndex].sortOrder != sortOrder else { continue }
            state.tasks[taskIndex].sortOrder = sortOrder
            state.tasks[taskIndex].version += 1
            appendMutation(
                SyncMutation(
                    id: ULID.generate(),
                    kind: "task.update",
                    entityId: id,
                    baseVersion: state.tasks[taskIndex].version - 1,
                    payload: ["sortOrder": .number(sortOrder)],
                    occurredAt: ISO8601DateFormatter().string(from: Date())
                )
            )
            changed = true
        }
        guard changed else { return state }
        try persist()
        return state
    }

    @discardableResult
    func updateTasks(_ fetchedTasks: [ProductivityTask]) throws -> OfflineSnapshot {
        let optimisticTasksByID = Dictionary(uniqueKeysWithValues: state.tasks.map { ($0.id, $0) })
        let fetchedTaskIDs = Set(fetchedTasks.map(\.id))
        let pendingTaskIDs = Set<String>(
            state.mutations.compactMap { mutation in
                guard mutation.kind == "task.create" || mutation.kind == "task.update" else { return nil }
                return mutation.entityId
            }
        )
        state.tasks.removeAll { task in
            !fetchedTaskIDs.contains(task.id) && !pendingTaskIDs.contains(task.id)
        }
        for task in fetchedTasks {
            if let index = state.tasks.firstIndex(where: { $0.id == task.id }) {
                state.tasks[index] = task
            } else {
                state.tasks.append(task)
            }
        }
        try reapplyPendingTaskMutations(optimisticTasksByID: optimisticTasksByID)
        try persist()
        return state
    }


}
