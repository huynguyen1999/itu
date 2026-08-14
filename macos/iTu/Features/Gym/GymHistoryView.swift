import SwiftUI

struct GymHistoryView: View {
    @Environment(AppModel.self) private var model
    @Binding var historyFilter: String

    private var unit: String {
        model.gymPreferences.weightUnit
    }

    private var visibleWorkouts: [WorkoutModel] {
        model.gymWorkouts.filter { $0.deletedAt == nil }
    }

    private var completedWorkouts: [WorkoutModel] {
        visibleWorkouts.filter { $0.status == "COMPLETED" }
    }

    private var displayedWorkouts: [WorkoutModel] {
        historyFilter == "COMPLETED" ? completedWorkouts : visibleWorkouts
    }

    private var allCompletedSets: [WorkoutSetModel] {
        completedWorkouts.flatMap { $0.exercises ?? [] }.flatMap { $0.sets ?? [] }.filter { $0.completedAt != nil }
    }

    private var bestWeightLifetime: Double {
        allCompletedSets.compactMap(\.weight).max() ?? 0
    }

    private var best1RMLifetime: Double {
        allCompletedSets.map { GymSupport.calculate1RM(weight: $0.weight ?? 0, reps: $0.reps ?? 0) }.max() ?? 0
    }

    private var volumeTrend: [Double] {
        Array(completedWorkouts.prefix(7).reversed()).map { GymSupport.workoutVolume(for: $0) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            // Filter Selector
            HStack {
                Picker("Filter", selection: $historyFilter) {
                    Text("Completed Only").tag("COMPLETED")
                    Text("All Sessions").tag("ALL")
                }
                .pickerStyle(.segmented)
                .frame(width: 220)

                Spacer()
            }

            // Summary Stats Cards
            HStack(spacing: 12) {
                metricCard(
                    title: "WORKOUTS",
                    value: "\(completedWorkouts.count)",
                    subtitle: "Completed",
                    tint: iTuTheme.teal
                )
                metricCard(
                    title: "LOGGED SETS",
                    value: "\(allCompletedSets.count)",
                    subtitle: "Sets finished",
                    tint: iTuTheme.amber
                )
                metricCard(
                    title: "BEST WEIGHT",
                    value: GymSupport.formatWeight(bestWeightLifetime > 0 ? bestWeightLifetime : nil, unit: unit),
                    subtitle: "Heaviest set",
                    tint: iTuTheme.mint
                )
                metricCard(
                    title: "ESTIMATED 1RM",
                    value: GymSupport.formatWeight(best1RMLifetime > 0 ? best1RMLifetime : nil, unit: unit),
                    subtitle: "Personal record",
                    tint: iTuTheme.forest
                )
            }

            // Volume Trend Visual Chart
            if !volumeTrend.isEmpty {
                VStack(alignment: .leading, spacing: 10) {
                    Text("VOLUME TREND (LAST 7 WORKOUTS)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)

                    let maxVol = max(1, volumeTrend.max() ?? 1)
                    HStack(alignment: .bottom, spacing: 10) {
                        ForEach(volumeTrend.indices, id: \.self) { idx in
                            let vol = volumeTrend[idx]
                            let fraction = CGFloat(vol / maxVol)
                            VStack(spacing: 4) {
                                RoundedRectangle(cornerRadius: 4, style: .continuous)
                                    .fill(iTuTheme.teal)
                                    .frame(width: 24, height: max(6, 60 * fraction))
                                Text("\(Int(vol / 1000))k")
                                    .font(.system(size: 9, design: .monospaced))
                                    .foregroundStyle(iTuTheme.inkDim)
                            }
                        }
                    }
                    .frame(height: 80, alignment: .bottom)
                    .padding(12)
                    .background(iTuTheme.surface)
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .stroke(iTuTheme.border, lineWidth: 1)
                    }
                }
            }

            // Workout History List
            VStack(alignment: .leading, spacing: 12) {
                Text("PAST SESSIONS (\(displayedWorkouts.count))")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if displayedWorkouts.isEmpty {
                    Text("No workout history found.")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    LazyVStack(spacing: 8) {
                        ForEach(displayedWorkouts) { workout in
                            historyWorkoutCard(workout)
                        }
                    }
                }
            }
        }
    }

    private func metricCard(title: String, value: String, subtitle: String, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title)
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .foregroundStyle(tint)
            Text(value)
                .font(.system(size: 16, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
            Text(subtitle)
                .font(.system(size: 10))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }

    private func historyWorkoutCard(_ workout: WorkoutModel) -> some View {
        let volume = GymSupport.workoutVolume(for: workout)
        let exList = workout.exercises ?? []
        let dateStr = String((workout.startedAt ?? "").prefix(10))
        let isCompleted = workout.status == "COMPLETED"

        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 12) {
                Circle()
                    .fill(isCompleted ? iTuTheme.teal.opacity(0.15) : iTuTheme.amber.opacity(0.15))
                    .frame(width: 32, height: 32)
                    .overlay {
                        Image(systemName: isCompleted ? "checkmark" : "hourglass")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundStyle(isCompleted ? iTuTheme.teal : iTuTheme.amber)
                    }

                VStack(alignment: .leading, spacing: 2) {
                    Text(workout.title)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("\(dateStr) · \(exList.count) exercises")
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

            // Exercise pills summary
            if !exList.isEmpty {
                HStack(spacing: 6) {
                    ForEach(exList.prefix(4)) { ex in
                        Text(ex.exercise?.name ?? "Exercise")
                            .font(.system(size: 10))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(iTuTheme.surfaceMuted)
                            .clipShape(Capsule())
                    }
                    if exList.count > 4 {
                        Text("+\(exList.count - 4)")
                            .font(.system(size: 10))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
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
