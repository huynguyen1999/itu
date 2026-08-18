import SwiftUI
import UIKit
import iTuDomain
import iTuDesignCore

public struct IOSNavigationRail: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    public let onRequestDestination: (IOSDestination) -> Void

    public init(onRequestDestination: @escaping (IOSDestination) -> Void) {
        self.onRequestDestination = onRequestDestination
    }

    public var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(spacing: 6) {
                // Botanical logo mark
                Image(systemName: "leaf.fill")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(IOSColor.teal(colorScheme))
                    .frame(width: IOSMetrics.railItemSize, height: IOSMetrics.railItemSize)
                    .accessibilityHidden(true)
                    .padding(.bottom, 2)

                // Primary destinations
                ForEach(IOSRootView.primaryDestinations) { destination in
                    railItem(destination)
                }

                // Divider separating primary from secondary
                Rectangle()
                    .fill(IOSColor.border(colorScheme))
                    .frame(width: 28, height: 1)
                    .padding(.vertical, 4)

                // Secondary destinations
                ForEach(IOSRootView.secondaryDestinations) { destination in
                    railItem(destination)
                }

                // Divider before More
                Rectangle()
                    .fill(IOSColor.border(colorScheme))
                    .frame(width: 28, height: 1)
                    .padding(.vertical, 4)

                // More & Directory
                railItem(.more)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 10)
        }
        .frame(width: IOSMetrics.railWidth)
        .background(IOSColor.surfaceMuted(colorScheme))
    }

    private func railItem(_ destination: IOSDestination) -> some View {
        let isSelected = model.destination == destination
        return Button {
            let generator = UIImpactFeedbackGenerator(style: .light)
            generator.impactOccurred()
            onRequestDestination(destination)
        } label: {
            ZStack(alignment: .leading) {
                // Background pill
                RoundedRectangle(cornerRadius: IOSCornerRadius.control, style: .continuous)
                    .fill(
                        isSelected
                            ? IOSColor.teal(colorScheme).opacity(0.16)
                            : Color.clear
                    )
                    .frame(width: 44, height: 44)

                // Leading active indicator bar
                if isSelected {
                    RoundedRectangle(cornerRadius: 2, style: .continuous)
                        .fill(IOSColor.teal(colorScheme))
                        .frame(width: 3, height: 22)
                        .padding(.leading, 2)
                }

                // Icon
                Image(systemName: iconName(for: destination, isSelected: isSelected))
                    .font(.system(size: 17, weight: isSelected ? .semibold : .medium))
                    .foregroundStyle(
                        isSelected
                            ? IOSColor.teal(colorScheme)
                            : IOSColor.inkDim(colorScheme)
                    )
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(destination.title)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .help(destination.title)
    }

    private func iconName(for destination: IOSDestination, isSelected: Bool) -> String {
        switch destination {
        case .home:          return isSelected ? "house.fill" : "house"
        case .plan:          return isSelected ? "checklist.checked" : "checklist"
        case .focus:         return isSelected ? "timer.circle.fill" : "timer"
        case .habits:        return isSelected ? "repeat.circle.fill" : "repeat"
        case .calendar:      return isSelected ? "calendar.badge.clock" : "calendar"
        case .learn:         return isSelected ? "graduationcap.fill" : "graduationcap"
        case .gym:           return isSelected ? "dumbbell.fill" : "dumbbell"
        case .budget:        return isSelected ? "creditcard.fill" : "creditcard"
        case .growth:        return isSelected ? "sparkles" : "sparkles"
        case .journal:       return isSelected ? "book.closed.fill" : "book.closed"
        case .matrix:        return isSelected ? "square.grid.2x2.fill" : "square.grid.2x2"
        case .statistics:    return isSelected ? "chart.bar.fill" : "chart.bar"
        case .health:        return isSelected ? "heart.fill" : "heart"
        case .notifications: return isSelected ? "bell.fill" : "bell"
        case .conflicts:     return "arrow.triangle.2.circlepath"
        case .trash:         return isSelected ? "trash.fill" : "trash"
        case .profile:       return isSelected ? "person.crop.circle.fill" : "person.crop.circle"
        case .settings:      return isSelected ? "gearshape.fill" : "gearshape"
        case .more:          return isSelected ? "ellipsis.circle.fill" : "ellipsis.circle"
        }
    }
}
