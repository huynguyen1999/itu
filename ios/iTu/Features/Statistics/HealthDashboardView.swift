import SwiftUI
import UIKit
import iTuDomain

// MARK: - Health Dashboard View

/// Dedicated Health view accessible from the More tab.
/// Shows HealthKit authorization state, daily summary aggregates,
/// and per-day detail. All data flows from the offline store; no
/// REST call is made here — health data is uploaded through the outbox.
struct HealthDashboardView: View {
    @ObservedObject var model: AppModel
    @State private var selectedDate: Date = Date()
    @State private var showingDetail = false

    var body: some View {
        List {
            authorizationSection
            if model.healthAuthorizationState == .requested {
                importStatusSection
                if !model.healthDailySummaries.isEmpty {
                    recentSummariesSection
                }
                workoutsSection
            }
        }
        .navigationTitle("Health")
        .task { model.refreshHealthAuthorization() }
        .refreshable { model.refreshHealth() }
    }

    // MARK: - Sections

    @ViewBuilder
    private var authorizationSection: some View {
        Section("HealthKit Access") {
            LabeledContent("Permission", value: model.healthAuthorizationState.title)
            Text(model.healthAuthorizationState.detail)
                .font(.footnote)
                .foregroundStyle(.secondary)
            if model.healthAuthorizationState.canRequest {
                Button("Allow HealthKit Access") {
                    Task { await model.requestHealthAccess() }
                }
            }
            if model.healthAuthorizationState == .requested {
                Link(
                    "Review permissions in iOS Settings",
                    destination: URL(string: UIApplication.openSettingsURLString)!
                )
                .font(.footnote)
            }
        }
    }

    @ViewBuilder
    private var importStatusSection: some View {
        Section("Import") {
            LabeledContent("Status", value: model.healthImportStatus.title)
            if let importedAt = model.healthLastSuccessfulImportAt {
                LabeledContent("Last successful", value: shortTimestamp(importedAt))
            }
            Button(model.healthImportStatus == .importing ? "Importing…" : "Import now") {
                model.refreshHealth()
            }
            .disabled(model.healthImportStatus == .importing)
            if case let .partial(message) = model.healthImportStatus {
                Text("Some metrics could not be imported: \(message)")
                    .font(.footnote)
                    .foregroundStyle(.orange)
            }
            if case let .failed(message) = model.healthImportStatus {
                Text("Import failed: \(message)")
                    .font(.footnote)
                    .foregroundStyle(.red)
            }
            Text("Normalized daily summaries and workout metadata sync to your account. Raw HealthKit samples remain on this device.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private var recentSummariesSection: some View {
        let recent = recentSummaries
        Section("Recent summaries (\(recent.count) days)") {
            ForEach(recent) { summary in
                HealthDailySummaryRow(summary: summary)
            }
            if recent.isEmpty {
                Text("No health summaries imported yet.")
                    .foregroundStyle(.secondary)
            }
        }
    }

    @ViewBuilder
    private var workoutsSection: some View {
        let recent = recentWorkouts
        if !recent.isEmpty {
            Section("Recent workouts") {
                ForEach(recent.prefix(10)) { workout in
                    HealthWorkoutRow(workout: workout)
                }
            }
        }
    }

    // MARK: - Derived data

    private var recentSummaries: [HealthDailySummaryModel] {
        model.healthDailySummaries
            .filter { $0.source == .healthKit }
            .sorted { $0.localDate > $1.localDate }
            .prefix(14)
            .map { $0 }
    }

    private var recentWorkouts: [HealthWorkoutSummaryModel] {
        model.healthWorkouts
            .sorted { $0.startAt > $1.startAt }
    }

    private func shortTimestamp(_ iso: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = formatter.date(from: iso) else { return iso }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }
}

// MARK: - Daily summary row

private struct HealthDailySummaryRow: View {
    let summary: HealthDailySummaryModel

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(summary.localDate)
                .font(.headline)
            HStack(spacing: 12) {
                healthMetric(label: "Steps", value: summary.steps.formatted(), icon: "figure.walk")
                healthMetric(label: "Exercise", value: "\(summary.exerciseMinutes)m", icon: "bolt.heart")
                healthMetric(label: "Sleep", value: sleepString(summary.sleepMinutes), icon: "moon.zzz")
            }
            HStack(spacing: 12) {
                if let hr = summary.restingHeartRateBpm {
                    healthMetric(label: "Resting HR", value: "\(Int(hr.rounded())) bpm", icon: "heart.fill")
                }
                if let hrv = summary.hrvMilliseconds {
                    healthMetric(label: "HRV", value: "\(Int(hrv.rounded())) ms", icon: "waveform.path.ecg")
                }
                if summary.workoutCount > 0 {
                    healthMetric(label: "Workouts", value: "\(summary.workoutCount)", icon: "figure.strengthtraining.traditional")
                }
            }
        }
        .padding(.vertical, 2)
    }

    @ViewBuilder
    private func healthMetric(label: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Label(value, systemImage: icon)
                .font(.caption.bold())
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
    }

    private func sleepString(_ minutes: Int) -> String {
        guard minutes > 0 else { return "—" }
        let h = minutes / 60
        let m = minutes % 60
        return h > 0 ? "\(h)h \(m)m" : "\(m)m"
    }
}

// MARK: - Workout row

private struct HealthWorkoutRow: View {
    let workout: HealthWorkoutSummaryModel

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(activityName)
                    .font(.headline)
                Text(dateString)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 2) {
                Text(durationString)
                    .font(.caption.bold())
                if let energy = workout.energyKcal {
                    Text("\(Int(energy.rounded())) kcal")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var activityName: String {
        // HKWorkoutActivityType raw values — map common ones to readable strings.
        let type = Int(workout.activityType) ?? 0
        switch type {
        case 1: return "American Football"
        case 2: return "Archery"
        case 3: return "Australian Football"
        case 4: return "Badminton"
        case 5: return "Baseball"
        case 6: return "Basketball"
        case 7: return "Bowling"
        case 8: return "Boxing"
        case 9: return "Climbing"
        case 10: return "Cricket"
        case 13: return "Cycling"
        case 16: return "Elliptical"
        case 20: return "Functional Strength Training"
        case 24: return "Hiking"
        case 25: return "Hockey"
        case 27: return "Lacrosse"
        case 30: return "Mixed Martial Arts"
        case 35: return "Paddle Sports"
        case 37: return "Pilates"
        case 38: return "Racquetball"
        case 39: return "Rowing"
        case 40: return "Rugby"
        case 41: return "Running"
        case 42: return "Sailing"
        case 46: return "Skiing"
        case 48: return "Soccer"
        case 51: return "Squash"
        case 52: return "Stair Climbing"
        case 53: return "Surfing"
        case 54: return "Swimming"
        case 55: return "Table Tennis"
        case 56: return "Tennis"
        case 58: return "Traditional Strength Training"
        case 62: return "Volleyball"
        case 63: return "Walking"
        case 64: return "Water Fitness"
        case 65: return "Water Polo"
        case 67: return "Yoga"
        default: return "Workout"
        }
    }

    private var dateString: String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        guard let date = formatter.date(from: workout.startAt) else { return workout.startAt }
        let display = DateFormatter()
        display.dateStyle = .medium
        display.timeStyle = .short
        return display.string(from: date)
    }

    private var durationString: String {
        let minutes = workout.durationSeconds / 60
        let hours = minutes / 60
        let remaining = minutes % 60
        return hours > 0 ? "\(hours)h \(remaining)m" : "\(minutes)m"
    }
}
