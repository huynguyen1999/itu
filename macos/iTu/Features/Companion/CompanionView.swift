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

    func updateNSView(_ view: NSVisualEffectView, context: Context) {
        view.material = material
        view.blendingMode = blendingMode
    }
}

struct CompanionView: View {
    @Bindable var viewModel: CompanionViewModel
    @FocusState private var searchFocused: Bool
    @FocusState private var noteBodyFocused: Bool
    @FocusState private var taskCaptureFocused: Bool
    @FocusState private var cardFrontFocused: Bool

    var body: some View {
        ZStack {
            VisualEffectView()
            VStack(spacing: 0) {
                searchBar
                tabBar
                Group {
                    if viewModel.searchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                        tabContent
                    } else {
                        searchResults
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                statusBar
            }
        }
        .frame(minWidth: 650, minHeight: 520)
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 20, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
        .onKeyPress(.upArrow) {
            guard !viewModel.searchText.isEmpty else { return .ignored }
            viewModel.moveSearchSelection(-1)
            return .handled
        }
        .onKeyPress(.downArrow) {
            guard !viewModel.searchText.isEmpty else { return .ignored }
            viewModel.moveSearchSelection(1)
            return .handled
        }
        .onKeyPress(.return) {
            if !viewModel.searchText.isEmpty {
                viewModel.executeSearchSelection()
                return .handled
            }
            return viewModel.handleReturn() ? .handled : .ignored
        }
        .onAppear { searchFocused = true }
        .onReceive(NotificationCenter.default.publisher(for: NSWindow.didBecomeKeyNotification)) { notification in
            guard notification.object as? NSWindow == NSApp.keyWindow else { return }
            searchFocused = true
        }
        .onChange(of: viewModel.isTaskCapturing) { _, active in
            if active { taskCaptureFocused = true }
        }
        .onChange(of: viewModel.addingCardDeckID) { _, deckID in
            if deckID != nil { cardFrontFocused = true }
        }
        .onChange(of: viewModel.selectedTab) { _, tab in
            if tab == .note {
                searchFocused = false
                noteBodyFocused = true
            } else {
                noteBodyFocused = false
            }
        }
    }

    private var searchBar: some View {
        HStack(spacing: 11) {
            Image(systemName: "magnifyingglass")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(iTuTheme.inkDim)
            TextField("Search iTu or run a command…", text: $viewModel.searchText)
                .textFieldStyle(.plain)
                .font(.system(size: 15, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
                .focused($searchFocused)
            if !viewModel.searchText.isEmpty {
                Button { viewModel.searchText = "" } label: {
                    Image(systemName: "xmark.circle.fill").foregroundStyle(iTuTheme.inkFaint)
                }
                .buttonStyle(.plain)
                .accessibilityLabel("Clear search")
            } else {
                Button { viewModel.router.openSettings(); viewModel.dismissCompanion() } label: {
                    Image(systemName: "gearshape")
                }
                .help("Settings")
                Button { viewModel.router.openMainWindow(); viewModel.dismissCompanion() } label: {
                    Image(systemName: "arrow.up.right.square")
                }
                .help("Open full iTu")
                Button { viewModel.dismissCompanion() } label: { Image(systemName: "xmark") }
                    .help("Close companion")
            }
        }
        .buttonStyle(.plain)
        .foregroundStyle(iTuTheme.inkDim)
        .padding(.horizontal, 16)
        .frame(height: 50)
        .background(Color.black.opacity(0.025))
        .overlay(alignment: .bottom) { Divider().overlay(iTuTheme.border) }
    }

    private var tabBar: some View {
        HStack(spacing: 6) {
            ForEach(CompanionTab.allCases) { tab in
                Button { viewModel.selectTab(tab) } label: {
                    HStack(spacing: 6) {
                        Image(systemName: tab.icon)
                        Text(tab.title)
                        Text("⌘\(tab.rawValue)")
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(viewModel.selectedTab == tab ? iTuTheme.teal : iTuTheme.inkFaint)
                    }
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 10)
                    .frame(height: 32)
                    .foregroundStyle(viewModel.selectedTab == tab ? iTuTheme.ink : iTuTheme.inkDim)
                    .background(viewModel.selectedTab == tab ? iTuTheme.mintTint.opacity(0.8) : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(KeyEquivalent(Character(String(tab.rawValue))), modifiers: .command)
                .accessibilityLabel("\(tab.title), Command \(tab.rawValue)")
            }
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 12)
        .frame(height: 44)
        .overlay(alignment: .bottom) { Divider().overlay(iTuTheme.border) }
    }

    @ViewBuilder private var tabContent: some View {
        switch viewModel.selectedTab {
        case .tasksHabits: tasksHabitsTab
        case .note: noteTab
        case .focus: focusTab
        case .deck: deckTab
        }
    }

    private var tasksHabitsTab: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 16) {
                    if !viewModel.overdueTasks.isEmpty {
                        companionSection("OVERDUE", id: "tasks-overdue") {
                            ForEach(viewModel.overdueTasks) { taskRow($0, overdue: true) }
                        }
                    }
                    companionSection("TODAY", id: "tasks-today") {
                        if viewModel.todayTasks.isEmpty {
                            emptyRow("All caught up", detail: "No Tasks scheduled or due today.", icon: "checkmark.circle")
                        } else {
                            ForEach(viewModel.todayTasks) { taskRow($0, overdue: false) }
                        }
                        if viewModel.isTaskCapturing {
                            HStack(spacing: 10) {
                                Image(systemName: "plus.circle.fill").foregroundStyle(iTuTheme.teal)
                                TextField("Add a Task to Inbox", text: $viewModel.taskCaptureText)
                                    .textFieldStyle(.plain)
                                    .focused($taskCaptureFocused)
                                    .onSubmit { Task { await viewModel.captureTask() } }
                                Button("Add") { Task { await viewModel.captureTask() } }
                                    .buttonStyle(.borderedProminent).tint(iTuTheme.teal)
                            }
                            .padding(11)
                        } else {
                            Button { viewModel.isTaskCapturing = true } label: {
                                Label("Add Task", systemImage: "plus").frame(maxWidth: .infinity, alignment: .leading)
                            }
                            .buttonStyle(.plain)
                            .foregroundStyle(iTuTheme.teal)
                            .padding(11)
                        }
                    }
                    companionSection("HABITS", id: "habits-today") {
                        if viewModel.todayHabits.isEmpty {
                            emptyRow("No Habits scheduled", detail: "Manage schedules in the Habits workspace.", icon: "repeat")
                        } else {
                            ForEach(viewModel.todayHabits) { habitRow($0) }
                        }
                    }
                }
                .padding(14)
            }
            .onChange(of: viewModel.scrollTarget) { _, target in
                guard let target else { return }
                proxy.scrollTo(target, anchor: .top)
                viewModel.scrollTarget = nil
            }
        }
    }

