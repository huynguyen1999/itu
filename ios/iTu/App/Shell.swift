import SwiftUI
import iTuDomain
import iTuNetworking
import iTuDesignCore

// MARK: - Preference key (shared across features via same module)

struct IOSNavigationDirtyPreferenceKey: PreferenceKey {
    static let defaultValue: Set<IOSDestination> = []
    static func reduce(value: inout Set<IOSDestination>, nextValue: () -> Set<IOSDestination>) {
        value.formUnion(nextValue())
    }
}

// MARK: - Root

struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        Group {
            if model.isRestoring {
                VStack(spacing: 12) {
                    Image(systemName: "leaf.fill")
                        .font(.title2)
                        .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
                    ProgressView("Restoring your account")
                }
            } else if model.isAuthenticated {
                IOSRootView()
            } else {
                LoginView()
            }
        }
        .tint(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
        .alert("iTu", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.clearError() } })) {
            Button("OK", role: .cancel) { model.clearError() }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}

// MARK: - iPhone Navigation Shell

struct IOSRootView: View {
    static let primaryDestinations: [IOSDestination] = [.home, .plan, .focus, .habits]
    static let secondaryDestinations: [IOSDestination] = [
        .calendar, .learn, .gym, .budget, .growth, .journal, .matrix,
        .statistics, .health, .notifications, .conflicts, .trash, .profile, .settings
    ]
    static let phoneDestinations: [IOSDestination] = primaryDestinations + secondaryDestinations + [.more]

    static func rootDestination(for destination: IOSDestination) -> IOSDestination {
        phoneDestinations.contains(destination) ? destination : .more
    }

    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var dirtyDestinations: Set<IOSDestination> = []
    @State private var pendingDestination: IOSDestination?
    @State private var showingNavigationChanges = false
    @State private var morePath: [IOSDestination] = []

    var body: some View {
        HStack(spacing: 0) {
            sidebar
            Divider()
            rootView(for: model.destination)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(iTuTheme.color(iTuDesignTokens.canvas, scheme: colorScheme))
        .ignoresSafeArea(.keyboard)
        .onPreferenceChange(IOSNavigationDirtyPreferenceKey.self) { dirtyDestinations = $0 }
        .task {
            await Task.yield()
            consumePendingNavigationRequest()
        }
        .onChange(of: model.navigationRequest) { _ in
            consumePendingNavigationRequest()
        }
        .confirmationDialog("Unsaved changes", isPresented: $showingNavigationChanges) {
            Button("Discard changes", role: .destructive) {
                guard let destination = pendingDestination else { return }
                pendingDestination = nil
                applyNavigation(to: destination)
            }
            Button("Cancel", role: .cancel) { pendingDestination = nil }
        } message: {
            Text("Discard your changes, or cancel and save before changing sections.")
        }
    }

    private var sidebar: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 8) {
                Image(systemName: "leaf.fill")
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
                    .frame(width: 40, height: 40)
                    .accessibilityHidden(true)

                ForEach(Self.primaryDestinations) { destination in
                    destinationButton(destination)
                }

                Divider()
                    .padding(.vertical, 4)

                ForEach(Self.secondaryDestinations) { destination in
                    destinationButton(destination)
                }

                Divider()
                    .padding(.vertical, 4)

                destinationButton(.more)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 12)
        }
        .frame(width: 64)
        .background(iTuTheme.color(iTuDesignTokens.surfaceMuted, scheme: colorScheme))
    }

    private func destinationButton(_ destination: IOSDestination) -> some View {
        Button { requestDestination(destination) } label: {
            Image(systemName: destination.systemImage)
                .font(.headline.weight(.semibold))
                .frame(width: 40, height: 40)
                .foregroundStyle(
                    model.destination == destination
                        ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme)
                        : iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme)
                )
                .background(
                    model.destination == destination
                        ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme).opacity(0.14)
                        : .clear,
                    in: RoundedRectangle(cornerRadius: 12, style: .continuous)
                )
        }
        .buttonStyle(.plain)
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(model.destination == destination ? .isSelected : [])
    }

    private func requestDestination(_ destination: IOSDestination) {
        let root = Self.rootDestination(for: destination)
        guard root != model.destination || destination != .more else { return }
        guard isCurrentRouteDirty else {
            applyNavigation(to: destination)
            return
        }
        pendingDestination = destination
        showingNavigationChanges = true
    }

    @ViewBuilder
    private func rootView(for destination: IOSDestination) -> some View {
        if destination == .more {
            NavigationStack(path: $morePath) {
                DestinationView(destination: destination)
                    .navigationDestination(for: IOSDestination.self) { secondaryDestination in
                        DestinationView(destination: secondaryDestination)
                    }
            }
        } else {
            NavigationStack {
                DestinationView(destination: destination)
            }
        }
    }

    private var isCurrentRouteDirty: Bool {
        if model.destination == .more {
            return dirtyDestinations.contains(morePath.last ?? .more)
        }
        return dirtyDestinations.contains(model.destination)
    }

    private func applyNavigation(to destination: IOSDestination) {
        let root = Self.rootDestination(for: destination)
        if root == .more {
            morePath = destination == .more ? [] : [destination]
        }
        model.destination = root
    }

    private func consumePendingNavigationRequest() {
        guard let request = model.navigationRequest else { return }
        model.consumeNavigationRequest(request)
        requestDestination(request.destination)
    }
}

