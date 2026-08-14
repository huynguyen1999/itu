import SwiftUI

enum BudgetSupport {
    static func categorySymbol(_ icon: String?) -> String {
        let normalized = (icon ?? "other")
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_")
        let key: String
        switch normalized {
        case "utensils": key = "food"
        case "car": key = "transport"
        case "shoppingbag", "groceries", "grocery", "shopping_cart": key = "shopping"
        case "receipt": key = "bills"
        case "heart", "heart_pulse": key = "health"
        case "tv": key = "entertainment"
        case "folder": key = "other"
        case "transportation": key = "transport"
        case "graduation_cap": key = "education"
        case "plane": key = "travel"
        default: key = normalized
        }
        switch key {
        case "wallet": return "wallet.pass.fill"
        case "home": return "house.fill"
        case "food": return "fork.knife"
        case "coffee": return "cup.and.saucer.fill"
        case "shopping": return "bag.fill"
        case "transport": return "car.fill"
        case "bills": return "receipt.fill"
        case "health": return "heart.fill"
        case "fitness": return "dumbbell.fill"
        case "education": return "graduationcap.fill"
        case "entertainment": return "party.popper.fill"
        case "travel": return "airplane"
        case "work": return "briefcase.fill"
        case "gifts": return "gift.fill"
        case "other": return "ellipsis.circle.fill"
        default: return "wallet.pass.fill"
        }
    }

    static func categoryTint(_ color: String?) -> Color {
        switch color?.uppercased() {
        case "EMERALD", "MINT": return iTuTheme.mint
        case "FOREST": return iTuTheme.forest
        case "BLUE", "INDIGO": return iTuTheme.syncBlue
        case "VIOLET": return .purple
        case "AMBER": return iTuTheme.amber
        case "CORAL", "ROSE": return iTuTheme.coral
        case "SLATE": return iTuTheme.inkDim
        default: return iTuTheme.teal
        }
    }

    static func formatCurrency(_ value: Double, currency: String) -> String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .currency
        formatter.currencyCode = currency
        formatter.maximumFractionDigits = currency.uppercased() == "VND" ? 0 : 2
        return formatter.string(from: NSNumber(value: value)) ?? "\(currency) \(String(format: "%.2f", value))"
    }

    static var currentPeriod: String {
        let now = Date()
        return iTuCalendarSupport.monthString(now)
    }

    static func shiftPeriod(_ period: String, by delta: Int) -> String {
        let parts = period.split(separator: "-")
        guard parts.count == 2,
              let year = Int(parts[0]),
              let month = Int(parts[1]) else { return currentPeriod }
        let totalMonths = year * 12 + (month - 1) + delta
        let newYear = totalMonths / 12
        let newMonth = (totalMonths % 12) + 1
        return String(format: "%04d-%02d", newYear, newMonth)
    }
}

struct BudgetCategoryIconOption: Identifiable, Hashable {
    let key: String
    let symbol: String
    let label: String
    var id: String { key }
}

struct BudgetCategoryColorOption: Identifiable, Hashable {
    let key: String
    let label: String
    let color: Color
    var id: String { key }
}

let budgetCategoryIconOptions: [BudgetCategoryIconOption] = [
    BudgetCategoryIconOption(key: "wallet", symbol: "wallet.pass.fill", label: "Wallet"),
    BudgetCategoryIconOption(key: "shopping-cart", symbol: "bag.fill", label: "Shopping"),
    BudgetCategoryIconOption(key: "utensils", symbol: "fork.knife", label: "Food"),
    BudgetCategoryIconOption(key: "car", symbol: "car.fill", label: "Transport"),
    BudgetCategoryIconOption(key: "home", symbol: "house.fill", label: "Home"),
    BudgetCategoryIconOption(key: "plane", symbol: "airplane", label: "Travel"),
    BudgetCategoryIconOption(key: "heart-pulse", symbol: "heart.fill", label: "Health"),
    BudgetCategoryIconOption(key: "graduation-cap", symbol: "graduationcap.fill", label: "Education")
]

let budgetCategoryColorOptions: [BudgetCategoryColorOption] = [
    BudgetCategoryColorOption(key: "TEAL", label: "Teal", color: iTuTheme.teal),
    BudgetCategoryColorOption(key: "MINT", label: "Mint", color: iTuTheme.mint),
    BudgetCategoryColorOption(key: "FOREST", label: "Forest", color: iTuTheme.forest),
    BudgetCategoryColorOption(key: "AMBER", label: "Amber", color: iTuTheme.amber),
    BudgetCategoryColorOption(key: "CORAL", label: "Coral", color: iTuTheme.coral),
    BudgetCategoryColorOption(key: "VIOLET", label: "Violet", color: .purple),
    BudgetCategoryColorOption(key: "BLUE", label: "Blue", color: iTuTheme.syncBlue),
    BudgetCategoryColorOption(key: "SLATE", label: "Slate", color: iTuTheme.inkDim)
]
