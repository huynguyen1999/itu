import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.appUpdateRequiresUpdate, let policy = model.appUpdatePolicy {
                RequiredAppUpdateView(policy: policy) {
                    model.startAppUpdate()
                }
            } else if model.authenticationState == .restoring {
                VStack(spacing: 14) {
                    iTuBrandMark(size: 42)
                    ProgressView()
                        .controlSize(.small)
                        .tint(iTuTheme.teal)
                    Text("Loading your offline workspace…")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)

                    if let errorMessage = model.errorMessage {
                        Text(errorMessage)
                            .font(.system(size: 11))
                            .foregroundStyle(iTuTheme.coral)
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                            .padding(.top, 2)
                    }

                    Button {
                        Task {
                            await model.terminateSession(reason: "user proceeded to sign in")
                        }
                    } label: {
                        Text("Continue to Sign In")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(iTuTheme.teal)
                    }
                    .buttonStyle(.plain)
                    .padding(.top, 6)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(iTuTheme.canvas)
            } else if model.authenticationState == .unauthenticated {
                AuthView()
            } else {
                MainView()
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            if let policy = model.appUpdateOptionalPolicy {
                OptionalAppUpdateBanner(
                    policy: policy,
                    onUpdate: { model.startAppUpdate() },
                    onDismiss: { model.dismissOptionalAppUpdate() }
                )
                .padding(.horizontal, 18)
                .padding(.top, 10)
            }
        }
        .overlay(alignment: .topTrailing) {
            VStack(alignment: .trailing, spacing: 10) {
                if let notice = model.noticeQueue.first {
                    AppToastHost(notice: notice) {
                        model.dismissCurrentNotice()
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                    .task(id: notice.id) {
                        do {
                            try await Task.sleep(for: .seconds(4))
                            guard !Task.isCancelled, model.noticeQueue.first?.id == notice.id else { return }
                            model.dismissCurrentNotice()
                        } catch {
                            // Expected on dismissal/replacement
                        }
                    }
                }

                if let receipt = model.growthReceiptQueue.first {
                    GrowthReceiptOverlay(presented: receipt) {
                        model.dismissCurrentGrowthReceipt()
                    }
                    .transition(.move(edge: .trailing).combined(with: .opacity))
                    .task(id: receipt.id) {
                        do {
                            try await Task.sleep(for: .seconds(5))
                            guard !Task.isCancelled, model.growthReceiptQueue.first?.id == receipt.id else { return }
                            model.dismissCurrentGrowthReceipt()
                        } catch {
                            // Cancellation is expected when the receipt is manually dismissed or replaced.
                        }
                    }
                }
            }
            .padding(18)
        }
        .animation(.snappy, value: model.noticeQueue.first?.id)
        .animation(.snappy, value: model.growthReceiptQueue.first?.id)
    }
}
