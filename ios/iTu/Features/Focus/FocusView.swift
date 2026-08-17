import SwiftUI
import iTuDomain
import iTuDesignCore

struct FocusView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @StateObject private var audioPlayer = IOSFocusAudioPlayer.shared
    @State private var selectedDuration = 25

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                SyncBanner()
                if let active = model.activeFocusSession {
                    activeSessionCard(active)
                } else {
                    startCard
                }
                audioCard
                recentFocusCard
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .scrollIndicators(.hidden)
        .background(iTuTheme.color(iTuDesignTokens.canvas, scheme: colorScheme))
        .navigationTitle("Focus")
        .navigationBarTitleDisplayMode(.inline)
        .task { await loadFocusSounds() }
    }

    private func activeSessionCard(_ session: FocusSession) -> some View {
        TimelineView(.periodic(from: Date(), by: 1)) { context in
            let elapsed = elapsedSeconds(for: session, now: context.date)
            let planned = max(1, session.plannedSeconds ?? 25 * 60)
            VStack(spacing: 18) {
                HStack {
                    Label(session.phase.displayName, systemImage: "timer")
                        .font(.caption.weight(.semibold))
                        .textCase(.uppercase)
                        .tracking(1)
                    Spacer()
                    Text(session.status == .paused ? "Paused" : "In focus")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(iTuTheme.color(iTuDesignTokens.mint, scheme: colorScheme))
                }
                Text(session.customTitle ?? session.taskTitleSnapshot ?? "Focused work")
                    .font(.title2.bold())
                    .frame(maxWidth: .infinity, alignment: .leading)
                ZStack {
                    Circle()
                        .stroke(.white.opacity(0.16), lineWidth: 12)
                    Circle()
                        .trim(from: 0, to: min(1, CGFloat(elapsed) / CGFloat(planned)))
                        .stroke(iTuTheme.color(iTuDesignTokens.mint, scheme: colorScheme), style: StrokeStyle(lineWidth: 12, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    VStack(spacing: 4) {
                        Text(timerText(for: session, elapsed: elapsed))
                            .font(.system(size: 42, weight: .bold, design: .monospaced))
                            .monospacedDigit()
                        Text("remaining")
                            .font(.caption)
                            .foregroundStyle(.white.opacity(0.68))
                    }
                }
                .frame(width: 192, height: 192)
                HStack(spacing: 10) {
                    if session.status == .active {
                        Button("Pause", systemImage: "pause.fill") { Task { await model.handleFocusIntent(.pause) } }
                            .buttonStyle(.bordered)
                    } else {
                        Button("Resume", systemImage: "play.fill") { Task { await model.handleFocusIntent(.resume) } }
                            .buttonStyle(.bordered)
                    }
                    Button("Finish", systemImage: "checkmark") { Task { await model.finishFocus(session) } }
                        .buttonStyle(.borderedProminent)
                }
            }
            .frame(maxWidth: .infinity)
            .padding(20)
            .foregroundStyle(.white)
            .background(forestGradient, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .accessibilityElement(children: .contain)
        }
    }

    private var startCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            Label("Focus timer", systemImage: "timer")
                .font(.caption.weight(.semibold))
                .textCase(.uppercase)
                .tracking(1)
                .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
            Text("Make room for the work")
                .font(.title2.bold())
            Text("Choose a session length, then keep your attention in one place.")
                .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
            Picker("Session length", selection: $selectedDuration) {
                Text("25 min").tag(25)
                Text("50 min").tag(50)
                Text("90 min").tag(90)
            }
            .pickerStyle(.segmented)
            Button("Start Focus", systemImage: "play.fill") {
                Task { await model.startFocus(title: "", plannedSeconds: selectedDuration * 60) }
            }
            .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(18)
        .iTuMobilePanel(cornerRadius: 18)
    }

    private var audioCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Focus soundtrack", systemImage: "waveform")
                    .font(.headline)
                Spacer()
                Menu {
                    ForEach(audioPlayer.sounds) { sound in
                        Button {
                            audioPlayer.select(sound)
                            Task { _ = try? await model.apiClient.updateFocusSoundPreference(soundKey: sound.id, enabled: true) }
                        } label: {
                            Label(sound.name, systemImage: soundIcon(for: sound))
                        }
                    }
                } label: {
                    Label(audioPlayer.selectedSound?.name ?? "Choose", systemImage: "chevron.up.chevron.down")
                        .font(.subheadline.weight(.semibold))
                }
                .disabled(audioPlayer.sounds.isEmpty)
            }
            HStack(alignment: .center, spacing: 3) {
                ForEach(Array(audioPlayer.waveformHeights().enumerated()), id: \.offset) { _, height in
                    Capsule()
                        .fill(iTuTheme.color(iTuDesignTokens.mint, scheme: colorScheme).opacity(audioPlayer.isPlaying ? 0.95 : 0.42))
                        .frame(maxWidth: .infinity)
                        .frame(height: height)
                }
            }
            .frame(height: 38)
            HStack(spacing: 12) {
                Button {
                    Task { await audioPlayer.toggle(using: model.apiClient) }
                } label: {
                    Image(systemName: audioPlayer.isLoading ? "ellipsis" : (audioPlayer.isPlaying ? "pause.fill" : "play.fill"))
                        .frame(width: 36, height: 36)
                }
                .buttonStyle(.borderedProminent)
                .disabled(audioPlayer.selectedSound == nil || audioPlayer.isLoading)
                Label("Volume", systemImage: "speaker.wave.2.fill")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.7))
                Slider(value: Binding(
                    get: { Double(audioPlayer.volume) },
                    set: { audioPlayer.volume = Float($0) }
                ), in: 0...1)
                Button { audioPlayer.stop() } label: {
                    Image(systemName: "stop.fill")
                }
                .buttonStyle(.bordered)
            }
            if let errorMessage = audioPlayer.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.78))
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(audioPlayer.isPlaying ? "Playing while you focus" : "Choose a sound for the session")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.68))
            }
        }
        .padding(18)
        .foregroundStyle(.white)
        .background(forestGradient, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private var recentFocusCard: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Label("Recent focus", systemImage: "clock.arrow.circlepath")
                    .font(.headline)
                Spacer()
                Text("\(completedHistory.count) sessions")
                    .font(.caption)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
            }
            HStack(spacing: 10) {
                statTile("Today", value: "\(todayMinutes)m", icon: "sun.max.fill")
                statTile("Completed", value: "\(completedHistory.count)", icon: "checkmark.circle.fill")
                statTile("Total", value: "\(totalMinutes)m", icon: "hourglass")
            }
            if groupedHistory.isEmpty {
                Text("Completed Focus Sessions will appear here.")
                    .font(.subheadline)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
            } else {
                ForEach(Array(groupedHistory.enumerated()), id: \.offset) { _, group in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(group.0)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                        ForEach(group.1) { session in
                            HStack(spacing: 10) {
                                Image(systemName: session.status == .completed ? "checkmark.circle.fill" : "circle.dashed")
                                    .foregroundStyle(session.status == .completed ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme) : .secondary)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(session.customTitle ?? session.taskTitleSnapshot ?? "Focus Session")
                                        .lineLimit(1)
                                    Text(session.phase.displayName)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Text(durationLabel(for: session))
                                    .font(.caption.monospacedDigit())
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                }
            }
        }
        .padding(16)
        .iTuMobilePanel()
    }

    private func statTile(_ title: String, value: String, icon: String) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            Image(systemName: icon).foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
            Text(value).font(.headline.monospacedDigit())
            Text(title).font(.caption2).foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(iTuTheme.color(iTuDesignTokens.surfaceMuted, scheme: colorScheme), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private var completedHistory: [FocusSession] {
        model.focusSessions
            .filter { $0.status == .completed || $0.status == .abandoned }
            .sorted { ($0.completedAt ?? $0.startedAt) > ($1.completedAt ?? $1.startedAt) }
    }

    private var groupedHistory: [(String, [FocusSession])] {
        Dictionary(grouping: completedHistory) { session in
            guard let date = IOSProductCalendar.date(from: session.completedAt ?? session.startedAt) else { return "Earlier" }
            return IOSProductCalendar.dayString(date)
        }
        .sorted { $0.key > $1.key }
    }

    private var todayMinutes: Int {
        let today = IOSProductCalendar.dayString(Date())
        return completedHistory.filter {
            guard let date = IOSProductCalendar.date(from: $0.completedAt ?? $0.startedAt) else { return false }
            return IOSProductCalendar.dayString(date) == today
        }.reduce(0) { $0 + duration(for: $1) } / 60
    }

    private var totalMinutes: Int { completedHistory.reduce(0) { $0 + duration(for: $1) } / 60 }

    private func elapsedSeconds(for session: FocusSession, now: Date) -> Int {
        guard let start = IOSProductCalendar.date(from: session.adjustedStartedAt ?? session.startedAt) else { return 0 }
        let end = IOSProductCalendar.date(from: session.pausedAt ?? session.completedAt ?? "") ?? now
        return max(0, Int(end.timeIntervalSince(start)) - session.accumulatedPauseSecs)
    }

    private func duration(for session: FocusSession) -> Int {
        elapsedSeconds(for: session, now: IOSProductCalendar.date(from: session.completedAt ?? "") ?? Date())
    }

    private func durationLabel(for session: FocusSession) -> String {
        let seconds = duration(for: session)
        return "\(seconds / 60)m"
    }

    private func timerText(for session: FocusSession, elapsed: Int) -> String {
        let planned = max(1, session.plannedSeconds ?? 25 * 60)
        let remaining = planned - elapsed
        return remaining < 0 ? "+\(formatTime(-remaining))" : formatTime(remaining)
    }

    private func formatTime(_ seconds: Int) -> String {
        String(format: "%02d:%02d", seconds / 60, seconds % 60)
    }

    private func soundIcon(for sound: FocusSound) -> String {
        switch sound.category.lowercased() {
        case "nature": "leaf.fill"
        case "atmosphere": "cup.and.saucer.fill"
        default: "waveform"
        }
    }

    private func loadFocusSounds() async {
        audioPlayer.configure(catalog: IOSFocusAudioPlayer.builtInCatalog)
        if let catalog = try? await model.apiClient.fetchFocusSounds() {
            audioPlayer.configure(catalog: catalog)
        }
    }

    private var forestGradient: LinearGradient {
        LinearGradient(
            colors: [
                iTuTheme.color(iTuDesignTokens.forest, scheme: colorScheme),
                iTuTheme.color(iTuDesignTokens.forestDeep, scheme: colorScheme)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }
}

private extension FocusPhase {
    var displayName: String {
        switch self {
        case .work: "Work"
        case .shortBreak: "Short Break"
        case .longBreak: "Long Break"
        }
    }
}
