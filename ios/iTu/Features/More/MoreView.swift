import SwiftUI

struct MoreView: View {
    @EnvironmentObject private var model: AppModel
    @State private var showingLogoutConfirmation = false

    var body: some View {
        List {
            Section {
                if let user = model.user {
                    HStack(spacing: 12) {
                        Image(systemName: "person.crop.circle.fill")
                            .font(.title2)
                            .foregroundStyle(.tint)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.accountLabel).font(.headline)
                            Text("Your iTu workspace")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
            Section(IOSMoreSection.tracking.title) {
                featureLink(.calendar)
                featureLink(.matrix)
                featureLink(.statistics)
                featureLink(.health)
            }
            Section(IOSMoreSection.learningAndGrowth.title) {
                featureLink(.journal)
                featureLink(.learn)
                featureLink(.gym)
                featureLink(.budget)
                featureLink(.growth)
            }
            Section(IOSMoreSection.system.title) {
                featureLink(.notifications)
                featureLink(.conflicts).badge(model.conflicts.count)
                featureLink(.trash)
                featureLink(.profile)
                featureLink(.settings)
            }
            Section {
                Button("Log out", systemImage: "rectangle.portrait.and.arrow.right", role: .destructive) { showingLogoutConfirmation = true }
            }
        }
        .navigationTitle("More")
        .confirmationDialog("Log out of iTu?", isPresented: $showingLogoutConfirmation) {
            Button("Log out", role: .destructive) { Task { await model.logout() } }
            Button("Cancel", role: .cancel) {}
        } message: { Text("Pending offline changes remain on this device until they are synced.") }
    }

    @ViewBuilder
    private func featureLink(_ destination: IOSDestination) -> some View {
        NavigationLink(value: destination) {
            Label(destination.title, systemImage: destination.systemImage)
        }
    }
}
