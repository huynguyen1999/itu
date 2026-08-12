struct NavigationEntry: Identifiable, Equatable {
    let id: String
    let title: String
    let systemImage: String
    let destination: AppSection
}

struct NavigationGroup: Identifiable, Equatable {
    let id: String
    let title: String
    let entries: [NavigationEntry]
}

enum NavigationSchema {
    static let primaryGroups: [NavigationGroup] = [
        NavigationGroup(id: "productivity", title: "Productivity", entries: [
            NavigationEntry(id: "home", title: "Home", systemImage: "house", destination: .home),
            NavigationEntry(id: "plan", title: "Plan", systemImage: "checkmark.square", destination: .inbox),
            NavigationEntry(id: "matrix", title: "Matrix", systemImage: "square.grid.2x2", destination: .matrix),
            NavigationEntry(id: "focus", title: "Focus", systemImage: "scope", destination: .focus),
            NavigationEntry(id: "calendar", title: "Calendar", systemImage: "calendar", destination: .calendar)
        ]),
        NavigationGroup(id: "tracking", title: "Tracking", entries: [
            NavigationEntry(id: "habits", title: "Habits", systemImage: "repeat", destination: .habits),
            NavigationEntry(id: "statistics", title: "Statistics", systemImage: "chart.bar", destination: .statistics),
            NavigationEntry(id: "budget", title: "Budget", systemImage: "creditcard", destination: .budget),
            NavigationEntry(id: "gym", title: "Gym", systemImage: "dumbbell", destination: .gym)
        ]),
        NavigationGroup(id: "knowledge", title: "Knowledge", entries: [
            NavigationEntry(id: "journal", title: "Journal", systemImage: "book.closed", destination: .journal),
            NavigationEntry(id: "learn", title: "Learn", systemImage: "book.closed", destination: .learn),
            NavigationEntry(id: "growth", title: "Growth", systemImage: "sparkles", destination: .growth)
        ]),
        NavigationGroup(id: "system", title: "System", entries: [
            NavigationEntry(id: "conflicts", title: "Conflicts", systemImage: "arrow.triangle.2.circlepath", destination: .conflicts),
            NavigationEntry(id: "notifications", title: "Notifications", systemImage: "bell", destination: .notifications),
            NavigationEntry(id: "trash", title: "Trash", systemImage: "trash", destination: .trash),
            NavigationEntry(id: "profile", title: "Profile", systemImage: "person.crop.circle", destination: .profile),
            NavigationEntry(id: "settings", title: "Settings", systemImage: "gearshape", destination: .settings)
        ])
    ]
}
