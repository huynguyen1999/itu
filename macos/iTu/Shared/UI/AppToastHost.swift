import SwiftUI

struct AppToastHost: View {
    let notice: AppNotice
    let onDismiss: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: iconName)
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(iconColor)

            VStack(alignment: .leading, spacing: 2) {
                Text(notice.title)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(iTuTheme.ink)

                if let message = notice.message, !message.isEmpty {
                    Text(message)
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                        .lineLimit(2)
                }
            }

            Spacer(minLength: 8)

            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.system(size: 10, weight: .bold))
                    .foregroundStyle(iTuTheme.inkFaint)
                    .frame(width: 20, height: 20)
            }
            .buttonStyle(.plain)
            .pointingHandCursor()
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(maxWidth: 360)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
        .shadow(color: iTuTheme.forest.opacity(0.12), radius: 10, y: 4)
    }

    private var iconName: String {
        switch notice.level {
        case .info: "info.circle.fill"
        case .success: "checkmark.circle.fill"
        case .warning: "exclamationmark.triangle.fill"
        case .error: "xmark.circle.fill"
        }
    }

    private var iconColor: Color {
        switch notice.level {
        case .info: iTuTheme.teal
        case .success: iTuTheme.mint
        case .warning: iTuTheme.amber
        case .error: iTuTheme.coral
        }
    }
}
