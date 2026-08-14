import SwiftUI

struct DailyStreakRingView: View {
    let value: String
    let label: String
    var isRevision: Bool = false

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .stroke(iTuTheme.border.opacity(0.4), lineWidth: 2)
                    .frame(width: 48, height: 48)
                Circle()
                    .stroke(iTuTheme.border.opacity(0.4), lineWidth: 2)
                    .frame(width: 36, height: 36)
                Circle()
                    .stroke(iTuTheme.teal.opacity(0.4), lineWidth: 2)
                    .frame(width: 24, height: 24)
                Circle()
                    .trim(from: 0, to: isRevision ? 0.7 : 0.82)
                    .stroke(iTuTheme.mint, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .frame(width: 48, height: 48)
                    .rotationEffect(.degrees(-90))
            }
            .frame(width: 50, height: 50)

            VStack(alignment: .trailing, spacing: 2) {
                Text(value)
                    .font(.system(size: 24, weight: .medium, design: .serif))
                    .foregroundStyle(iTuTheme.mint)
                Text(label.uppercased())
                    .font(.system(size: 9.5, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkFaint)
            }
        }
    }
}


