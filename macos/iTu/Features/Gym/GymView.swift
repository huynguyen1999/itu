import SwiftUI

struct GymView: View {
    @Environment(AppModel.self) private var model
    @SceneStorage("gym.selectedTab") private var selectedTab = "Overview"
    @SceneStorage("gym.historyFilter") private var historyFilter = "COMPLETED"
    @State private var showingGymSettings = false
    @State private var editingWorkoutID: String?

    private var activeWorkout: WorkoutModel? {
        model.gymWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) && $0.deletedAt == nil }
            ?? model.gymOverview?.recentWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) && $0.deletedAt == nil }
    }

    var body: some View {
        HStack(spacing: 0) {
            secondaryRail

            VStack(alignment: .leading, spacing: 0) {
                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        switch selectedTab {
                        case "Active":
                            if let editingWorkout = editingWorkoutID.flatMap({ id in model.gymWorkouts.first(where: { $0.id == id }) }) {
                                ActiveWorkoutView(
                                    workout: editingWorkout,
                                    onFinished: { editingWorkoutID = nil; selectedTab = "History" },
                                    onDiscarded: { editingWorkoutID = nil; selectedTab = "History" },
                                    isHistorical: true
                                )
                            } else if let activeWorkout {
                                ActiveWorkoutView(
                                    workout: activeWorkout,
                                    onFinished: { selectedTab = "History" },
                                    onDiscarded: { selectedTab = "Overview" }
                                )
                            } else {
                                GymOverviewView(
                                    onStartWorkoutClicked: { startWorkout() },
                                    onContinueWorkoutClicked: { selectedTab = "Active" }
                                )
                            }
                        case "Routines":
                            GymRoutinesView(onStartWorkout: { routineId in
                                Task {
                                    if await model.startGymWorkoutFromRoutine(routineId: routineId) != nil {
                                        selectedTab = "Active"
                                    }
                                }
                            })
                        case "History":
                            GymHistoryView(
                                historyFilter: $historyFilter,
                                onRepeatWorkout: { workoutID in
                                    Task {
                                        if await model.repeatGymWorkout(workoutId: workoutID) != nil { selectedTab = "Active" }
                                    }
                                },
                                onSaveAsRoutine: { workoutID in
                                    Task { _ = await model.createGymRoutineFromWorkout(workoutId: workoutID) }
                                },
                                onUpdateRoutine: { routineID, workoutID in
                                    Task { _ = await model.updateGymRoutineFromWorkout(routineId: routineID, workoutId: workoutID) }
                                },
                                onEditWorkout: { workoutID in
                                    editingWorkoutID = workoutID
                                    selectedTab = "Active"
                                }
                            )
                        case "Exercises":
                            ExerciseLibraryView()
                        default:
                            GymOverviewView(
                                onStartWorkoutClicked: { startWorkout() },
                                onContinueWorkoutClicked: { selectedTab = "Active" }
                            )
                        }
                    }
                    .padding(24)
                }
                .iTuPinnedHeader { pageHeader }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        }
        .background(iTuTheme.canvas)
        .task {
            await model.refreshCoordinator.run(.gym, force: false) {
                async let overview: Void = model.loadGymOverview()
                async let routines: Void = model.loadGymRoutines()
                async let exercises: Void = model.loadGymExercises()
                async let workouts: Void = model.loadGymWorkouts()
                _ = await (overview, routines, exercises, workouts)
            }
        }
    }

    private var secondaryRail: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                Text("TRACKING")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Gym")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 22)

            Divider().overlay(iTuTheme.border)

            VStack(spacing: 4) {
                railButton("Overview", icon: "square.grid.2x2", tab: "Overview")
                railButton("Routines", icon: "list.bullet.clipboard", tab: "Routines")
                if activeWorkout != nil {
                    railButton("Active Session", icon: "figure.strengthtraining.traditional", tab: "Active", isHighlighted: true)
                }
                railButton("History", icon: "clock.arrow.circlepath", tab: "History")
                railButton("Exercises", icon: "dumbbell.fill", tab: "Exercises")
            }
            .padding(.horizontal, 10)
            .padding(.top, 14)

            Spacer()
        }
        .frame(width: 220)
        .background(iTuTheme.surface)
        .overlay(alignment: .trailing) {
            Rectangle().fill(iTuTheme.border).frame(width: 1)
        }
    }

    private func railButton(_ title: String, icon: String, tab: String, isHighlighted: Bool = false) -> some View {
        let isSelected = selectedTab == tab
        return Button {
            selectedTab = tab
        } label: {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 14))
                    .frame(width: 20)
                    .foregroundStyle(isSelected || isHighlighted ? iTuTheme.teal : iTuTheme.inkDim)
                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                    .foregroundStyle(isSelected ? iTuTheme.ink : (isHighlighted ? iTuTheme.teal : iTuTheme.inkDim))
                Spacer()
                if isHighlighted && !isSelected {
                    Circle()
                        .fill(iTuTheme.teal)
                        .frame(width: 6, height: 6)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 9)
            .background(isSelected ? iTuTheme.surfaceMuted : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }
            }
        }
        .buttonStyle(.plain)
    }

    private var pageHeader: some View {
        iTuPageHeader(
            kicker: "TRACKING",
            title: selectedTab == "Active" ? "Active Workout" : selectedTab,
            description: headerSubtitle,
            actions: {
                if activeWorkout != nil && selectedTab != "Active" {
                    Button {
                        selectedTab = "Active"
                    } label: {
                        Label("Resume Workout", systemImage: "figure.strengthtraining.traditional")
                    }
                    .buttonStyle(iTuHeaderSecondaryButtonStyle(height: 34))
                }

                Button("Gym settings", systemImage: "gearshape") {
                    showingGymSettings.toggle()
                }
                .labelStyle(.iconOnly)
                .buttonStyle(iTuHeaderGhostButtonStyle())
                .help("Gym preferences")
                .popover(isPresented: $showingGymSettings, arrowEdge: .top) {
                    GymSettingsPopoverView()
                }
            }
        )
    }

    private var headerSubtitle: String {
        switch selectedTab {
        case "Overview":
            return "Review weekly performance, volume trends, and start new training sessions."
        case "Active":
            return "Log active sets, track rest intervals, and record reps."
        case "History":
            return "Browse past training sessions and performance records."
        case "Exercises":
            return "Explore exercise library, instructions, and personal record progression."
        default:
            return "Gym & Fitness tracker."
        }
    }

    private func startWorkout() {
        Task {
            if await model.startGymWorkout() != nil {
                selectedTab = "Active"
            }
        }
    }
}
