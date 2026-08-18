import SwiftUI

public struct IOSFilterBar<Item: Identifiable & Equatable>: View {
    @Environment(\.colorScheme) private var colorScheme
    public let items: [Item]
    public let title: (Item) -> String
    public let icon: ((Item) -> String?)?
    @Binding public var selection: Item

    public init(
        items: [Item],
        title: @escaping (Item) -> String,
        icon: ((Item) -> String?)? = nil,
        selection: Binding<Item>
    ) {
        self.items = items
        self.title = title
        self.icon = icon
        self._selection = selection
    }

    public var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: IOSSpacing.tight) {
                ForEach(items) { item in
                    let isSelected = selection == item
                    Button {
                        selection = item
                    } label: {
                        HStack(spacing: 5) {
                            if let iconName = icon?(item) {
                                Image(systemName: iconName)
                                    .font(IOSTypography.captionBold)
                            }
                            Text(title(item))
                                .font(IOSTypography.captionBold)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .foregroundStyle(
                            isSelected
                                ? .white
                                : IOSColor.ink(colorScheme)
                        )
                        .background(
                            isSelected
                                ? IOSColor.teal(colorScheme)
                                : IOSColor.surface(colorScheme),
                            in: Capsule()
                        )
                        .overlay {
                            if !isSelected {
                                Capsule()
                                    .stroke(IOSColor.border(colorScheme), lineWidth: 1)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                    .accessibilityAddTraits(isSelected ? .isSelected : [])
                }
            }
            .padding(.horizontal, IOSSpacing.normal)
            .padding(.vertical, IOSSpacing.micro)
        }
    }
}
