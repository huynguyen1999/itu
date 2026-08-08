import SwiftUI

struct GymView: View {
    @Environment(AppModel.self) private var model
    @State private var selectedTab = "Overview"

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 4) {
                    Text("TRACKING")
                        .font(.system(size: 10, weight: .bold))
                        .foregroundStyle(iTuTheme.mint)
                    Text("Gym & Fitness")
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()

                Button {
                    // Start workout action
                } label: {
                    HStack(spacing: 6) {
                        Image(systemName: "play.fill")
                        Text("Start Workout")
                    }
                }
                .buttonStyle(iTuPrimaryButtonStyle())
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)

            // Segmented Local Nav
            Picker("Tab", selection: $selectedTab) {
                Text("Overview").tag("Overview")
                Text("History").tag("History")
                Text("Exercises").tag("Exercises")
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 24)

            // Body Content
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if selectedTab == "Overview" {
                        gymOverviewSection
                    } else if selectedTab == "History" {
                        gymHistorySection
                    } else {
                        exercisesSection
                    }
                }
                .padding(24)
            }
        }
        .background(iTuTheme.canvas)
    }

    @ViewBuilder
    private var gymOverviewSection: some View {
        HStack(spacing: 16) {
            metricCard(title: "THIS WEEK WORKOUTS", value: "0", color: iTuTheme.teal)
            metricCard(title: "TOTAL SETS", value: "0", color: iTuTheme.mint)
            metricCard(title: "VOLUME", value: "0 kg", color: iTuTheme.amber)
        }

        VStack(alignment: .leading, spacing: 12) {
            Text("Recent Workouts")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Text("No recent workouts recorded.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(.top, 12)
    }

    @ViewBuilder
    private var gymHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Workout History")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Text("No workouts in history.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
    }

    @ViewBuilder
    private var exercisesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Exercise Library")
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Text("No custom exercises created.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
    }

    private func metricCard(title: String, value: String, color: Color) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title)
                .font(.system(size: 10, weight: .bold))
                .foregroundStyle(color)
            Text(value)
                .font(.system(size: 20, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(16)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        )
    }
}
