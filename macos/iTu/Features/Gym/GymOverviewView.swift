import SwiftUI

struct GymOverviewView: View {
    @Environment(AppModel.self) private var model
    var onStartWorkoutClicked: () -> Void
    var onContinueWorkoutClicked: () -> Void

    private var unit: String {
        model.gymPreferences.weightUnit
    }

    private var overview: GymOverviewModel? {
        model.gymOverview
    }

    private var activeWorkout: WorkoutModel? {
        model.gymWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) && $0.deletedAt == nil }
            ?? overview?.recentWorkouts.first { ["IN_PROGRESS", "ACTIVE"].contains($0.status) && $0.deletedAt == nil }
    }

    private var recentWorkouts: [WorkoutModel] {
        model.gymWorkouts.filter { $0.deletedAt == nil && $0.status == "COMPLETED" }.prefix(5).map { $0 }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // "Ready to Train" Hero Banner
            HStack(spacing: 16) {
                Image(systemName: activeWorkout != nil ? "figure.strengthtraining.traditional" : "bolt.fill")
                    .font(.system(size: 28))
                    .foregroundStyle(iTuTheme.teal)

                VStack(alignment: .leading, spacing: 2) {
                    Text(activeWorkout != nil ? "ACTIVE WORKOUT IN PROGRESS" : "READY TO TRAIN?")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.mint)
                    Text(activeWorkout?.title ?? "Log today's training session")
                        .font(.system(size: 20, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text(activeWorkout != nil ? "Resume logging sets, rest timer, and exercises." : "Track your sets, volume, and personal records seamlessly.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                Spacer()

                if activeWorkout != nil {
                    Button {
                        onContinueWorkoutClicked()
                    } label: {
                        Label("Continue Workout", systemImage: "arrow.right.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .controlSize(.regular)
                } else {
                    Button {
                        onStartWorkoutClicked()
                    } label: {
                        Label("Start Workout", systemImage: "plus")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(iTuTheme.teal)
                    .controlSize(.regular)
                }
            }
            .padding(16)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }

            // 3 Stats Metric Cards
            HStack(spacing: 14) {
                metricCard(
                    title: "THIS WEEK WORKOUTS",
                    value: "\(overview?.weeklyWorkoutsCount ?? recentWorkouts.count)",
                    subtitle: "Completed sessions",
                    tint: iTuTheme.teal
                )
                metricCard(
                    title: "TOTAL SETS",
                    value: "\(overview?.weeklySetsCount ?? totalLoggedSets)",
                    subtitle: "Logged sets",
                    tint: iTuTheme.amber
                )
                metricCard(
                    title: "TOTAL VOLUME",
                    value: "\(overview?.weeklyVolumeKg ?? Int(totalLifetimeVolume)) \(unit.lowercased())",
                    subtitle: "Volume lifted",
                    tint: iTuTheme.mint
                )
            }

            // Recent Workouts Section
            VStack(alignment: .leading, spacing: 12) {
                Text("RECENT WORKOUT SESSIONS")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if recentWorkouts.isEmpty {
                    Text("No completed workouts yet. Start your first workout above.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.vertical, 12)
                } else {
                    VStack(spacing: 8) {
                        ForEach(recentWorkouts) { workout in
                            workoutCard(workout)
                        }
                    }
                }
            }
        }
    }

    private var totalLoggedSets: Int {
        model.gymWorkouts.flatMap { $0.exercises ?? [] }.flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }.count
    }

    private var totalLifetimeVolume: Double {
        model.gymWorkouts.filter { $0.status == "COMPLETED" }.reduce(0) { $0 + GymSupport.workoutVolume(for: $1) }
    }

    private func metricCard(title: String, value: String, subtitle: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .bold, design: .monospaced))
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
            Text(subtitle)
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func workoutCard(_ workout: WorkoutModel) -> some View {
        let volume = GymSupport.workoutVolume(for: workout)
        let exCount = workout.exercises?.count ?? 0
        let dateStr = String((workout.startedAt ?? "").prefix(10))

        return HStack(spacing: 12) {
            Circle()
                .fill(iTuTheme.teal.opacity(0.15))
                .frame(width: 32, height: 32)
                .overlay {
                    Image(systemName: "figure.strengthtraining.traditional")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.teal)
                }

            VStack(alignment: .leading, spacing: 2) {
                Text(workout.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)
                Text("\(exCount) exercises · \(dateStr)")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text("\(Int(volume)) \(unit.lowercased())")
                    .font(.system(size: 13, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.ink)
                if let mins = workout.durationMinutes, mins > 0 {
                    Text("\(mins)m")
                        .font(.system(size: 10, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
        }
        .padding(12)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }
}
