import SwiftUI

struct LearnSettingsPopover: View {
    @Environment(AppModel.self) private var model

    init() {}

    public var body: some View {
        let settings = model.settingsStore

        VStack(alignment: .leading, spacing: 14) {
            HStack {
                Text("Learn Preferences")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)
                Spacer()
            }

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Review Order")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("", selection: Binding(
                    get: { settings.learnReviewOrder },
                    set: { settings.learnReviewOrder = $0 }
                )) {
                    Text("Due first → New").tag("DUE_FIRST")
                    Text("New first → Due").tag("NEW_FIRST")
                    Text("Mixed").tag("MIXED")
                }
                .pickerStyle(.menu)
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Daily Review Limits")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Text("Unlimited")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkFaint)
            }
        }
        .padding(16)
        .frame(width: 270)
    }
}
