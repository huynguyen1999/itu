import SwiftUI

struct BudgetSettingsPopoverView: View {
    @Environment(AppModel.self) private var model

    private let currencies = ["VND", "USD", "EUR", "GBP", "JPY", "SGD", "AUD", "CAD"]

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Budget Preferences")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            Divider()

            VStack(alignment: .leading, spacing: 6) {
                Text("Default Currency")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                Picker("Currency", selection: Binding(
                    get: { model.budgetPreferences.defaultCurrency },
                    set: { newCurrency in
                        Task {
                            _ = await model.updateBudgetPreferences(patch: [
                                "defaultCurrency": .string(newCurrency)
                            ])
                        }
                    }
                )) {
                    ForEach(currencies, id: \.self) { curr in
                        Text(curr).tag(curr)
                    }
                }
                .pickerStyle(.menu)
                .labelsHidden()
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Warning Threshold")
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(iTuTheme.inkDim)

                HStack {
                    Text("\(model.budgetPreferences.budgetWarningThreshold)%")
                        .font(.system(size: 12, design: .monospaced))
                        .foregroundStyle(iTuTheme.ink)
                    Slider(
                        value: Binding(
                            get: { Double(model.budgetPreferences.budgetWarningThreshold) },
                            set: { newVal in
                                Task {
                                    _ = await model.updateBudgetPreferences(patch: [
                                        "budgetWarningThreshold": .number(Double(Int(newVal)))
                                    ])
                                }
                            }
                        ),
                        in: 50...100,
                        step: 5
                    )
                }
            }

            Toggle("Budget alerts enabled", isOn: Binding(
                get: { model.budgetPreferences.budgetAlertsEnabled },
                set: { enabled in
                    Task {
                        _ = await model.updateBudgetPreferences(patch: [
                            "budgetAlertsEnabled": .bool(enabled)
                        ])
                    }
                }
            ))
            .font(.system(size: 12))
        }
        .padding(16)
        .frame(width: 250)
    }
}
