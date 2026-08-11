import SwiftUI

// MARK: - Layout breakpoints
enum LayoutMode {
    /// Primary rail + content only (< 860 pt)
    case narrow
    /// Primary rail + content; Plan rail manually toggleable (860 – 1099 pt)
    case medium
    /// Primary rail + Plan rail + content (≥ 1100 pt)
    case wide

    init(width: CGFloat) {
        if width < 860 {
            self = .narrow
        } else if width < 1100 {
            self = .medium
        } else {
            self = .wide
        }
    }
}

struct MainView: View {
    @Environment(AppModel.self) private var model
    @State private var retainedDestinations: Set<RetainedDestination> = [.home]
    @State private var retainedPlanSection: AppSection = .inbox
    /// Manually shown/hidden in .medium mode; auto-shown in .wide.
    @State private var showPlanRail = false

    var body: some View {
        GeometryReader { geometry in
            let mode = LayoutMode(width: geometry.size.width)
            ZStack(alignment: .leading) {
                HStack(spacing: 0) {
                    PrimaryRail()

                    // Plan Views rail: always shown in .wide; manually toggled in .medium; hidden in .narrow
                    if model.selectedSection.isPlanningSection && planRailVisible(mode: mode) {
                        PlanningRail()
                            .transition(.move(edge: .leading).combined(with: .opacity))
                    }

                    detail
                        .environment(\.layoutMode, mode)
                        .environment(\.showPlanRailBinding, showPlanRailBinding)
                        .frame(minWidth: 0, maxWidth: .infinity, minHeight: 0, maxHeight: .infinity)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
                .background(iTuTheme.canvas)
                .onChange(of: mode) { _, newMode in
                    // In wide mode the sidebar is always implicit — reset the manual toggle
                    if newMode == .wide { showPlanRail = false }
                }

                if let overlay = model.presentedOverlay {
                    AppOverlayHost(overlay: overlay)
                        .transition(.opacity.combined(with: .scale(scale: 0.98)))
                        .zIndex(100)
                }

                VStack {
                    Spacer()
                    UndoToastView()
                        .padding(.bottom, 24)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottom)
                .allowsHitTesting(true)
                .zIndex(90)
            }
        }
        .background(iTuTheme.canvas)
        .ignoresSafeArea()
        .animation(.snappy(duration: 0.22), value: showPlanRail)
        .animation(.snappy, value: model.presentedOverlay)
        .preferredColorScheme(preferredColorScheme)
        .onAppear {
            retain(model.selectedSection)
        }
        .onChange(of: model.selectedSection) { _, section in
            retain(section)
            Task { @MainActor in
                await Task.yield()
                guard model.selectedSection == section else { return }
                AppPerformanceSignposts.emitContentVisible(sectionName: section.rawValue)
            }
        }
    }

    private var preferredColorScheme: ColorScheme? {
        switch model.settingsStore.themeMode {
        case .system: nil
        case .light: .light
        case .dark: .dark
        }
    }

    @ViewBuilder
    private var detail: some View {
        ZStack {
            if retainedDestinations.contains(.home) || model.selectedSection == .home {
                retainedDestination(isVisible: model.selectedSection == .home) {
                    HomeOverviewView()
                }
            }
            if retainedDestinations.contains(.plan) || model.selectedSection.isRetainedPlanningSection {
                retainedDestination(isVisible: model.selectedSection.isRetainedPlanningSection) {
                    PlanningView(section: activePlanSection)
                }
            }
            if retainedDestinations.contains(.matrix) || model.selectedSection == .matrix {
                retainedDestination(isVisible: model.selectedSection == .matrix) {
                    EisenhowerMatrixView()
                }
            }
            if retainedDestinations.contains(.statistics) || model.selectedSection == .statistics {
                retainedDestination(isVisible: model.selectedSection == .statistics) {
                    StatisticsView()
                }
            }
            if retainedDestinations.contains(.focus) || model.selectedSection == .focus {
                retainedDestination(isVisible: model.selectedSection == .focus) {
                    FocusView()
                }
            }
            if retainedDestinations.contains(.habits) || model.selectedSection == .habits {
                retainedDestination(isVisible: model.selectedSection == .habits) {
                    HabitsView()
                }
            }

            if !model.selectedSection.isRetainedDestination {
                nonRetainedDetail
            }
        }
    }

    private func retain(_ section: AppSection) {
        switch section {
        case .home:
            retainedDestinations.insert(.home)
        case .today, .inbox, .completed:
            retainedDestinations.insert(.plan)
            retainedPlanSection = section
        case .matrix:
            retainedDestinations.insert(.matrix)
        case .statistics:
            retainedDestinations.insert(.statistics)
        case .focus:
            retainedDestinations.insert(.focus)
        case .habits:
            retainedDestinations.insert(.habits)
        default:
            break
        }
    }

    private var activePlanSection: AppSection {
        model.selectedSection.isRetainedPlanningSection ? model.selectedSection : retainedPlanSection
    }

    private func retainedDestination<Content: View>(
        isVisible: Bool,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .opacity(isVisible ? 1 : 0)
            .allowsHitTesting(isVisible)
            .accessibilityHidden(!isVisible)
    }

    @ViewBuilder
    private var nonRetainedDetail: some View {
        switch model.selectedSection {
        case .upcoming:
            UpcomingView()
        case .journal:
            JournalView()
        case .budget:
            BudgetView()
        case .gym:
            GymView()
        case .growth:
            GrowthView()
        case .learn:
            LearnView()
        case .trash:
            TrashView()
        case .conflicts:
            ConflictsView()
        case .notifications:
            NotificationsView()
        case .profile:
            ProfileView()
        case .settings:
            SettingsView()
        case .home, .today, .inbox, .completed, .matrix, .statistics, .focus, .habits:
            EmptyView()
        }
    }

    /// Whether the PlanningRail should be displayed for the given mode.
    private func planRailVisible(mode: LayoutMode) -> Bool {
        switch mode {
        case .wide: return true
        case .medium: return showPlanRail
        case .narrow: return false
        }
    }

    private var showPlanRailBinding: Binding<Bool> {
        Binding(
            get: { showPlanRail },
            set: { showPlanRail = $0 }
        )
    }

    private enum RetainedDestination: Hashable {
        case home
        case plan
        case matrix
        case statistics
        case focus
        case habits
    }
}

private struct PrimaryRail: View {
    @Environment(AppModel.self) private var model

