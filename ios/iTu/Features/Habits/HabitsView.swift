import SwiftUI
import iTuDomain

struct HabitsView: View {
    @EnvironmentObject private var model: AppModel

    var body: some View {
        List {
            Section("Habits") {
                if model.habits.isEmpty { Text("No Habits yet.").foregroundStyle(.secondary) }
                ForEach(model.habits) { habit in
                    HStack {
                        VStack(alignment: .leading) {
                            Text(habit.name)
                            Text("Streak: \(habit.currentStreak) days").font(.caption).foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button(habit.isCompletedToday ? "Done" : "Check in") {
                            Task { await model.checkIn(habit) }
                        }
                        .buttonStyle(.bordered).disabled(habit.isCompletedToday)
                    }
                    .accessibilityElement(children: .contain)
                }
            }
        }
        .navigationTitle("Habits")
    }
}
