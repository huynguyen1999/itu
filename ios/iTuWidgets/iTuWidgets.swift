import ActivityKit
import Foundation
import SwiftUI
import WidgetKit
import iTuDomain

@main
struct iTuWidgetsBundle: WidgetBundle {
    @WidgetBundleBuilder
    var body: some Widget {
        TodayWidget()
        FocusWidget()
        if #available(iOS 16.1, *) {
            FocusLiveActivityWidget()
        }
        if #available(iOS 18.0, *) {
            FocusControlWidget()
        }
    }
}

@available(iOS 18.0, *)
struct FocusControlWidget: ControlWidget {
    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: "FocusControlWidget") {
            ControlWidgetButton(action: StartFocusIntent()) {
                Label("Start Focus", systemImage: "timer")
            }
        }
        .displayName("Start Focus")
        .description("Start an iTu Focus Session from Control Center.")
    }
}

struct TodayEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let hasAccount: Bool
    let isPlaceholder: Bool

    static var placeholder: TodayEntry {
        TodayEntry(
            date: Date(),
            snapshot: WidgetSnapshot(
                accountID: "placeholder",
                generatedAt: "",
                localDate: "",
                taskTotal: 0,
                taskCompleted: 0,
                taskRemaining: 0,
                habitsRemaining: 0
            ),
            hasAccount: false,
            isPlaceholder: true
        )
    }
}

struct TodayProvider: TimelineProvider {
    func placeholder(in context: Context) -> TodayEntry { .placeholder }

    func getSnapshot(in context: Context, completion: @escaping (TodayEntry) -> Void) {
        let snapshot = IOSWidgetSnapshotBridge.load()
        completion(TodayEntry(date: Date(), snapshot: snapshot, hasAccount: IOSWidgetSnapshotBridge.activeAccountID != nil, isPlaceholder: false))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<TodayEntry>) -> Void) {
        let snapshot = IOSWidgetSnapshotBridge.load()
        let entry = TodayEntry(date: Date(), snapshot: snapshot, hasAccount: IOSWidgetSnapshotBridge.activeAccountID != nil, isPlaceholder: false)
        let nextDay = iTuCalendarSupport.calendar().date(byAdding: .day, value: 1, to: Date()) ?? Date().addingTimeInterval(86_400)
        completion(Timeline(entries: [entry], policy: .after(nextDay)))
    }
}

struct TodayWidget: Widget {
    static let kind = "TodayWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: TodayProvider()) { entry in
            TodayWidgetView(entry: entry)
        }
        .configurationDisplayName("Today")
        .description("Your tasks, habits, and current Focus Session.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

struct TodayWidgetView: View {
    let entry: TodayEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        let snapshot = entry.snapshot
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("TODAY").font(.caption.weight(.semibold)).foregroundStyle(.secondary)
                Spacer()
                Image(systemName: "checklist").foregroundStyle(.teal)
            }
            if entry.isPlaceholder {
                Text("Sign in to see Today").font(.headline)
                Text("Your tasks will appear here.").font(.caption).foregroundStyle(.secondary)
            } else if let snapshot {
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text("\(snapshot.taskRemaining)").font(.title.bold())
                    Text("remaining").font(.caption).foregroundStyle(.secondary)
                }
                Text("\(snapshot.taskCompleted) of \(snapshot.taskTotal) completed")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Tasks completed")
                    .accessibilityValue("\(snapshot.taskCompleted) of \(snapshot.taskTotal)")
                if isStale(snapshot) {
                    Label("Update needed", systemImage: "arrow.clockwise")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                if family == .systemMedium {
                    if snapshot.todayTasks.isEmpty {
                        Text(snapshot.nextTask.map { "Next: \($0.title)" } ?? "No scheduled tasks")
                            .font(.caption)
                            .lineLimit(1)
                    } else {
                        ForEach(snapshot.todayTasks) { task in
                            Label(task.title, systemImage: "circle")
                                .font(.caption)
                                .lineLimit(1)
                                .minimumScaleFactor(0.8)
                        }
                    }
                } else {
                    Text(snapshot.todayTasks.first.map { "Next: \($0.title)" }
                         ?? snapshot.nextTask.map { "Next: \($0.title)" }
                         ?? "No scheduled tasks")
                        .font(.caption)
                        .lineLimit(2)
                }
                Spacer(minLength: 0)
                HStack {
                    Label("\(snapshot.habitsRemaining) habits", systemImage: "repeat")
                    Spacer()
                    if let focus = snapshot.activeFocus {
                        Label(focus.title, systemImage: "timer")
                            .lineLimit(1)
                    }
                }
                .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                Text(entry.hasAccount ? "Open iTu" : "Sign in to see Today")
                    .font(.headline)
                Text(entry.hasAccount ? "Open iTu to refresh Today." : "Your tasks will appear here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding()
        .widgetURL(URL(string: "itu://home"))
        .iTuWidgetBackground()
    }

    private func isStale(_ snapshot: WidgetSnapshot) -> Bool {
        guard let generatedAt = iTuDateSupport.parse(snapshot.generatedAt) else { return true }
        return entry.date.timeIntervalSince(generatedAt) > 15 * 60
    }
}

struct FocusEntry: TimelineEntry {
    let date: Date
    let snapshot: WidgetSnapshot?
    let focus: WidgetFocusSnapshot?
    let hasAccount: Bool
}

struct FocusProvider: TimelineProvider {
    func placeholder(in context: Context) -> FocusEntry { FocusEntry(date: Date(), snapshot: nil, focus: nil, hasAccount: false) }

    func getSnapshot(in context: Context, completion: @escaping (FocusEntry) -> Void) {
        completion(makeEntry())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<FocusEntry>) -> Void) {
        let entry = makeEntry()
        completion(Timeline(entries: [entry], policy: .after(nextRefreshDate(for: entry.snapshot, now: entry.date))))
    }

    private func makeEntry() -> FocusEntry {
        let date = Date()
        let snapshot = IOSWidgetSnapshotBridge.load()
        return FocusEntry(
            date: date,
            snapshot: snapshot,
            focus: snapshot?.activeFocus,
            hasAccount: IOSWidgetSnapshotBridge.activeAccountID != nil
        )
    }

    private func nextRefreshDate(for snapshot: WidgetSnapshot?, now: Date) -> Date {
        let fallback = now.addingTimeInterval(15 * 60)
        var candidates = [fallback]
        if let generatedAt = snapshot.flatMap({ iTuDateSupport.parse($0.generatedAt) }) {
            candidates.append(generatedAt.addingTimeInterval(15 * 60))
        }
        if let deadline = snapshot?.activeFocus?.deadline(at: now) {
            candidates.append(deadline)
        }
        return candidates.filter { $0 > now }.min() ?? fallback
    }
}