    private func navigateTo(_ section: AppSection) {
        let sectionChanged = model.selectedSection != section
        guard sectionChanged || model.selectedTaskListId != nil else { return }
        if sectionChanged {
            AppPerformanceSignposts.emitSelectionCommitted(sectionName: section.rawValue)
        }
        var transaction = Transaction()
        transaction.disablesAnimations = true
        withTransaction(transaction) {
            model.selectedTaskListId = nil
            model.selectedSection = section
        }
    }

    private func navigateTo(_ entry: NavigationEntry) {
        guard entry.id != "plan" || !model.selectedSection.isPlanningSection else { return }
        navigateTo(entry.destination)
    }

    private func isSelected(_ entry: NavigationEntry) -> Bool {
        entry.id == "plan"
            ? model.selectedSection.isPlanningSection
            : model.selectedSection == entry.destination
    }

    private func badge(for entry: NavigationEntry) -> Int {
        switch entry.id {
        case "conflicts": model.conflicts.count
        case "notifications": model.notifications.filter { $0.readAt == nil }.count
        default: 0
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            brand

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    ForEach(NavigationSchema.primaryGroups) { group in
                        railGroup(group.title) {
                            ForEach(group.entries) { entry in
                                PrimaryRailButton(
                                    title: entry.title,
                                    systemImage: entry.systemImage,
                                    badge: badge(for: entry),
                                    isSelected: isSelected(entry)
                                ) {
                                    navigateTo(entry)
                                }
                            }
                        }
                    }
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 20)
            }

