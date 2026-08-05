import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        Group {
            if model.isBootstrapping {
                VStack(spacing: 14) {
                    iTuBrandMark(size: 42)
                    ProgressView()
                        .controlSize(.small)
                        .tint(iTuTheme.teal)
                    Text("Loading your offline workspace…")
                        .font(.system(size: 12, weight: .medium))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(iTuTheme.canvas)
            } else if model.user == nil {
                AuthView()
            } else {
                MainView()
            }
        }
        .overlay(alignment: .topTrailing) {
            if let receipt = model.growthReceiptQueue.first {
                GrowthReceiptOverlay(presented: receipt) {
                    model.dismissCurrentGrowthReceipt()
                }
                .padding(18)
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
        .animation(.snappy, value: model.growthReceiptQueue.first?.id)
        .alert(
            "iTu",
            isPresented: Binding(
                get: { model.errorMessage != nil },
                set: { if !$0 { model.errorMessage = nil } }
            )
        ) {
            Button("OK") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "")
        }
    }
}
