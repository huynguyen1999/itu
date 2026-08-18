import SwiftUI
import iTuDomain

public struct IOSSyncIssueBanner: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme

    public init() {}

    public var body: some View {
        if model.syncPhase == .error || model.syncPhase == .conflict {
            HStack(alignment: .top, spacing: IOSSpacing.compact) {
                Image(systemName: model.syncPhase == .conflict ? "exclamationmark.triangle.fill" : "exclamationmark.circle.fill")
                    .font(IOSTypography.headline)
                    .foregroundStyle(IOSColor.coral(colorScheme))

                VStack(alignment: .leading, spacing: 2) {
                    Text(model.syncPhase == .conflict ? "Sync Conflict" : "Sync Failed")
                        .font(IOSTypography.subheadline)
                        .fontWeight(.semibold)
                        .foregroundStyle(IOSColor.ink(colorScheme))

                    if let message = model.syncErrorMessage {
                        Text(message)
                            .font(IOSTypography.caption)
                            .foregroundStyle(IOSColor.inkDim(colorScheme))
                    }
                }

                Spacer()

                if model.syncPhase == .conflict {
                    Button("Resolve") {
                        model.requestNavigation(to: .conflicts)
                    }
                    .font(IOSTypography.captionBold)
                    .buttonStyle(.borderedProminent)
                    .tint(IOSColor.coral(colorScheme))
                } else {
                    Button("Retry") {
                        Task { await model.retrySync() }
                    }
                    .font(IOSTypography.captionBold)
                    .buttonStyle(.bordered)
                    .tint(IOSColor.coral(colorScheme))
                }
            }
            .padding(IOSSpacing.compact)
            .background(
                IOSColor.coralTint(colorScheme).opacity(0.4),
                in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                    .stroke(IOSColor.coral(colorScheme).opacity(0.3), lineWidth: 1)
            }
        }
    }
}
