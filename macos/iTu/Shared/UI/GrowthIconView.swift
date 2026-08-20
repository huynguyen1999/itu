import AppKit
import CryptoKit
import SwiftUI
import iTuDesignCore
import iTuNetworking

typealias GrowthIconDescriptor = iTuDesignCore.GrowthIconDescriptor

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
