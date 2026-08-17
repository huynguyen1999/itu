import AVFoundation
import Combine
import Foundation
import iTuDomain
import iTuNetworking

@MainActor
final class IOSFocusAudioPlayer: ObservableObject {
    static let shared = IOSFocusAudioPlayer()
    static let builtInCatalog = FocusSoundCatalog(
        sounds: [
            FocusSound(id: "builtin:rain", name: "Rain", originalName: "Rain", url: "/audio/focus/rain.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Nature", source: "BUILTIN", defaultVolume: 0.42),
            FocusSound(id: "builtin:forest", name: "Forest", originalName: "Forest", url: "/audio/focus/forest.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Nature", source: "BUILTIN", defaultVolume: 0.42),
            FocusSound(id: "builtin:cafe", name: "Café", originalName: "Café", url: "/audio/focus/cafe.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Atmosphere", source: "BUILTIN", defaultVolume: 0.32),
            FocusSound(id: "builtin:brown-noise", name: "Brown noise", originalName: "Brown noise", url: "/audio/focus/brown-noise.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Noise", source: "BUILTIN", defaultVolume: 0.35)
        ],
        preferences: []
    )

    @Published private(set) var sounds: [FocusSound] = []
    @Published private(set) var selectedSound: FocusSound?
    @Published private(set) var isPlaying = false
    @Published private(set) var isLoading = false
    @Published var volume: Float = 0.42 {
        didSet { player?.volume = volume }
    }
    @Published var errorMessage: String?

    private var player: AVAudioPlayer?
    private var loadedSoundID: String?

    func configure(catalog: FocusSoundCatalog) {
        let preferences = Dictionary(uniqueKeysWithValues: catalog.preferences.map { ($0.soundKey, $0) })
        sounds = catalog.sounds.enumerated()
            .filter { preferences[$0.element.id]?.enabled != false }
            .sorted {
                let lhs = preferences[$0.element.id]?.sortOrder ?? $0.offset
                let rhs = preferences[$1.element.id]?.sortOrder ?? $1.offset
                return lhs == rhs
                    ? $0.element.name.localizedCaseInsensitiveCompare($1.element.name) == .orderedAscending
                    : lhs < rhs
            }
            .map(\.element)
        selectedSound = sounds.first(where: { $0.id == selectedSound?.id }) ?? sounds.first
        if let selectedSound {
            volume = Float(preferences[selectedSound.id].map { $0.volume / 100 } ?? selectedSound.defaultVolume)
        }
        errorMessage = sounds.isEmpty ? "No focus sounds are available." : nil
    }

    func select(_ sound: FocusSound) {
        guard selectedSound?.id != sound.id else { return }
        stop()
        player = nil
        loadedSoundID = nil
        selectedSound = sound
        volume = Float(sound.defaultVolume)
        errorMessage = nil
    }

    func toggle(using apiClient: APIClient) async {
        guard let sound = selectedSound else { return }
        if loadedSoundID == sound.id, let player {
            if player.isPlaying {
                player.pause()
                isPlaying = false
            } else {
                player.play()
                isPlaying = player.isPlaying
            }
            return
        }

        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try AVAudioSession.sharedInstance().setActive(true)
            let data = try await apiClient.downloadFocusSound(path: sound.url)
            let player = try AVAudioPlayer(data: data)
            player.numberOfLoops = -1
            player.volume = volume
            guard player.prepareToPlay(), player.play() else {
                throw NSError(domain: "iTuFocusAudio", code: 1, userInfo: [NSLocalizedDescriptionKey: "The selected sound could not be played."])
            }
            self.player = player
            loadedSoundID = sound.id
            isPlaying = true
        } catch {
            stop()
            errorMessage = "Could not play \(sound.name): \(error.localizedDescription)"
        }
    }

    func stop() {
        player?.stop()
        player?.currentTime = 0
        isPlaying = false
    }

    func waveformHeights(count: Int = 32) -> [CGFloat] {
        let name = selectedSound?.name ?? "focus"
        var hash: UInt64 = 5381
        for byte in name.utf8 { hash = ((hash &<< 5) &+ hash) &+ UInt64(byte) }
        return (0..<count).map { index in
            let random = Double((hash ^ UInt64(index &* 31)) % 25)
            let wave = sin(Double(index) / 4.2) * 8
            return CGFloat(max(6, min(36, 8 + wave + random)))
        }
    }
}
