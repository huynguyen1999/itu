import SwiftUI

struct VisualEffectView: NSViewRepresentable {
    var material: NSVisualEffectView.Material = .hudWindow
    var blendingMode: NSVisualEffectView.BlendingMode = .behindWindow

    func makeNSView(context: Context) -> NSVisualEffectView {
        let view = NSVisualEffectView()
        view.material = material
        view.blendingMode = blendingMode
        view.state = .active
        return view
    }

    func updateNSView(_ nsView: NSVisualEffectView, context: Context) {
        nsView.material = material
        nsView.blendingMode = blendingMode
    }
}

struct CompanionView: View {
    @Bindable var viewModel: CompanionViewModel
    @FocusState private var isSearchFocused: Bool
    @FocusState private var isQuickCaptureFocused: Bool
    @State private var isWindowHovered: Bool = false
    @State private var showHints: Bool = true
    @State private var hintTimerTask: Task<Void, Never>? = nil

    var body: some View {
        ZStack {
            VisualEffectView(material: .hudWindow, blendingMode: .behindWindow)

            VStack(spacing: 0) {
                // Search Input Bar at the very top ( Spotlight style)
                HStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)

                    TextField("Search iTu…", text: $viewModel.searchText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 15, weight: .regular, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                        .focused($isSearchFocused)
                        .disabled(viewModel.isQuickCapturing)
                        .onSubmit {
                            viewModel.executeSelection()
                        }

                    if !viewModel.searchText.isEmpty {
                        Button {
                            viewModel.searchText = ""
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .foregroundStyle(iTuTheme.inkFaint)
                                .font(.system(size: 14))
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                    } else {
                        // Show control buttons on hover, otherwise show ⌘K badge
                        if isWindowHovered {
                            HStack(spacing: 8) {
                                CompanionIconButton(systemName: "gearshape") {
                                    viewModel.router.openSettings()
                                    viewModel.dismissCompanion()
                                }

                                CompanionIconButton(systemName: "arrow.up.right.square") {
                                    viewModel.router.openMainWindow()
                                    viewModel.dismissCompanion()
                                }

                                CompanionIconButton(systemName: "xmark") {
                                    viewModel.dismissCompanion()
                                }
                            }
                            .transition(.opacity)
                        } else {
                            Text("⌘K")
                                .font(.system(size: 10, weight: .semibold, design: .rounded))
                                .padding(.horizontal, 5)
                                .padding(.vertical, 2)
                                .background(Color.black.opacity(0.08))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                    }
                }
                .padding(.horizontal, 16)
                .frame(height: 52)
                .background(Color.black.opacity(0.02))
                .overlay(alignment: .bottom) {
                    Rectangle()
                        .fill(iTuTheme.border)
                        .frame(height: 1)
                }

                // Cockpit Content Area
                if viewModel.isQuickCapturing {
                    // Inline Quick Capture Card View
                    VStack(alignment: .leading, spacing: 12) {
                        Text("NEW TASK")
                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkFaint)
                            .tracking(1.0)
                        
                        TextField("What needs to be done?", text: $viewModel.quickCaptureText)
                            .textFieldStyle(.plain)
                            .font(.system(size: 15, weight: .medium, design: .rounded))
                            .focused($isQuickCaptureFocused)
                            .onSubmit {
                                let trimmed = viewModel.quickCaptureText.trimmingCharacters(in: .whitespacesAndNewlines)
                                if !trimmed.isEmpty {
                                    Task {
                                        _ = await viewModel.model.createTask(title: trimmed)
                                        viewModel.quickCaptureText = ""
                                        viewModel.isQuickCapturing = false
                                        viewModel.refreshItems()
                                    }
                                }
                            }
                        
                        Divider()
                        
                        HStack {
                            Spacer()
                            Text("↵ Save   esc Cancel")
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                    }
                    .padding(16)
                    .background(Color.black.opacity(0.02))
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .overlay {
                        RoundedRectangle(cornerRadius: 12, style: .continuous)
                            .stroke(iTuTheme.teal.opacity(0.3), lineWidth: 1)
                    }
                    .padding(16)
                    .frame(maxHeight: .infinity, alignment: .top)
                } else if viewModel.items.isEmpty {
                    VStack(spacing: 8) {
                        Image(systemName: "magnifyingglass.circle")
                            .font(.system(size: 32))
                            .foregroundStyle(iTuTheme.inkFaint)
                        Text("No matching tasks or actions found")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(iTuTheme.inkDim)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    ScrollViewReader { proxy in
                        ScrollView {
                            VStack(alignment: .leading, spacing: 2) {
                                ForEach(Array(viewModel.items.enumerated()), id: \.element.id) { index, item in
                                    let isSelected = viewModel.selectedIndex == index

                                    // Render Section Header if section changes
                                    if index == 0 || viewModel.items[index - 1].section != item.section {
                                        Text(item.section.rawValue)
                                            .font(.system(size: 10, weight: .bold, design: .monospaced))
                                            .tracking(1.0)
                                            .foregroundStyle(iTuTheme.inkFaint)
                                            .padding(.horizontal, 16)
                                            .padding(.top, index == 0 ? 12 : 16)
                                            .padding(.bottom, 6)
                                    }

                                    // Custom visual cockpit renders
                                    if item.section == .focus {
                                        if item.id == "focus-header" || item.id == "focus-empty" {
                                            CompanionFocusCardView(
                                                item: item,
                                                index: index,
                                                viewModel: viewModel
                                            )
                                        } else {
                                            EmptyView()
                                        }
                                    } else if item.section == .habits {
                                        // Render all habits inside a single checklist card
                                        let habitsItems = viewModel.items.filter { $0.section == .habits }
                                        if let firstHabit = habitsItems.first, firstHabit.id == item.id {
                                            CompanionHabitsCardView(
                                                items: habitsItems,
                                                selectedIndex: viewModel.selectedIndex,
                                                viewModel: viewModel
                                            )
                                        } else {
                                            EmptyView()
                                        }
                                    } else if item.section == .today {
                                        if item.id.hasPrefix("today-task-") {
                                            CompanionTodayTaskRowView(
                                                item: item,
                                                index: index,
                                                viewModel: viewModel
                                            )
                                        } else {
                                            // today-empty
                                            CompanionItemRowView(
                                                item: item,
                                                isSelected: isSelected,
                                                index: index,
                                                viewModel: viewModel
                                            )
                                        }
                                    } else {
                                        // Tasks, Commands, Quick Capture search rows
                                        CompanionItemRowView(
                                            item: item,
                                            isSelected: isSelected,
                                            index: index,
                                            viewModel: viewModel
                                        )
                                    }
                                }
                            }
                            .padding(.bottom, 12)
                        }
                        .onChange(of: viewModel.selectedIndex) { _, newIndex in
                            guard newIndex >= 0 && newIndex < viewModel.items.count else { return }
                            let item = viewModel.items[newIndex]
                            withAnimation(.snappy(duration: 0.12)) {
                                proxy.scrollTo(item.id, anchor: .center)
                            }
                        }
                    }
                }

                // Footer Keyboard Hints (with auto-hide and bottom area hover triggers)
                if showHints {
                    HStack(spacing: 16) {
                        HStack(spacing: 4) {
                            Text("↑↓")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .padding(.horizontal, 4)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            Text("Navigate")
                                .font(.system(size: 11))
                        }
                        HStack(spacing: 4) {
                            Text("Tab")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .padding(.horizontal, 4)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            Text("Next section")
                                .font(.system(size: 11))
                        }
                        HStack(spacing: 4) {
                            Text("↵")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .padding(.horizontal, 4)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            Text("Execute")
                                .font(.system(size: 11))
                        }
                        HStack(spacing: 4) {
                            Text("Space")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .padding(.horizontal, 4)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            Text("Toggle habit")
                                .font(.system(size: 11))
                        }
                        HStack(spacing: 4) {
                            Text("⌘1-9")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .padding(.horizontal, 4)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            Text("Select")
                                .font(.system(size: 11))
                        }
                        HStack(spacing: 4) {
                            Text("esc")
                                .font(.system(size: 10, weight: .semibold, design: .monospaced))
                                .padding(.horizontal, 4)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 3))
                            Text("Close")
                                .font(.system(size: 11))
                        }
                        Spacer()
                    }
                    .foregroundStyle(iTuTheme.inkFaint)
                    .padding(.horizontal, 16)
                    .frame(height: 32)
                    .background(Color.black.opacity(0.02))
                    .overlay(alignment: .top) {
                        Rectangle()
                            .fill(iTuTheme.border)
                            .frame(height: 1)
                    }
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }
            }
        }
        .frame(width: 650, height: 520)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
        .onHover { hovering in
            withAnimation(.easeOut(duration: 0.2)) {
                isWindowHovered = hovering
            }
            if hovering {
                triggerHintVisibility()
            }
        }
        .onKeyPress(phases: .down) { press in
            triggerHintVisibility()
            
            if press.key == .escape && viewModel.isQuickCapturing {
                viewModel.isQuickCapturing = false
                viewModel.quickCaptureText = ""
                return .handled
            }
            
            if press.modifiers.contains(.command) {
                if let char = press.characters.first, char.isNumber, let num = Int(String(char)) {
                    if num >= 1 && num <= 9 {
                        viewModel.selectItem(at: num - 1)
                        return .handled
                    }
                }
            }
            return .ignored
        }
        .onKeyPress(.space) {
            triggerHintVisibility()
            let index = viewModel.selectedIndex
            guard index >= 0 && index < viewModel.items.count else { return .ignored }
            let item = viewModel.items[index]
            if item.section == .habits {
                viewModel.executeSelection()
                return .handled
            }
            return .ignored
        }
        .onKeyPress(.tab) {
            viewModel.selectNextSection()
            triggerHintVisibility()
            return .handled
        }
        .onKeyPress(.upArrow) {
            viewModel.moveSelectionUp()
            triggerHintVisibility()
            return .handled
        }
        .onKeyPress(.downArrow) {
            viewModel.moveSelectionDown()
            triggerHintVisibility()
            return .handled
        }
        .onKeyPress(.return) {
            viewModel.executeSelection()
            triggerHintVisibility()
            return .handled
        }
        .onAppear {
            isSearchFocused = true
            triggerHintVisibility()
        }
        .onChange(of: viewModel.isQuickCapturing) { _, newValue in
            if newValue {
                isQuickCaptureFocused = true
            } else {
                isSearchFocused = true
            }
        }
        .onChange(of: viewModel.searchText) { _, _ in
            triggerHintVisibility()
        }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { notification in
            if let window = notification.object as? NSWindow, window == NSApp.keyWindow {
                if viewModel.isQuickCapturing {
                    isQuickCaptureFocused = true
                } else {
                    isSearchFocused = true
                }
                triggerHintVisibility()
            }
        }
    }

