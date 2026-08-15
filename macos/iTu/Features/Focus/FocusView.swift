import SwiftUI

struct FocusView: View {
    @Environment(AppModel.self) private var model
    @State private var showTaskPickerSheet = false
    @State private var taskSearchQuery = ""
    @State private var recordSearchQuery = ""
    @State private var combineShortSessions = true
    @State private var collapsedDays: Set<String> = []
    @State private var visibleDayCount = 3
    @State private var isEditingTitle = false
    @State private var titleInput = ""
    @State private var isEditingTime = false
    @State private var editMinutes = "29"
    @State private var editSeconds = "00"
    @State private var audioPlayer = AudioPlayerManager.shared
    @State private var notificationManager = SystemNotificationManager.shared
    @State private var showVolumePopover = false

    private var audioStatusText: String {
        if !audioPlayer.isEnabled { return "Sound disabled" }
        if audioPlayer.isLoading { return "Loading audio…" }
        if let errorMessage = audioPlayer.errorMessage { return errorMessage }
        guard let sound = audioPlayer.selectedSound else { return "No sounds available" }
        return audioPlayer.isPlaying ? "Playing · \(sound.name)" : "Paused · \(sound.name)"
    }

    private func soundIcon(_ sound: FocusSound?) -> String {
        switch sound?.category.lowercased() {
        case "nature": "leaf"
        case "atmosphere": "cup.and.saucer"
        case "noise": "waveform"
        default: "speaker.wave.2"
        }
    }

    var body: some View {
        @Bindable var timer = model.focusTimer

        VStack(spacing: 0) {
            iTuPageHeader(
                kicker: "Timer & Sessions",
                title: "Focus",
                actions: {
                    Button {
                        model.presentedOverlay = .focusSettings
                    } label: {
                        Image(systemName: "gearshape")
                            .accessibilityLabel("Focus settings")
                    }
                    .buttonStyle(iTuHeaderGhostButtonStyle())
                    .help("Focus settings")
                }
            )

            ScrollView {
                HStack(alignment: .top, spacing: 24) {
                    // Left Column: Light-themed Main Studio Panel matching Web Focus Page
                    mainStudioPanel(timer: timer)

                    // Right Column: 2x2 Stats Grid & Focus Record List
                    rightSideColumn(timer: timer)
                        .frame(width: 330)
                }
                .padding(24)
                .frame(maxWidth: 1080)
                .frame(maxWidth: .infinity)
            }
            .background(
                LinearGradient(
                    colors: [iTuTheme.canvas, iTuTheme.mintTint.opacity(0.35)],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                )
            )
        }
        .onAppear {
            timer.configure(settings: model.settingsStore.focusSettings)
            Task { await model.loadFocus() }
        }
    }

    // MARK: - Left Studio Panel (Light Card with White Dial & Dark Sound Player Overlay)