    private func taskRow(_ task: ProductivityTask, overdue: Bool) -> some View {
        let nextStatus = nextTaskStatus(task.status)
        return HStack(spacing: 10) {
            Button { Task { await viewModel.toggleTask(task) } } label: {
                Image(systemName: taskStatusIcon(task.status))
                    .font(.system(size: 17))
                    .foregroundStyle(taskStatusColor(task.status, overdue: overdue))
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Status: \(task.status.displayName). Change to \(nextStatus.displayName)")
            Button { viewModel.openTask(task) } label: {
                HStack {
                    Text(task.title)
                        .strikethrough(task.status == .completed)
                        .foregroundStyle(task.status == .completed ? iTuTheme.inkFaint : iTuTheme.ink)
                        .lineLimit(1)
                    Spacer()
                    if overdue { Text("Overdue").foregroundStyle(.orange) }
                    if task.priority != .none { Image(systemName: "flag.fill").foregroundStyle(task.priority == .high ? .red : iTuTheme.inkFaint) }
                    Image(systemName: "arrow.up.right").foregroundStyle(iTuTheme.inkFaint)
                }
            }
            .buttonStyle(.plain)
        }
        .font(.system(size: 13, weight: .medium))
        .padding(.horizontal, 12)
        .frame(height: 40)
    }

    private func nextTaskStatus(_ status: TaskStatus) -> TaskStatus {
        switch status {
        case .inbox, .planned: .inProgress
        case .inProgress: .completed
        case .completed, .canceled, .archived: .planned
        }
    }

    private func taskStatusIcon(_ status: TaskStatus) -> String {
        switch status {
        case .inProgress: "play.circle.fill"
        case .completed: "checkmark.circle.fill"
        case .canceled: "xmark.circle.fill"
        case .inbox, .planned, .archived: "circle"
        }
    }

    private func taskStatusColor(_ status: TaskStatus, overdue: Bool) -> Color {
        switch status {
        case .inProgress, .completed: iTuTheme.teal
        case .canceled, .archived: iTuTheme.inkFaint
        case .inbox, .planned: overdue ? .orange : iTuTheme.inkDim
        }
    }

    private func habitRow(_ row: CompanionHabitRow) -> some View {
        Button { Task { await viewModel.toggleHabit(row) } } label: {
            HStack(spacing: 10) {
                Image(systemName: row.occurrence.status == .completed ? "checkmark.circle.fill" : "circle")
                    .font(.system(size: 17))
                    .foregroundStyle(row.occurrence.status == .completed ? iTuTheme.teal : iTuTheme.inkDim)
                Image(systemName: row.habit.icon).frame(width: 16)
                Text(row.habit.name).font(.system(size: 13, weight: .medium))
                Spacer()
                if row.occurrence.status == .completed { Text("Done").foregroundStyle(iTuTheme.teal) }
            }
            .padding(.horizontal, 12)
            .frame(height: 40)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(row.occurrence.status == .completed ? "Uncheck \(row.habit.name)" : "Check in \(row.habit.name)")
    }

    private var noteTab: some View {
        VStack(spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("TODAY’S LIVING NOTE").companionEyebrow()
                    Text(viewModel.today).font(.system(size: 12)).foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button(viewModel.noteSaveState.label) {
                    if viewModel.noteSaveState == .retry { viewModel.retryNoteSave() }
                }
                .buttonStyle(.plain)
                .foregroundStyle(viewModel.noteSaveState == .retry ? Color.orange : iTuTheme.teal)
                .disabled(viewModel.noteSaveState != .retry)
                .accessibilityLabel("Note status: \(viewModel.noteSaveState.label)")
            }
            TextField("Note title", text: $viewModel.noteTitle)
                .textFieldStyle(.plain)
                .font(.system(size: 19, weight: .bold, design: .rounded))
                .padding(.horizontal, 14).frame(height: 42)
                .background(iTuTheme.surface.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            ZStack(alignment: .topLeading) {
                if viewModel.noteBody.isEmpty {
                    Text("Write in Markdown…").foregroundStyle(iTuTheme.inkFaint).padding(.horizontal, 10).padding(.vertical, 9)
                }
                TextEditor(text: $viewModel.noteBody)
                    .font(.system(size: 14, design: .rounded))
                    .scrollContentBackground(.hidden)
                    .padding(4)
                    .focused($noteBodyFocused)
                    .onAppear {
                        searchFocused = false
                        noteBodyFocused = true
                    }
            }
            .background(iTuTheme.surface.opacity(0.72))
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
        }
        .padding(16)
        .task { await viewModel.loadTodayNote() }
    }

    private var focusTab: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                if let session = viewModel.model.focusTimer.activeSession {
                    activeFocusCard(session)
                } else {
                    idleFocusCard
                }
                if let error = viewModel.model.focusTimer.errorMessage {
                    Label(error, systemImage: "wifi.exclamationmark")
                        .font(.system(size: 11, weight: .medium))
                        .foregroundStyle(iTuTheme.amber)
                        .padding(.horizontal, 4)
                }
            }
            .padding(14)
        }
    }

    private var idleFocusCard: some View {
        companionSection("FOCUS", id: "focus-idle") {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    ZStack {
                        Circle().fill(iTuTheme.mintTint).frame(width: 38, height: 38)
                        Image(systemName: "timer").font(.system(size: 17, weight: .semibold)).foregroundStyle(iTuTheme.teal)
                    }
                    VStack(alignment: .leading, spacing: 3) {
                        Text("No active session").font(.system(size: 14, weight: .bold, design: .rounded)).foregroundStyle(iTuTheme.ink)
                        Text("Choose a duration and optionally link a Task.").font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim)
                    }
                    Spacer()
                    Text("\(viewModel.model.focusTimer.selectedMinutes):00")
                        .font(.system(size: 22, weight: .semibold, design: .monospaced))
                        .foregroundStyle(iTuTheme.ink)
                }
                .padding(14)

                Divider().overlay(iTuTheme.border)

                VStack(alignment: .leading, spacing: 8) {
                    Text("DURATION").companionEyebrow()
                    HStack(spacing: 7) {
                        ForEach([15, 25, 30, 45, 60], id: \.self) { minutes in
                            let selected = viewModel.model.focusTimer.selectedMinutes == minutes
                            Button { viewModel.model.focusTimer.setDuration(minutes: minutes) } label: {
                                Text("\(minutes) min")
                                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                                    .foregroundStyle(selected ? Color.white : iTuTheme.inkDim)
                                    .frame(maxWidth: .infinity)
                                    .frame(height: 30)
                                    .background(selected ? iTuTheme.teal : iTuTheme.surfaceMuted)
                                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Focus for \(minutes) minutes")
                        }
                    }
                }
                .padding(14)

                Divider().overlay(iTuTheme.border)

                HStack(spacing: 12) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("TASK").companionEyebrow()
                        Text("Optional").font(.system(size: 10)).foregroundStyle(iTuTheme.inkFaint)
                    }
                    Spacer()
                    focusTaskMenu
                        .frame(maxWidth: 360, alignment: .trailing)
                }
                .padding(14)

                Divider().overlay(iTuTheme.border)

                Button { Task { await viewModel.model.startFocus() } } label: {
                    Label("Start Focus", systemImage: "play.fill")
                        .font(.system(size: 13, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 38)
                        .background(iTuTheme.teal)
                        .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                }
                .buttonStyle(.plain)
                .padding(12)
            }
        }
    }

    private var focusTaskMenu: some View {
        Menu {
            Button("No linked Task") { viewModel.selectFocusTask(nil) }
            if viewModel.focusTaskCandidates.isEmpty {
                Text("No active Tasks")
            } else {
                Divider()
                ForEach(viewModel.focusTaskCandidates) { task in
                    Button {
                        viewModel.selectFocusTask(task.id)
                    } label: {
                        if viewModel.model.focusTimer.linkedTask?.id == task.id {
                            Label(task.title, systemImage: "checkmark")
                        } else {
                            Text(task.title)
                        }
                    }
                }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "checklist").foregroundStyle(iTuTheme.teal)
                Text(viewModel.model.focusTimer.linkedTask?.title ?? "Select a Task")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
                    .lineLimit(1)
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9, weight: .bold)).foregroundStyle(iTuTheme.inkFaint)
            }
            .padding(.horizontal, 11)
            .frame(height: 32)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 8, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
        }
        .menuStyle(.borderlessButton)
        .accessibilityLabel("Linked Task: \(viewModel.model.focusTimer.linkedTask?.title ?? "none")")
    }

    private func activeFocusCard(_ session: FocusSession) -> some View {
        companionSection(session.phase == .work ? "FOCUS" : "BREAK", id: "focus-active") {
            VStack(spacing: 0) {
                HStack(alignment: .center, spacing: 12) {
                    Circle()
                        .fill(session.status == .paused ? iTuTheme.amber : iTuTheme.mint)
                        .frame(width: 9, height: 9)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(session.status == .paused ? "Session paused" : "Session in progress")
                            .font(.system(size: 14, weight: .bold, design: .rounded)).foregroundStyle(iTuTheme.ink)
                        Text(session.taskTitleSnapshot ?? session.customTitle ?? "Focus")
                            .font(.system(size: 11)).foregroundStyle(iTuTheme.inkDim).lineLimit(1)
                    }
                    Spacer()
                    Text(viewModel.model.focusTimer.formattedRemaining)
                        .font(.system(size: 30, weight: .semibold, design: .monospaced))
                        .foregroundStyle(iTuTheme.ink)
                        .contentTransition(.numericText())
                }
                .padding(16)

                ProgressView(value: viewModel.model.focusTimer.progressFraction)
                    .progressViewStyle(.linear)
                    .tint(iTuTheme.teal)
                    .padding(.horizontal, 16)
                    .padding(.bottom, 14)

                Divider().overlay(iTuTheme.border)

                HStack(spacing: 8) {
                    focusAction(session.status == .paused ? "Resume" : "Pause", icon: session.status == .paused ? "play.fill" : "pause.fill") {
                        Task { await viewModel.model.performFocusAction(session.status == .paused ? "resume" : "pause") }
                    }
                    focusAction("+5 min", icon: "plus") { Task { await viewModel.model.performFocusAction("extend", extendSeconds: 300) } }
                    focusAction("Complete", icon: "checkmark", emphasized: true) { Task { await viewModel.model.performFocusAction("complete") } }
                    focusAction("Abandon", icon: "xmark", destructive: true) { Task { await viewModel.model.performFocusAction("abandon") } }
                }
                .padding(12)
            }
        }
    }

    private func focusAction(
        _ title: String,
        icon: String,
        emphasized: Bool = false,
        destructive: Bool = false,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(emphasized ? Color.white : (destructive ? iTuTheme.coral : iTuTheme.inkDim))
                .frame(maxWidth: .infinity)
                .frame(height: 32)
                .background(emphasized ? iTuTheme.teal : (destructive ? iTuTheme.coralTint : iTuTheme.surfaceMuted))
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder private var deckTab: some View {
        if viewModel.reviewingDeckID != nil {
            reviewView
        } else {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 10) {
                    if let message = viewModel.deckMessage {
                        Label(message, systemImage: "checkmark.circle").font(.caption).foregroundStyle(iTuTheme.teal)
                    }
                    if viewModel.sortedDecks.isEmpty {
                        emptyRow("No Flashcard Decks", detail: "Create a Deck in the main Learn workspace.", icon: "rectangle.stack")
                    }
                    ForEach(viewModel.sortedDecks) { deck in
                        VStack(spacing: 0) {
                            HStack(spacing: 12) {
                                Image(systemName: deck.icon).font(.system(size: 18)).foregroundStyle(iTuTheme.teal).frame(width: 28)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(deck.title).font(.system(size: 14, weight: .semibold)).foregroundStyle(iTuTheme.ink)
                                    Text("\(deck.dueCount) due · \(deck.cardCount) cards").font(.caption).foregroundStyle(iTuTheme.inkDim)
                                }
                                Spacer()
                                Button("Quick Add", systemImage: "plus") {
                                    if viewModel.addingCardDeckID == deck.id {
                                        viewModel.cancelDeckFlow()
                                    } else {
                                        viewModel.beginAddingCard(to: deck)
                                    }
                                }
                                .buttonStyle(iTuSecondaryButtonStyle(height: 30))
                                Button("Review") { Task { await viewModel.beginReview(deck) } }
                                    .buttonStyle(iTuPrimaryButtonStyle(height: 30))
                            }
                            .padding(12)

                            if viewModel.addingCardDeckID == deck.id {
                                Divider().overlay(iTuTheme.border)
                                quickAddFlashcard(to: deck)
                            }
                        }
                        .background(iTuTheme.surface.opacity(0.66))
                        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                        .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
                    }
                }
                .padding(14)
            }
        }
    }

    private func quickAddFlashcard(to deck: DeckModel) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("QUICK ADD TO \(deck.title.uppercased())").companionEyebrow()
            HStack(spacing: 8) {
                TextField("Front", text: $viewModel.cardFront)
                    .focused($cardFrontFocused)
                    .onSubmit { if !viewModel.cardBack.isEmpty { Task { await viewModel.saveCard() } } }
                TextField("Back", text: $viewModel.cardBack)
                    .onSubmit { Task { await viewModel.saveCard() } }
                Button("Add", systemImage: "return") { Task { await viewModel.saveCard() } }
                    .buttonStyle(iTuPrimaryButtonStyle(height: 32))
                    .disabled(
                        viewModel.cardFront.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ||
                        viewModel.cardBack.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
            }
            .textFieldStyle(.plain)
            .font(.system(size: 12, design: .rounded))
            .padding(.horizontal, 10)
            .frame(height: 36)
            .background(iTuTheme.surfaceMuted)
            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
            .overlay { RoundedRectangle(cornerRadius: 9, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
            if let message = viewModel.cardValidationMessage {
                Text(message).font(.system(size: 10, weight: .medium)).foregroundStyle(iTuTheme.amber)
            }
        }
        .padding(12)
    }

    private var reviewView: some View {
        VStack(spacing: 14) {
            HStack {
                Button("End review", systemImage: "xmark") { viewModel.cancelDeckFlow() }.buttonStyle(.plain)
                Spacer()
                Text("\(min(viewModel.reviewIndex + 1, viewModel.reviewCards.count)) / \(viewModel.reviewCards.count)")
                    .font(.system(size: 11, weight: .bold, design: .monospaced)).foregroundStyle(iTuTheme.inkDim)
            }
            if viewModel.reviewCards.indices.contains(viewModel.reviewIndex) {
                let card = viewModel.reviewCards[viewModel.reviewIndex]
                VStack(spacing: 14) {
                    Text(card.frontMarkdown).font(.system(size: 20, weight: .semibold, design: .rounded)).multilineTextAlignment(.center)
                    if viewModel.reviewRevealed {
                        Divider()
                        Text(card.backMarkdown).font(.system(size: 16, design: .rounded)).multilineTextAlignment(.center)
                    } else {
                        Button("Reveal answer  Space") { viewModel.revealReviewCard() }.buttonStyle(.borderedProminent).tint(iTuTheme.teal)
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(24)
                .background(iTuTheme.surface.opacity(0.72))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                if viewModel.reviewRevealed {
                    HStack {
                        gradeButton(1, "Again", .red)
                        gradeButton(2, "Hard", .orange)
                        gradeButton(3, "Good", iTuTheme.teal)
                        gradeButton(4, "Easy", .green)
                    }
                }
            }
        }
        .padding(16)
        .onKeyPress(.space) { viewModel.revealReviewCard(); return .handled }
        .onKeyPress(phases: .down) { press in
            guard let number = Int(press.characters), (1...4).contains(number) else { return .ignored }
            Task { await viewModel.gradeReview(number) }
            return .handled
        }
    }

    private func gradeButton(_ grade: Int, _ title: String, _ color: Color) -> some View {
        Button { Task { await viewModel.gradeReview(grade) } } label: {
            VStack(spacing: 2) { Text("\(grade)").font(.caption.monospaced().bold()); Text(title) }.frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered).tint(color)
        .accessibilityLabel("Grade \(title), \(grade)")
    }

    private var searchResults: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 2) {
                    ForEach(Array(viewModel.searchItems.enumerated()), id: \.element.id) { index, item in
                        if index == 0 || viewModel.searchItems[index - 1].section != item.section {
                            Text(item.section.rawValue).companionEyebrow().padding(.top, index == 0 ? 10 : 14).padding(.horizontal, 14)
                        }
                        Button { item.action() } label: {
                            HStack(spacing: 10) {
                                Image(systemName: item.icon).frame(width: 18).foregroundStyle(index == viewModel.selectedSearchIndex ? iTuTheme.teal : iTuTheme.inkDim)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(item.title).font(.system(size: 13, weight: .semibold)).lineLimit(1)
                                    if let subtitle = item.subtitle { Text(subtitle).font(.caption).foregroundStyle(iTuTheme.inkDim) }
                                }
                                Spacer()
                                if index == viewModel.selectedSearchIndex { Image(systemName: "return").foregroundStyle(iTuTheme.inkFaint) }
                            }
                            .foregroundStyle(iTuTheme.ink)
                            .padding(.horizontal, 12).frame(height: 44)
                            .background(index == viewModel.selectedSearchIndex ? iTuTheme.mintTint.opacity(0.85) : .clear)
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        }
                        .buttonStyle(.plain).padding(.horizontal, 6).id(item.id)
                    }
                }
                .padding(.bottom, 12)
            }
            .onChange(of: viewModel.selectedSearchIndex) { _, index in
                guard viewModel.searchItems.indices.contains(index) else { return }
                proxy.scrollTo(viewModel.searchItems[index].id, anchor: .center)
            }
        }
    }

    private var statusBar: some View {
        let status = viewModel.dailyStatus
        return HStack(spacing: 4) {
            statusButton("\(status.taskCount) Tasks today", icon: "checklist") { viewModel.navigateStatusTasks() }
            statusButton("\(status.habitCount) Habits today", icon: "repeat") { viewModel.navigateStatusHabits() }
            statusButton("\(status.focusedMinutes) min focused", icon: "timer") { viewModel.selectTab(.focus) }
            statusButton("\(status.dueCardCount) cards to review", icon: "rectangle.stack") { viewModel.selectTab(.deck) }
        }
        .padding(.horizontal, 8)
        .frame(height: 38)
        .background(Color.black.opacity(0.025))
        .overlay(alignment: .top) { Divider().overlay(iTuTheme.border) }
    }

    private func statusButton(_ title: String, icon: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Label(title, systemImage: icon)
                .font(.system(size: 10, weight: .semibold, design: .rounded))
                .foregroundStyle(iTuTheme.inkDim)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(title)
    }

    private func companionSection<Content: View>(_ title: String, id: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(title).companionEyebrow().padding(.horizontal, 4).padding(.bottom, 7)
            VStack(spacing: 0) { content() }
                .background(iTuTheme.surface.opacity(0.66))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay { RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(iTuTheme.border, lineWidth: 1) }
        }
        .id(id)
    }

    private func emptyRow(_ title: String, detail: String, icon: String) -> some View {
        HStack(spacing: 10) {
            Image(systemName: icon).font(.system(size: 18)).foregroundStyle(iTuTheme.teal)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 13, weight: .semibold)).foregroundStyle(iTuTheme.ink)
                Text(detail).font(.caption).foregroundStyle(iTuTheme.inkDim)
            }
            Spacer()
        }
        .padding(12)
    }
}

private extension Text {
    func companionEyebrow() -> some View {
        font(.system(size: 10, weight: .bold, design: .monospaced))
            .tracking(1.1)
            .foregroundStyle(iTuTheme.inkFaint)
    }
}
