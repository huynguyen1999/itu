import SwiftUI
import iTuDomain

struct Phase6StatisticsView: View {
    @ObservedObject var model: AppModel
    @State private var fromDate = Calendar.current.date(byAdding: .day, value: -6, to: Date()) ?? Date()
    @State private var toDate = Date()

    init(model: AppModel) {
        self.model = model
    }

    var body: some View {
        Form {
            Section("Range") {
                DatePicker("From", selection: $fromDate, displayedComponents: .date)
                DatePicker("To", selection: $toDate, displayedComponents: .date)
                Button("Refresh") { Task { await refresh() } }
                    .disabled(toDate < fromDate || model.usageStatisticsState.isLoading)
            }

            Section("Application usage") {
                resourceState(model.usageStatisticsState)
                Text(model.usageStatisticsIsLocalOnly
                     ? "Source: device-local normalized summaries; not confirmed by the server."
                     : "Source: server summary with pending device-local deltas applied.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let statistics = model.usageStatistics {
                    LabeledContent("Active time", value: formatDuration(statistics.totalActiveSeconds))
                    if let engaged = statistics.totalEngagedSeconds {
                        LabeledContent("Engaged time", value: formatDuration(engaged))
                    }
                    if let coverage = statistics.engagementCoverage {
                        Text(coverage.complete
                             ? "Engagement coverage is complete for the returned application activity."
                             : "Engagement coverage is partial; some application activity has no engagement signal.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    } else {
                        Text("Engagement time is unavailable for this source.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                    }
                    ForEach(statistics.topApps.prefix(8)) { app in
                        LabeledContent(app.displayName, value: formatDuration(app.activeSeconds))
                    }
                } else {
                    Text("No application usage summaries for this range.")
                        .foregroundStyle(.secondary)
                }
                Text("iPhone Screen Time import is disabled for personal development builds.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Website usage") {
                resourceState(model.websiteUsageStatisticsState)
                Text(model.websiteUsageStatisticsIsLocalOnly
                     ? "Source: device-local hostname summaries; not confirmed by the server."
                     : "Source: server hostname summary with pending device-local deltas applied.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                if let statistics = model.websiteUsageStatistics {
                    LabeledContent("Active time", value: formatDuration(statistics.totalActiveSeconds))
                    ForEach(statistics.topHostnames.prefix(8)) { host in
                        LabeledContent(host.hostname, value: formatDuration(host.activeSeconds))
                    }
                } else {
                    Text("No website usage summaries for this range.")
                        .foregroundStyle(.secondary)
                }
                Text("Website summaries are normalized by hostname. Private URL details are not inferred from aggregate data.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Health") {
                LabeledContent("Permission", value: model.healthAuthorizationState.title)
                LabeledContent("Import", value: healthImportTitle)
                if model.healthAuthorizationState.canRequest {
                    Button("Allow HealthKit access") { Task { await model.requestHealthAccess() } }
                }
                Button("Refresh HealthKit data") { model.refreshHealth() }
                    .disabled(model.healthAuthorizationState != .requested || model.healthImportStatus == .importing)
                if let importedAt = model.healthLastSuccessfulImportAt {
                    LabeledContent("Last successful import", value: importedAt)
                }
                healthSummary
                Text("Health data is normalized into daily summaries and workout metadata. Raw HealthKit samples remain on this device; this view does not claim a server-side raw import.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            Section("Screen Time permission") {
                LabeledContent("Permission", value: "Disabled for personal development")
                Text("Screen Time / Family Controls is disabled for personal development team builds.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        }
        .navigationTitle("Statistics")
        .task {
            model.refreshHealthAuthorization()
            await refresh()
        }
    }

    @ViewBuilder
    private var healthSummary: some View {
        let summaries = model.healthDailySummaries.filter { $0.localDate >= dayKey(fromDate) && $0.localDate <= dayKey(toDate) }
        if summaries.isEmpty {
            Text("No normalized Health summaries for this range.")
                .foregroundStyle(.secondary)
        } else {
            let steps = summaries.reduce(0) { $0 + $1.steps }
            let exercise = summaries.reduce(0) { $0 + $1.exerciseMinutes }
            let sleep = summaries.reduce(0) { $0 + $1.sleepMinutes }
            LabeledContent("Steps", value: steps.formatted())
            LabeledContent("Exercise", value: "\(exercise) min")
            LabeledContent("Sleep", value: "\(sleep) min")
            Text("Source: HealthKit on this device; values are account-normalized by local day.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func resourceState(_ state: IOSRemoteResourceState) -> some View {
        switch state {
        case .idle:
            EmptyView()
        case .loading:
            ProgressView("Loading server summary…")
        case .loaded:
            EmptyView()
        case let .failed(message):
            Label("Server summary unavailable: \(message). Showing local summaries when available.", systemImage: "exclamationmark.triangle")
                .font(.footnote)
                .foregroundStyle(.orange)
        }
    }

    private var healthImportTitle: String {
        switch model.healthImportStatus {
        case .unavailable: "Unavailable on this device"
        case .idle: "Not imported yet"
        case .importing: "Importing…"
        case .imported: "Imported on this device"
        case let .partial(message): "Partial: \(message)"
        case let .failed(message): "Failed: \(message)"
        }
    }

    private func refresh() async {
        guard toDate >= fromDate else { return }
        await model.refreshUsage(from: dayKey(fromDate), to: dayKey(toDate))
    }

    private func dayKey(_ date: Date) -> String { IOSProductCalendar.dayString(date) }

    private func formatDuration(_ seconds: Int) -> String {
        let hours = seconds / 3_600
        let minutes = (seconds % 3_600) / 60
        return hours > 0 ? "\(hours)h \(minutes)m" : "\(minutes)m"
    }

}
