import AppKit
import CryptoKit
import SwiftUI

struct GrowthIconDescriptor: Identifiable, Hashable, Sendable {
    let id: String
    let label: String
    let systemImage: String
    var isTextGlyph: Bool = false

    static let presets: [GrowthIconDescriptor] = {
        let entries: [(String, String, String)] = [
            ("SPARKLES", "Sparkles", "sparkles"), ("ACTIVITY", "Activity", "waveform.path.ecg"),
            ("ALARM_CLOCK", "Alarm Clock", "alarm"), ("APPLE", "Apple", "apple.logo"),
            ("ARCHIVE", "Archive", "archivebox"), ("ARROW_UP_RIGHT", "Uptrend", "arrow.up.right"),
            ("ATOM", "Science", "atom"), ("BADGE_CHECK", "Badge Check", "checkmark.seal"),
            ("BADGE_PLUS", "Badge Plus", "plus.circle"), ("BAR_CHART_3", "Bars", "chart.bar"),
            ("BATTERY_CHARGING", "Energy", "battery.100.bolt"), ("BED", "Rest", "bed.double"),
            ("BIKE", "Cycling", "bicycle"), ("BOOK", "Book", "book.closed"),
            ("BOOK_CHECK", "Study Check", "checkmark.rectangle.stack"), ("BOOK_OPEN", "Reading", "book"),
            ("BOOKMARK", "Bookmark", "bookmark"), ("BRAIN", "Brain", "brain.head.profile"),
            ("BRIEFCASE_BUSINESS", "Career", "briefcase"), ("BRUSH", "Brush", "paintbrush"),
            ("CALCULATOR", "Math", "plus.forwardslash.minus"), ("CALENDAR_CHECK", "Consistency", "calendar.badge.checkmark"),
            ("CAMERA", "Camera", "camera"), ("CHART_AREA", "Area Chart", "chart.xyaxis.line"),
            ("CHART_BAR", "Bar Chart", "chart.bar"), ("CHART_COLUMN", "Column Chart", "chart.bar.xaxis"),
            ("CHART_LINE", "Line Chart", "chart.xyaxis.line"), ("CHART_NO_AXES_COMBINED", "Growth Chart", "chart.line.uptrend.xyaxis"),
            ("CHECK_CIRCLE_2", "Completed", "checkmark.circle"), ("CHEF_HAT", "Cooking", "frying.pan"),
            ("CIRCLE_DOLLAR_SIGN", "Finance", "dollarsign.circle"), ("CLIPBOARD_CHECK", "Checklist", "checklist"),
            ("CLOCK", "Time", "clock"), ("CODE_2", "Code", "chevron.left.forwardslash.chevron.right"),
            ("COFFEE", "Coffee", "cup.and.saucer"), ("COMPASS", "Direction", "safari"),
            ("COOKING_POT", "Meal Prep", "cooktop"), ("CROSSHAIR", "Focus", "scope"),
            ("DUMBBELL", "Strength", "dumbbell"), ("EAR", "Listening", "ear"),
            ("EYE", "Awareness", "eye"), ("FEATHER", "Writing", "pencil.and.outline"),
            ("FLAME", "Momentum", "flame"), ("FLOWER_2", "Mindfulness", "camera.macro"),
            ("FOCUS", "Deep Work", "viewfinder"), ("FOOTPRINTS", "Steps", "figure.walk"),
            ("GEM", "Value", "diamond"), ("GIFT", "Reward", "gift"),
            ("GLOBE", "World", "globe"), ("GOAL", "Goal", "target"),
            ("GRADUATION_CAP", "Learning", "graduationcap"), ("HAMMER", "Making", "hammer"),
            ("HAND_HEART", "Care", "heart.circle"), ("HEADPHONES", "Audio", "headphones"),
            ("HEART_HANDSHAKE", "Relationships", "person.2"), ("HEART_PULSE", "Health", "heart.text.square"),
            ("HOUSE", "Home", "house"), ("IMAGE", "Visual", "photo"),
            ("LANDMARK", "Civics", "building.columns"), ("LANGUAGES", "Languages", "character.bubble"),
            ("LAPTOP", "Computer", "laptopcomputer"), ("LEAF", "Nature", "leaf"),
            ("LIBRARY", "Library", "books.vertical"), ("LIGHTBULB", "Ideas", "lightbulb"),
            ("LIST_CHECKS", "Tasks", "checklist"), ("MAP", "Map", "map"),
            ("MEDAL", "Medal", "medal"), ("MESSAGE_CIRCLE", "Communication", "message"),
            ("MIC", "Speaking", "mic"), ("MICROSCOPE", "Research", "microscope"),
            ("MOON", "Sleep", "moon"), ("MOUNTAIN", "Challenge", "mountain.2"),
            ("MUSIC", "Music", "music.note"), ("NOTEBOOK_PEN", "Notes", "note.text"),
            ("PALETTE", "Art", "paintpalette"), ("PEN_LINE", "Drafting", "pencil.line"),
            ("PENCIL", "Pencil", "pencil"), ("PLAY", "Practice", "play"),
            ("PUZZLE", "Problem Solving", "puzzlepiece"), ("ROCKET", "Launch", "paperplane"),
            ("ROUTE", "Route", "point.topleft.down.to.point.bottomright.curvepath"), ("RULER", "Precision", "ruler"),
            ("SCALE", "Balance", "scale.3d"), ("SCROLL", "Knowledge", "scroll"),
            ("SEARCH", "Discovery", "magnifyingglass"), ("SHIELD", "Resilience", "shield"),
            ("SMILE", "Mood", "face.smiling"), ("SPROUT", "Growth", "leaf"),
            ("STAR", "Skill", "star"), ("STRETCH_HORIZONTAL", "Flexibility", "arrow.left.and.right"),
            ("SUN", "Morning", "sun.max"), ("TARGET", "Target", "target"),
            ("TIMER", "Timer", "timer"), ("TROPHY", "Trophy", "trophy"),
            ("USERS", "People", "person.2"), ("UTENSILS", "Food", "fork.knife"),
            ("WALLET_CARDS", "Budget", "wallet.pass"), ("WAND_SPARKLES", "Magic", "wand.and.stars"),
            ("WAVES", "Calm", "water.waves"), ("WEIGHT", "Training", "figure.strengthtraining.traditional"),
            ("ZAP", "Energy Burst", "bolt")
        ]
        return entries.map { GrowthIconDescriptor(id: $0.0, label: $0.1, systemImage: $0.2) }
    }()

