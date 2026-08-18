import SwiftUI

public struct IOSMetricRow: View {
    @Environment(\.colorScheme) private var colorScheme
    public let icon: String
    public let label: String
    public let value: String
    public let trend: String?
    public let tint: Color?

    public init(
        icon: String,
        label: String,
        value: String,
        trend: String? = nil,
        tint: Color? = nil
    ) {
        self.icon = icon
        self.label = label
        self.value = value
        self.trend = trend
        self.tint = tint
    }

    public var body: some View {
        HStack(spacing: IOSSpacing.compact) {
            Image(systemName: icon)
                .font(IOSTypography.headline)
                .foregroundStyle(tint ?? IOSColor.teal(colorScheme))
                .frame(width: 32, height: 32)
                .background(
                    (tint ?? IOSColor.teal(colorScheme)).opacity(0.12),
                    in: RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
                )
            Text(label)
                .font(IOSTypography.subheadline)
                .foregroundStyle(IOSColor.ink(colorScheme))
            Spacer()
            Text(value)
                .font(IOSTypography.headline)
                .foregroundStyle(IOSColor.ink(colorScheme))
            if let trend {
                Text(trend)
                    .font(IOSTypography.caption)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
            }
        }
        .padding(.horizontal, IOSSpacing.normal)
        .padding(.vertical, IOSSpacing.compact)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.row, style: .continuous)
                .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
        }
    }
}