// MARK: - Destination router

struct DestinationView: View {
    @EnvironmentObject private var model: AppModel
    let destination: IOSDestination

    var body: some View {
        switch destination {
        case .home:          HomeView()
        case .plan:          PlanView()
        case .focus:         FocusView()
        case .calendar:      CalendarView()
        case .habits:        HabitsView()
        case .more:          MoreView()
        case .learn:         Phase6LearnView()
        case .gym:           Phase6GymView()
        case .budget:        Phase6BudgetView()
        case .growth:        Phase6GrowthView()
        case .journal:       Phase6JournalView()
        case .matrix:        Phase6MatrixView()
        case .statistics:    Phase6StatisticsView(model: model)
        case .health:        HealthDashboardView(model: model)
        case .notifications: Phase6NotificationsView(model: model)
        case .conflicts:     Phase6ConflictsView(model: model)
        case .trash:         Phase6TrashView(model: model)
        case .profile:       Phase6ProfileView(model: model)
        case .settings:      Phase6SettingsView(model: model)
        }
    }
}

// MARK: - Sync banner (shared across feature views)

struct SyncBanner: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: icon)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(accent)
                .frame(width: 24, height: 24)
                .background(accent.opacity(0.12), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.syncPhase.title)
                    .font(.subheadline.weight(.semibold))
                    .accessibilityLabel("Sync status: \(model.syncPhase.title)")
                if model.pendingCount > 0 {
                    Text("\(model.pendingCount) pending change\(model.pendingCount == 1 ? "" : "s")")
                        .font(.caption)
                        .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                } else if let syncErrorMessage = model.syncErrorMessage {
                    Text(syncErrorMessage)
                        .font(.caption)
                        .foregroundStyle(iTuTheme.color(iTuDesignTokens.coral, scheme: colorScheme))
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            Spacer(minLength: 8)
            if model.syncErrorMessage != nil {
                Button("Retry") { Task { await model.retrySync() } }
                    .buttonStyle(.bordered)
                    .tint(accent)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .background(
            iTuTheme.color(iTuDesignTokens.surfaceMuted, scheme: colorScheme),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(iTuTheme.color(iTuDesignTokens.borderSoft, scheme: colorScheme), lineWidth: 1)
        }
        .foregroundStyle(accent)
        .accessibilityElement(children: .contain)
    }

    private var icon: String {
        switch model.syncPhase {
        case .offline:  "wifi.slash"
        case .pending:  "clock.arrow.circlepath"
        case .syncing:  "arrow.triangle.2.circlepath"
        case .upToDate: "checkmark.circle.fill"
        case .conflict: "exclamationmark.triangle.fill"
        case .error:    "exclamationmark.circle.fill"
        }
    }

    private var accent: Color {
        switch model.syncPhase {
        case .offline:           iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme)
        case .pending, .syncing: iTuTheme.color(iTuDesignTokens.syncBlue, scheme: colorScheme)
        case .upToDate:          iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme)
        case .conflict, .error:  iTuTheme.color(iTuDesignTokens.coral, scheme: colorScheme)
        }
    }
}

// MARK: - Shared utility views

struct IOSContentUnavailableView: View {
    let title: String
    let systemImage: String
    let description: String?

    init(_ title: String, systemImage: String, description: String? = nil) {
        self.title = title; self.systemImage = systemImage; self.description = description
    }

    var body: some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage).font(.largeTitle).foregroundStyle(.secondary).accessibilityHidden(true)
            Text(title).font(.headline)
            if let description {
                Text(description).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.center)
            }
        }
        .frame(maxWidth: .infinity).padding().accessibilityElement(children: .combine)
    }
}

// MARK: - API endpoint helper (Login + Settings)

enum IOSAPIEndpoint {
    static func save(_ value: String) throws {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(),
              (scheme == "https" || scheme == "http"),
              url.host != nil, url.user == nil, url.password == nil else {
            throw APIError(statusCode: 0, message: "Enter a valid HTTP(S) API endpoint URL.", code: nil)
        }
        try APIConfiguration.saveBaseURL(trimmed)
    }
}