struct FocusWidget: Widget {
    static let kind = "FocusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: Self.kind, provider: FocusProvider()) { entry in
            FocusWidgetView(entry: entry)
        }
        .configurationDisplayName("Focus")
        .description("See the current Focus Session.")
        .supportedFamilies([.systemSmall])
    }
}

struct FocusWidgetView: View {
    let entry: FocusEntry

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("FOCUS", systemImage: "timer")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.teal)
            if let focus = entry.focus {
                Text(focus.title).font(.headline).lineLimit(2).minimumScaleFactor(0.8)
                FocusTimerText(focus: focus).font(.title2.monospacedDigit())
                Text(focus.status == .paused ? "Paused" : focus.phase == .work ? "In Focus" : "Break")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                if isStale {
                    Label("Update needed", systemImage: "arrow.clockwise")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            } else if entry.snapshot == nil {
                Text(entry.hasAccount ? "Open iTu" : "Sign in to see Focus")
                    .font(.headline)
                Text(entry.hasAccount ? "Open iTu to refresh Focus." : "Sign in to start a Focus Session.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("No active Focus Session")
                    .font(.headline)
                if #available(iOS 17.0, *) {
                    Button(intent: StartFocusIntent()) {
                        Label("Start 25 min", systemImage: "play.fill")
                    }
                    .buttonStyle(.borderedProminent)
                } else {
                    Text("Tap to open Focus")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .widgetURL(URL(string: entry.focus.map { "itu://focus/\($0.id)" } ?? "itu://focus"))
        .iTuWidgetBackground()
    }

    private var isStale: Bool {
        guard let generatedAt = entry.snapshot.flatMap({ iTuDateSupport.parse($0.generatedAt) }) else { return true }
        return entry.date.timeIntervalSince(generatedAt) > 15 * 60
    }
}

private extension View {
    @ViewBuilder
    func iTuWidgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            containerBackground(for: .widget) { Color(.systemBackground) }
        } else {
            background(Color(.systemBackground))
        }
    }
}

struct FocusTimerText: View {
    let focus: WidgetFocusSnapshot

    var body: some View {
        Group {
            if focus.status == .active,
               let deadline = focus.deadline(at: Date()) {
                Text(timerInterval: Date()...max(Date(), deadline), countsDown: true)
            } else if let remaining = focus.remainingSeconds(at: Date()) {
                Text(format(seconds: remaining))
            } else {
                Text("—")
            }
        }
        .accessibilityLabel("Focus time remaining")
        .accessibilityValue(accessibilityValue)
    }

    private func format(seconds: Int) -> String {
        String(format: "%02d:%02d", max(0, seconds) / 60, max(0, seconds) % 60)
    }

