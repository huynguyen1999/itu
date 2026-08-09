import Foundation

extension AppModel {
    @MainActor
    func loadBudgetOverview(period: String? = nil) async {
        do {
            budgetOverview = try await apiClient.getBudgetOverview(period: period)
        } catch {
            // Silently retain existing state on error
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
        do {
            _ = try await apiClient.createBudgetCategory(name: name, type: type, icon: icon, color: color)
            await loadBudgetCategories()
            await loadBudgetOverview()
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func updateBudgetCategory(id: String, name: String, type: String, icon: String, color: String) async -> Bool {
        do {
            _ = try await apiClient.updateBudgetCategory(id: id, name: name, type: type, icon: icon, color: color)
            await loadBudgetCategories()
            await loadBudgetOverview()
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func archiveBudgetCategory(id: String) async -> Bool {
        do {
            _ = try await apiClient.archiveBudgetCategory(id: id)
            await loadBudgetCategories()
            await loadBudgetOverview()
            return true
        } catch {
            return false
        }
    }

    @MainActor
    func loadBudgetTransactions(period: String? = nil) async {
        do {
            budgetTransactions = try await apiClient.getBudgetTransactions(period: period)
        } catch {}
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
        imageData: Data,
        fileName: String,
        mimeType: String
    ) async -> Bool {
        do {
            let exercise = try await apiClient.createGymExercise(
                name: name,
                description: description.isEmpty ? nil : description,
                metricType: metricType,
                equipment: equipment.isEmpty ? nil : equipment,
                primaryMuscleGroup: primaryMuscleGroup.isEmpty ? nil : primaryMuscleGroup
            )
            do {
                _ = try await apiClient.uploadGymExerciseImage(id: exercise.id, fileData: imageData, fileName: fileName, mimeType: mimeType)
            } catch {
                try? await apiClient.archiveGymExercise(id: exercise.id)
                return false
            }
            await loadGymExercises()
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
        do {
            let workout = try await apiClient.createGymWorkout(title: title)
            await loadGymOverview()
            await loadGymWorkouts()
            return workout
        } catch {
            return nil
        }
    }
}