            footer
        }
        .frame(width: 222)
        .background(
            LinearGradient(
                colors: [iTuTheme.forest, iTuTheme.forestDeep],
                startPoint: .top,
                endPoint: .bottom
            )
        )
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(Color.white.opacity(0.07))
                .frame(width: 1)
        }
    }

    private var brand: some View {
        HStack(spacing: 11) {
            iTuBrandMark(size: 34)
            Text("iTu")
                .font(.system(size: 21, weight: .bold, design: .rounded))
                .foregroundStyle(Color.white)
            Spacer()
        }
        .padding(.horizontal, 16)
        .padding(.top, 28)
        .padding(.bottom, 15)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 1)
        }
    }

    private var footer: some View {
        VStack(spacing: 10) {
            Button {
                Task { await model.synchronize(showErrors: true) }
            } label: {
                HStack(spacing: 10) {
                    Image(systemName: syncIcon)
                        .font(.system(size: 13, weight: .medium))
                    Text(syncTitle)
                        .font(.system(size: 13, weight: .medium))
                    Spacer()
                    if model.syncPhase == .syncing {
                        ProgressView()
                            .controlSize(.mini)
                            .tint(.white)
                    }
                }
                .foregroundStyle(Color.white.opacity(0.78))
                .padding(.horizontal, 10)
                .frame(height: 34)
            }
            .buttonStyle(.plain)
            .disabled(model.syncPhase == .syncing)

            if let user = model.user {
                HStack(spacing: 10) {
                    // Avatar initial
                    ZStack {
                        Circle()
                            .fill(iTuTheme.teal)
                        Text(String(user.accountLabel.prefix(1)).uppercased())
                            .font(.system(size: 13, weight: .bold))
                            .foregroundStyle(.white)
                    }
                    .frame(width: 34, height: 34)

                    VStack(alignment: .leading, spacing: 4) {
                        // Name + level badge
                        HStack(spacing: 6) {
                            Text(user.accountLabel)
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(.white)
                                .lineLimit(1)
                            Spacer(minLength: 0)
                            if let level = model.growthLevel {
                                Text("Lv \(level)")
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .foregroundStyle(iTuTheme.mint)
                                    .padding(.horizontal, 5)
                                    .padding(.vertical, 2)
                                    .background(iTuTheme.mint.opacity(0.15))
                                    .clipShape(Capsule())
                            }
                        }

                        // XP progress bar
                        xpProgressBar
                    }
                }
                .padding(10)
                .background(Color.white.opacity(0.055))
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                }
                .contentShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                .onTapGesture {
                    if model.pendingCount > 0 || !model.conflicts.isEmpty {
                        navigateTo(.conflicts)
                    } else {
                        navigateTo(.growth)
                    }
                }
                .help("View Growth profile")
            }
        }
        .padding(12)
        .overlay(alignment: .top) {
            Rectangle()
                .fill(Color.white.opacity(0.08))
                .frame(height: 1)
        }
    }

    private func railGroup<Content: View>(
        _ title: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            iTuSectionLabel(title: title, color: Color.white.opacity(0.28))
                .padding(.horizontal, 11)
            content()
        }
    }

    private var syncTitle: String {
        switch model.syncPhase {
        case .offline: model.pendingCount == 0 ? "Offline mode" : "\(model.pendingCount) waiting to sync"
        case .pending: "\(model.pendingCount) pending"
        case .syncing: "Syncing..."
        case .upToDate: "Up to date"
        case .conflict: "Needs attention"
        }
    }

    private var syncIcon: String {
        switch model.syncPhase {
        case .offline: "icloud.slash"
        case .pending: "cloud"
        case .syncing: "arrow.triangle.2.circlepath"
        case .upToDate: "checkmark.icloud"
        case .conflict: "exclamationmark.triangle"
        }
    }

    private var syncColor: Color {
        switch model.syncPhase {
        case .offline: Color.white.opacity(0.52)
        case .pending: iTuTheme.amber
        case .syncing: iTuTheme.mint
        case .upToDate: iTuTheme.mint
        case .conflict: iTuTheme.coral
        }
    }

    @ViewBuilder
    private var xpProgressBar: some View {
        let currentXp = model.growthProgressXp ?? model.growthCurrentXp ?? 0
        let requiredXp = model.growthRequiredXp ?? model.growthNextLevelXp ?? 100
        let progress = requiredXp > 0 ? CGFloat(currentXp) / CGFloat(requiredXp) : 0

        VStack(alignment: .leading, spacing: 3) {
            // Track
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(Color.white.opacity(0.1))
                    Capsule()
                        .fill(
                            LinearGradient(
                                colors: [iTuTheme.mint, iTuTheme.teal],
                                startPoint: .leading,
                                endPoint: .trailing
                            )
                        )
                        .frame(width: max(4, geo.size.width * min(progress, 1)))
                }
            }
            .frame(height: 4)

            // XP label
            HStack(spacing: 0) {
                Text("\(currentXp)")
                    .foregroundStyle(Color.white.opacity(0.6))
                Text(" / \(requiredXp) XP")
                    .foregroundStyle(Color.white.opacity(0.35))
            }
            .font(.system(size: 9, weight: .medium, design: .monospaced))
        }
    }
}