    private func triggerHintVisibility() {
        withAnimation(.easeOut(duration: 0.25)) {
            showHints = true
        }
        hintTimerTask?.cancel()
        hintTimerTask = Task {
            try? await Task.sleep(for: .seconds(3))
            guard !Task.isCancelled else { return }
            withAnimation(.easeIn(duration: 0.35)) {
                showHints = false
            }
        }
    }
}

struct CompanionFocusCardView: View {
    let item: CompanionListItem
    let index: Int
    @Bindable var viewModel: CompanionViewModel
    @State private var isHovered = false
    @State private var isMenuHovered = false

    var body: some View {
        let isCardSelected = viewModel.selectedIndex == index
        let activeSession = viewModel.model.focusTimer.activeSession
        let isBreak = activeSession?.phase == .shortBreak || activeSession?.phase == .longBreak

        VStack(alignment: .leading, spacing: 12) {
            // Header: Focus state title and time
            HStack {
                HStack(spacing: 8) {
                    Circle()
                        .fill(item.id == "focus-empty" ? iTuTheme.inkFaint : (isBreak ? Color.blue : Color.green))
                        .frame(width: 8, height: 8)

                    Text(isBreak ? (activeSession?.phase == .shortBreak ? "Short Break ☕" : "Long Break ☕") : item.title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                }
                Spacer()

                if let subtitle = item.subtitle {
                    Text(subtitle)
                        .font(.system(size: 14, weight: .semibold, design: .rounded))
                        .foregroundStyle(isBreak ? Color.blue : iTuTheme.inkDim)
                }
            }

            // Buttons row
            HStack(spacing: 12) {
                if item.id == "focus-empty" {
                    // Presets picker & start
                    Menu {
                        Button("15 min") { viewModel.model.focusTimer.setDuration(minutes: 15) }
                        Button("25 min") { viewModel.model.focusTimer.setDuration(minutes: 25) }
                        Button("50 min") { viewModel.model.focusTimer.setDuration(minutes: 50) }
                    } label: {
                        HStack(spacing: 4) {
                            Text("\(viewModel.model.focusTimer.selectedMinutes) min")
                            Image(systemName: "chevron.down")
                                .font(.system(size: 9))
                        }
                        .font(.system(size: 11, weight: .semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(isMenuHovered ? Color.black.opacity(0.12) : Color.black.opacity(0.06))
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .onHover { hovering in
                        isMenuHovered = hovering
                    }
                    
                    if let startIndex = viewModel.items.firstIndex(where: { $0.id == "focus-start" }) {
                        let startItem = viewModel.items[startIndex]
                        let isStartSelected = viewModel.selectedIndex == startIndex

                        Button {
                            viewModel.selectedIndex = startIndex
                            viewModel.executeSelection()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: startItem.icon)
                                Text(startItem.title)
                            }
                        }
                        .buttonStyle(CompanionActionButtonStyle(isSelected: isStartSelected))
                        .pointingHandCursor()
                    }
                } else if isBreak {
                    // Skip break command only
                    if let completeIndex = viewModel.items.firstIndex(where: { $0.id == "focus-complete" }) {
                        let isSkipSelected = viewModel.selectedIndex == completeIndex

                        Button {
                            viewModel.selectedIndex = completeIndex
                            viewModel.executeSelection()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: "forward.fill")
                                Text("Skip Break")
                            }
                        }
                        .buttonStyle(CompanionActionButtonStyle(isSelected: isSkipSelected))
                        .pointingHandCursor()
                    }
                } else {
                    // Active work controls
                    if let pauseIndex = viewModel.items.firstIndex(where: { $0.id == "focus-pause" || $0.id == "focus-resume" }) {
                        let pauseItem = viewModel.items[pauseIndex]
                        let isPauseSelected = viewModel.selectedIndex == pauseIndex

                        Button {
                            viewModel.selectedIndex = pauseIndex
                            viewModel.executeSelection()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: pauseItem.icon)
                                Text(pauseItem.title)
                            }
                        }
                        .buttonStyle(CompanionActionButtonStyle(isSelected: isPauseSelected))
                        .pointingHandCursor()
                    }

                    if let completeIndex = viewModel.items.firstIndex(where: { $0.id == "focus-complete" }) {
                        let completeItem = viewModel.items[completeIndex]
                        let isCompleteSelected = viewModel.selectedIndex == completeIndex

                        Button {
                            viewModel.selectedIndex = completeIndex
                            viewModel.executeSelection()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: completeItem.icon)
                                Text(completeItem.title)
                            }
                        }
                        .buttonStyle(CompanionActionButtonStyle(isSelected: isCompleteSelected))
                        .pointingHandCursor()
                    }