    private func mainStudioPanel(timer: FocusTimer) -> some View {
        VStack(spacing: 20) {
            // Mode Tabs Bar embedded inside top of white card
            HStack(spacing: 4) {
                ForEach(TimerMode.allCases) { mode in
                    let isSelected = timer.timerMode == mode
                    Button {
                        timer.setMode(mode)
                    } label: {
                        Text(mode.title)
                            .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                            .foregroundStyle(isSelected ? Color.white : iTuTheme.inkDim)
                            .frame(maxWidth: .infinity)
                            .frame(height: 36)
                    }
                    .buttonStyle(FocusModeButtonStyle(isSelected: isSelected))
                    .disabled(timer.activeSession != nil)
                }
            }
            .padding(4)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }
            .frame(maxWidth: 420)

            // Target Task / Custom Focus Title Input
            HStack(spacing: 8) {
                if isEditingTitle {
                    TextField("Focus Title…", text: $titleInput)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                        .textFieldStyle(.plain)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 4)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(iTuTheme.teal, lineWidth: 1.5)
                        )
                        .onSubmit {
                            Task { await model.updateFocusTitle(titleInput) }
                            isEditingTitle = false
                        }
                        .onExitCommand {
                            isEditingTitle = false
                        }
                } else {
                    Button {
                        titleInput = timer.currentTitle
                        isEditingTitle = true
                    } label: {
                        HStack(spacing: 4) {
                            Text(timer.currentTitle)
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Image(systemName: "pencil")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                    }
                    .buttonStyle(FocusInlineButtonStyle())
                    .help("Click to edit focus title")
                }

                Button {
                    showTaskPickerSheet = true
                } label: {
                    Image(systemName: "list.bullet.indent")
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 26, height: 26)
                        .background(iTuTheme.surfaceMuted)
                        .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                }
                .buttonStyle(.plain)
                .help("Assign existing task")
                .popover(isPresented: $showTaskPickerSheet, arrowEdge: .bottom) {
                    taskPickerModal(timer: timer)
                }
            }

            // Light Dial Area
            ZStack {
                // Background 60 ticks ring (light grey ticks on white background)
                LightDialTicksShape()
                    .stroke(iTuTheme.border, lineWidth: 2)
                    .frame(width: 260, height: 260)

                // Track Ring
                Circle()
                    .stroke(iTuTheme.borderSoft, lineWidth: 8)
                    .frame(width: 224, height: 224)

                // Mint Progress Arc
                Circle()
                    .trim(from: 0, to: CGFloat(timer.progressFraction))
                    .stroke(
                        LinearGradient(
                            colors: timer.displaySeconds < 0
                                ? [iTuTheme.amber, iTuTheme.coral]
                                : [iTuTheme.mint, iTuTheme.teal],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        ),
                        style: StrokeStyle(lineWidth: 8, lineCap: .round)
                    )
                    .rotationEffect(.degrees(-90))
                    .frame(width: 224, height: 224)
                    .animation(.linear(duration: 0.5), value: timer.progressFraction)

                // Digital Timer Readout
                VStack(spacing: 4) {
                    if isEditingTime && timer.activeSession == nil {
                        HStack(spacing: 2) {
                            TextField("", text: $editMinutes)
                                .font(.system(size: 52, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.ink)
                                .monospacedDigit()
                                .multilineTextAlignment(.trailing)
                                .textFieldStyle(.plain)
                                .frame(width: 70)
                                .onSubmit {
                                    applyInlineTime(timer: timer)
                                }
                                .onExitCommand {
                                    isEditingTime = false
                                }
                            Text(":")
                                .font(.system(size: 52, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.ink)
                                .monospacedDigit()
                            TextField("", text: $editSeconds)
                                .font(.system(size: 52, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.ink)
                                .monospacedDigit()
                                .multilineTextAlignment(.leading)
                                .textFieldStyle(.plain)
                                .frame(width: 70)
                                .onSubmit {
                                    applyInlineTime(timer: timer)
                                }
                                .onExitCommand {
                                    isEditingTime = false
                                }
                        }
                    } else {
                        Button {
                            let secs = timer.displaySeconds
                            editMinutes = String(format: "%02d", secs / 60)
                            editSeconds = String(format: "%02d", secs % 60)
                            isEditingTime = true
                        } label: {
                            Text(timer.formattedRemaining)
                                .font(.system(size: 52, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.ink)
                                .monospacedDigit()
                                .contentTransition(.numericText())
                        }
                        .buttonStyle(FocusInlineButtonStyle())
                        .disabled(timer.activeSession != nil)
                        .help(timer.activeSession == nil ? "Change time length" : "")
                    }

                    Text(timer.isPaused ? "PAUSED" : timer.displaySeconds < 0 ? "OVERTIME" : timer.isRunning ? "FOCUSING…" : "READY")
                        .font(.system(size: 11, weight: .bold, design: .monospaced))
                        .tracking(1.5)
                        .foregroundStyle(iTuTheme.inkFaint)
                }
            }
            .padding(.vertical, 10)

            // Audio Player Component (Dark Card or Compact Pill matching Web)
            if timer.compactAudio {
                audioPillView(timer: timer)
            } else {
                audioCardView(timer: timer)
            }

            // Main lifecycle actions mirror the web session controls.
            HStack(spacing: 12) {
                if timer.activeSession == nil {
                    Button {
                        Task { await model.startFocus() }
                    } label: {
                        Label(timer.isMutating ? "Starting…" : "Start", systemImage: "play.fill")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(minWidth: 160, minHeight: 44)
                            .background(
                                LinearGradient(
                                    colors: [Color(red: 0.13, green: 0.56, blue: 0.49), Color(red: 0.07, green: 0.40, blue: 0.36)],
                                    startPoint: .leading,
                                    endPoint: .trailing
                                )
                            )
                            .clipShape(Capsule())
                            .shadow(color: Color(red: 0.12, green: 0.38, blue: 0.32).opacity(0.45), radius: 12, y: 4)
                    }
                    .buttonStyle(.plain)
                    .disabled(timer.isMutating)
                } else {
                    HStack(spacing: 8) {
                        Button {
                            Task {
                                await model.performFocusAction(timer.isPaused ? "resume" : "pause")
                            }
                        } label: {
                            HStack(spacing: 5) {
                                Image(systemName: timer.isPaused ? "play.fill" : "pause.fill")
                                    .font(.system(size: 12, weight: .bold))
                                Text(timer.isPaused ? "Resume" : "Pause")
                                    .font(.system(size: 12, weight: .semibold))
                                    .lineLimit(1)
                            }
                            .foregroundStyle(.white)
                            .padding(.horizontal, 12)
                            .frame(height: 36)
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

                        if timer.activeSession?.phase == .work {
                            Button {
                                Task { await model.performFocusAction("extend", extendSeconds: 300) }
                            } label: {
                                HStack(spacing: 4) {
                                    Image(systemName: "timer")
                                        .font(.system(size: 12, weight: .semibold))
                                    Text("+5m")
                                        .font(.system(size: 12, weight: .semibold))
                                        .lineLimit(1)
                                }
                                .foregroundStyle(iTuTheme.ink)
                                .padding(.horizontal, 10)
                                .frame(height: 36)
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

                        let isCompletable = timer.elapsedSeconds >= (timer.activeSession?.plannedSeconds ?? 0)
                        if isCompletable {
                            Button {
                                Task { await model.performFocusAction("complete") }
                            } label: {
                                HStack(spacing: 5) {
                                    Image(systemName: "checkmark")
                                        .font(.system(size: 12, weight: .bold))
                                    Text(timer.activeSession?.phase == .work ? "Complete" : "End Break")
                                        .font(.system(size: 12, weight: .semibold))
                                        .lineLimit(1)
                                }
                                .foregroundStyle(.white)
                                .padding(.horizontal, 12)
                                .frame(height: 36)
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
                            .help(timer.activeSession?.phase == .work ? "Complete Focus Session" : "End Break")
                        }

                        Button {
                            Task { await model.performFocusAction("abandon") }
                        } label: {
                            Image(systemName: "arrow.counterclockwise")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.inkDim)
                                .frame(width: 36, height: 36)
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
            }
            .padding(.top, 4)
        }
        .padding(24)
        .frame(maxWidth: .infinity, minHeight: 520)
        .iTuPanel(radius: 20)
    }

    // MARK: - Dark Audio Player Components (Matching Web FocusAudioPlayerCard & FocusAudioPill)

    private func audioCardView(timer: FocusTimer) -> some View {
        VStack(spacing: 14) {
            // Header
            HStack {
                HStack(spacing: 10) {
                    ZStack {
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(Color(red: 0.09, green: 0.23, blue: 0.19))
                            .overlay(
                                RoundedRectangle(cornerRadius: 10, style: .continuous)
                                    .stroke(Color(red: 0.11, green: 0.28, blue: 0.23), lineWidth: 1)
                            )
                            .frame(width: 36, height: 36)
                        Image(systemName: soundIcon(audioPlayer.selectedSound))
                            .font(.system(size: 15))
                            .foregroundStyle(Color(red: 0.32, green: 0.91, blue: 0.77))
                    }
                    VStack(alignment: .leading, spacing: 2) {
                        Text("BACKGROUND SOUND")
                            .font(.system(size: 10, weight: .semibold, design: .monospaced))
                            .tracking(1.2)
                            .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))

                        Menu {
                            Section("Focus Sounds") {
                                ForEach(audioPlayer.sounds) { sound in
                                    Button {
                                        model.selectFocusSound(sound)
                                    } label: {
                                        Label(sound.name, systemImage: soundIcon(sound))
                                    }
                                }
                            }
                            Divider()
                            Button {
                                model.presentedOverlay = .focusSoundManagement
                            } label: {
                                Label("Manage Custom Sounds...", systemImage: "music.note.list")
                            }
                        } label: {
                            HStack(spacing: 4) {
                                Text(audioPlayer.selectedSound?.name ?? "No sounds available")
                                    .font(.system(size: 14, weight: .bold))
                                    .foregroundStyle(Color(red: 0.92, green: 0.96, blue: 0.94))
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 10, weight: .bold))
                                    .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
                            }
                        }
                        .menuStyle(.borderlessButton)
                    }
                }
                Spacer()
                HStack(spacing: 8) {
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            timer.compactAudio = true
                            model.settingsStore.focusSettings.compactAudio = true
                        }
                    } label: {
                        Image(systemName: "rectangle.compress.vertical")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
                            .frame(width: 28, height: 28)
                            .background(Color(red: 0.06, green: 0.15, blue: 0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            .overlay(
                                RoundedRectangle(cornerRadius: 8, style: .continuous)
                                    .stroke(Color(red: 0.11, green: 0.28, blue: 0.23), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                    .help("Compact audio player")

                    Toggle("", isOn: Binding(
                        get: { audioPlayer.isEnabled },
                        set: { audioPlayer.isEnabled = $0 }
                    ))
                    .toggleStyle(SwitchToggleStyle(tint: Color(red: 0.32, green: 0.91, blue: 0.77)))
                    .labelsHidden()
                }
            }

            // Status Row
            HStack(spacing: 6) {
                Circle()
                    .fill(audioPlayer.isPlaying ? Color(red: 0.32, green: 0.91, blue: 0.77) : Color(red: 0.30, green: 0.42, blue: 0.38))
                    .frame(width: 6, height: 6)
                    .shadow(color: audioPlayer.isPlaying ? Color(red: 0.32, green: 0.91, blue: 0.77).opacity(0.8) : .clear, radius: 4)
                Text(audioStatusText)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
                Spacer()
            }

            // Waveform Scrubber
            HStack(alignment: .center, spacing: 3) {
                let heights = audioPlayer.waveformHeights(count: 40)
                ForEach(0..<heights.count, id: \.self) { i in
                    let isActive = audioPlayer.isEnabled && audioPlayer.isPlaying
                    let height = heights[i]
                    RoundedRectangle(cornerRadius: 2)
                        .fill(isActive ? Color(red: 0.32, green: 0.91, blue: 0.77) : Color(red: 0.11, green: 0.28, blue: 0.23))
                        .frame(height: height)
                }
            }
            .frame(height: 40)

            // Time Row
            HStack {
                Text("0:00")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color(red: 0.32, green: 0.91, blue: 0.77))
                Spacer()
                Text("0:00")
                    .font(.system(size: 11, weight: .medium, design: .monospaced))
                    .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
            }

            // Controls Row
            HStack(spacing: 18) {
                // Stop Button
                Button {
                    audioPlayer.stop()
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0.06, green: 0.15, blue: 0.12))
                            .overlay(
                                Circle().stroke(Color(red: 0.11, green: 0.28, blue: 0.23), lineWidth: 1)
                            )
                            .frame(width: 38, height: 38)
                        Image(systemName: "square.fill")
                            .font(.system(size: 11))
                            .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
                    }
                }
                .buttonStyle(.plain)
                .disabled(!audioPlayer.isPlaying)

                // Play/Pause Button
                Button {
                    Task { await model.toggleFocusSoundPlayback() }
                } label: {
                    ZStack {
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [Color(red: 0.32, green: 0.91, blue: 0.77), Color(red: 0.18, green: 0.72, blue: 0.58)],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 52, height: 52)
                            .shadow(color: Color(red: 0.32, green: 0.91, blue: 0.77).opacity(0.4), radius: 12, y: 4)
                        Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 18, weight: .bold))
                            .foregroundStyle(Color(red: 0.03, green: 0.13, blue: 0.10))
                    }
                }
                .buttonStyle(.plain)
                .disabled(audioPlayer.selectedSound == nil || audioPlayer.isLoading || !audioPlayer.isEnabled)

                // Volume Button with Popover
                Button {
                    showVolumePopover.toggle()
                } label: {
                    ZStack {
                        Circle()
                            .fill(Color(red: 0.06, green: 0.15, blue: 0.12))
                            .overlay(
                                Circle().stroke(Color(red: 0.11, green: 0.28, blue: 0.23), lineWidth: 1)
                            )
                            .frame(width: 38, height: 38)
                        Image(systemName: audioPlayer.volume == 0 ? "speaker.slash.fill" : (audioPlayer.volume < 0.5 ? "speaker.wave.1.fill" : "speaker.wave.2.fill"))
                            .font(.system(size: 13))
                            .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
                    }
                }
                .buttonStyle(.plain)
                .popover(isPresented: $showVolumePopover, arrowEdge: .top) {
                    VStack(spacing: 8) {
                        Text("\(Int(audioPlayer.volume * 100))%")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(Color(red: 0.32, green: 0.91, blue: 0.77))
                        Slider(value: Binding(
                            get: { Double(audioPlayer.volume) },
                            set: { audioPlayer.volume = Float($0) }
                        ), in: 0...1, onEditingChanged: { editing in
                            if !editing { Task { await model.saveFocusSoundVolume() } }
                        })
                        .frame(width: 120)
                    }
                    .padding(12)
                    .background(Color(red: 0.06, green: 0.15, blue: 0.12))
                }
            }
        }
        .padding(18)
        .background(
            LinearGradient(
                colors: [Color(red: 0.06, green: 0.15, blue: 0.12), Color(red: 0.03, green: 0.09, blue: 0.07)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color(red: 0.11, green: 0.28, blue: 0.23), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.35), radius: 16, y: 8)
        .frame(maxWidth: 420)
    }

    private func audioPillView(timer: FocusTimer) -> some View {
        HStack(spacing: 10) {
            // Equalizer animation bars
            HStack(alignment: .bottom, spacing: 2) {
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(red: 0.32, green: 0.91, blue: 0.77))
                    .frame(width: 3, height: audioPlayer.isPlaying ? 8 : 4)
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(red: 0.32, green: 0.91, blue: 0.77))
                    .frame(width: 3, height: audioPlayer.isPlaying ? 14 : 8)
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color(red: 0.32, green: 0.91, blue: 0.77))
                    .frame(width: 3, height: audioPlayer.isPlaying ? 10 : 5)
            }
            .frame(height: 14)

            Image(systemName: audioPlayer.volume == 0 ? "speaker.slash.fill" : "speaker.wave.2.fill")
                .font(.system(size: 11))
                .foregroundStyle(Color(red: 0.32, green: 0.91, blue: 0.77))

            Text(audioStatusText)
                .font(.system(size: 12, weight: .medium))
                .foregroundStyle(Color(red: 0.92, green: 0.96, blue: 0.94))
                .lineLimit(1)

            Spacer()

            Button {
                Task { await model.toggleFocusSoundPlayback() }
            } label: {
                Image(systemName: audioPlayer.isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(Color(red: 0.32, green: 0.91, blue: 0.77))
                    .frame(width: 24, height: 24)
                    .background(Color(red: 0.09, green: 0.23, blue: 0.19))
                    .clipShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(audioPlayer.selectedSound == nil || audioPlayer.isLoading || !audioPlayer.isEnabled)

            Button {
                withAnimation(.easeInOut(duration: 0.2)) {
                    timer.compactAudio = false
                    model.settingsStore.focusSettings.compactAudio = false
                }
            } label: {
                Image(systemName: "rectangle.expand.vertical")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(Color(red: 0.50, green: 0.66, blue: 0.61))
            }
            .buttonStyle(.plain)
            .help("Expand audio player")
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 8)
        .background(
            LinearGradient(
                colors: [Color(red: 0.06, green: 0.15, blue: 0.12), Color(red: 0.03, green: 0.09, blue: 0.07)],
                startPoint: .leading,
                endPoint: .trailing
            )
        )
        .clipShape(Capsule())
        .overlay(
            Capsule().stroke(Color(red: 0.11, green: 0.28, blue: 0.23), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.25), radius: 10, y: 4)
        .frame(maxWidth: 420)
    }

    // MARK: - Right Column: 2x2 Stats Grid & Focus Record List

    private func rightSideColumn(timer: FocusTimer) -> some View {
        VStack(spacing: 16) {
            // 2x2 Stats Grid
            Grid(horizontalSpacing: 12, verticalSpacing: 12) {
                GridRow {
                    WebStyleStatTile(title: "TODAY'S POMO", value: "\(timer.todayCompletedSessionsCount)")
                    WebStyleStatTile(title: "TODAY'S FOCUS", value: "\(timer.todayFocusedMinutes)m")
                }
                GridRow {
                    WebStyleStatTile(title: "TOTAL POMO", value: "\(timer.completedSessionsCount)")
                    WebStyleStatTile(title: "TOTAL FOCUS", value: "\(timer.totalFocusedMinutes)m")
                }
            }

            // Focus Record Panel
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Focus record")
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)

                    Spacer()

                    // Combine Toggle Button
                    Button {
                        combineShortSessions.toggle()
                    } label: {
                        HStack(spacing: 5) {
                            Circle()
                                .fill(combineShortSessions ? iTuTheme.teal : iTuTheme.inkFaint)
                                .frame(width: 6, height: 6)
                            Text("Combine")
                                .font(.system(size: 11, weight: .medium))
                                .foregroundStyle(combineShortSessions ? iTuTheme.teal : iTuTheme.inkDim)
                        }
                        .padding(.horizontal, 9)
                        .padding(.vertical, 4)
                        .background(combineShortSessions ? iTuTheme.mintTint : iTuTheme.surfaceMuted)
                        .clipShape(Capsule())
                        .overlay {
                            Capsule().stroke(combineShortSessions ? iTuTheme.teal.opacity(0.3) : iTuTheme.border, lineWidth: 1)
                        }
                    }
                    .buttonStyle(.plain)
                }

                // Search Bar Input
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkFaint)
                    TextField("Search dates…", text: $recordSearchQuery)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                }
                .padding(.horizontal, 10)
                .frame(height: 30)
                .background(iTuTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }

                focusRecords(timer: timer)
            }
            .padding(16)
            .iTuPanel(radius: 18)
        }
    }

    @ViewBuilder
    private func focusRecords(timer: FocusTimer) -> some View {
        let projection = timer.historyProjection
        let labels = projection.labels.filter {
            recordSearchQuery.isEmpty || $0.localizedCaseInsensitiveContains(recordSearchQuery)
        }
        let records = labels.flatMap { projection.sessionsByDay[$0] ?? [] }
        let grouped = projection.sessionsByDay
        let visibleLabels = Array(labels.prefix(visibleDayCount))

        if timer.isLoading && records.isEmpty {
            ProgressView("Loading focus records…")
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
        } else if visibleLabels.isEmpty {
            Text(recordSearchQuery.isEmpty
                 ? "No focus records yet. Complete a session to start tracking."
                 : "No matching dates found.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
        } else {
            VStack(spacing: 12) {
                ForEach(visibleLabels, id: \.self) { label in
                    let sessions = grouped[label] ?? []
                    let visibleSessions = combineShortSessions
                        ? sessions.filter { focusDurationMinutes($0) >= 2 }
                        : sessions
                    let shortSessions = sessions.filter { focusDurationMinutes($0) < 2 }
                    let isToday = isTodayLabel(label)

                    VStack(alignment: .leading, spacing: 8) {
                        Button {
                            if collapsedDays.contains(label) {
                                collapsedDays.remove(label)
                            } else {
                                collapsedDays.insert(label)
                            }
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "chevron.down")
                                    .font(.system(size: 9, weight: .bold))
                                    .foregroundStyle(iTuTheme.inkFaint)
                                    .rotationEffect(.degrees(collapsedDays.contains(label) ? -90 : 0))
                                Text(label)
                                    .font(.system(size: 12, weight: .bold))
                                    .foregroundStyle(iTuTheme.ink)

                                if isToday {
                                    Text("Today")
                                        .font(.system(size: 9, weight: .bold))
                                        .foregroundStyle(iTuTheme.teal)
                                        .padding(.horizontal, 6)
                                        .padding(.vertical, 2)
                                        .background(iTuTheme.mintTint)
                                        .clipShape(RoundedRectangle(cornerRadius: 4, style: .continuous))
                                }

                                Spacer()

                                HStack(spacing: 8) {
                                    densityBars(for: sessions)
                                    Text("\(sessions.count) session\(sessions.count == 1 ? "" : "s")")
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                    Text("\(sessions.reduce(0) { $0 + focusDurationMinutes($1) })m")
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                }
                            }
                        }
                        .buttonStyle(.plain)

                        if !collapsedDays.contains(label) {
                            ForEach(visibleSessions) { session in
                                FocusRecordRow(
                                    session: session,
                                    durationMinutes: focusDurationMinutes(session)
                                ) {
                                    openRecordEditor(session)
                                }
                            }
                            if combineShortSessions && !shortSessions.isEmpty {
                                let totalShortMins = shortSessions.reduce(0) { $0 + focusDurationMinutes($1) }
                                HStack(spacing: 6) {
                                    Circle()
                                        .fill(iTuTheme.inkFaint)
                                        .frame(width: 6, height: 6)
                                    Text("\(shortSessions.count) short session\(shortSessions.count == 1 ? "" : "s")")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkDim)
                                    Text("under 2m each")
                                        .font(.system(size: 11))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                    Spacer()
                                    Text("\(totalShortMins)m total")
                                        .font(.system(size: 11, design: .monospaced))
                                        .foregroundStyle(iTuTheme.inkFaint)
                                }
                                .padding(.leading, 14)
                                .padding(.vertical, 4)
                            }
                        }
                    }
                    if label != visibleLabels.last {
                        Divider()
                    }
                }
                if labels.count > visibleDayCount {
                    Button("Show \(min(5, labels.count - visibleDayCount)) earlier day\(labels.count - visibleDayCount == 1 ? "" : "s")") {
                        visibleDayCount += 5
                    }
                    .buttonStyle(iTuGhostButtonStyle())
                    .frame(maxWidth: .infinity)
                }
            }
        }
    }

    @ViewBuilder
    private func densityBars(for sessions: [FocusSession]) -> some View {
        let maxDur = max(1, sessions.map { focusDurationMinutes($0) }.max() ?? 1)
        HStack(alignment: .bottom, spacing: 2) {
            ForEach(Array(sessions.prefix(12).enumerated()), id: \.offset) { _, session in
                let dur = focusDurationMinutes(session)
                let height = max(3, Int((Double(dur) / Double(maxDur)) * 12))
                RoundedRectangle(cornerRadius: 1)
                    .fill(iTuTheme.teal)
                    .frame(width: 3, height: CGFloat(height))
            }
        }
        .frame(height: 12)
    }

    private func isTodayLabel(_ label: String) -> Bool {
        let todayLabel = Date().formatted(iTuDateSupport.focusDayStyle)
        return label == todayLabel
    }

    private func focusDurationMinutes(_ session: FocusSession) -> Int {
        model.focusTimer.historyProjection.durationMinutes(for: session)
    }

    private func openRecordEditor(_ session: FocusSession) {
        model.presentedOverlay = .focusSessionEditor(session)
    }

    // MARK: - Modals

    private func taskPickerModal(timer: FocusTimer) -> some View {
        VStack(spacing: 0) {
            HStack {
                Text("Assign Task to Focus Session")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
                Button {
                    showTaskPickerSheet = false
                } label: {
                    Image(systemName: "xmark")
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .buttonStyle(.plain)
            }
            .padding(16)
            .background(iTuTheme.surface)

            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(iTuTheme.inkFaint)
                TextField("Search tasks…", text: $taskSearchQuery)
                    .textFieldStyle(.plain)
            }
            .padding(10)
            .background(iTuTheme.surfaceMuted)

            List {
                Button("No Task (Clear)") {
                    timer.linkedTask = nil
                    if timer.activeSession != nil {
                        Task { await model.performFocusAction("attach", taskId: nil) }
                    }
                    showTaskPickerSheet = false
                }
                .foregroundStyle(iTuTheme.coral)

                ForEach(model.tasks.filter { $0.deletedAt == nil && $0.status != .completed }) { task in
                    if taskSearchQuery.isEmpty || task.title.localizedCaseInsensitiveContains(taskSearchQuery) {
                        Button {
                            timer.linkedTask = task
                            if timer.activeSession != nil {
                                Task { await model.performFocusAction("attach", taskId: task.id) }
                            }
                            showTaskPickerSheet = false
                        } label: {
                            HStack {
                                Text(task.title)
                                    .foregroundStyle(iTuTheme.ink)
                                Spacer()
                                if task.priority != .none {
                                    Text(task.priority.rawValue.capitalized)
                                        .font(.system(size: 10, design: .monospaced))
                                        .foregroundStyle(iTuTheme.teal)
                                }
                            }
                        }
                    }
                }
            }
        }
        .frame(width: 440, height: 420)
    }

    private func applyInlineTime(timer: FocusTimer) {
        let m = Int(editMinutes.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        let s = Int(editSeconds.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 0
        let totalSecs = max(1, min(180 * 60, m * 60 + s))
        timer.setExactDuration(seconds: totalSecs)
        isEditingTime = false
    }

}

// MARK: - Light Dial Ticks Shape for White Canvas

private struct LightDialTicksShape: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        let center = CGPoint(x: rect.midX, y: rect.midY)
        let radius = min(rect.width, rect.height) / 2
        let innerRadiusMajor = radius * 0.84
        let innerRadiusMinor = radius * 0.90

        for i in 0..<60 {
            let angle = (Double(i) / 60.0) * 2.0 * .pi - .pi / 2.0
            let isMajor = i % 5 == 0
            let rIn = isMajor ? innerRadiusMajor : innerRadiusMinor

            let start = CGPoint(
                x: center.x + CGFloat(rIn * Darwin.cos(angle)),
                y: center.y + CGFloat(rIn * Darwin.sin(angle))
            )
            let end = CGPoint(
                x: center.x + CGFloat(radius * Darwin.cos(angle)),
                y: center.y + CGFloat(radius * Darwin.sin(angle))
            )

            path.move(to: start)
            path.addLine(to: end)
        }

        return path
    }
}

