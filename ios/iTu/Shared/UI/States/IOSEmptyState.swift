import SwiftUI

public struct IOSEmptyState<ActionView: View>: View {
    @Environment(\.colorScheme) private var colorScheme
    public let icon: String
    public let title: String
    public let description: String
    public let action: ActionView

    public init(
        icon: String = "leaf",
        title: String,
        description: String,
        @ViewBuilder action: () -> ActionView = { EmptyView() }
    ) {
        self.icon = icon
        self.title = title
        self.description = description
        self.action = action()
    }

    public var body: some View {
        VStack(spacing: IOSSpacing.normal) {
            Image(systemName: icon)
                .font(.system(size: 40, weight: .light))
                .foregroundStyle(IOSColor.teal(colorScheme))
                .frame(width: 64, height: 64)
                .background(
                    IOSColor.mintTint(colorScheme),
                    in: Circle()
                )

            VStack(spacing: IOSSpacing.micro) {
                Text(title)
                    .font(IOSTypography.headline)
                    .foregroundStyle(IOSColor.ink(colorScheme))
                    .multilineTextAlignment(.center)

                Text(description)
                    .font(IOSTypography.subheadline)
                    .foregroundStyle(IOSColor.inkDim(colorScheme))
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, IOSSpacing.normal)
            }

            action
                .padding(.top, IOSSpacing.tight)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, IOSSpacing.major)
        .padding(.horizontal, IOSSpacing.normal)
        .background(
            IOSColor.surface(colorScheme),
            in: RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: IOSCornerRadius.card, style: .continuous)
                .stroke(IOSColor.borderSoft(colorScheme), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
    }
}
