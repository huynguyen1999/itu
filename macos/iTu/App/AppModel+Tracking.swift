import Foundation

extension AppModel {
    @MainActor
    func updateGymPreferences(patch: [String: JSONValue]) async -> Bool {
        var value = gymPreferences
        if let unit = patch["weightUnit"]?.stringValue { value.weightUnit = unit }
        if let rest = patch["defaultRestSeconds"]?.numberValue { value.defaultRestSeconds = Int(rest) }
        if let auto = patch["autoStartRestTimer"]?.boolValue { value.autoStartRestTimer = auto }
        do { apply(try await offlineStore.saveGymPreferences(value, mutation: SyncMutation(id: ULID.generate(), kind: "gympreferences.update", entityId: "gympreferences", baseVersion: nil, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
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
            // The persisted transaction/category snapshot remains visible offline.
        }
    }

    @MainActor
    func loadBudgetCategories() async {
        do {
            budgetCategories = try await apiClient.getBudgetCategories()
        } catch {}
    }

    @MainActor
    func createBudgetCategory(name: String, type: String, icon: String, color: String) async -> Bool {
        let id = ULID.generate()
        let value = BudgetCategoryModel(id: id, userId: user?.id ?? "", name: name, type: type, icon: icon, color: color, sortOrder: budgetCategories.count, archivedAt: nil, version: 1)
        let mutation = SyncMutation(id: ULID.generate(), kind: "moneycategory.create", entityId: id, baseVersion: nil, payload: ["name": .string(name), "type": .string(type), "icon": .string(icon), "color": .string(color)], occurredAt: ISO8601DateFormatter().string(from: Date()))
        do {
            apply(try await offlineStore.saveBudgetCategory(value, mutation: mutation))
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
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func loadBudgetTransactions(period: String? = nil, categoryID: String? = nil, type: String? = nil) async {
        do {
            budgetTransactions = try await apiClient.getBudgetTransactions(period: period, categoryID: categoryID, type: type)
        } catch { budgetTransactions = currentSnapshot.budgetTransactions }
    }

    @MainActor
    func updateBudgetPeriod(period: String, overallLimit: String) async -> Bool {
        let id = budgetPeriods.first(where: { $0.period == period })?.id ?? period
        let old = budgetPeriods.first(where: { $0.period == period })
        let value = BudgetPeriodModel(id: id, userId: user?.id ?? "", period: period, currency: budgetPreferences.defaultCurrency, overallLimit: Double(overallLimit) ?? 0, categoryBudgets: old?.categoryBudgets ?? [], version: (old?.version ?? 1) + 1)
        do { apply(try await offlineStore.saveBudgetPeriod(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneybudgetperiod.update", entityId: period, baseVersion: old?.version, payload: ["period": .string(period), "overallLimit": .string(overallLimit)], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func updateBudgetCategoryLimit(period: String, categoryID: String, limit: String) async -> Bool {
        let old = budgetPeriods.first(where: { $0.period == period })
        let categoryBudgets = (old?.categoryBudgets ?? []).filter { $0.categoryId != categoryID } + [BudgetCategoryBudgetModel(id: "\(period):\(categoryID)", budgetPeriodId: old?.id ?? period, categoryId: categoryID, limit: Double(limit) ?? 0, category: budgetCategories.first(where: { $0.id == categoryID }), version: 1)]
        let value = BudgetPeriodModel(id: old?.id ?? period, userId: user?.id ?? "", period: period, currency: old?.currency ?? budgetPreferences.defaultCurrency, overallLimit: old?.overallLimit ?? 0, categoryBudgets: categoryBudgets, version: (old?.version ?? 1) + 1)
        do { apply(try await offlineStore.saveBudgetPeriod(value, mutation: SyncMutation(id: ULID.generate(), kind: "moneycategorybudget.upsert", entityId: "\(period):\(categoryID)", baseVersion: old?.version, payload: ["period": .string(period), "categoryId": .string(categoryID), "limit": .string(limit)], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func createBudgetTransaction(amount: String, categoryID: String, type: String = "EXPENSE", merchant: String? = nil, paymentMethod: String = "CASH", transactionAt: String? = nil, note: String? = nil) async -> Bool {
        let id = ULID.generate(); let at = transactionAt ?? ISO8601DateFormatter().string(from: Date()); let value = BudgetTransactionModel(id: id, userId: user?.id ?? "", type: type, amount: Double(amount) ?? 0, currency: budgetPreferences.defaultCurrency, category: budgetCategories.first(where: { $0.id == categoryID })?.name ?? "Other", categoryId: categoryID, merchant: merchant, paymentMethod: paymentMethod, transactionAt: at, note: note, version: 1, createdAt: at, updatedAt: at, deletedAt: nil)
        var payload: [String: JSONValue] = ["amount": .string(amount), "currency": .string(value.currency), "type": .string(type), "categoryId": .string(categoryID), "paymentMethod": .string(paymentMethod), "transactionAt": .string(at)]
        payload["merchant"] = merchant.map(JSONValue.string) ?? .null; payload["note"] = note.map(JSONValue.string) ?? .null
        do { apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.create", entityId: id, baseVersion: nil, payload: payload, occurredAt: at))); return true } catch { return false }
    }

    @MainActor
    func updateBudgetTransaction(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = budgetTransactions.first(where: { $0.id == id }) else { return false }
        let value = BudgetTransactionModel(id: old.id, userId: old.userId, type: patch["type"]?.stringValue ?? old.type, amount: patch["amount"]?.stringValue.flatMap(Double.init) ?? old.amount, currency: patch["currency"]?.stringValue ?? old.currency, category: patch["category"]?.stringValue ?? old.category, categoryId: patch["categoryId"]?.stringValue ?? old.categoryId, merchant: patch["merchant"]?.stringValue ?? old.merchant, paymentMethod: patch["paymentMethod"]?.stringValue ?? old.paymentMethod, transactionAt: patch["transactionAt"]?.stringValue ?? old.transactionAt, note: patch["note"]?.stringValue ?? old.note, version: (old.version ?? 1) + 1, createdAt: old.createdAt, updatedAt: ISO8601DateFormatter().string(from: Date()), deletedAt: old.deletedAt)
        do { apply(try await offlineStore.saveBudgetTransaction(value, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.update", entityId: id, baseVersion: old.version, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func deleteBudgetTransaction(id: String) async -> Bool {
        guard let old = budgetTransactions.first(where: { $0.id == id }) else { return false }
        do { apply(try await offlineStore.saveBudgetTransaction(old, mutation: SyncMutation(id: ULID.generate(), kind: "budgettransaction.delete", entityId: id, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); budgetTransactions.removeAll { $0.id == id }; return true } catch { return false }
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
            gymExercises = try await apiClient.getGymExercises()
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
        let value = ExerciseModel(id: id, userId: user?.id ?? "", name: name, normalizedName: name.lowercased(), description: description.isEmpty ? nil : description, imageStorageKey: nil, imageUrl: nil, metricType: metricType, equipment: equipment.isEmpty ? nil : equipment, primaryMuscleGroup: primaryMuscleGroup.isEmpty ? nil : primaryMuscleGroup, secondaryMuscleGroups: [], defaultWeightUnit: gymPreferences.weightUnit, defaultRestSeconds: gymPreferences.defaultRestSeconds, archivedAt: nil, version: 1)
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
            gymWorkouts = try await apiClient.getGymWorkouts()
        } catch {}
    }

    @MainActor
    func startGymWorkout(title: String? = nil) async -> WorkoutModel? {
        let id = ULID.generate()
        let now = ISO8601DateFormatter().string(from: Date())
        let workout = WorkoutModel(id: id, userId: user?.id ?? "", title: title ?? "Workout", status: "IN_PROGRESS", startedAt: now, endedAt: nil, durationMinutes: nil, exercises: [], version: 1, deletedAt: nil)
        do {
            apply(try await offlineStore.saveWorkout(workout, mutation: SyncMutation(id: ULID.generate(), kind: "gymworkout.create", entityId: id, baseVersion: nil, payload: ["title": .string(workout.title), "status": .string(workout.status), "startedAt": .string(now)], occurredAt: now)))
            return workout
        } catch { return nil }
    }

    @MainActor
    func updateGymExercise(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let value = ExerciseModel(id: old.id, userId: old.userId, name: patch["name"]?.stringValue ?? old.name, normalizedName: (patch["name"]?.stringValue ?? old.name).lowercased(), description: patch["description"]?.stringValue ?? old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: patch["metricType"]?.stringValue ?? old.metricType, equipment: patch["equipment"]?.stringValue ?? old.equipment, primaryMuscleGroup: patch["primaryMuscleGroup"]?.stringValue ?? old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: patch["defaultWeightUnit"]?.stringValue ?? old.defaultWeightUnit, defaultRestSeconds: patch["defaultRestSeconds"]?.numberValue.map(Int.init) ?? old.defaultRestSeconds, archivedAt: old.archivedAt, version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.update", entityId: id, baseVersion: old.version, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func archiveGymExercise(id: String) async -> Bool {
        guard let old = gymExercises.first(where: { $0.id == id }) else { return false }
        let value = ExerciseModel(id: old.id, userId: old.userId, name: old.name, normalizedName: old.normalizedName, description: old.description, imageStorageKey: old.imageStorageKey, imageUrl: old.imageUrl, metricType: old.metricType, equipment: old.equipment, primaryMuscleGroup: old.primaryMuscleGroup, secondaryMuscleGroups: old.secondaryMuscleGroups, defaultWeightUnit: old.defaultWeightUnit, defaultRestSeconds: old.defaultRestSeconds, archivedAt: ISO8601DateFormatter().string(from: Date()), version: (old.version ?? 1) + 1)
        do { apply(try await offlineStore.saveExercise(value, mutation: SyncMutation(id: ULID.generate(), kind: "exercisedefinition.delete", entityId: id, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func loadGymExerciseStats(id: String) async {
        gymExerciseStats[id] = try? await apiClient.getGymExerciseStats(id: id)
    }

    @MainActor
    func completeGymWorkout(id: String) async -> Bool { await updateGymWorkout(id: id, patch: ["status": .string("COMPLETED"), "endedAt": .string(ISO8601DateFormatter().string(from: Date()))]) }

    @MainActor
    func updateGymWorkout(id: String, patch: [String: JSONValue]) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }) else { return false }
        let value: WorkoutModel
        if let encoded = try? JSONEncoder().encode(old), case var .object(fields) = (try? JSONDecoder().decode(JSONValue.self, from: encoded)), let merged = try? JSONEncoder().encode(JSONValue.object(fields.merging(patch) { _, latest in latest })), let decoded = try? JSONDecoder().decode(WorkoutModel.self, from: merged) {
            var copy = decoded
            copy = WorkoutModel(id: copy.id, userId: copy.userId, title: copy.title, status: copy.status, startedAt: copy.startedAt, endedAt: copy.endedAt, durationMinutes: copy.durationMinutes, exercises: copy.exercises, version: (old.version ?? 1) + 1, deletedAt: copy.deletedAt)
            value = copy
        } else { return false }
        do { apply(try await offlineStore.saveWorkout(value, mutation: SyncMutation(id: ULID.generate(), kind: "gymworkout.update", entityId: id, baseVersion: old.version, payload: patch, occurredAt: ISO8601DateFormatter().string(from: Date())))); return true } catch { return false }
    }

    @MainActor
    func deleteGymWorkout(id: String) async -> Bool {
        guard let old = gymWorkouts.first(where: { $0.id == id }) else { return false }
        do { apply(try await offlineStore.saveWorkout(old, mutation: SyncMutation(id: ULID.generate(), kind: "gymworkout.delete", entityId: id, baseVersion: old.version, payload: [:], occurredAt: ISO8601DateFormatter().string(from: Date())))); gymWorkouts.removeAll { $0.id == id }; return true } catch { return false }
    }

    @MainActor
    func createCompletedGymWorkout(title: String? = nil) async -> WorkoutModel? {
        let id = ULID.generate(); let now = ISO8601DateFormatter().string(from: Date())
        let workout = WorkoutModel(id: id, userId: user?.id ?? "", title: title ?? "Workout", status: "COMPLETED", startedAt: now, endedAt: now, durationMinutes: 0, exercises: [], version: 1, deletedAt: nil)
        do { apply(try await offlineStore.saveWorkout(workout, mutation: SyncMutation(id: ULID.generate(), kind: "gymworkout.create", entityId: id, baseVersion: nil, payload: ["title": .string(workout.title), "status": .string("COMPLETED"), "startedAt": .string(now), "endedAt": .string(now)], occurredAt: now))); return workout } catch { return nil }
    }
}
