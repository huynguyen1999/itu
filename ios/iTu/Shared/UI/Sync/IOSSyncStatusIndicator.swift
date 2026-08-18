import SwiftUI
import iTuDomain

public struct IOSSyncStatusIndicator: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        Group {
            switch model.syncPhase {
            case .upToDate:
                EmptyView()

            case .syncing:
                HStack(spacing: 4) {
                    ProgressView()
                        .scaleEffect(0.7)
                    Text("Syncing")
                        .font(IOSTypography.kicker)
                        .foregroundStyle(IOSColor.syncBlue(colorScheme))
                }
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(IOSColor.syncBlue(colorScheme).opacity(0.12), in: Capsule())

            case .pending:
                if model.pendingCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "clock.arrow.circlepath")
                            .font(.caption2)
                        Text("\(model.pendingCount)")
                            .font(IOSTypography.kicker)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .foregroundStyle(IOSColor.syncBlue(colorScheme))
                    .background(IOSColor.syncBlue(colorScheme).opacity(0.12), in: Capsule())
                }

            case .offline:
                if model.pendingCount > 0 {
                    HStack(spacing: 4) {
                        Image(systemName: "wifi.slash")
                            .font(.caption2)
                        Text("\(model.pendingCount) waiting")
                            .font(IOSTypography.kicker)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .foregroundStyle(IOSColor.amber(colorScheme))
                    .background(IOSColor.amber(colorScheme).opacity(0.14), in: Capsule())
                } else {
                    Image(systemName: "wifi.slash")
                        .font(.caption)
                        .foregroundStyle(IOSColor.inkFaint(colorScheme))
                }

            case .conflict, .error:
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(IOSColor.coral(colorScheme))
            }
        }
    }
}
