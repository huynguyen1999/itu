import AppKit
import SwiftUI

enum MenuBarTab: String, CaseIterable, Identifiable {
    case timer
    case statistics
    case settings

    var id: String { rawValue }
}

struct MenuBarView: View {
    @Environment(AppModel.self) private var model
    var onOpenMainWindow: @MainActor () -> Void = {}

    @State private var selectedTab: MenuBarTab = .timer
    @State private var isEditingTitle = false
    @State private var isEditingTime = false
    @State private var titleInput = ""
    @State private var editMinutes = "30"
    @State private var editSeconds = "00"
    @State private var showTagPopover = false
    @State private var showTaskPickerPopover = false
    @State private var taskSearchQuery = ""

    var body: some View {
        VStack(spacing: 0) {
            topControlBar
            activeSubView
        }
        .frame(width: 320)
        .background(Color(red: 0.12, green: 0.13, blue: 0.15))
        .preferredColorScheme(.dark)
        .onAppear {
            titleInput = model.focusTimer.currentTitle
        }
        .onChange(of: model.focusTimer.activeSession?.id) { _, _ in
            titleInput = model.focusTimer.currentTitle
        }
    }

    @ViewBuilder
    private var activeSubView: some View {
        switch selectedTab {
        case .timer:
            timerMainView
        case .statistics:
            statisticsSubView
        case .settings:
            settingsSubView
        }
    }

    // MARK: - Timer Main View

    private var timerMainView: some View {
        VStack(spacing: 0) {
            contentCard
            statisticsStrip
            bottomActionBar
        }
    }

    // MARK: - Top Header Control Bar

