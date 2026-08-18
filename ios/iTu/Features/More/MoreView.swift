import SwiftUI
import iTuDomain
import iTuDesignCore

public struct MoreView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var showingLogoutConfirmation = false

    public init() {}

    public var body: some View {
        List {
            Section {
                if let user = model.user {
                    HStack(spacing: IOSSpacing.compact) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.largeTitle)
                            .foregroundStyle(IOSColor.teal(colorScheme))
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.accountLabel)
                                .font(IOSTypography.headline)
                                .foregroundStyle(IOSColor.ink(colorScheme))
                            Text("Your iTu workspace")
                                .font(IOSTypography.caption)
                                .foregroundStyle(IOSColor.inkDim(colorScheme))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }

            Section("TRACKING & PRODUCTIVITY") {
                featureLink(.calendar)
                featureLink(.matrix)
                featureLink(.statistics)
                featureLink(.health)
            }

            Section("LEARNING & GROWTH") {
                featureLink(.journal)
                featureLink(.learn)
                featureLink(.gym)
                featureLink(.budget)
                featureLink(.growth)
            }

            Section("SYSTEM & SETTINGS") {
                featureLink(.notifications)
                featureLink(.conflicts).badge(model.conflicts.count)
                featureLink(.trash)
                featureLink(.profile)
                featureLink(.settings)
            }

            Section {
                Button(role: .destructive) {
                    showingLogoutConfirmation = true
                } label: {
                    Label("Log out", systemImage: "rectangle.portrait.and.arrow.right")
                        .foregroundStyle(IOSColor.coral(colorScheme))
                }
            }
        }
        .navigationTitle("More")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarLeading) {
                IOSSyncStatusIndicator()
            }
        }
        .confirmationDialog("Log out of iTu?", isPresented: $showingLogoutConfirmation) {
            Button("Log out", role: .destructive) {
                Task { await model.logout() }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Pending offline changes remain on this device until they are synced.")
        }
    }

    @ViewBuilder
    private func featureLink(_ destination: IOSDestination) -> some View {
        NavigationLink(value: destination) {
            Label {
                Text(destination.title)
                    .font(IOSTypography.body)
                    .foregroundStyle(IOSColor.ink(colorScheme))
            } icon: {
                Image(systemName: destination.systemImage)
                    .foregroundStyle(IOSColor.teal(colorScheme))
            }
        }
    }
}