                    if let abandonIndex = viewModel.items.firstIndex(where: { $0.id == "focus-abandon" }) {
                        let abandonItem = viewModel.items[abandonIndex]
                        let isAbandonSelected = viewModel.selectedIndex == abandonIndex

                        Button {
                            viewModel.selectedIndex = abandonIndex
                            viewModel.executeSelection()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: abandonItem.icon)
                                Text(abandonItem.title)
                            }
                        }
                        .buttonStyle(CompanionActionButtonStyle(isSelected: isAbandonSelected))
                        .pointingHandCursor()
                    }

                    if let extendIndex = viewModel.items.firstIndex(where: { $0.id == "focus-extend" }) {
                        let extendItem = viewModel.items[extendIndex]
                        let isExtendSelected = viewModel.selectedIndex == extendIndex

                        Button {
                            viewModel.selectedIndex = extendIndex
                            viewModel.executeSelection()
                        } label: {
                            HStack(spacing: 6) {
                                Image(systemName: extendItem.icon)
                                Text(extendItem.title)
                            }
                        }
                        .buttonStyle(CompanionActionButtonStyle(isSelected: isExtendSelected))
                        .pointingHandCursor()
                    }
                }
            }
        }
        .padding(16)
        .background(
            isCardSelected
                ? iTuTheme.mintTint.opacity(0.3)
                : (isHovered ? Color.black.opacity(0.04) : Color.black.opacity(0.02))
        )
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isCardSelected ? iTuTheme.teal : (isHovered ? iTuTheme.teal.opacity(0.3) : iTuTheme.border), lineWidth: 1)
        }
        .padding(.horizontal, 12)
        .padding(.top, 4)
        .id(item.id)
        .onHover { hovering in
            isHovered = hovering
        }
        .animation(.easeInOut(duration: 0.15), value: isHovered)
    }
}