private struct PrimaryRailButton: View {
    let title: String
    let systemImage: String
    var badge = 0
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: systemImage)
                    .font(.system(size: 14, weight: .medium))
                    .frame(width: 17)
                Text(title)
                    .font(.system(size: 14, weight: isSelected ? .semibold : .regular))
                Spacer()
                if badge > 0 {
                    Text("\(badge)")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Color.white.opacity(0.12))
                        .clipShape(Capsule())
                }
            }
            .foregroundStyle(Color.white.opacity(isSelected ? 0.95 : 0.64))
            .padding(.horizontal, 11)
            .frame(height: 40)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(PrimaryRailButtonStyle(isSelected: isSelected))
        .help(title)
        .accessibilityLabel(title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }
}

private struct PrimaryRailButtonStyle: ButtonStyle {
    let isSelected: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHovered = false

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background(
                isSelected
                    ? Color.white.opacity(0.1)
                    : Color.white.opacity(configuration.isPressed ? 0.1 : (isHovered ? 0.065 : 0))
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .animation(reduceMotion ? nil : .easeOut(duration: 0.08), value: isHovered)
            .onHover { hovering in
                isHovered = hovering
            }
            .pointingHandCursor()
    }
}

private struct PlanningRail: View {
    @Environment(AppModel.self) private var model
    @State private var showingNewList = false
    @State private var editingList: TaskListModel?

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 4) {
                iTuSectionLabel(title: "Planning", color: iTuTheme.teal)
                Text("Views")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 20)
            .padding(.top, 30)
            .padding(.bottom, 22)

            VStack(spacing: 4) {
                PlanningRailButton(section: .inbox, title: "All Tasks") { model.selectedTaskListId = nil }
                PlanningRailButton(section: .today) { model.selectedTaskListId = nil }
                PlanningRailButton(section: .upcoming) { model.selectedTaskListId = nil }
                PlanningRailButton(section: .completed) { model.selectedTaskListId = nil }
                PlanningRailButton(section: .trash) { model.selectedTaskListId = nil }
            }
            .padding(.horizontal, 12)

            Rectangle()
                .fill(iTuTheme.border)
                .frame(height: 1)
                .padding(.vertical, 20)

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    iTuSectionLabel(title: "Lists")
                    Spacer()
                    Button {
                        showingNewList = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.system(size: 11, weight: .bold))
                            .foregroundStyle(iTuTheme.teal)
                            .frame(width: 24, height: 24)
                            .background(iTuTheme.mintTint.opacity(0.7))
                            .clipShape(RoundedRectangle(cornerRadius: 7, style: .continuous))
                    }
                    .buttonStyle(.plain)
                    .pointingHandCursor()
                    .help("New list")
                }
                if model.taskLists.isEmpty {
                    Text("No task lists available.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                } else {
                    ForEach(model.taskLists) { list in
                        PlanningRailButton(
                            section: .inbox,
                            title: list.name,
                            icon: list.icon ?? "list.bullet",
                            taskListId: list.id
                        ) {
                            model.selectedTaskListId = list.id
                        }
                        .contextMenu {
                            Button("Edit List") {
                                editingList = list
                            }
                            if !list.isDefault {
                                Divider()
                                Button("Archive List", role: .destructive) {
                                    Task { await model.deleteTaskList(list) }
                                }
                            }
                        }
                    }
                }
            }
            .padding(.horizontal, 12)

            Spacer()
        }
        .frame(width: 228)
        .background(iTuTheme.surface.opacity(0.82))
        .overlay(alignment: .trailing) {
            Rectangle()
                .fill(iTuTheme.border)
                .frame(width: 1)
        }
        .sheet(isPresented: $showingNewList) {
            TaskListEditorSheet(list: nil)
        }
        .sheet(item: $editingList) { list in
            TaskListEditorSheet(list: list)
        }
    }
}

private struct TaskListEditorSheet: View {
    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    let list: TaskListModel?

    @State private var name: String
    @State private var description: String
    @State private var color: String

