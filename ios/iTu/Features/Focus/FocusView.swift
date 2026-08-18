import SwiftUI
import iTuDomain
import iTuDesignCore

public typealias Phase6FocusView = FocusView

private extension FocusPhase {
    var displayName: String {
        switch self {
        case .work: return "Work"
        case .shortBreak: return "Short Break"
        case .longBreak: return "Long Break"
        }
    }
}

public struct FocusView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var audioPlayer = IOSFocusAudioPlayer.shared

    @State private var selectedDuration = 25
    @State private var selectedTaskID: String?
    @State private var showingTaskPicker = false
    @State private var customTitle = ""

    private let presetDurations = [15, 25, 45, 50, 90]

    public init() {}

    private var activeSession: FocusSession? {
        model.activeFocusSession
    }

    public var body: some View {
        Group {
            if let active = activeSession {
                // Immersive Active Focus View
                activeFocusView(active)
            } else {
                // Inactive Focus Setup & Dashboard
                inactiveFocusView
            }
        }
        .navigationTitle("Focus")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
        }
        .task { await loadFocusSounds() }
        .sheet(isPresented: $showingTaskPicker) {
            NavigationStack {
                List {
                    Button {
                        selectedTaskID = nil
                        showingTaskPicker = false
                    } label: {
                        HStack {
                            Text("Free Focus (No Task)")
                                .font(IOSTypography.body)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Spacer()
                            if selectedTaskID == nil {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(IOSColor.teal(colorScheme))
                            }
                        }
                    }

                    Section("Open Tasks") {
                        ForEach(openTasks) { task in
                            Button {
                                selectedTaskID = task.id
                                showingTaskPicker = false
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(task.title)
                                            .font(IOSTypography.body)
                                            .foregroundStyle(IOSColor.ink(colorScheme))
                                        if let due = task.dueAt, let date = IOSProductCalendar.date(from: due) {
                                            Text("Due \(date.formatted(date: .abbreviated, time: .shortened))")
                                                .font(IOSTypography.caption)
                                                .foregroundStyle(IOSColor.inkDim(colorScheme))
                                        }
                                    }
                                    Spacer()
                                    if selectedTaskID == task.id {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(IOSColor.teal(colorScheme))
                                    }
                                }
                            }
                        }
                    }
                }
                .navigationTitle("Attach Task")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showingTaskPicker = false }
                    }
                }
            }
            .presentationDetents([.medium, .large])
        }
    }

    // MARK: - Inactive Focus View

    private var inactiveFocusView: some View {
        IOSPage {
            // Setup Card
            setupCard

            // Soundtrack Selector Card
            soundtrackCard

            // Today's Focus Metrics
            todayMetricsCard

            // Recent Sessions
            recentSessionsSection
        }
    }

    private var setupCard: some View {
        IOSHeroCard {
            VStack(alignment: .leading, spacing: IOSSpacing.normal) {
                HStack {
                    Label("DEEP WORK", systemImage: "timer")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.mint(colorScheme))
                    Spacer()
                }

                Text("Choose session length")
                    .font(IOSTypography.title)
                    .foregroundStyle(.white)

                // Duration Selector Chips
                HStack(spacing: IOSSpacing.tight) {
                    ForEach(presetDurations, id: \.self) { duration in
                        let isSelected = selectedDuration == duration
                        Button {
                            selectedDuration = duration
                        } label: {
                            Text("\(duration)m")
                                .font(IOSTypography.headline)
                                .padding(.horizontal, 14)
                                .padding(.vertical, 8)
                                .background(
                                    isSelected
                                        ? IOSColor.mint(colorScheme)
                                        : Color.white.opacity(0.14),
                                    in: Capsule()
                                )
                                .foregroundStyle(
                                    isSelected
                                        ? IOSColor.forestDeep(colorScheme)
                                        : .white
                                )
                        }
                        .buttonStyle(.plain)
                    }
                }

                Divider()
                    .overlay(Color.white.opacity(0.18))

                // Optional Task Selector Button
                Button {
                    showingTaskPicker = true
                } label: {
                    HStack(spacing: IOSSpacing.compact) {
                        Image(systemName: selectedTask != nil ? "checklist.checked" : "square.dashed")
                            .font(.headline)
                            .foregroundStyle(IOSColor.mint(colorScheme))

                        VStack(alignment: .leading, spacing: 2) {
                            Text(selectedTask?.title ?? "Free Focus")
                                .font(IOSTypography.headline)
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Text(selectedTask != nil ? "Attached Task" : "Tap to attach a task (optional)")
                                .font(IOSTypography.caption)
                                .foregroundStyle(.white.opacity(0.7))
                        }

                        Spacer()

                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.white.opacity(0.6))
                    }
                    .padding(IOSSpacing.compact)
                    .background(Color.white.opacity(0.1), in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous))
                }
                .buttonStyle(.plain)

                // Start Focus Button
                Button {
                    startSession()
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "play.fill")
                        Text("Start Focus (\(selectedDuration) min)")
                    }
                    .font(IOSTypography.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(IOSColor.mint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous))
                    .foregroundStyle(IOSColor.forestDeep(colorScheme))
                }
                .buttonStyle(.plain)
                .padding(.top, 4)
            }
        }
    }

    private func startSession() {
        Task {
            let title = selectedTask?.title ?? "Focused Work"
            await model.startFocus(title: title, plannedSeconds: selectedDuration * 60)
        }
    }

    // MARK: - Active Immersive Focus View

    private func activeFocusView(_ session: FocusSession) -> some View {
        TimelineView(.periodic(from: Date(), by: 1)) { context in
            let elapsed = elapsedSeconds(for: session, now: context.date)
            let planned = max(1, session.plannedSeconds ?? selectedDuration * 60)
            let progress = min(1, max(0, CGFloat(elapsed) / CGFloat(planned)))

            ZStack {
                IOSColor.forestDeep(colorScheme)
                    .ignoresSafeArea()

                VStack(spacing: IOSSpacing.section) {
                    // Top Session Phase Badge
                    HStack {
                        Label(session.phase.displayName.uppercased(), systemImage: "timer")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(IOSColor.mint(colorScheme))
                        Spacer()
                        Text(session.status == .paused ? "PAUSED" : "FOCUSING")
                            .font(IOSTypography.kicker)
                            .tracking(1.2)
                            .foregroundStyle(session.status == .paused ? IOSColor.amber(colorScheme) : IOSColor.mint(colorScheme))
                    }
                    .padding(.horizontal, IOSSpacing.major)
                    .padding(.top, IOSSpacing.normal)

                    // Session Title
                    Text(session.customTitle ?? session.taskTitleSnapshot ?? "Focused Work")
                        .font(IOSTypography.title)
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, IOSSpacing.normal)
                        .lineLimit(2)

                    Spacer()

                    // Circular Countdown Ring
                    ZStack {
                        Circle()
                            .stroke(Color.white.opacity(0.12), lineWidth: 16)

                        Circle()
                            .trim(from: 0, to: progress)
                            .stroke(
                                IOSColor.mint(colorScheme),
                                style: StrokeStyle(lineWidth: 16, lineCap: .round)
                            )
                            .rotationEffect(.degrees(-90))
                            .animation(.linear(duration: 1), value: progress)

                        VStack(spacing: 4) {
                            Text(timerText(for: session, elapsed: elapsed))
                                .font(.system(size: 48, weight: .bold, design: .monospaced))
                                .monospacedDigit()
                                .foregroundStyle(.white)

                            Text("remaining")
                                .font(IOSTypography.caption)
                                .foregroundStyle(.white.opacity(0.65))
                        }
                    }
                    .frame(width: 220, height: 220)

                    Spacer()

                    // Active Ambient Sound Bar
                    if audioPlayer.isPlaying {
                        HStack(spacing: IOSSpacing.compact) {
                            Image(systemName: "speaker.wave.2.fill")
                                .foregroundStyle(IOSColor.mint(colorScheme))
                            Text(audioPlayer.selectedSound?.name ?? "Background Audio")
                                .font(IOSTypography.captionBold)
                                .foregroundStyle(.white)
                            Spacer()
                            Button {
                                Task { await audioPlayer.toggle(using: model.apiClient) }
                            } label: {
                                Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                                    .foregroundStyle(.white)
                            }
                        }
                        .padding(.horizontal, 16)
                        .padding(.vertical, 10)
                        .background(Color.white.opacity(0.1), in: Capsule())
                        .padding(.horizontal, IOSSpacing.major)
                    }

                    // Bottom Action Controls
                    HStack(spacing: IOSSpacing.normal) {
                        if session.status == .active {
                            Button {
                                Task { await model.handleFocusIntent(.pause) }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "pause.fill")
                                    Text("Pause")
                                }
                                .font(IOSTypography.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(Color.white.opacity(0.18), in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous))
                                .foregroundStyle(.white)
                            }
                            .buttonStyle(.plain)
                        } else {
                            Button {
                                Task { await model.handleFocusIntent(.resume) }
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: "play.fill")
                                    Text("Resume")
                                }
                                .font(IOSTypography.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                                .background(IOSColor.mint(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous))
                                .foregroundStyle(IOSColor.forestDeep(colorScheme))
                            }
                            .buttonStyle(.plain)
                        }

                        Button {
                            Task { await model.finishFocus(session) }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "checkmark")
                                Text("Finish")
                            }
                            .font(IOSTypography.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(IOSColor.teal(colorScheme), in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous))
                            .foregroundStyle(.white)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, IOSSpacing.major)
                    .padding(.bottom, IOSSpacing.major)
                }
            }
        }
    }

    // MARK: - Soundtrack Card

    private var soundtrackCard: some View {
        IOSCard {
            VStack(alignment: .leading, spacing: IOSSpacing.compact) {
                HStack {
                    Label("SOUNDSCAPE", systemImage: "headphones")
                        .font(IOSTypography.kicker)
                        .tracking(1.2)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                    Spacer()
                    if audioPlayer.isPlaying {
                        Text("PLAYING")
                            .font(IOSTypography.kicker)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                    }
                }

                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: IOSSpacing.tight) {
                        ForEach(audioPlayer.sounds) { sound in
                            let isSelected = audioPlayer.selectedSound?.id == sound.id
                            Button {
                                audioPlayer.select(sound)
                            } label: {
                                HStack(spacing: 6) {
                                    Image(systemName: soundIcon(sound.name))
                                    Text(sound.name)
                                }
                                .font(IOSTypography.captionBold)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(
                                    isSelected
                                        ? IOSColor.teal(colorScheme)
                                        : IOSColor.surfaceMuted(colorScheme),
                                    in: Capsule()
                                )
                                .foregroundStyle(
                                    isSelected
                                        ? .white
                                        : IOSColor.ink(colorScheme)
                                )
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }

                if audioPlayer.selectedSound != nil {
                    HStack(spacing: IOSSpacing.compact) {
                        Button {
                            Task { await audioPlayer.toggle(using: model.apiClient) }
                        } label: {
                            Image(systemName: audioPlayer.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                .font(.title2)
                                .foregroundStyle(IOSColor.teal(colorScheme))
                        }
                        .buttonStyle(.plain)

                        Slider(
                            value: Binding(
                                get: { Double(audioPlayer.volume) },
                                set: { audioPlayer.volume = Float($0) }
                            ),
                            in: 0...1
                        )
                        .tint(IOSColor.teal(colorScheme))
                    }
                }
            }
        }
    }

    private func soundIcon(_ icon: String) -> String {
        switch icon.lowercased() {
        case "rain": return "cloud.rain.fill"
        case "forest": return "leaf.fill"
        case "ocean": return "water.waves"
        case "fire": return "flame.fill"
        default: return "waveform"
        }
    }

    // MARK: - Today Metrics Card

    private var todayMetricsCard: some View {
        HStack(spacing: IOSSpacing.tight) {
            IOSMetricCard(
                title: "Today Focus",
                value: formattedTodayMinutes,
                icon: "timer",
                tint: IOSColor.teal(colorScheme)
            )

            IOSMetricCard(
                title: "Sessions",
                value: "\(todaySessionsCount)",
                icon: "checkmark.circle",
                tint: IOSColor.mint(colorScheme)
            )

            IOSMetricCard(
                title: "All Time",
                value: "\(totalSessionsCount)",
                icon: "hourglass",
                tint: IOSColor.amber(colorScheme)
            )
        }
    }

    // MARK: - Recent Sessions Section

    private var recentSessionsSection: some View {
        IOSSection(title: "Recent Sessions", subtitle: "\(completedHistory.count) total") {
            if completedHistory.isEmpty {
                IOSEmptyState(
                    icon: "timer",
                    title: "No Completed Sessions",
                    description: "Your finished focus sessions will be cataloged here."
                )
            } else {
                VStack(spacing: IOSSpacing.tight) {
                    ForEach(Array(completedHistory.prefix(5))) { session in
                        recentSessionRow(session)
                    }
                }
            }
        }
    }

    private func recentSessionRow(_ session: FocusSession) -> some View {
        HStack(spacing: IOSSpacing.compact) {
            Image(systemName: "checkmark.circle.fill")
                .font(.headline)
                .foregroundStyle(IOSColor.teal(colorScheme))

            VStack(alignment: .leading, spacing: 2) {
                Text(session.customTitle ?? session.taskTitleSnapshot ?? "Focus Session")
                    .font(IOSTypography.subheadline)
                    .fontWeight(.medium)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                    .lineLimit(1)
                Text(session.phase.displayName)
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            }

            Spacer()

            Text(durationLabel(for: session))
                .font(IOSTypography.caption)
                .monospacedDigit()
                .foregroundStyle(IOSColor.inkFaint(colorScheme))
        }
        .padding(.horizontal, IOSSpacing.normal)
        .padding(.vertical, IOSSpacing.compact)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
        }
    }

    // MARK: - Helpers & Timing

    private var openTasks: [ProductivityTask] {
        model.tasks.filter { $0.status != .completed && $0.status != .archived && $0.status != .canceled }
    }

    private var selectedTask: ProductivityTask? {
        guard let selectedTaskID else { return nil }
        return model.tasks.first { $0.id == selectedTaskID }
    }

    private var completedHistory: [FocusSession] {
        model.focusSessions
            .filter { $0.status == .completed || $0.status == .abandoned }
            .sorted { ($0.completedAt ?? $0.startedAt) > ($1.completedAt ?? $1.startedAt) }
    }

    private var todaySessionsCount: Int {
        let day = String(IOSProductCalendar.dayString().prefix(10))
        return model.focusSessions.filter { ($0.startedAt).starts(with: day) }.count
    }

    private var totalSessionsCount: Int {
        model.focusSessions.filter { $0.status == .completed }.count
    }

    private var formattedTodayMinutes: String {
        let day = String(IOSProductCalendar.dayString().prefix(10))
        let totalSeconds = model.focusSessions.filter { $0.startedAt.starts(with: day) }
            .reduce(0) { (res: Int, s: FocusSession) in res + (s.plannedSeconds ?? 0) }
        let mins = totalSeconds / 60
        return "\(mins)m"
    }

    private func elapsedSeconds(for session: FocusSession, now: Date) -> Int {
        guard let startDate = ISO8601DateFormatter().date(from: session.startedAt) else { return 0 }
        let totalElapsed = max(0, Int(now.timeIntervalSince(startDate)))
        let pauses = session.accumulatedPauseSecs
        return max(0, totalElapsed - pauses)
    }

    private func timerText(for session: FocusSession, elapsed: Int) -> String {
        let planned = session.plannedSeconds ?? selectedDuration * 60
        let remaining = max(0, planned - elapsed)
        let minutes = remaining / 60
        let seconds = remaining % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }

    private func durationLabel(for session: FocusSession) -> String {
        let secs = session.plannedSeconds ?? 0
        return "\(secs / 60)m"
    }

    private func loadFocusSounds() async {
        audioPlayer.configure(catalog: IOSFocusAudioPlayer.builtInCatalog)
    }
}