struct CompanionTodayTaskRowView: View {
    let item: CompanionListItem
    let index: Int
    @Bindable var viewModel: CompanionViewModel
    @State private var isHovered = false
    @State private var isStatusHovered = false
    @State private var isOpenHovered = false
    @State private var isFocusHovered = false

    var body: some View {
        let isSelected = viewModel.selectedIndex == index
        let taskId = item.id.replacingOccurrences(of: "today-task-", with: "")

        if let task = viewModel.model.tasks.first(where: { $0.id == taskId }) {
            HStack(spacing: 12) {
                // Complete / Toggle Status Button
                Button {
                    Task {
                        let nextStatus: TaskStatus = task.status == .completed ? .planned : .completed
                        await viewModel.model.setTaskStatus(task, status: nextStatus)
                        viewModel.refreshItems()
                    }
                } label: {
                    Image(systemName: task.status == .completed ? "checkmark.circle.fill" : (task.status == .inProgress ? "play.circle.fill" : "circle"))
                        .font(.system(size: 16))
                        .foregroundStyle(task.status == .completed ? iTuTheme.mint : (task.status == .inProgress ? iTuTheme.teal : iTuTheme.inkDim))
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                .help(task.status == .completed ? "Reopen task" : "Complete task")

                // Title & Metadata
                VStack(alignment: .leading, spacing: 2) {
                    Text(task.title)
                        .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                        .strikethrough(task.status == .completed)
                        .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                        .lineLimit(1)

                    HStack(spacing: 6) {
                        Text(task.status == .completed ? "Completed" : (task.status == .inProgress ? "In Progress" : "Planned"))
                            .font(.system(size: 10, weight: .bold))
                            .foregroundStyle(task.status == .completed ? iTuTheme.mint : (task.status == .inProgress ? iTuTheme.teal : iTuTheme.inkFaint))

                        if task.priority != .none {
                            Text("•")
                                .font(.system(size: 10))
                                .foregroundStyle(iTuTheme.inkFaint)
                            Text(task.priority.rawValue.capitalized)
                                .font(.system(size: 10, weight: .medium))
                                .foregroundStyle(task.priority == .high ? Color.red : iTuTheme.inkFaint)
                        }
                    }
                }

                Spacer()

                // Actions on hover or selection
                if isSelected || isHovered {
                    HStack(spacing: 6) {
                        // Complete action
                        Button {
                            Task {
                                await viewModel.model.setTaskStatus(task, status: .completed)
                                viewModel.refreshItems()
                            }
                        } label: {
                            Image(systemName: "checkmark")
                                .font(.system(size: 10, weight: .bold))
                                .padding(5)
                                .background(Color.black.opacity(0.06))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                        .help("Complete")

                        // Status menu
                        Menu {
                            Button("Planned") {
                                Task { await viewModel.model.setTaskStatus(task, status: .planned) }
                            }
                            Button("In Progress") {
                                Task { await viewModel.model.setTaskStatus(task, status: .inProgress) }
                            }
                            Button("Completed") {
                                Task { await viewModel.model.setTaskStatus(task, status: .completed) }
                            }
                            Button("Canceled") {
                                Task { await viewModel.model.setTaskStatus(task, status: .canceled) }
                            }
                        } label: {
                            Image(systemName: "ellipsis.circle")
                                .font(.system(size: 12))
                                .padding(5)
                                .background(isStatusHovered ? Color.black.opacity(0.12) : Color.black.opacity(0.06))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                        .help("Change status")
                        .onHover { hovering in
                            isStatusHovered = hovering
                        }

                        // Start Focus action
                        Button {
                            Task {
                                await viewModel.startFocus(for: task)
                            }
                        } label: {
                            Image(systemName: "play.fill")
                                .font(.system(size: 10, weight: .bold))
                                .padding(5)
                                .background(isFocusHovered ? iTuTheme.teal.opacity(0.85) : iTuTheme.teal)
                                .foregroundStyle(.white)
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                        .help("Start Focus")
                        .onHover { hovering in
                            isFocusHovered = hovering
                        }

                        // Open in main window action
                        Button {
                            viewModel.router.openTask(id: task.id)
                            viewModel.dismissCompanion()
                        } label: {
                            Image(systemName: "arrow.up.right")
                                .font(.system(size: 10, weight: .bold))
                                .padding(5)
                                .background(isOpenHovered ? Color.black.opacity(0.12) : Color.black.opacity(0.06))
                                .clipShape(Circle())
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                        .help("Open task")
                        .onHover { hovering in
                            isOpenHovered = hovering
                        }
                    }
                    .transition(.opacity)
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 42)
            .background(
                isSelected
                    ? iTuTheme.mintTint.opacity(0.3)
                    : (isHovered ? Color.black.opacity(0.04) : Color.clear)
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .padding(.horizontal, 12)
            .id(item.id)
            .onHover { hovering in
                isHovered = hovering
            }
            .animation(.easeInOut(duration: 0.12), value: isHovered)
        }
    }
}

struct CompanionHabitsCardView: View {
    let items: [CompanionListItem]
    let selectedIndex: Int
    @Bindable var viewModel: CompanionViewModel
    @State private var isHovered = false
    @State private var hoveredHabitId: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.element.id) { subIndex, item in
                let globalIndex = viewModel.items.firstIndex(where: { $0.id == item.id }) ?? 0
                let isSelected = selectedIndex == globalIndex
                let habitId = item.id.replacingOccurrences(of: "habit-", with: "")
                let isRowHovered = hoveredHabitId == habitId
                
                if let habit = viewModel.model.habits.first(where: { $0.id == habitId }) {
                    HStack {
                        Button {
                            Task {
                                await viewModel.model.toggleHabitCheckIn(habit)
                                viewModel.refreshItems()
                            }
                        } label: {
                            Image(systemName: habit.isCompletedToday ? "checkmark.circle.fill" : "circle")
                                .font(.system(size: 15))
                                .foregroundStyle(habit.isCompletedToday ? Color.green : (isSelected ? iTuTheme.teal : iTuTheme.inkDim))
                        }
                        .buttonStyle(.plain)
                        .pointingHandCursor()
                        
                        Text(habit.name)
                            .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                            .foregroundStyle(iTuTheme.ink)
                        
                        Spacer()
                        
                        if habit.currentStreak > 0 {
                            Text("🔥 \(habit.currentStreak)d")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.orange)
                        }
                    }
                    .padding(.horizontal, 12)
                    .frame(height: 38)
                    .background(
                        isSelected
                            ? iTuTheme.mintTint.opacity(0.5)
                            : (isRowHovered ? Color.black.opacity(0.04) : Color.clear)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .padding(.horizontal, 4)
                    .padding(.vertical, 2)
                    .contentShape(Rectangle())
                    .onHover { hovering in
                        if hovering {
                            hoveredHabitId = habitId
                        } else if hoveredHabitId == habitId {
                            hoveredHabitId = nil
                        }
                    }
                    .animation(.easeInOut(duration: 0.12), value: isRowHovered)
                }
            }
        }
        .padding(.vertical, 6)
        .background(isHovered ? Color.black.opacity(0.04) : Color.black.opacity(0.02))
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(isHovered ? iTuTheme.teal.opacity(0.3) : iTuTheme.border, lineWidth: 1)
        }
        .padding(.horizontal, 12)
        .id(items.first?.id ?? "habits-list")
        .onHover { hovering in
            isHovered = hovering
        }
        .animation(.easeInOut(duration: 0.15), value: isHovered)
    }
}

struct CompanionItemRowView: View {
    let item: CompanionListItem
    let isSelected: Bool
    let index: Int
    @Bindable var viewModel: CompanionViewModel
    @State private var isHovered = false

    var body: some View {
        Button {
            viewModel.selectedIndex = index
            viewModel.executeSelection()
        } label: {
            HStack(spacing: 12) {
                Image(systemName: item.icon)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)
                    .frame(width: 20)

                VStack(alignment: .leading, spacing: 2) {
                    Text(item.title)
                        .font(.system(size: 13, weight: isSelected ? .semibold : .medium))
                        .foregroundStyle(iTuTheme.ink)
                        .lineLimit(1)

                    if let subtitle = item.subtitle {
                        Text(subtitle)
                            .font(.system(size: 10))
                            .foregroundStyle(iTuTheme.inkDim)
                            .lineLimit(1)
                    }
                }

                Spacer()

                if isSelected || isHovered {
                    HStack(spacing: 8) {
                        if item.id.hasPrefix("task-") {
                            Text("Open")
                                .font(.system(size: 10, weight: .bold))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(Color.black.opacity(0.06))
                                .clipShape(RoundedRectangle(cornerRadius: 4))
                                .foregroundStyle(iTuTheme.inkDim)
                        } else {
                            Image(systemName: "return")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }
                    }
                    .transition(.opacity)
                }
            }
        }
        .buttonStyle(CompanionRowButtonStyle(isSelected: isSelected, hasSubtitle: item.subtitle != nil, isHovered: isHovered))
        .padding(.horizontal, 8)
        .id(item.id)
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

struct CompanionIconButton: View {
    let systemName: String
    let action: () -> Void
    @State private var isHovered = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemName)
                .font(.system(size: 12))
                .foregroundStyle(isHovered ? iTuTheme.ink : iTuTheme.inkDim)
                .frame(width: 24, height: 24)
                .background(isHovered ? Color.black.opacity(0.06) : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .pointingHandCursor()
        .onHover { hovering in
            isHovered = hovering
        }
    }
}

struct CompanionActionButtonStyle: ButtonStyle {
    let isSelected: Bool
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                isSelected
                    ? (configuration.isPressed ? iTuTheme.ink.opacity(0.85) : iTuTheme.ink)
                    : (configuration.isPressed
                        ? Color.black.opacity(0.15)
                        : (isHovered ? Color.black.opacity(0.1) : Color.black.opacity(0.05)))
            )
            .foregroundStyle(isSelected ? iTuTheme.surface : iTuTheme.ink)
            .clipShape(RoundedRectangle(cornerRadius: 6))
            .scaleEffect(configuration.isPressed ? 0.96 : 1.0)
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
            .animation(.easeOut(duration: 0.15), value: isHovered)
            .onHover { hovering in
                isHovered = hovering
            }
    }
}

struct CompanionRowButtonStyle: ButtonStyle {
    let isSelected: Bool
    let hasSubtitle: Bool
    let isHovered: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 12)
            .frame(height: hasSubtitle ? 44 : 36)
            .background(
                isSelected
                    ? (configuration.isPressed ? iTuTheme.mintTint.opacity(0.85) : iTuTheme.mintTint)
                    : (configuration.isPressed
                        ? Color.black.opacity(0.08)
                        : (isHovered ? Color.black.opacity(0.04) : Color.clear))
            )
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.teal.opacity(0.3), lineWidth: 1)
                }
            }
            .scaleEffect(configuration.isPressed ? 0.99 : (isHovered ? 1.005 : 1.0))
            .animation(.easeOut(duration: 0.1), value: configuration.isPressed)
    }
}

