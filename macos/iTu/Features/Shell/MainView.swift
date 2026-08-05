import SwiftUI

struct MainView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        ZStack {
            HStack(spacing: 0) {
                PrimaryRail()

                if model.selectedSection.isPlanningSection {
                    PlanningRail()
                }

                detail
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .background(iTuTheme.canvas)

            if let overlay = model.presentedOverlay {
                AppOverlayHost(overlay: overlay)
                    .transition(.opacity.combined(with: .scale(scale: 0.98)))
                    .zIndex(100)
            }
        }
        .background(iTuTheme.canvas)
        .ignoresSafeArea()
        .animation(.snappy, value: model.presentedOverlay)
        .preferredColorScheme(preferredColorScheme)
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
        switch model.selectedSection {
        case .home:
            HomeOverviewView()
        case .today, .inbox, .completed:
            PlanningView(section: model.selectedSection)
        case .upcoming:
            UpcomingView()
        case .matrix:
            EisenhowerMatrixView()
        case .focus:
            FocusView()
        case .habits:
            HabitsView()
        case .statistics:
            StatisticsView()
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
        }
    }
}

private struct PrimaryRail: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        VStack(spacing: 0) {
            brand

            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    railGroup("Productivity") {
                        PrimaryRailButton(
                            title: "Home",
                            systemImage: "house",
                            isSelected: model.selectedSection == .home
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .home
                        }
                        PrimaryRailButton(
                            title: "Plan",
                            systemImage: "checkmark.square",
                            isSelected: model.selectedSection.isPlanningSection
                        ) {
                            model.selectedTaskListId = nil
                            if !model.selectedSection.isPlanningSection {
                                model.selectedSection = .inbox
                            }
                        }
                        PrimaryRailButton(
                            title: "Matrix",
                            systemImage: "square.grid.2x2",
                            isSelected: model.selectedSection == .matrix
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .matrix
                        }
                        PrimaryRailButton(
                            title: "Focus",
                            systemImage: "scope",
                            isSelected: model.selectedSection == .focus
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .focus
                        }
                        PrimaryRailButton(
                            title: "Habits",
                            systemImage: "repeat",
                            isSelected: model.selectedSection == .habits
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .habits
                        }
                    }

                    railGroup("Learning & Growth") {
                        PrimaryRailButton(
                            title: "Learn",
                            systemImage: "book.closed",
                            isSelected: model.selectedSection == .learn
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .learn
                        }
                        PrimaryRailButton(
                            title: "Growth",
                            systemImage: "sparkles",
                            isSelected: model.selectedSection == .growth
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .growth
                        }
                        PrimaryRailButton(
                            title: "Statistics",
                            systemImage: "chart.bar",
                            isSelected: model.selectedSection == .statistics
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .statistics
                        }
                    }

                    railGroup("System") {
                        PrimaryRailButton(
                            title: "Conflicts",
                            systemImage: "arrow.triangle.2.circlepath",
                            badge: model.conflicts.count,
                            isSelected: model.selectedSection == .conflicts
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .conflicts
                        }
                        PrimaryRailButton(
                            title: "Notifications",
                            systemImage: "bell",
                            badge: model.notifications.filter { $0.readAt == nil }.count,
                            isSelected: model.selectedSection == .notifications
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .notifications
                        }
                        PrimaryRailButton(
                            title: "Trash",
                            systemImage: "trash",
                            isSelected: model.selectedSection == .trash
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .trash
                        }
                        PrimaryRailButton(
                            title: "Profile",
                            systemImage: "person.crop.circle",
                            isSelected: model.selectedSection == .profile
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .profile
                        }
                        PrimaryRailButton(
                            title: "Settings",
                            systemImage: "gearshape",
                            isSelected: model.selectedSection == .settings
                        ) {
                            model.selectedTaskListId = nil
                            model.selectedSection = .settings
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
                    Text(String(user.accountLabel.prefix(1)).uppercased())
                        .font(.system(size: 13, weight: .bold))
                        .foregroundStyle(.white)
                        .frame(width: 36, height: 36)
                        .background(iTuTheme.teal)
                        .clipShape(Circle())

                    VStack(alignment: .leading, spacing: 2) {
                        Text(user.accountLabel)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(.white)
                            .lineLimit(1)
                        HStack(spacing: 4) {
                            Image(systemName: syncIcon)
                                .font(.system(size: 9, weight: .medium))
                            Text(syncTitle)
                                .font(.system(size: 10, design: .monospaced))
                        }
                        .foregroundStyle(syncColor)
                    }
                    Spacer(minLength: 0)
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
                        model.selectedSection = .conflicts
                    }
                }
                .help(model.pendingCount > 0 || !model.conflicts.isEmpty ? "Open sync recovery" : "Sync status")
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
                    : Color.white.opacity(isHovered ? 0.065 : 0)
            )
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .offset(y: configuration.isPressed && !reduceMotion ? 1 : 0)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: configuration.isPressed)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.12), value: isHovered)
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
            onSelect()
            model.selectedSection = section
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
        [.today, .inbox, .upcoming, .completed, .trash].contains(self)
    }
}