    private static let emojiMap: [String: (id: String, systemImage: String)] = [
        "🏃": ("BIKE", "figure.run"),
        "🏃‍♂️": ("BIKE", "figure.run"),
        "🏃‍♀️": ("BIKE", "figure.run"),
        "⚡": ("ZAP", "bolt"),
        "🏠": ("HOUSE", "house"),
        "🎯": ("TARGET", "target"),
        "📚": ("LIBRARY", "books.vertical"),
        "🔥": ("FLAME", "flame"),
        "💡": ("LIGHTBULB", "lightbulb"),
        "💪": ("WEIGHT", "figure.strengthtraining.traditional"),
        "🧠": ("BRAIN", "brain.head.profile"),
        "❤️": ("HEART_PULSE", "heart.fill"),
        "⭐": ("STAR", "star"),
        "☕": ("COFFEE", "cup.and.saucer"),
        "🎨": ("PALETTE", "paintpalette"),
        "🎵": ("MUSIC", "music.note"),
        "📷": ("CAMERA", "camera"),
        "🏆": ("TROPHY", "trophy"),
        "💻": ("LAPTOP", "laptopcomputer"),
        "🌱": ("SPROUT", "leaf"),
        "⏰": ("ALARM_CLOCK", "alarm"),
        "📅": ("CALENDAR_CHECK", "calendar.badge.checkmark"),
        "📝": ("NOTEBOOK_PEN", "note.text"),
        "📌": ("BOOKMARK", "bookmark"),
        "🚀": ("ROCKET", "paperplane"),
        "🛡️": ("SHIELD", "shield"),
        "💰": ("CIRCLE_DOLLAR_SIGN", "dollarsign.circle"),
        "🎁": ("GIFT", "gift"),
        "🌍": ("GLOBE", "globe"),
        "🌙": ("MOON", "moon"),
        "☀️": ("SUN", "sun.max"),
        "🧘": ("FLOWER_2", "figure.mind.and.body"),
        "🍎": ("APPLE", "apple.logo")
    ]

    static func resolve(_ value: String?) -> GrowthIconDescriptor {
        guard let value, !value.isEmpty else { return fallback }
        if let preset = presets.first(where: { $0.id == value.uppercased() }) { return preset }
        if let mapped = emojiMap[value] {
            let label = value.replacingOccurrences(of: ".", with: " ").capitalized
            return GrowthIconDescriptor(id: mapped.id, label: label, systemImage: mapped.systemImage, isTextGlyph: false)
        }
        let label = value.replacingOccurrences(of: ".", with: " ").capitalized
        if supported(value) {
            return GrowthIconDescriptor(id: value, label: label, systemImage: value, isTextGlyph: false)
        }
        return GrowthIconDescriptor(id: value, label: label, systemImage: fallback.systemImage, isTextGlyph: true)
    }

    static let fallback = GrowthIconDescriptor(id: "SPARKLES", label: "Growth", systemImage: "sparkles")

