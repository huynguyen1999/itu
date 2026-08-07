import SwiftUI

struct DeckIconDescriptor: Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let systemImage: String

    static let presets: [DeckIconDescriptor] = [
        DeckIconDescriptor(id: "INBOX", label: "Inbox", systemImage: "tray"),
        DeckIconDescriptor(id: "BOOK", label: "Book", systemImage: "book"),
        DeckIconDescriptor(id: "BRAIN", label: "Brain", systemImage: "brain.head.profile"),
        DeckIconDescriptor(id: "LANGUAGE", label: "Language", systemImage: "character.bubble"),
        DeckIconDescriptor(id: "FLASK", label: "Flask", systemImage: "beaker"),
        DeckIconDescriptor(id: "CODE", label: "Code", systemImage: "chevron.left.forwardslash.chevron.right"),
        DeckIconDescriptor(id: "LEAF", label: "Leaf", systemImage: "leaf"),
        DeckIconDescriptor(id: "CALCULATOR", label: "Calculator", systemImage: "plus.forwardslash.minus"),
        DeckIconDescriptor(id: "GLOBE", label: "Globe", systemImage: "globe")
    ]

    static func resolve(_ value: String?) -> DeckIconDescriptor {
        guard let value, !value.isEmpty else { return presets[1] } // Default BOOK
        if let found = presets.first(where: { $0.id == value.uppercased() }) {
            return found
        }
        return DeckIconDescriptor(id: value, label: value, systemImage: "book")
    }
}

struct DeckIconView: View {
    let icon: String?
    var size: CGFloat = 20
    var color: Color = iTuTheme.teal

    var body: some View {
        let descriptor = DeckIconDescriptor.resolve(icon)
        Image(systemName: descriptor.systemImage)
            .resizable()
            .scaledToFit()
            .frame(width: size, height: size)
            .foregroundStyle(color)
            .accessibilityLabel(descriptor.label)
    }
}