    private var topControlBar: some View {
        HStack(spacing: 8) {
            topControlBarLeft
            Spacer()
            topControlBarRight
        }
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 6)
    }

    private var topControlBarLeft: some View {
        HStack(spacing: 6) {
            if selectedTab != .timer {
                Button {
                    withAnimation(.easeInOut(duration: 0.15)) {
                        selectedTab = .timer
                    }
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(Color.white.opacity(0.8))
                        .frame(width: 26, height: 26)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help("Back to Timer")
            } else {
                Button {
                    openMainWindow()
                } label: {
                    Image(systemName: "arrow.up.left.and.arrow.down.right")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(Color.white.opacity(0.6))
                        .frame(width: 26, height: 26)
                        .background(Color.white.opacity(0.08))
                        .clipShape(Circle())
                }
                .buttonStyle(.plain)
                .help("Open Main iTu Window")
            }

            Text(headerTitle)
                .font(.system(size: 11, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.7))
        }
    }

    @ViewBuilder
    private var topControlBarRight: some View {
        HStack(spacing: 6) {
            if selectedTab == .timer {
                if model.focusTimer.activeSession?.phase == .work || model.focusTimer.activeSession == nil {
                    tagPickerButton
                }


            }

            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    selectedTab = (selectedTab == .statistics ? .timer : .statistics)
                }
            } label: {
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(selectedTab == .statistics ? iTuTheme.mint : Color.white.opacity(0.7))
                    .frame(width: 30, height: 30)
                    .background(selectedTab == .statistics ? iTuTheme.mint.opacity(0.2) : Color.white.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .help("Focus Statistics")

            Button {
                withAnimation(.easeInOut(duration: 0.15)) {
                    selectedTab = (selectedTab == .settings ? .timer : .settings)
                }
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(selectedTab == .settings ? iTuTheme.mint : Color.white.opacity(0.7))
                    .frame(width: 30, height: 30)
                    .background(selectedTab == .settings ? iTuTheme.mint.opacity(0.2) : Color.white.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)
            .help("Focus Settings")

            Menu {
                Button("Quit iTu") { NSApplication.shared.terminate(nil) }
            } label: {
                Image(systemName: "ellipsis")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.7))
                    .frame(width: 30, height: 30)
                    .background(Color.white.opacity(0.1))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .menuStyle(.borderlessButton)
            .frame(width: 30, height: 30)
        }
    }

    private var tagPickerButton: some View {
        let hasTags = !model.focusTimer.selectedTagIds.isEmpty
        return Button {
            showTagPopover.toggle()
        } label: {
            ZStack {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .fill(hasTags ? Color(red: 0.95, green: 0.42, blue: 0.30) : Color.white.opacity(0.1))
                    .frame(width: 30, height: 30)

                Image(systemName: "tag.fill")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(hasTags ? .white : Color.white.opacity(0.7))
            }
        }
        .buttonStyle(.plain)
        .popover(isPresented: $showTagPopover, arrowEdge: .top) {
            tagPickerPopover
        }
        .help(hasTags ? "\(model.focusTimer.selectedTagIds.count) Tag(s) selected" : "Select Tags")
    }

    private var headerTitle: String {
        switch selectedTab {
        case .timer:
            return statusLabel
        case .statistics:
            return "Statistics"
        case .settings:
            return "Settings"
        }
    }

    // MARK: - Content Card

    @ViewBuilder
    private var contentCard: some View {
        VStack(spacing: 12) {
            if model.focusTimer.activeSession == nil {
                idleContentCard
            } else {
                activeContentCard
            }
        }
        .padding(.vertical, 14)
        .padding(.horizontal, 16)
    }

    @ViewBuilder
    private var idleContentCard: some View {
        if model.focusTimer.isBreakPending {
            VStack(spacing: 6) {
                Text("Focus Complete 🎯")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.mint)
                Text("\(model.focusCycleEngine.nextPhase == .longBreak ? "Long" : "Short") break ready · \(model.focusCycleEngine.nextPhase == .longBreak ? model.settingsStore.focusSettings.longBreakMinutes : model.settingsStore.focusSettings.shortBreakMinutes) min")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.7))
            }
        } else if model.focusTimer.isWorkPending {
            VStack(spacing: 6) {
                Text("Break Complete ☕️")
                    .font(.system(size: 16, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.mint)
                Text("Ready for your next focus session")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.7))
            }
        } else {
            modeSelector

            if model.focusTimer.timerMode == .focus {
                editableTitleView
            }
            digitalClockView
        }
    }

    @ViewBuilder
    private var activeContentCard: some View {
        if model.focusTimer.activeSession?.phase == .work {
            editableTitleView
        } else {
            Text(model.focusTimer.activeSession?.phase == .shortBreak ? "Short Break" : "Long Break")
                .font(.system(size: 18, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.9))
        }
        digitalClockView
    }

    // MARK: - Mode Selector (Idle state)

    private var modeSelector: some View {
        HStack(spacing: 4) {
            ForEach(TimerMode.allCases) { mode in
                let isSelected = model.focusTimer.timerMode == mode
                Button {
                    model.focusTimer.setMode(mode)
                } label: {
                    Text(mode.title)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundStyle(isSelected ? .white : Color.white.opacity(0.5))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 5)
                        .background(isSelected ? Color.white.opacity(0.15) : Color.clear)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(3)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    // MARK: - Title Input & Task Picker

    private var isTaskLinked: Bool {
        model.focusTimer.linkedTask != nil || model.focusTimer.activeSession?.taskId != nil
    }

    private var editableTitleView: some View {
        HStack(spacing: 8) {
            if isEditingTitle {
                TextField("Focus Title…", text: $titleInput)
                    .textFieldStyle(.plain)
                    .font(.system(size: 18, weight: .semibold, design: .rounded))
                    .foregroundStyle(.white)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8, style: .continuous)
                            .stroke(iTuTheme.mint, lineWidth: 1.5)
                    )
                    .onSubmit { commitTitleChange() }
            } else {
                Button {
                    titleInput = model.focusTimer.currentTitle
                    isEditingTitle = true
                } label: {
                    HStack(spacing: 5) {
                        Text(model.focusTimer.currentTitle)
                            .font(.system(size: 18, weight: .semibold, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.92))
                            .lineLimit(1)
                        Image(systemName: "pencil")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(Color.white.opacity(0.4))
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 4)
                    .background(Color.white.opacity(0.05))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .help("Click to edit focus title")
            }

            Button {
                showTaskPickerPopover.toggle()
            } label: {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(isTaskLinked ? iTuTheme.mint.opacity(0.25) : Color.white.opacity(0.08))
                        .frame(width: 28, height: 28)

                    Image(systemName: "list.bullet.indent")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(isTaskLinked ? iTuTheme.mint : Color.white.opacity(0.6))
                }
            }
            .buttonStyle(.plain)
            .popover(isPresented: $showTaskPickerPopover, arrowEdge: .top) {
                taskPickerPopover
            }
            .help("Assign task to focus session")
        }
    }

    // MARK: - Digital Clock Component

    private var digitalClockView: some View {
        Group {
            if isEditingTime && model.focusTimer.activeSession == nil {
                HStack(spacing: 4) {
                    TextField("30", text: $editMinutes)
                        .font(.system(size: 48, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.plain)
                        .frame(width: 75)
                        .onSubmit { applyInlineTime() }

                    Text(":")
                        .font(.system(size: 48, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.7))

                    TextField("00", text: $editSeconds)
                        .font(.system(size: 48, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.leading)
                        .textFieldStyle(.plain)
                        .frame(width: 75)
                        .onSubmit { applyInlineTime() }
                }
                .padding(.horizontal, 8)
                .background(Color.white.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(iTuTheme.mint, lineWidth: 1.5)
                )
            } else {
                Button {
                    guard model.focusTimer.activeSession == nil else { return }
                    let totalSecs = model.focusTimer.displaySeconds
                    editMinutes = String(format: "%02d", totalSecs / 60)
                    editSeconds = String(format: "%02d", totalSecs % 60)
                    isEditingTime = true
                } label: {
                    Text(model.focusTimer.formattedRemaining)
                        .font(.system(size: 52, weight: .bold, design: .monospaced))
                        .tracking(-2)
                        .foregroundStyle(model.focusTimer.displaySeconds < 0 ? Color(red: 0.40, green: 0.94, blue: 0.82) : .white)
                        .monospacedDigit()
                        .shadow(color: Color.black.opacity(0.3), radius: 6, y: 2)
                }
                .buttonStyle(.plain)
                .disabled(model.focusTimer.activeSession != nil)
            }
        }
    }

    // MARK: - Statistics Strip

    private var statisticsStrip: some View {
        HStack(spacing: 12) {
            VStack(spacing: 2) {
                Text("\(model.focusTimer.todayFocusedMinutes)m")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text("Focus Today")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)

            Divider()
                .frame(height: 24)
                .background(Color.white.opacity(0.1))

            VStack(spacing: 2) {
                Text("\(model.focusTimer.todayCompletedSessionsCount)")
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text("Completed")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)

            Divider()
                .frame(height: 24)
                .background(Color.white.opacity(0.1))

            VStack(spacing: 2) {
                Text(model.focusCycleEngine.cycleProgressString)
                    .font(.system(size: 13, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.mint)
                Text("Cycle")
                    .font(.system(size: 9, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)
        }
        .padding(.vertical, 8)
        .padding(.horizontal, 14)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .padding(.horizontal, 14)
        .padding(.bottom, 10)
    }

    // MARK: - Bottom Action Controls

    @ViewBuilder
    private var bottomActionBar: some View {
        VStack(spacing: 10) {
            if model.focusTimer.activeSession == nil {
                idleActionBar
            } else {
                activeActionBar
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 14)
    }

    @ViewBuilder
    private var idleActionBar: some View {
        if model.focusTimer.isBreakPending {
            HStack(spacing: 10) {
                Button {
                    if model.focusCycleEngine.nextPhase == .longBreak {
                        _ = FocusCommandService.shared.startLongBreak()
                    } else {
                        _ = FocusCommandService.shared.startShortBreak()
                    }
                } label: {
                    Text("Start Break")
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(Color(red: 0.40, green: 0.94, blue: 0.82))
                        .frame(maxWidth: .infinity, minHeight: 38)
                        .background(Color.white.opacity(0.12))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)

                Button {
                    model.focusCycleEngine.skipScheduledBreak()
                    model.focusTimer.isBreakPending = false
                } label: {
                    Text("Skip")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.7))
                        .frame(width: 60, height: 38)
                        .background(Color.white.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        } else if model.focusTimer.isWorkPending {
            Button {
                _ = FocusCommandService.shared.startFocus()
            } label: {
                Text("Start Focus")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(Color(red: 0.40, green: 0.94, blue: 0.82))
                    .frame(maxWidth: .infinity, minHeight: 40)
                    .background(Color.white.opacity(0.12))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }
            .buttonStyle(.plain)
        } else {
            Button {
                if isEditingTitle { commitTitleChange() }
                Task { await model.startFocus() }
            } label: {
                ZStack {
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Color(red: 0.18, green: 0.52, blue: 0.44), Color(red: 0.10, green: 0.35, blue: 0.30)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 56, height: 56)
                        .shadow(color: iTuTheme.teal.opacity(0.35), radius: 10, y: 3)

                    Image(systemName: "play.fill")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundStyle(Color(red: 0.40, green: 0.94, blue: 0.82))
                        .offset(x: 2)
                }
            }
            .buttonStyle(.plain)
            .disabled(model.focusTimer.isMutating)
        }
    }

    private var activeActionBar: some View {
        HStack(spacing: 6) {
            Button {
                Task {
                    await model.performFocusAction(model.focusTimer.isPaused ? "resume" : "pause")
                }
            } label: {
                HStack(spacing: 4) {
                    Image(systemName: model.focusTimer.isPaused ? "play.fill" : "pause.fill")
                        .font(.system(size: 11, weight: .bold))
                    Text(model.focusTimer.isPaused ? "Resume" : "Pause")
                        .font(.system(size: 12, weight: .semibold))
                        .lineLimit(1)
                        .fixedSize()
                }
                .foregroundStyle(.white)
                .padding(.horizontal, 10)
                .frame(height: 34)
                .background(
                    LinearGradient(
                        colors: [Color(red: 0.18, green: 0.52, blue: 0.44), Color(red: 0.10, green: 0.35, blue: 0.30)],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .clipShape(Capsule())
                .shadow(color: iTuTheme.teal.opacity(0.3), radius: 4, y: 1)
            }
            .buttonStyle(.plain)

            if model.focusTimer.activeSession?.phase == .work {
                Button {
                    Task { await model.performFocusAction("extend", extendSeconds: 300) }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "timer")
                            .font(.system(size: 11, weight: .semibold))
                        Text("+5m")
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                            .fixedSize()
                    }
                    .foregroundStyle(iTuTheme.ink)
                    .padding(.horizontal, 9)
                    .frame(height: 34)
                    .background(iTuTheme.mintTint)
                    .clipShape(Capsule())
                    .overlay(
                        Capsule()
                            .stroke(iTuTheme.border, lineWidth: 1)
                    )
                }
                .buttonStyle(.plain)
                .help("Add 5 minutes")
            }

            let isCompletable = model.focusTimer.elapsedSeconds >= (model.focusTimer.activeSession?.plannedSeconds ?? 0)
            if isCompletable {
                Button {
                    Task { await model.performFocusAction("complete") }
                } label: {
                    HStack(spacing: 4) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                        Text(model.focusTimer.activeSession?.phase == .work ? "Complete" : "End Break")
                            .font(.system(size: 12, weight: .semibold))
                            .lineLimit(1)
                            .fixedSize()
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 10)
                    .frame(height: 34)
                    .background(
                        LinearGradient(
                            colors: [Color(red: 0.14, green: 0.48, blue: 0.42), Color(red: 0.08, green: 0.32, blue: 0.28)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .clipShape(Capsule())
                    .shadow(color: iTuTheme.teal.opacity(0.3), radius: 4, y: 1)
                }
                .buttonStyle(.plain)
                .help(model.focusTimer.activeSession?.phase == .work ? "Complete Focus Session" : "End Break")
            }

            Button {
                Task { await model.performFocusAction("abandon") }
            } label: {
                Image(systemName: "arrow.counterclockwise")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)
                    .frame(width: 34, height: 34)
                    .background(iTuTheme.mintTint)
                    .clipShape(Circle())
                    .overlay(
                        Circle()
                            .stroke(iTuTheme.border, lineWidth: 1)
                    )
            }
            .buttonStyle(.plain)
            .help("Abandon session")
        }
    }

    // MARK: - Built-in Menu Bar Statistics SubView

    private var statisticsSubView: some View {
        VStack(alignment: .leading, spacing: 14) {
            statisticsCardsRow

            Text("Today's Completed Work")
                .font(.system(size: 11, weight: .bold))
                .foregroundStyle(Color.white.opacity(0.5))
                .padding(.top, 4)

            statisticsHistoryList
        }
        .padding(14)
    }

    private var statisticsCardsRow: some View {
        HStack(spacing: 8) {
            VStack(spacing: 4) {
                Text("\(model.focusTimer.todayFocusedMinutes)m")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.mint)
                Text("Today's Focus")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(spacing: 4) {
                Text("\(model.focusTimer.todayCompletedSessionsCount)")
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
                Text("Sessions Done")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))

            VStack(spacing: 4) {
                Text(model.focusCycleEngine.cycleProgressString)
                    .font(.system(size: 18, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.mint)
                Text("Cycle")
                    .font(.system(size: 10, weight: .medium))
                    .foregroundStyle(Color.white.opacity(0.5))
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, 10)
            .background(Color.white.opacity(0.06))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
    }

    private var completedTodaySessions: [FocusSession] {
        model.focusTimer.history.filter { session in
            session.phase == .work && session.status == .completed
        }
    }

    @ViewBuilder
    private var statisticsHistoryList: some View {
        if completedTodaySessions.isEmpty {
            emptyHistoryView
        } else {
            historyScrollView
        }
    }

    private var emptyHistoryView: some View {
        VStack(spacing: 8) {
            Image(systemName: "timer")
                .font(.system(size: 24))
                .foregroundStyle(Color.white.opacity(0.2))
            Text("No completed sessions today yet")
                .font(.system(size: 11))
                .foregroundStyle(Color.white.opacity(0.4))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.vertical, 30)
    }

    private var historyScrollView: some View {
        ScrollView {
            VStack(spacing: 6) {
                ForEach(completedTodaySessions) { session in
                    historyRow(session: session)
                }
            }
        }
        .frame(maxHeight: 180)
    }

    private func historyRow(session: FocusSession) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(sessionTitle(session))
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(Color.white.opacity(0.9))
                    .lineLimit(1)
                Text(formatDate(session.completedAt ?? session.startedAt))
                    .font(.system(size: 10))
                    .foregroundStyle(Color.white.opacity(0.4))
            }

            Spacer()

            Text(sessionDurationText(session))
                .font(.system(size: 12, weight: .bold, design: .monospaced))
                .foregroundStyle(iTuTheme.mint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func sessionTitle(_ session: FocusSession) -> String {
        if let custom = session.customTitle, !custom.isEmpty {
            return custom
        }
        if let taskTitle = session.taskTitleSnapshot, !taskTitle.isEmpty {
            return taskTitle
        }
        return "Focus Session"
    }

    private func sessionDurationText(_ session: FocusSession) -> String {
        let secs = session.plannedSeconds ?? 0
        return "\(secs / 60)m"
    }

    // MARK: - Built-in Menu Bar Settings SubView

    private var settingsSubView: some View {
        VStack(spacing: 12) {
            ScrollView {
                VStack(spacing: 10) {
                    workDurationSettingRow
                    shortBreakSettingRow
                    longBreakSettingRow
                    cyclesSettingRow
                    overtimeSettingRow
                    soundSettingRow
                    notificationSettingRow
                    autoStartBreaksSettingRow
                    autoStartWorkSettingRow
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 6)
            }
            .frame(maxHeight: 260)
        }
        .padding(.vertical, 8)
    }

    private var workDurationSettingRow: some View {
        settingsStepperRow(
            title: "Default Work Duration",
            subtitle: "Minutes per focus session (1–240m)",
            value: model.settingsStore.focusSettings.defaultWorkMinutes,
            range: 1...240,
            unit: "m"
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.defaultWorkMinutes = newValue
            applySettingsUpdate(updated)
        }
    }

    private var shortBreakSettingRow: some View {
        settingsStepperRow(
            title: "Short Break Duration",
            subtitle: "Minutes per short break (1–60m)",
            value: model.settingsStore.focusSettings.shortBreakMinutes,
            range: 1...60,
            unit: "m"
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.shortBreakMinutes = newValue
            applySettingsUpdate(updated)
        }
    }

    private var longBreakSettingRow: some View {
        settingsStepperRow(
            title: "Long Break Duration",
            subtitle: "Minutes per long break (1–120m)",
            value: model.settingsStore.focusSettings.longBreakMinutes,
            range: 1...120,
            unit: "m"
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.longBreakMinutes = newValue
            applySettingsUpdate(updated)
        }
    }

    private var cyclesSettingRow: some View {
        settingsStepperRow(
            title: "Sessions Before Long Break",
            subtitle: "Work sessions per cycle (1–20)",
            value: model.settingsStore.focusSettings.cyclesBeforeLongBreak,
            range: 1...20,
            unit: ""
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.cyclesBeforeLongBreak = newValue
            applySettingsUpdate(updated)
        }
    }

    private var overtimeSettingRow: some View {
        settingsToggleRow(
            title: "Continue Counting (+MM:SS)",
            subtitle: "Keep timer counting upward past 00:00 until completed",
            isOn: model.settingsStore.focusSettings.countExceededFocusTime
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.countExceededFocusTime = newValue
            updated.overtimeEnabled = newValue
            applySettingsUpdate(updated)
        }
    }

    private var soundSettingRow: some View {
        settingsToggleRow(
            title: "Chime Audio on Finish",
            subtitle: "Play chime sound when countdown reaches 00:00",
            isOn: model.settingsStore.focusSettings.finishSoundEnabled
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.finishSoundEnabled = newValue
            applySettingsUpdate(updated)
        }
    }

    private var notificationSettingRow: some View {
        settingsToggleRow(
            title: "System Desktop Notification",
            subtitle: "Show macOS notification banner when session finishes",
            isOn: model.settingsStore.focusSettings.desktopNotificationEnabled
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.desktopNotificationEnabled = newValue
            applySettingsUpdate(updated)
        }
    }

    private var autoStartBreaksSettingRow: some View {
        settingsToggleRow(
            title: "Auto-Start Breaks",
            subtitle: "Automatically start break timer when focus completes",
            isOn: model.settingsStore.focusSettings.autoStartBreaks
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.autoStartBreaks = newValue
            applySettingsUpdate(updated)
        }
    }

    private var autoStartWorkSettingRow: some View {
        settingsToggleRow(
            title: "Auto-Start Focus",
            subtitle: "Automatically start focus session when break finishes",
            isOn: model.settingsStore.focusSettings.autoStartWork
        ) { newValue in
            var updated = model.settingsStore.focusSettings
            updated.autoStartWork = newValue
            applySettingsUpdate(updated)
        }
    }

    private func settingsStepperRow(
        title: String,
        subtitle: String,
        value: Int,
        range: ClosedRange<Int>,
        unit: String,
        onChange: @escaping (Int) -> Void
    ) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.9))
                Text(subtitle)
                    .font(.system(size: 9))
                    .foregroundStyle(Color.white.opacity(0.5))
            }

            Spacer()

            HStack(spacing: 6) {
                Button {
                    let newVal = max(range.lowerBound, value - 1)
                    onChange(newVal)
                } label: {
                    Text("-")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color.white.opacity(0.8))
                        .frame(width: 24, height: 24)
                        .background(Color.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)

                Text("\(value)\(unit)")
                    .font(.system(size: 12, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.mint)
                    .frame(minWidth: 32, alignment: .center)

                Button {
                    let newVal = min(range.upperBound, value + 1)
                    onChange(newVal)
                } label: {
                    Text("+")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color.white.opacity(0.8))
                        .frame(width: 24, height: 24)
                        .background(Color.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func settingsToggleRow(
        title: String,
        subtitle: String,
        isOn: Bool,
        onChange: @escaping (Bool) -> Void
    ) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 11, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.9))
                Text(subtitle)
                    .font(.system(size: 9))
                    .foregroundStyle(Color.white.opacity(0.5))
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { isOn },
                set: { onChange($0) }
            ))
            .toggleStyle(.switch)
            .controlSize(.small)
            .labelsHidden()
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.05))
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
    }

    private func applySettingsUpdate(_ updated: FocusSettings) {
        model.settingsStore.focusSettings = updated
        model.focusTimer.configure(settings: updated)
        model.focusCycleEngine.configure(cyclesBeforeLongBreak: updated.cyclesBeforeLongBreak)
        if model.focusTimer.activeSession == nil {
            model.focusTimer.setDuration(minutes: updated.defaultWorkMinutes)
        }
    }

    private func formatDate(_ isoString: String) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = formatter.date(from: isoString) ?? ISO8601DateFormatter().date(from: isoString) ?? Date()
        let timeFormatter = DateFormatter()
        timeFormatter.timeStyle = .short
        return timeFormatter.string(from: date)
    }

    // MARK: - Tag Picker Popover

    private var tagPickerPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Select Tags")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(Color.white.opacity(0.9))

            Divider()

            if model.tags.isEmpty {
                Text("No tags available yet.")
                    .font(.system(size: 11))
                    .foregroundStyle(Color.white.opacity(0.4))
                    .padding(.vertical, 8)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 6) {
                        ForEach(model.tags) { tag in
                            let isSelected = model.focusTimer.selectedTagIds.contains(tag.id)
                            Button {
                                if isSelected {
                                    model.focusTimer.selectedTagIds.remove(tag.id)
                                } else {
                                    model.focusTimer.selectedTagIds.insert(tag.id)
                                }
                            } label: {
                                HStack(spacing: 8) {
                                    Circle()
                                        .fill(tagColor(tag.color))
                                        .frame(width: 10, height: 10)
                                    Text(tag.name)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(Color.white.opacity(0.85))
                                    Spacer()
                                    if isSelected {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(iTuTheme.mint)
                                    }
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 7)
                                .background(isSelected ? Color.white.opacity(0.12) : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 180)
            }
        }
        .padding(12)
        .frame(width: 220)
        .background(Color(red: 0.12, green: 0.13, blue: 0.15))
    }

    // MARK: - Task Picker Popover

    private var matchingTasks: [ProductivityTask] {
        model.tasks.filter { task in
            task.deletedAt == nil && task.status != .completed && task.status != .canceled
                && (taskSearchQuery.isEmpty || task.title.localizedCaseInsensitiveContains(taskSearchQuery))
        }
    }

    private var taskPickerPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.white.opacity(0.4))
                TextField("Search tasks…", text: $taskSearchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundStyle(.white)
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Color.white.opacity(0.08))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

            let isNoTaskSelected = model.focusTimer.linkedTask == nil && model.focusTimer.activeSession?.taskId == nil
            Button {
                model.focusTimer.linkedTask = nil
                if model.focusTimer.activeSession != nil {
                    Task { await model.performFocusAction("attach", taskId: nil) }
                }
                showTaskPickerPopover = false
            } label: {
                HStack(spacing: 8) {
                    Text("No task")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(Color.white.opacity(0.85))
                    Spacer()
                    if isNoTaskSelected {
                        Image(systemName: "checkmark")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(iTuTheme.mint)
                    }
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 7)
                .background(isNoTaskSelected ? Color.white.opacity(0.12) : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            }
            .buttonStyle(.plain)

            if matchingTasks.isEmpty {
                Text("No matching tasks")
                    .font(.system(size: 12))
                    .foregroundStyle(Color.white.opacity(0.4))
                    .frame(maxWidth: .infinity, alignment: .center)
                    .padding(.vertical, 16)
            } else {
                ScrollView {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(matchingTasks) { task in
                            let isSelected = model.focusTimer.linkedTask?.id == task.id || model.focusTimer.activeSession?.taskId == task.id
                            Button {
                                model.focusTimer.linkedTask = task
                                model.focusTimer.customTitle = task.title
                                titleInput = task.title
                                if model.focusTimer.activeSession != nil {
                                    Task { await model.performFocusAction("attach", taskId: task.id) }
                                }
                                showTaskPickerPopover = false
                            } label: {
                                HStack(spacing: 8) {
                                    Text(task.title)
                                        .font(.system(size: 12, weight: .medium))
                                        .foregroundStyle(Color.white.opacity(0.85))
                                        .lineLimit(1)
                                    Spacer()
                                    if isSelected {
                                        Image(systemName: "checkmark")
                                            .font(.system(size: 11, weight: .bold))
                                            .foregroundStyle(iTuTheme.mint)
                                    }
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 7)
                                .background(isSelected ? Color.white.opacity(0.12) : Color.clear)
                                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
                .frame(maxHeight: 180)
            }
        }
        .padding(12)
        .frame(width: 240)
        .background(Color(red: 0.12, green: 0.13, blue: 0.15))
    }

    // MARK: - Helper Actions

    private func commitTitleChange() {
        let trimmed = titleInput.trimmingCharacters(in: .whitespacesAndNewlines)
        Task { await model.updateFocusTitle(trimmed) }
        isEditingTitle = false
    }

    private func applyInlineTime() {
        let m = Int(editMinutes.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        let s = Int(editSeconds.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        let totalSecs = max(1, min(180 * 60, m * 60 + s))
        model.focusTimer.setExactDuration(seconds: totalSecs)
        isEditingTime = false
    }

    private func tagColor(_ colorName: String?) -> Color {
        guard let name = colorName?.lowercased() else { return iTuTheme.teal }
        switch name {
        case "mint", "teal": return iTuTheme.teal
        case "coral", "red", "orange": return Color(red: 0.95, green: 0.42, blue: 0.30)
        case "amber", "yellow": return iTuTheme.amber
        case "blue", "indigo": return Color.blue
        case "purple": return Color.purple
        default: return iTuTheme.teal
        }
    }

    private var statusLabel: String {
        guard model.user != nil else { return "Sign in required" }
        guard let session = model.focusTimer.activeSession else {
            if model.focusTimer.isBreakPending { return "Break Ready" }
            if model.focusTimer.isWorkPending { return "Focus Ready" }
            return "Ready"
        }
        if session.phase != .work {
            return model.focusTimer.isPaused ? "Break Paused" : "Taking Break"
        }
        return model.focusTimer.isPaused ? "Paused" : "Focusing"
    }

    private func openMainWindow() {
        NSApp.activate(ignoringOtherApps: true)
        let existingWindow = NSApp.windows.first { w in
            !(w is NSPanel)
                && w.className != "NSStatusBarWindow"
                && w.className != "NSMenuWindow"
                && (w.title.contains("iTu") || w.identifier?.rawValue.contains("main") == true)
        } ?? NSApp.windows.first { w in
            !(w is NSPanel)
                && w.className != "NSStatusBarWindow"
                && w.className != "NSMenuWindow"
                && w.canBecomeMain
        }

        if let existingWindow {
            if existingWindow.isMiniaturized {
                existingWindow.deminiaturize(nil)
            }
            existingWindow.makeKeyAndOrderFront(nil)
            existingWindow.orderFrontRegardless()
            NSApp.activate(ignoringOtherApps: true)
        } else {
            onOpenMainWindow()
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                NSApp.activate(ignoringOtherApps: true)
                if let newWin = NSApp.windows.first(where: { !($0 is NSPanel) && $0.canBecomeMain }) {
                    if newWin.isMiniaturized { newWin.deminiaturize(nil) }
                    newWin.makeKeyAndOrderFront(nil)
                    newWin.orderFrontRegardless()
                }
            }
        }
    }
}