    private var accessibilityValue: String {
        guard let remaining = focus.remainingSeconds(at: Date()) else { return "Time unavailable" }
        let minutes = remaining / 60
        let seconds = remaining % 60
        return "\(minutes) minute\(minutes == 1 ? "" : "s") and \(seconds) second\(seconds == 1 ? "" : "s") remaining"
    }
}

@available(iOS 16.1, *)
struct FocusLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: FocusActivityAttributes.self) { context in
            FocusLiveActivityLockScreenView(context: context)
                .widgetURL(URL(string: "itu://focus/\(context.attributes.sessionID)"))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Text(context.attributes.title)
                        .lineLimit(2)
                        .minimumScaleFactor(0.75)
                        .font(.headline)
                        .accessibilityLabel("Focus Session")
                        .accessibilityValue(context.attributes.title)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    FocusActivityTimerText(state: context.state)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        FocusActivityControls(status: context.state.status)
                    }
                }
            } compactLeading: {
                Image(systemName: "leaf.fill")
                    .foregroundStyle(.green)
                    .accessibilityLabel("Focus Session")
                    .accessibilityValue(context.attributes.title)
            } compactTrailing: {
                FocusActivityTimerText(state: context.state)
            } minimal: {
                Image(systemName: "timer")
                    .accessibilityLabel("Focus Session")
                    .accessibilityValue(context.attributes.title)
            }
            .widgetURL(URL(string: "itu://focus/\(context.attributes.sessionID)"))
        }
    }
}

@available(iOS 16.1, *)
struct FocusLiveActivityLockScreenView: View {
    let context: ActivityViewContext<FocusActivityAttributes>

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("FOCUS", systemImage: "timer").font(.caption.weight(.semibold))
                Spacer()
                FocusActivityTimerText(state: context.state)
                    .font(.title3.monospacedDigit())
            }
            Text(context.attributes.title)
                .font(.headline)
                .lineLimit(2)
                .accessibilityLabel("Focus Session")
                .accessibilityValue(context.attributes.title)
            HStack {
                Text(context.state.status == FocusSessionStatus.paused.rawValue ? "Paused" : context.state.phase == FocusPhase.work.rawValue ? "In Focus" : "Break")
                    .font(.caption).foregroundStyle(.secondary)
                Spacer()
                FocusActivityControls(status: context.state.status)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 12)
    }
}

@available(iOS 16.1, *)
struct FocusActivityTimerText: View {
    let state: FocusActivityAttributes.ContentState

    var body: some View {
        Group {
            if state.status == FocusSessionStatus.active.rawValue,
               let planned = state.plannedSeconds,
               let started = iTuDateSupport.parse(state.startedAt) {
                let deadline = started.addingTimeInterval(Double(max(0, planned) + max(0, state.accumulatedPauseSeconds)))
                Text(timerInterval: Date()...max(Date(), deadline), countsDown: true)
            } else if let pausedAt = state.pausedAt,
                      let paused = iTuDateSupport.parse(pausedAt),
                      let started = iTuDateSupport.parse(state.startedAt),
                      let planned = state.plannedSeconds {
                let elapsed = max(0, Int(paused.timeIntervalSince(started)))
                let remaining = max(0, planned - max(0, elapsed - state.accumulatedPauseSeconds))
                Text(String(format: "%02d:%02d", remaining / 60, remaining % 60))
            } else {
                Text("—")
            }
        }
        .accessibilityLabel("Focus time remaining")
        .accessibilityValue(accessibilityValue)
    }

    private var accessibilityValue: String {
        guard let status = FocusSessionStatus(rawValue: state.status),
              let phase = FocusPhase(rawValue: state.phase),
              let remaining = WidgetFocusSnapshot(
                  id: "live",
                  title: "Focus",
                  status: status,
                  phase: phase,
                  plannedSeconds: state.plannedSeconds,
                  startedAt: state.startedAt,
                  pausedAt: state.pausedAt,
                  accumulatedPauseSeconds: state.accumulatedPauseSeconds
              ).remainingSeconds(at: Date()) else {
            return "Time unavailable"
        }
        let minutes = remaining / 60
        let seconds = remaining % 60
        let statusText = status == .paused ? "Paused" : "Counting down"
        return "\(statusText), \(minutes) minute\(minutes == 1 ? "" : "s") and \(seconds) second\(seconds == 1 ? "" : "s") remaining"
    }
}

@available(iOS 16.1, *)
struct FocusActivityControls: View {
    let status: String

    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 12) {
                if status == FocusSessionStatus.paused.rawValue {
                    Button(intent: ResumeFocusIntent()) { Label("Resume", systemImage: "play.fill") }
                } else {
                    Button(intent: PauseFocusIntent()) { Label("Pause", systemImage: "pause.fill") }
                }
                Button(intent: CompleteFocusIntent()) { Label("Finish", systemImage: "checkmark") }
            }
            .buttonStyle(.bordered)
        } else {
            EmptyView()
        }
    }
}
