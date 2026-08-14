import SwiftUI

struct ExerciseStatsView: View {
    @Environment(AppModel.self) private var model
    let exercise: ExerciseModel
    var onClose: () -> Void

    private var unit: String {
        model.gymPreferences.weightUnit
    }

    private struct SessionLog: Identifiable {
        let id: String
        let date: String
        let title: String
        let sets: [WorkoutSetModel]
        var bestWeight: Double { sets.compactMap(\.weight).max() ?? 0 }
        var totalVolume: Double { sets.reduce(0) { $0 + ($1.weight ?? 0) * Double($1.reps ?? 0) } }
        var best1RM: Double {
            sets.map { GymSupport.calculate1RM(weight: $0.weight ?? 0, reps: $0.reps ?? 0) }.max() ?? 0
        }
    }

    private var loggedSessions: [SessionLog] {
        var sessions: [SessionLog] = []
        for workout in model.gymWorkouts.filter({ $0.deletedAt == nil }) {
            guard let exercises = workout.exercises else { continue }
            for ex in exercises where ex.exerciseId == exercise.id || (ex.exercise?.name.localizedCaseInsensitiveCompare(exercise.name) == .orderedSame) {
                let completedSets = (ex.sets ?? []).filter { $0.completedAt != nil }
                if !completedSets.isEmpty {
                    sessions.append(SessionLog(
                        id: "\(workout.id)-\(ex.id)",
                        date: String((workout.startedAt ?? "").prefix(10)),
                        title: workout.title,
                        sets: completedSets
                    ))
                }
            }
        }
        return sessions.sorted { $0.date > $1.date }
    }

    private var personalBestWeight: Double {
        loggedSessions.map(\.bestWeight).max() ?? 0
    }

    private var personalBest1RM: Double {
        loggedSessions.map(\.best1RM).max() ?? 0
    }

    private var lifetimeVolume: Double {
        loggedSessions.reduce(0) { $0 + $1.totalVolume }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(exercise.name)
                        .font(.system(size: 18, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)

                    HStack(spacing: 6) {
                        if let muscle = exercise.primaryMuscleGroup, !muscle.isEmpty {
                            Text(muscle)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(iTuTheme.teal)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(iTuTheme.teal.opacity(0.1))
                                .clipShape(Capsule())
                        }
                        if let equip = exercise.equipment, !equip.isEmpty {
                            Text(equip)
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(iTuTheme.inkDim)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(iTuTheme.surfaceMuted)
                                .clipShape(Capsule())
                        }
                    }
                }

                Spacer()

                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .buttonStyle(.plain)
            }

            Divider()

            // PR Cards
            HStack(spacing: 12) {
                statCard(
                    title: "ESTIMATED 1RM",
                    value: GymSupport.formatWeight(personalBest1RM > 0 ? personalBest1RM : nil, unit: unit),
                    subtitle: "Theoretical max",
                    tint: iTuTheme.teal
                )
                statCard(
                    title: "HEAVIEST SET",
                    value: GymSupport.formatWeight(personalBestWeight > 0 ? personalBestWeight : nil, unit: unit),
                    subtitle: "Actual best",
                    tint: iTuTheme.amber
                )
                statCard(
                    title: "TOTAL VOLUME",
                    value: "\(Int(lifetimeVolume)) \(unit.lowercased())",
                    subtitle: "\(loggedSessions.count) sessions",
                    tint: iTuTheme.mint
                )
            }

            // Progression History
            VStack(alignment: .leading, spacing: 10) {
                Text("LOGGED SESSIONS")
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                if loggedSessions.isEmpty {
                    VStack(spacing: 6) {
                        Text("No completed sets logged for this exercise yet.")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity, minHeight: 80)
                    .background(iTuTheme.surfaceMuted)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                } else {
                    ScrollView {
                        VStack(spacing: 8) {
                            ForEach(loggedSessions) { session in
                                sessionCard(session)
                            }
                        }
                    }
                    .frame(maxHeight: 240)
                }
            }
        }
        .padding(20)
        .frame(width: 440)
    }

    private func statCard(title: String, value: String, subtitle: String, tint: Color) -> some View {
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
        .padding(10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func sessionCard(_ session: SessionLog) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack {
                Text(session.date)
                    .font(.system(size: 11, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.ink)
                Text("· \(session.title)")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
                Spacer()
                Text("Best: \(GymSupport.formatWeight(session.bestWeight, unit: unit))")
                    .font(.system(size: 10, design: .monospaced))
                    .foregroundStyle(iTuTheme.teal)
            }

            // Sets tags
            HStack(spacing: 6) {
                ForEach(session.sets.indices, id: \.self) { idx in
                    let s = session.sets[idx]
                    Text("\(s.reps ?? 0) × \(GymSupport.formatWeight(s.weight, unit: unit))")
                        .font(.system(size: 10, design: .monospaced))
                        .padding(.horizontal, 6)
                        .padding(.vertical, 3)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                }
            }
        }
        .padding(10)
        .background(iTuTheme.surfaceMuted)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }
}
