import AppKit
import SwiftUI

struct MenuBarView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.openWindow) private var openWindow

    @State private var isEditingTitle = false
    @State private var isEditingTime = false
    @State private var titleInput = ""
    @State private var editMinutes = "25"
    @State private var editSeconds = "00"
    @State private var showTagPopover = false
    @State private var showTaskPickerPopover = false
    @State private var taskSearchQuery = ""
    @State private var newTagName = ""
    @State private var showNewTagField = false

    var body: some View {
        VStack(spacing: 0) {
            topControlBar
            focusCard
            bottomActionBar
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

    // MARK: - Top Header Control Bar

    private var topControlBar: some View {
        HStack(spacing: 8) {
            // App Branding & Window Controls
            HStack(spacing: 6) {
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

                Text(statusLabel)
                    .font(.system(size: 11, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.5))
            }

            Spacer()

            // Header Action Toolbar
            HStack(spacing: 6) {
                // Tag Selection Button (Highlights Orange when active, opens dropdown below)
                let hasTags = !model.focusTimer.selectedTagIds.isEmpty
                Button {
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

                // Reset / Abandon Action Button
                if model.focusTimer.activeSession != nil {
                    Button {
                        Task { await model.performFocusAction("abandon") }
                    } label: {
                        Image(systemName: "arrow.counterclockwise")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(Color.white.opacity(0.7))
                            .frame(width: 30, height: 30)
                            .background(Color.white.opacity(0.1))
                            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .help("Abandon current focus session")
                }

                // Stats Button
                Button {
                    openFocus()
                } label: {
                    Image(systemName: "chart.bar.fill")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color.white.opacity(0.7))
                        .frame(width: 30, height: 30)
                        .background(Color.white.opacity(0.1))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .help("Focus Statistics")

                // More Menu Button
                Menu {
                    Button("Open Focus Studio") { openFocus() }
                    Button("Open Main Window") { openMainWindow() }
                    Divider()
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
        .padding(.horizontal, 14)
        .padding(.top, 14)
        .padding(.bottom, 6)
    }

    // MARK: - Main Focus Card Body

    private var focusCard: some View {
        VStack(spacing: 14) {
            // Interactive Title Input + Task Selection Popover Button
            editableTitleView

            // Interactive Digital Clock Readout (Click to edit Minutes/Seconds inline)
            digitalClockView
        }
        .padding(.vertical, 16)
        .padding(.horizontal, 16)
    }

    // MARK: - Editable Title Input Component with Task Picker Button

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
                    .onSubmit {
                        commitTitleChange()
                    }
                    .onExitCommand {
                        isEditingTitle = false
                        titleInput = model.focusTimer.currentTitle
                    }
            } else {
                Button {
                    titleInput = model.focusTimer.currentTitle
                    isEditingTitle = true
                } label: {
                    HStack(spacing: 5) {
                        Text(model.focusTimer.currentTitle)
                            .font(.system(size: 20, weight: .semibold, design: .rounded))
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

            // Task Selection Popover Button (📖≡ / list.bullet.indent)
            let isTaskLinked = model.focusTimer.linkedTask != nil || model.focusTimer.activeSession?.taskId != nil
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

    // MARK: - Interactive Digital Clock Component

    private var digitalClockView: some View {
        Group {
            if isEditingTime && model.focusTimer.activeSession == nil {
                HStack(spacing: 4) {
                    TextField("25", text: $editMinutes)
                        .font(.system(size: 56, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.trailing)
                        .textFieldStyle(.plain)
                        .frame(width: 85)
                        .onSubmit { applyInlineTime() }
                        .onExitCommand { isEditingTime = false }

                    Text(":")
                        .font(.system(size: 56, weight: .bold, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.7))

                    TextField("00", text: $editSeconds)
                        .font(.system(size: 56, weight: .bold, design: .monospaced))
                        .foregroundStyle(.white)
                        .multilineTextAlignment(.leading)
                        .textFieldStyle(.plain)
                        .frame(width: 85)
                        .onSubmit { applyInlineTime() }
                        .onExitCommand { isEditingTime = false }
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
                        .font(.system(size: 64, weight: .bold, design: .monospaced))
                        .tracking(-2.5)
                        .foregroundStyle(.white)
                        .monospacedDigit()
                        .shadow(color: Color.black.opacity(0.3), radius: 6, y: 2)
                }
                .buttonStyle(.plain)
                .disabled(model.focusTimer.activeSession != nil)
                .help(model.focusTimer.activeSession == nil ? "Click to edit minute/second duration" : "")
            }
        }
    }

    // MARK: - Bottom Action Controls (Play / Pause / Complete)

    private var bottomActionBar: some View {
        VStack(spacing: 10) {
            if model.focusTimer.activeSession == nil {
                // Big Circular Play Button
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
                            .frame(width: 64, height: 64)
                            .shadow(color: iTuTheme.teal.opacity(0.35), radius: 12, y: 4)

                        Image(systemName: "play.fill")
                            .font(.system(size: 24, weight: .bold))
                            .foregroundStyle(Color(red: 0.40, green: 0.94, blue: 0.82))
                            .offset(x: 2)
                    }
                }
                .buttonStyle(.plain)
                .disabled(model.focusTimer.isMutating)
                .padding(.bottom, 6)
            } else {
                // Active Session Controls (Pause/Resume, +5m, Complete)
                HStack(spacing: 12) {
                    // Play / Pause Circle
                    Button {
                        Task {
                            await model.performFocusAction(model.focusTimer.isPaused ? "resume" : "pause")
                        }
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
                                .frame(width: 54, height: 54)
                                .shadow(color: iTuTheme.teal.opacity(0.35), radius: 10, y: 3)

                            Image(systemName: model.focusTimer.isPaused ? "play.fill" : "pause.fill")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundStyle(Color(red: 0.40, green: 0.94, blue: 0.82))
                                .offset(x: model.focusTimer.isPaused ? 2 : 0)
                        }
                    }
                    .buttonStyle(.plain)

                    // Extend +5m
                    Button {
                        Task { await model.performFocusAction("extend", extendSeconds: 300) }
                    } label: {
                        Text("+5m")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(height: 36)
                            .padding(.horizontal, 12)
                            .background(Color.white.opacity(0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                    }
                    .buttonStyle(.plain)

                    // Complete Button
                    Button {
                        Task { await model.performFocusAction("complete") }
                    } label: {
                        Image(systemName: "checkmark")
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(Color(red: 0.40, green: 0.94, blue: 0.82))
                            .frame(width: 38, height: 38)
                            .background(Color.white.opacity(0.12))
                            .clipShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .help("Complete Focus Session")
                }
                .padding(.bottom, 6)
            }
        }
        .padding(.horizontal, 16)
        .padding(.bottom, 16)
    }

    // MARK: - Tag Selection Popover

    private var tagPickerPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Select Tags")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.white.opacity(0.9))
                Spacer()
                Button {
                    showNewTagField.toggle()
                } label: {
                    Image(systemName: "plus")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(iTuTheme.mint)
                }
                .buttonStyle(.plain)
                .help("Add new tag")
            }

            if showNewTagField {
                HStack(spacing: 6) {
                    TextField("New tag name…", text: $newTagName)
                        .textFieldStyle(.plain)
                        .font(.system(size: 12))
                        .foregroundStyle(.white)
                        .padding(6)
                        .background(Color.white.opacity(0.08))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .onSubmit {
                            createNewTag()
                        }
                    Button("Add") {
                        createNewTag()
                    }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 24))
                }
            }

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

    private var taskPickerPopover: some View {
        VStack(alignment: .leading, spacing: 10) {
            // Search Field
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
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )

            // "No task" option
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

            let matchingTasks = model.tasks.filter { task in
                task.deletedAt == nil && task.status != .completed && task.status != .canceled
                    && (taskSearchQuery.isEmpty || task.title.localizedCaseInsensitiveContains(taskSearchQuery))
            }

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

    private func createNewTag() {
        let trimmed = newTagName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        model.createTag(name: trimmed)
        newTagName = ""
        showNewTagField = false
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
        guard model.focusTimer.activeSession != nil else { return "Ready" }
        return model.focusTimer.isPaused ? "Paused" : "Focusing"
    }

    private func openFocus() {
        model.selectedSection = .focus
        openMainWindow()
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
            openWindow(id: "main")
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