// MARK: - 2x2 Web Style Stat Tile Component

private struct WebStyleStatTile: View {
    let title: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(title.uppercased())
                .font(.system(size: 9, weight: .bold, design: .monospaced))
                .tracking(1.1)
                .foregroundStyle(iTuTheme.inkFaint)

            Text(value)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .iTuPanel(radius: 14)
    }
}

private struct FocusRecordRow: View {
    let session: FocusSession
    let durationMinutes: Int
    let edit: () -> Void
    @State private var isHovered = false

    private var timeString: String {
        let startValue = session.adjustedStartedAt ?? session.startedAt
        let endValue = session.adjustedCompletedAt ?? session.completedAt ?? startValue
        guard let start = FocusTimer.parseDate(startValue),
              let end = FocusTimer.parseDate(endValue) else { return "" }
        return "\(start.formatted(iTuDateSupport.time)) – \(end.formatted(iTuDateSupport.time))"
    }

    var body: some View {
        HStack(spacing: 8) {
            Circle()
                .fill(session.status == .completed ? iTuTheme.teal : iTuTheme.inkFaint)
                .frame(width: 6, height: 6)
            if !timeString.isEmpty {
                Text(timeString)
                    .font(.system(size: 11, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
            }
            Text(session.customTitle ?? session.taskTitleSnapshot ?? (session.status == .abandoned ? "Abandoned session" : "Focus"))
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.ink)
                .lineLimit(1)
            Spacer()
            if isHovered {
                Button(action: edit) {
                    Image(systemName: "pencil")
                        .font(.system(size: 10, weight: .semibold))
                }
                .buttonStyle(iTuGhostButtonStyle(height: 24))
                .help("Edit focus record")
            }
            Text("\(durationMinutes)m")
                .font(.system(size: 11, design: .monospaced))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(.leading, 14)
        .padding(.vertical, 4)
        .padding(.trailing, 4)
        .background(isHovered ? iTuTheme.surfaceMuted : Color.clear)
        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        .onHover { isHovered = $0 }
    }
}

private struct FocusModeButtonStyle: ButtonStyle {
    let isSelected: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                isSelected
                    ? iTuTheme.forest
                    : (isHovered ? iTuTheme.mintTint : Color.clear)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.985 : 1))
            .opacity(isEnabled ? 1 : 0.4)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: isHovered)
            .onHover { isHovered = $0 && isEnabled }
    }
}

private struct FocusInlineButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.isEnabled) private var isEnabled
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .opacity(isEnabled ? (isHovered ? 0.78 : 1) : 1)
            .scaleEffect(reduceMotion ? 1 : (configuration.isPressed ? 0.98 : 1))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.14), value: isHovered)
            .onHover { isHovered = $0 && isEnabled }
    }
}