    init(list: TaskListModel?) {
        self.list = list
        _name = State(initialValue: list?.name ?? "")
        _description = State(initialValue: list?.description ?? "")
        _color = State(initialValue: list?.color ?? "TEAL")
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(list == nil ? "New List" : "Edit List")
                .font(.system(size: 20, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)

            VStack(alignment: .leading, spacing: 6) {
                Text("LIST NAME")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(iTuTheme.inkDim)
                TextField("e.g., Work Projects", text: $name)
                    .textFieldStyle(.roundedBorder)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("DESCRIPTION")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(iTuTheme.inkDim)
                TextField("Optional overview", text: $description)
                    .textFieldStyle(.roundedBorder)
            }

            Picker("Color", selection: $color) {
                Text("Teal").tag("TEAL")
                Text("Blue").tag("BLUE")
                Text("Purple").tag("PURPLE")
                Text("Amber").tag("AMBER")
            }

            HStack {
                Button("Cancel") { dismiss() }
                    .buttonStyle(.bordered)
                Spacer()
                Button(list == nil ? "Create List" : "Save Changes") {
                    let trimmedDescription = description.trimmingCharacters(in: .whitespacesAndNewlines)
                    Task {
                        if let list {
                            await model.updateTaskList(
                                list,
                                name: name,
                                description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                                color: color
                            )
                        } else {
                            await model.createTaskList(
                                name: name,
                                description: trimmedDescription.isEmpty ? nil : trimmedDescription,
                                color: color
                            )
                        }
                        dismiss()
                    }
                }
                .buttonStyle(iTuPrimaryButtonStyle(height: 34))
                .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding(24)
        .frame(width: 380)
        .background(iTuTheme.surface)
    }
}

private struct PlanningRailButton: View {
    @Environment(AppModel.self) private var model
    let section: AppSection
    var title: String?
    var icon: String?
    var showsCount = false
    var taskListId: String?
    var onSelect: () -> Void = {}

    @State private var isHovered = false

    var body: some View {
        let isSelected = if let taskListId {
            model.selectedTaskListId == taskListId
        } else {
            model.selectedSection == section && model.selectedTaskListId == nil
        }
        Button {
            if model.selectedSection != section {
                AppPerformanceSignposts.emitSelectionCommitted(sectionName: section.rawValue)
            }
            var transaction = Transaction()
            transaction.disablesAnimations = true
            withTransaction(transaction) {
                onSelect()
                model.selectedSection = section
            }
        } label: {
            HStack(spacing: 11) {
                Image(systemName: icon ?? section.systemImage)
                    .font(.system(size: icon == nil ? 13 : 7, weight: .medium))
                    .foregroundStyle(icon == nil ? iTuTheme.inkDim : iTuTheme.teal)
                    .frame(width: 16)
                Text(title ?? section.title)
                    .font(.system(size: 14, weight: isSelected ? .semibold : .regular))
                Spacer()
                if showsCount {
                    Text("\(model.tasks(for: .inbox).count)")
                        .font(.system(size: 11, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
            }
            .foregroundStyle(isSelected ? iTuTheme.teal : (isHovered ? iTuTheme.ink : iTuTheme.inkDim))
            .padding(.horizontal, 10)
            .frame(height: 39)
            .background(isSelected ? iTuTheme.mintTint : (isHovered ? iTuTheme.mintTint.opacity(0.5) : Color.clear))
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        }
        .buttonStyle(.plain)
        .onHover { hovering in
            isHovered = hovering
            if hovering {
                NSCursor.pointingHand.push()
            } else {
                NSCursor.pop()
            }
        }
    }
}

private extension AppSection {
    var isPlanningSection: Bool {
        [.today, .inbox, .upcoming, .completed].contains(self)
    }

    var isRetainedPlanningSection: Bool {
        [.today, .inbox, .completed].contains(self)
    }

    var isRetainedDestination: Bool {
        switch self {
        case .home, .today, .inbox, .completed, .matrix, .statistics, .focus, .habits:
            true
        default:
            false
        }
    }
}

// MARK: - Environment Keys

struct LayoutModeKey: EnvironmentKey {
    static let defaultValue: LayoutMode = .wide
}

struct ShowPlanRailBindingKey: EnvironmentKey {
    static let defaultValue: Binding<Bool> = .constant(false)
}

extension EnvironmentValues {
    var layoutMode: LayoutMode {
        get { self[LayoutModeKey.self] }
        set { self[LayoutModeKey.self] = newValue }
    }

    var showPlanRailBinding: Binding<Bool> {
        get { self[ShowPlanRailBindingKey.self] }
        set { self[ShowPlanRailBindingKey.self] = newValue }
    }
}
