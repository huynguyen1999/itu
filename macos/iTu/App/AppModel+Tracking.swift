import Foundation

extension AppModel {
    @MainActor
    func updateGymPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = gymPreferences
        if let unit = patch["weightUnit"]?.stringValue { value.weightUnit = unit }
        if let unit = patch["distanceUnit"]?.stringValue { value.distanceUnit = unit }
        if let rest = patch["defaultRestSeconds"]?.numberValue { value.defaultRestSeconds = Int(rest) }
        if let auto = patch["autoStartRestTimer"]?.boolValue { value.autoStartRestTimer = auto }
        if let previous = patch["previousPerformanceMode"]?.stringValue { value.previousPerformanceMode = previous }
        if let showRpe = patch["showRpe"]?.boolValue { value.showRpe = showRpe }
        if let sounds = patch["soundsEnabled"]?.boolValue { value.soundsEnabled = sounds }
        if let sounds = patch["restSoundEnabled"]?.boolValue { value.restSoundEnabled = sounds }
        if let sounds = patch["completionSoundEnabled"]?.boolValue { value.completionSoundEnabled = sounds }
        if case let .array(ids)? = patch["favoriteExerciseIDs"] { value.favoriteExerciseIDs = ids.compactMap(\.stringValue) }
        if case let .array(ids)? = patch["recentExerciseIDs"] { value.recentExerciseIDs = ids.compactMap(\.stringValue) }
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveGymPreferences(value, mutation: SyncMutation(id: ULID.generate(), kind: "gympreferences.update", entityId: "gympreferences", baseVersion: nil, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func updateBudgetPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = budgetPreferences
        if let currency = patch["defaultCurrency"]?.stringValue { value.defaultCurrency = currency }
        if let type = patch["defaultTransactionType"]?.stringValue { value.defaultTransactionType = type }
        do { apply(try await offlineStore.saveBudgetPreferences(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgetpreferences.update", entityId: "budgetpreferences", baseVersion: nil, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func uploadPendingGymImages() async {
        let pending = await offlineStore.snapshot().pendingGymExerciseImages
        for (id, data) in pending {
            do {
                _ = try await apiClient.uploadGymExerciseImage(id: id, fileData: data, fileName: "reference.jpg", mimeType: "image/jpeg")
                apply(try await offlineStore.removeGymExerciseImage(id: id))
            } catch { continue }
        }
    }

    @MainActor
    func loadBudgetOverview(period: String? = nil) async {
        do {
            budgetOverview = try await apiClient.getBudgetOverview(period: period)
        } catch {
            // The persisted transaction/category/period snapshot remains visible offline.
            rebuildBudgetOverview(period: period ?? budgetOverview?.period ?? iTuCalendarSupport.monthString())
        }
    }

    @MainActor
    func loadBudgetCategories() async {
        do {
            let fetched = try await apiClient.getBudgetCategories()
            apply(try await offlineStore.replaceBudgetCategories(fetched))
        } catch {
            // Keep the hydrated category list when the API is unavailable.
        }
    }

    @MainActor
    func createBudgetCategory(name: String, type: String, icon: String, color: String) async -> Bool {
        let id = ULID.generate()
        let value = BudgetCategoryModel(id: id, userId: user?.id ?? "", name: name, type: type, icon: icon, color: color, sortOrder: budgetCategories.count, archivedAt: nil, version: 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "moneycategory.create", entityId: id, baseVersion: nil, payload: ["name": .string(name), "type": .string(type), "icon": .string(icon), "color": .string(color)], occurredAt: ISO8601DateFormatter().string(from: Date()))
        do {
            apply(try await offlineStore.saveBudgetCategory(value, mutation: mutation))
            if let period = budgetOverview?.period { rebuildBudgetOverview(period: period) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func updateBudgetCategory(id: String, name: String, type: String, icon: String, color: String) async -> Bool {
        guard let old = budgetCategories.first(where: { $0.id == id }) else { return false }
        let value = BudgetCategoryModel(id: id, userId: old.userId, name: name, type: type, icon: icon, color: color, sortOrder: old.sortOrder, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        let payload: [String: JSONValue] = ["name": .string(name), "type": .string(type), "icon": .string(icon), "color": .string(color)]
        do {
            apply(try await offlineStore.saveBudgetCategory(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategory.update", entityId: id, baseVersion: old.version, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            if let period = budgetOverview?.period { rebuildBudgetOverview(period: period) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func archiveBudgetCategory(id: String) async -> Bool {
        do {
            guard let old = budgetCategories.first(where: { $0.id == id }) else { return false }
            let value = BudgetCategoryModel(id: old.id, userId: old.userId, name: old.name, type: old.type, icon: old.icon, color: old.color, sortOrder: old.sortOrder, archivedAt: ISO8601DateFormatter().string(from: Date()), version: (old.version ?? 1) + 1)
            apply(try await offlineStore.saveBudgetCategory(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategory.delete", entityId: id, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date()))))
            if let period = budgetOverview?.period { rebuildBudgetOverview(period: period) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func loadBudgetTransactions(period: String? = nil, categoryID: String? = nil, type: String? = nil) async {
        do {
            let fetched = try await apiClient.getBudgetTransactions(period: period, categoryID: categoryID, type: type)
            apply(try await offlineStore.replaceBudgetTransactions(fetched))
        } catch {
            let requestedType = type?.uppercased()
            budgetTransactions = currentSnapshot.budgetTransactions.filter { transaction in
                transaction.deletedAt == nil
                    && (period == nil || budgetTransactionMonth(transaction.transactionAt) == period)
                    && (categoryID == nil || transaction.categoryId == categoryID)
                    && (requestedType == nil || transaction.type.uppercased() == requestedType)
            }
            if budgetOverview == nil, let period { rebuildBudgetOverview(period: period) }
        }
    }

    @MainActor
    func updateBudgetPeriod(period: String, overallLimit: String) async -> Bool {
        let id = budgetPeriods.first(where: { $0.period == period })?.id ?? period
        let old = budgetPeriods.first(where: { $0.period == period })
        guard let parsedLimit = Double(overallLimit.trimmingCharacters(in: .whitespacesAndNewlines)), parsedLimit.isFinite, parsedLimit >= 0 else { return false }
        let value = BudgetPeriodModel(id: id, userId: user?.id ?? "", period: period, currency: budgetPreferences.defaultCurrency, overallLimit: parsedLimit, categoryBudgets: old?.categoryBudgets ?? [], version: (old?.version ?? 1) + 1)
        do {
            apply(try await offlineStore.saveBudgetPeriod(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneybudgetperiod.update", entityId: period, baseVersion: old?.version, payload: ["period": .string(period), "overallLimit": .string(overallLimit)], occurredAt: ISO8601DateFormatter().string(from: Date()))))
            rebuildBudgetOverview(period: period)
            return true
        } catch { return false }
    }

    @MainActor
    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async -> Bool {
        let old = budgetPeriods.first(where: { $0.period == period })
        guard let parsedLimit = Double(limit.trimmingCharacters(in: .whitespacesAndNewlines)), parsedLimit.isFinite, parsedLimit >= 0 else { return false }
        let categoryBudgets = (old?.categoryBudgets ?? []).filter { $0.categoryId != categoryID } + [BudgetCategoryBudgetModel(id: "\(period):\(categoryID)", budgetPeriodId: old?.id ?? period, categoryId: categoryID, limit: parsedLimit, category: budgetCategories.first(where: { $0.id == categoryID }), version: 1)]
        let value = BudgetPeriodModel(id: old?.id ?? period, userId: user?.id ?? "", period: period, currency: old?.currency ?? budgetPreferences.defaultCurrency, overallLimit: old?.overallLimit ?? 0, categoryBudgets: categoryBudgets, version: (old?.version ?? 1) + 1)
        do {
            apply(try await offlineStore.saveBudgetPeriod(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategorybudget.upsert", entityId: "\(period):\(categoryID)", baseVersion: old?.version, payload: ["period": .string(period), "categoryId": .string(categoryID), "limit": .string(limit)], occurredAt: ISO8601DateFormatter().string(from: Date()))))
            rebuildBudgetOverview(period: period)
            return true
        } catch { return false }
    }

    @MainActor
    func createBudgetTransaction(amount: String, categoryID: String, type: String = "EXPENSE", merchant: String? = nil, paymentMethod: String = "CASH", transactionAt: String? = nil, note: String? = nil) async -> Bool {
        guard let parsedAmount = Double(amount), parsedAmount.isFinite, parsedAmount > 0, let category = budgetCategories.first(where: { $0.id == categoryID }) else { return false }
        let id = ULID.generate(); let at = transactionAt ?? ISO8601DateFormatter().string(from: Date()); let value = BudgetTransactionModel(id: id, userId: user?.id ?? "", type: type, amount: parsedAmount, currency: budgetPreferences.defaultCurrency, category: category.name, categoryId: categoryID, merchant: merchant, paymentMethod: paymentMethod, transactionAt: at, note: note, version: 1, createdAt: at, updatedAt: at, deletedAt: nil)
        var payload: [String: JSONValue] = ["amount": .string(amount), "currency": .string(value.currency), "type": .string(type), "categoryId": .string(categoryID), "paymentMethod": .string(paymentMethod), "transactionAt": .string(at)]
        payload["merchant"] = merchant.map(JSONValue.string) ?? .null; payload["note"] = note.map(JSONValue.string) ?? .null
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: at)))
            rebuildBudgetOverview(period: budgetOverview?.period ?? iTuCalendarSupport.monthString())
            return true
        } catch { return false }
    }

    @MainActor
    func updateBudgetTransaction(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = budgetTransactions.first(where: { $0.id == id }) else { return false }
        let amount = patch["amount"]?.stringValue.flatMap(Double.init) ?? old.amount
        guard amount.isFinite, amount > 0 else { return false }
        let categoryID = patch["categoryId"]?.stringValue ?? old.categoryId
        let category = categoryID.flatMap { categoryID in budgetCategories.first(where: { $0.id == categoryID }) }
        let categoryName = category?.name ?? patch["category"]?.stringValue ?? old.category
        let merchant = patch["merchant"].map { $0.stringValue } ?? old.merchant
        let note = patch["note"].map { $0.stringValue } ?? old.note
        let value = BudgetTransactionModel(id: old.id, userId: old.userId, type: patch["type"]?.stringValue ?? old.type, amount: amount, currency: patch["currency"]?.stringValue ?? old.currency, category: categoryName, categoryId: categoryID, merchant: merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, transactionAt: patch["transactionAt"]?.stringValue ?? old.transactionAt, note: note, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: ISO8601DateFormatter().string(from: Date()), deletedAt: old.deletedAt)
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.update", entityId: id, baseVersion: old.version, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            rebuildBudgetOverview(period: budgetOverview?.period ?? iTuCalendarSupport.monthString())
            return true
        } catch { return false }
    }

    @MainActor
    func deleteBudgetTransaction(id: String) async -> Bool {
        guard let old = currentSnapshot.budgetTransactions.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = BudgetTransactionModel(id: old.id, userId: old.userId, type: old.type, amount: old.amount, currency: old.currency, category: old.category, categoryId: old.categoryId, merchant: old.merchant, paymentMethod: old.paymentMethod, transactionAt: old.transactionAt, note: old.note, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: now, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "budgettransaction.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do {
            apply(try await offlineStore.saveBudgetTransaction(value, mutation: mutation))
            syncPhase = .pending
            rebuildBudgetOverview(period: budgetOverview?.period ?? iTuCalendarSupport.monthString())
            return true
        } catch { return false }
    }

    @MainActor
    private func rebuildBudgetOverview(period: String) {
        guard let periodModel = budgetPeriods.first(where: { $0.period == period }) else { return }
        let transactions = budgetTransactions.filter { budgetTransactionMonth($0.transactionAt) == period && $0.deletedAt == nil }
        let income = transactions.filter { $0.type.uppercased() == "INCOME" }.reduce(0) { $0 + $1.amount }
        let spentByCategory = transactions.filter { $0.type.uppercased() != "INCOME" }.reduce(into: [String: Double]()) { result, transaction in
            guard let categoryID = transaction.categoryId else { return }
            result[categoryID, default: 0] += transaction.amount
        }
        let spent = spentByCategory.values.reduce(0, +)
        let categoryStats = budgetCategories.filter { $0.archivedAt == nil }.map { category in
            let budget = periodModel.categoryBudgets.first(where: { $0.categoryId == category.id })?.limit ?? 0
            let categorySpent = spentByCategory[category.id] ?? 0
            let remaining = max(0, budget - categorySpent)
            let percentage = budget > 0 ? min(100, (categorySpent / budget) * 100) : 0
            return BudgetCategoryStatModel(category: category, budget: budget, spent: categorySpent, remaining: remaining, percentage: percentage)
        }
        let overallBudget = periodModel.overallLimit
        budgetOverview = BudgetOverviewModel(period: period, currency: periodModel.currency, income: income, spent: spent, overallBudget: overallBudget, remainingBudget: max(0, overallBudget - spent), categories: categoryStats)
    }

    private func budgetTransactionMonth(_ value: String) -> String {
        if let date = ISO8601DateFormatter().date(from: value) { return iTuCalendarSupport.monthString(date) }
        return String(value.prefix(7))
    }

    @MainActor
    func loadGymOverview() async {
        do {
            gymOverview = try await apiClient.getGymOverview()
        } catch {}
    }

    @MainActor
    func loadGymExercises() async {
        do {
            apply(try await offlineStore.replaceGymExercises(try await apiClient.getGymExercises()))
        } catch {}
    }

    @MainActor
    func createGymExercise(
        name: String,
        description: String,
        metricType: String,
        equipment: String,
        primaryMuscleGroup: String,
        imageData: Data? = nil,
        fileName: String,
        mimeType: String
    ) async -> Bool {
        let id = ULID.generate()
        let value = ExerciseModel(id: id, userId: user?.id ?? "", name: name, normalizedName: name.lowercased(), description: description.isEmpty ? nil : description, imageStorageKey: nil, imageUrl: nil, metricType: metricType, equipment: equipment.isEmpty ? nil : equipment, primaryMuscleGroup: primaryMuscleGroup.isEmpty ? nil : primaryMuscleGroup, secondaryMuscleGroups: [], defaultWeightUnit: gymPreferences.weightUnit, defaultRestSeconds: gymPreferences.defaultRestSeconds, archivedAt: nil, deletedAt: nil, version: 1)
        let payload: [String: JSONValue] = ["name": .string(name), "metricType": .string(metricType), "description": description.isEmpty ? .null : .string(description), "equipment": equipment.isEmpty ? .null : .string(equipment), "primaryMuscleGroup": primaryMuscleGroup.isEmpty ? .null : .string(primaryMuscleGroup), "defaultWeightUnit": .string(gymPreferences.weightUnit), "defaultRestSeconds": .number(Double(gymPreferences.defaultRestSeconds))]
        do {
            apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            if let imageData { apply(try await offlineStore.queueGymExerciseImage(id: id, data: imageData)) }
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func loadGymWorkouts() async {
        do {
            apply(try await offlineStore.replaceGymWorkouts(try await apiClient.getGymWorkouts()))
        } catch {}
    }

    @MainActor
    func startGymWorkout(title: String? = nil) async -> WorkoutModel? {
        let id = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let workout = WorkoutModel(id: id, userId: user?.id ?? "", title: title ?? "Workout", status: "IN_PROGRESS", startedAt: now, endedAt: nil, durationMinutes: nil, exercises: [], version: 1, deletedAt: nil)
        do {
            guard !gymWorkouts.contains(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }) else { return gymWorkouts.first(where: { ["IN_PROGRESS", "ACTIVE"].contains($0.status) }) }
            apply(try await offlineStore.saveWorkout(workout, mutation: SyncMutation(id: ULID.generate(), kind: "workout.create", entityId: id, baseVersion: nil, payload: ["title": .string(workout.title), "startedAt": .string(now)], occurredAt: now)))
            return workout
        } catch { return nil }
    }

    @MainActor
    func updateGymExercise(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let value = ExerciseModel(id: old.id, userId: old.userId, name: patch["name"]?.stringValue ?? old.name, normalizedName: (patch["name"]?.stringValue ?? old.name).lowercased(), description: patch["description"]?.stringValue ?? old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: patch["metricType"]?.stringValue ?? old.metricType, equipment: patch["equipment"]?.stringValue ?? old.equipment, primaryMuscleGroup: patch["primaryMuscleGroup"]?.stringValue ?? old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: patch["defaultWeightUnit"]?.stringValue ?? old.defaultWeightUnit, defaultRestSeconds: patch["defaultRestSeconds"]?.numberValue.map(Int.init) ?? old.defaultRestSeconds, archivedAt: old.archivedAt, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1)
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func archiveGymExercise(id: String) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let archivedAt = ISO8601DateFormatter().string(from: Date())
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, archivedAt: archivedAt, deletedAt: old.deletedAt, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId)
        let patch: [String: JSONValue] = ["archivedAt": .string(archivedAt)]
        do { apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: archivedAt), occurredAt: archivedAt))); return true } catch { return false }
    }

    @MainActor
    func loadGymExerciseStats(id: String) async {
        gymExerciseStats[id] = try? await apiClient.getGymExerciseStats(id: id)
    }

    @MainActor
    func completeGymWorkout(id: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }), ["IN_PROGRESS", "ACTIVE"].contains(old.status) else { return false }
        let endedAt = ISO8601DateFormatter().string(from: Date())
        let durationMinutes = gymDurationMinutes(startedAt: old.startedAt, endedAt: endedAt) ?? old.durationMinutes
        let completedExercises = (old.exercises ?? []).compactMap { exercise -> WorkoutExerciseModel? in
            let completedSets = (exercise.sets ?? []).filter { $0.completedAt != nil }
            guard !completedSets.isEmpty else { return nil }
            return WorkoutExerciseModel(id: exercise.id, workoutEntryId: exercise.workoutEntryId, exerciseId: exercise.exerciseId, sortOrder: exercise.sortOrder, note: exercise.note, restSeconds: exercise.restSeconds, exercise: exercise.exercise, sets: completedSets, version: exercise.version, deletedAt: exercise.deletedAt)
        }
        let value = WorkoutModel(id: old.id, userId: old.userId, title: old.title, status: "COMPLETED", startedAt: old.startedAt, endedAt: endedAt, durationMinutes: durationMinutes, exercises: completedExercises, version: (old.version ?? 1) + 1, deletedAt: old.deletedAt, deletedByDeviceId: old.deletedByDeviceId)
        let payload: [String: JSONValue] = ["status": .string("COMPLETED"), "endedAt": .string(endedAt), "durationMinutes": durationMinutes.map { .number(Double($0)) } ?? .null]
        do {
            apply(try await offlineStore.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "workout.finish", entityId: id, baseVersion: old.version, payload: payload, fieldEditedAt: gymFieldEditedAt(payload, at: endedAt), occurredAt: endedAt)))
            return true
        } catch { return false }
    }

    @MainActor
    func addGymExercise(workoutID: String, exerciseID: String) async -> WorkoutExerciseModel? {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }),
              let exercise = gymExercises.first(where: { $0.id == exerciseID && $0.deletedAt == nil }) else { return nil }
        let existing = workout.exercises ?? []
        guard !existing.contains(where: { $0.exerciseId == exerciseID }) else { return existing.first(where: { $0.exerciseId == exerciseID }) }
        let id = ULID.generate()
        let value = WorkoutExerciseModel(id: id, workoutEntryId: workoutID, exerciseId: exerciseID, sortOrder: existing.count, note: nil, restSeconds: exercise.defaultRestSeconds ?? gymPreferences.defaultRestSeconds, exercise: exercise, sets: [])
        let payload: [String: JSONValue] = ["workoutId": .string(workoutID), "exerciseId": .string(exerciseID), "sortOrder": .number(Double(value.sortOrder)), "restSeconds": .number(Double(value.restSeconds ?? gymPreferences.defaultRestSeconds))]
        do {
            apply(try await offlineStore.saveWorkoutExercise(value, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            var recent = gymPreferences.recentExerciseIDs.filter { $0 != exerciseID }
            recent.insert(exerciseID, at: 0); recent = Array(recent.prefix(12))
            _ = await updateGymPreferences(patch: ["recentExerciseIDs": .array(recent.map(JSONValue.string))])
            return value
        } catch { return nil }
    }

    @MainActor
    func addGymSet(workoutID: String, workoutExerciseID: String) async -> WorkoutSetModel? {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }),
              let exercise = workout.exercises?.first(where: { $0.id == workoutExerciseID }) else { return nil }
        let previous = exercise.sets?.last
        let metric = exercise.exercise?.metricType ?? "WEIGHT_REPS"
        let set = WorkoutSetModel(id: ULID.generate(), workoutExerciseId: workoutExerciseID, sortOrder: exercise.sets?.count ?? 0, type: "NORMAL", reps: metric == "DURATION" || metric == "DISTANCE_DURATION" ? nil : previous?.reps, weight: metric == "WEIGHT_REPS" ? previous?.weight : nil, durationSeconds: ["DURATION", "DISTANCE_DURATION"].contains(metric) ? previous?.durationSeconds : nil, distanceMeters: metric == "DISTANCE_DURATION" ? previous?.distanceMeters : nil, rpe: nil, completedAt: nil)
        let payload: [String: JSONValue] = ["workoutExerciseId": .string(workoutExerciseID), "sortOrder": .number(Double(set.sortOrder)), "type": .string(set.type), "reps": set.reps.map { .number(Double($0)) } ?? .null, "weight": set.weight.map(JSONValue.number) ?? .null, "durationSeconds": set.durationSeconds.map { .number(Double($0)) } ?? .null, "distanceMeters": set.distanceMeters.map(JSONValue.number) ?? .null]
        do {
            apply(try await offlineStore.saveWorkoutSet(set, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.create", entityId: set.id, baseVersion: nil, payload: payload, occurredAt: ISO8601DateFormatter().string(from: Date()))))
            return set
        } catch { return nil }
    }

    @MainActor
    func updateGymSet(workoutID: String, workoutExerciseID: String, setID: String, patch: [String: JSONValue], complete: Bool = false) async -> Bool {
        guard let workout = gymWorkouts.first(where: { $0.id == workoutID }), let exercise = workout.exercises?.first(where: { $0.id == workoutExerciseID }), let old = exercise.sets?.first(where: { $0.id == setID }) else { return false }
        let completedAt: String?
        if case .null? = patch["completedAt"] {
            completedAt = nil
        } else {
            completedAt = patch["completedAt"]?.stringValue ?? old.completedAt
        }
        let value = WorkoutSetModel(id: old.id, workoutExerciseId: old.workoutExerciseId, sortOrder: old.sortOrder, type: patch["type"]?.stringValue ?? old.type, reps: patch["reps"]?.numberValue.map(Int.init) ?? old.reps, weight: patch["weight"]?.numberValue ?? old.weight, durationSeconds: patch["durationSeconds"]?.numberValue.map(Int.init) ?? old.durationSeconds, distanceMeters: patch["distanceMeters"]?.numberValue ?? old.distanceMeters, rpe: patch["rpe"]?.numberValue ?? old.rpe, completedAt: completedAt, version: (old.version ?? 1) + 1, deletedAt: old.deletedAt)
        let mutationKind = complete ? "workout-set.complete" : "workout-set.update"
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveWorkoutSet(value, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: mutationKind, entityId: setID, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func removeGymSet(workoutID: String, workoutExerciseID: String, setID: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID })?.sets?.first(where: { $0.id == setID }) else { return false }
        do { apply(try await offlineStore.removeWorkoutSet(id: setID, workoutID: workoutID, workoutExerciseID: workoutExerciseID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-set.delete", entityId: setID, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func removeGymExercise(workoutID: String, workoutExerciseID: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == workoutID })?.exercises?.first(where: { $0.id == workoutExerciseID }) else { return false }
        do { apply(try await offlineStore.removeWorkoutExercise(id: workoutExerciseID, workoutID: workoutID, mutation: SyncMutation(id: ULID.generate(), kind: "workout-exercise.delete", entityId: workoutExerciseID, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func gymPreviousSet(exerciseID: String) -> WorkoutSetModel? {
        gymWorkouts.filter { $0.status == "COMPLETED" }.sorted { ($0.endedAt ?? $0.startedAt ?? "") > ($1.endedAt ?? $1.startedAt ?? "") }.lazy.compactMap { workout in workout.exercises?.first(where: { $0.exerciseId == exerciseID })?.sets?.filter { $0.completedAt != nil }.last }.first
    }

    @MainActor
    func gymStats(exerciseID: String) -> ExerciseStatsModel {
        let completed = gymWorkouts.filter { $0.status == "COMPLETED" }
        let sets = completed.flatMap { $0.exercises ?? [] }.filter { $0.exerciseId == exerciseID }.flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }
        let weightSets = sets.compactMap { set -> (Double, Int)? in guard let weight = set.weight, let reps = set.reps else { return nil }; return (weight, reps) }
        let bestWeight = weightSets.map(\.0).max()
        let bestReps = weightSets.map(\.1).max()
        let volume = weightSets.reduce(0) { $0 + $1.0 * Double($1.1) }
        let estimated = weightSets.map { $0.0 * (1 + Double($0.1) / 30) }.max()
        let trend = completed.sorted { ($0.startedAt ?? "") < ($1.startedAt ?? "") }.map { workout in
            (workout.exercises ?? []).first(where: { $0.exerciseId == exerciseID })?.sets?.filter { $0.completedAt != nil }.reduce(0) { total, set in total + (set.weight ?? 0) * Double(set.reps ?? 0) } ?? 0
        }
        var recentSets: [WorkoutSetModel] = []
        for workout in completed {
            for exercise in workout.exercises ?? [] where exercise.exerciseId == exerciseID {
                recentSets.append(contentsOf: (exercise.sets ?? []).filter { $0.completedAt != nil })
            }
        }
        recentSets.sort { ($0.completedAt ?? "") > ($1.completedAt ?? "") }
        return ExerciseStatsModel(exercise: gymExercises.first(where: { $0.id == exerciseID }), totalSets: sets.count, totalVolumeKg: volume, bestWeight: bestWeight, bestReps: bestReps, lastPerformedAt: completed.sorted { ($0.startedAt ?? "") > ($1.startedAt ?? "") }.first?.startedAt, estimated1RM: estimated, volumeTrend: trend, recentSets: Array(recentSets.prefix(8)))
    }

    @MainActor
    func updateGymWorkout(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }) else { return false }
        let value: WorkoutModel
        if let encoded = try? JSONEncoder().encode(old), case var .object(fields) = (try? JSONDecoder().decode(JSONValue.self, from: encoded)), let merged = try? JSONEncoder().encode(JSONValue.object(fields.merging(patch) { _, latest in latest })), let decoded = try? JSONDecoder().decode(WorkoutModel.self, from: merged) {
            var copy = decoded
            copy = WorkoutModel(id: copy.id, userId: copy.userId, title: copy.title, status: copy.status, startedAt: copy.startedAt, endedAt: copy.endedAt, durationMinutes: copy.durationMinutes, exercises: copy.exercises, version: (old.version ?? 1) + 1, deletedAt: copy.deletedAt, deletedByDeviceId: copy.deletedByDeviceId)
            value = copy
        } else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        do { apply(try await offlineStore.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "workout.update", entityId: id, baseVersion: old.version, payload: patch, fieldEditedAt: gymFieldEditedAt(patch, at: now), occurredAt: now))); return true } catch { return false }
    }

    @MainActor
    func deleteGymWorkout(id: String) async -> Bool {
        guard let old = currentSnapshot.gymWorkouts.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = WorkoutModel(id: old.id, userId: old.userId, title: old.title, status: old.status, startedAt: old.startedAt, endedAt: old.endedAt, durationMinutes: old.durationMinutes, exercises: old.exercises, version: (old.version ?? 1) + 1, deletedAt: now, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "gymworkout.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do { apply(try await offlineStore.saveWorkout(value, mutation: mutation)); syncPhase = .pending; return true } catch { return false }
    }

    @MainActor
    func deleteGymExercise(id: String) async -> Bool {
        guard let old = currentSnapshot.gymExercises.first(where: { $0.id == id }), old.deletedAt == nil else { return false }
        let now = ISO8601DateFormatter().string(from: Date())
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, archivedAt: old.archivedAt, deletedAt: now, version: (old.version ?? 1) + 1, deletedByDeviceId: old.deletedByDeviceId)
        let mutation = SyncMutation(id: ULID.generate(), kind: "exercisedefinition.delete", entityId: id, baseVersion: old.version, payload: ["deletedAt": .string(now)], occurredAt: now)
        do { apply(try await offlineStore.saveExercise(value, mutation: mutation)); syncPhase = .pending; return true } catch { return false }
    }

}

private func gymFieldEditedAt(_ patch: [String: JSONValue], at timestamp: String) -> [String: String]? {
    guard !patch.isEmpty else { return nil }
    return Dictionary(uniqueKeysWithValues: patch.keys.map { ($0, timestamp) })
}

private func gymDurationMinutes(startedAt: String?, endedAt: String) -> Int? {
    guard let startedAt,
          let start = ISO8601DateFormatter().date(from: startedAt),
          let end = ISO8601DateFormatter().date(from: endedAt) else { return nil }
    return max(0, Int(end.timeIntervalSince(start) / 60.0))
}

private extension BudgetOverviewModel {
    init(period: String, currency: String, income: Double, spent: Double, overallBudget: Double, remainingBudget: Double, categories: [BudgetCategoryStatModel]) {
        self.period = period
        self.currency = currency
        self.income = income
        self.spent = spent
        self.overallBudget = overallBudget
        self.remainingBudget = remainingBudget
        self.categories = categories
    }
}

private extension BudgetCategoryStatModel {
    init(category: BudgetCategoryModel, budget: Double, spent: Double, remaining: Double, percentage: Double) {
        self.category = category
        self.budget = budget
        self.spent = spent
        self.remaining = remaining
        self.percentage = percentage
    }
}
