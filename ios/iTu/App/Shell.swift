import SwiftUI
import iTuDomain
import iTuNetworking
import iTuDesignCore

// MARK: - Root View

public struct RootView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        Group {
            if model.isRestoring {
                VStack(spacing: IOSSpacing.compact) {
                    Image(systemName: "leaf.fill")
                        .font(.title2)
                        .foregroundStyle(IOSColor.teal(colorScheme))
                    ProgressView("Restoring your account")
                        .font(IOSTypography.subheadline)
                        .foregroundStyle(IOSColor.inkDim(colorScheme))
                }
            } else if model.isAuthenticated {
                IOSRootView()
            } else {
                LoginView()
            }
        }
        .tint(IOSColor.teal(colorScheme))
        .alert("iTu", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.clearError() } })) {
            Button("OK", role: .cancel) { model.clearError() }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}

// MARK: - iPhone Navigation Shell

public struct IOSRootView: View {
    public static let primaryDestinations: [IOSDestination] = [.home, .plan, .focus, .habits]
    public static let secondaryDestinations: [IOSDestination] = [
        .calendar, .learn, .gym, .budget, .growth, .journal, .matrix,
        .statistics, .health, .notifications, .conflicts, .trash, .profile, .settings
    ]
    public static let phoneDestinations: [IOSDestination] = primaryDestinations + secondaryDestinations + [.more]

    public static func rootDestination(for destination: IOSDestination) -> IOSDestination {
        phoneDestinations.contains(destination) ? destination : .more
    }

    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var morePath: [IOSDestination] = []
    @State private var stackIDs: [IOSDestination: UUID] = [:]

    public init() {}

    public var body: some View {
        HStack(spacing: 0) {
            IOSNavigationRail { destination in
                requestDestination(destination)
            }

            Rectangle()
                .fill(IOSColor.border(colorScheme))
                .frame(width: 1)

            rootView(for: model.destination)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .background(IOSColor.canvas(colorScheme))
        .ignoresSafeArea(.keyboard)
        .task {
            await Task.yield()
            consumePendingNavigationRequest()
        }
        .onChange(of: model.navigationRequest) { _ in
            consumePendingNavigationRequest()
        }
    }

    private func requestDestination(_ destination: IOSDestination) {
        applyNavigation(to: destination)
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
            .id(stackID(for: .more))
        } else {
            NavigationStack {
                DestinationView(destination: destination)
            }
            .id(stackID(for: destination))
        }
    }

    private func stackID(for destination: IOSDestination) -> UUID {
        if let existing = stackIDs[destination] {
            return existing
        }
        let id = UUID()
        DispatchQueue.main.async {
            if stackIDs[destination] == nil {
                stackIDs[destination] = id
            }
        }
        return id
    }

    private func applyNavigation(to destination: IOSDestination) {
        let root = Self.rootDestination(for: destination)
        if root == .more {
            morePath = destination == .more ? [] : [destination]
        }
        if root == model.destination {
            // Tapping the active tab in the sidebar pops back to its root
            stackIDs[root] = UUID()
            if root == .more && destination == .more {
                morePath = []
            }
        } else {
            model.destination = root
        }
    }

    private func consumePendingNavigationRequest() {
        guard let request = model.navigationRequest else { return }
        model.consumeNavigationRequest(request)
        requestDestination(request.destination)
    }
}

// MARK: - Compatibility Aliases

public typealias IOSContentUnavailableView = IOSEmptyStateView

public struct IOSEmptyStateView: View {
    let title: String
    let systemImage: String
    let description: String?

    public init(_ title: String, systemImage: String, description: String? = nil) {
        self.title = title
        self.systemImage = systemImage
        self.description = description
    }

    public var body: some View {
        IOSEmptyState(icon: systemImage, title: title, description: description ?? "")
    }
}

// MARK: - API Endpoint Helper

public enum IOSAPIEndpoint {
    public static func save(_ value: String) throws {
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