    private static func supported(_ name: String) -> Bool {
        guard isPossibleSFSymbolName(name) else { return false }
        return NSImage(systemSymbolName: name, accessibilityDescription: nil) != nil
    }

    private static func isPossibleSFSymbolName(_ name: String) -> Bool {
        guard !name.isEmpty else { return false }
        return name.utf8.allSatisfy { byte in
            (byte >= 97 && byte <= 122) || (byte >= 48 && byte <= 57) || byte == 46 || byte == 45 || byte == 95
        }
    }
}

struct GrowthIconView: View {
    let icon: String?
    var size: CGFloat = 18
    var color: Color = iTuTheme.teal

    var body: some View {
        Group {
            if let icon, Self.isRemote(icon) {
                RemoteGrowthIconView(source: icon, size: size, fallbackColor: color)
            } else {
                let descriptor = GrowthIconDescriptor.resolve(icon)
                if descriptor.isTextGlyph, let icon, !icon.isEmpty {
                    Text(icon)
                        .font(.system(size: size * 0.85))
                        .lineLimit(1)
                } else {
                    Image(systemName: descriptor.systemImage)
                        .resizable()
                        .scaledToFit()
                        .accessibilityLabel(descriptor.label)
                }
            }
        }
        .frame(width: size, height: size)
        .foregroundStyle(color)
    }

    static func isRemote(_ value: String) -> Bool {
        value.hasPrefix("/media/") || value.hasPrefix("http://") || value.hasPrefix("https://")
    }
}

struct GrowthIconPicker: View {
    @Binding var selection: String
    @State private var search = ""

    private var options: [GrowthIconDescriptor] {
        guard !search.isEmpty else { return GrowthIconDescriptor.presets }
        return GrowthIconDescriptor.presets.filter {
            $0.label.localizedCaseInsensitiveContains(search) || $0.id.localizedCaseInsensitiveContains(search)
        }
    }

    var body: some View {
        VStack(spacing: 8) {
            TextField("Search icons", text: $search)
                .textFieldStyle(.roundedBorder)
            ScrollView {
                LazyVGrid(columns: [GridItem(.adaptive(minimum: 42))], spacing: 8) {
                    ForEach(options) { option in
                        Button {
                            selection = option.id
                        } label: {
                            GrowthIconView(icon: option.id, size: 18)
                                .frame(width: 34, height: 34)
                                .background(selection == option.id ? iTuTheme.teal.opacity(0.14) : .clear)
                                .clipShape(RoundedRectangle(cornerRadius: 8))
                        }
                        .buttonStyle(.plain)
                        .help(option.label)
                    }
                }
            }
        }
        .frame(minWidth: 260, idealWidth: 320, minHeight: 260, idealHeight: 360)
    }
}

private struct RemoteGrowthIconView: View {
    let source: String
    let size: CGFloat
    let fallbackColor: Color
    @State private var image: NSImage?

    var body: some View {
        Group {
            if let image {
                Image(nsImage: image).resizable().scaledToFill()
            } else {
                Image(systemName: GrowthIconDescriptor.fallback.systemImage)
                    .resizable().scaledToFit().foregroundStyle(fallbackColor)
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: max(4, size * 0.22)))
        .task(id: source) {
            guard let data = await GrowthIconDataStore.shared.data(for: source), !Task.isCancelled else { return }
            image = NSImage(data: data)
        }
        .accessibilityLabel("Uploaded growth icon")
    }
}

private actor GrowthIconDataStore {
    static let shared = GrowthIconDataStore()
    private var memory: [String: Data] = [:]
    private let session = APIClient.makeSession()

    func data(for source: String) async -> Data? {
        if let cached = memory[source] { return cached }
        let diskURL = cacheURL(for: source)
        if let cached = try? Data(contentsOf: diskURL) {
            memory[source] = cached
            return cached
        }
        guard let url = resolvedURL(for: source) else { return nil }
        var request = URLRequest(url: url)
        if let token = try? SessionCache.loadTokens().accessToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        guard let (data, response) = try? await session.data(for: request),
              (response as? HTTPURLResponse)?.statusCode == 200,
              NSImage(data: data) != nil else { return nil }
        memory[source] = data
        try? FileManager.default.createDirectory(at: diskURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: diskURL, options: .atomic)
        return data
    }

    private func resolvedURL(for source: String) -> URL? {
        if source.hasPrefix("/media/") { return URL(string: source, relativeTo: APIConfiguration.baseURL)?.absoluteURL }
        return URL(string: source)
    }

    private func cacheURL(for source: String) -> URL {
        let digest = SHA256.hash(data: Data(source.utf8)).map { String(format: "%02x", $0) }.joined()
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
            ?? FileManager.default.temporaryDirectory
        return base.appendingPathComponent("iTu/growth-icons/\(digest)", isDirectory: false)
    }
}
