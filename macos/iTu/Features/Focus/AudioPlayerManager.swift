import AVFoundation
import Foundation
import Observation
import iTuNetworking

@MainActor
@Observable
final class AudioPlayerManager {
    static let shared = AudioPlayerManager()
    static let builtInCatalog = FocusSoundCatalog(
        sounds: [
            FocusSound(id: "builtin:rain", name: "Rain", originalName: "Rain", url: "/audio/focus/rain.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Nature", source: "BUILTIN", defaultVolume: 0.42),
            FocusSound(id: "builtin:forest", name: "Forest", originalName: "Forest", url: "/audio/focus/forest.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Nature", source: "BUILTIN", defaultVolume: 0.42),
            FocusSound(id: "builtin:cafe", name: "Café", originalName: "Café", url: "/audio/focus/cafe.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Atmosphere", source: "BUILTIN", defaultVolume: 0.32),
            FocusSound(id: "builtin:brown-noise", name: "Brown noise", originalName: "Brown noise", url: "/audio/focus/brown-noise.mp3", mimeType: "audio/mpeg", sizeBytes: 0, durationSeconds: nil, version: 1, category: "Noise", source: "BUILTIN", defaultVolume: 0.35)
        ],
        preferences: []
    )

    var isPlaying = false
    var isLoading = false
    var errorMessage: String?
    var sounds: [FocusSound] = []
    var isEnabled = true {
        didSet {  
            if !isEnabled && isPlaying {
                stop()
            }
        }
    }
    var selectedSound: FocusSound?
    var volume: Float = 0.5 {
        didSet {
            audioPlayer?.volume = volume
        }
    }

    func waveformHeights(count: Int = 40) -> [CGFloat] {
        let soundName = selectedSound?.name ?? ""
        var hash: UInt64 = 5381
        for byte in soundName.utf8 {
            hash = ((hash &<< 5) &+ hash) &+ UInt64(byte)
        }

        var heights: [CGFloat] = []
        for i in 0..<count {
            let stepVal = hash ^ UInt64(i &* 31)
            let val = Double(stepVal % 25)
            let wave = sin(Double(i) / 4.2) * 8.0
            let base = 8.0 + wave + val
            heights.append(CGFloat(max(6.0, min(36.0, base))))
        }
        return heights
    }

    private var audioPlayer: AVAudioPlayer?
    private var loadedSoundID: String?

    var onStartPlaybackRequested: (() -> Void)?

    func configureBuiltInDefaults() {
        configure(catalog: Self.builtInCatalog)
    }

    func playIfEnabled() {
        guard isEnabled, selectedSound != nil else { return }
        if hasLoadedSelectedSound {
            if !isPlaying {
                audioPlayer?.play()
                isPlaying = audioPlayer?.isPlaying == true
            }
        } else {
            onStartPlaybackRequested?()
        }
    }

    func toggleLoadedPlayback() {
        if isPlaying {
            pause()
        } else {
            audioPlayer?.play()
            isPlaying = audioPlayer?.isPlaying == true
        }
    }

    func configure(catalog: FocusSoundCatalog) {
        let preferences = Dictionary(uniqueKeysWithValues: catalog.preferences.map { ($0.soundKey, $0) })
        let catalogIndexed = Array(catalog.sounds.enumerated())
        sounds = catalogIndexed
            .filter { preferences[$0.element.id]?.enabled != false }
            .sorted {
                let lhs = preferences[$0.element.id]?.sortOrder ?? $0.offset
                let rhs = preferences[$1.element.id]?.sortOrder ?? $1.offset
                return lhs == rhs ? $0.element.name.localizedCaseInsensitiveCompare($1.element.name) == .orderedAscending : lhs < rhs
            }
            .map(\.element)
        if let selectedSound, sounds.contains(where: { $0.id == selectedSound.id }) {
            self.selectedSound = sounds.first(where: { $0.id == selectedSound.id })
        } else {
            selectedSound = sounds.first
        }
        if let selectedSound {
            volume = Float(preferences[selectedSound.id].map { $0.volume / 100 } ?? selectedSound.defaultVolume)
        }
        errorMessage = sounds.isEmpty ? "No focus sounds are available." : nil
    }

    func stop() {
        audioPlayer?.stop()
        audioPlayer?.currentTime = 0
        isPlaying = false
    }

    func pause() {
        audioPlayer?.pause()
        isPlaying = false
    }

    func selectSound(_ sound: FocusSound) {
        guard selectedSound?.id != sound.id else { return }
        stop()
        audioPlayer = nil
        loadedSoundID = nil
        selectedSound = sound
        volume = Float(sound.defaultVolume)
        errorMessage = nil
    }

    func play(data: Data, sound: FocusSound) throws {
        let player = try AVAudioPlayer(data: data)
        player.numberOfLoops = -1
        player.volume = volume
        guard player.prepareToPlay(), player.play() else {
            throw APIError(statusCode: 0, message: "The selected sound could not be played.", code: nil)
        }
        audioPlayer = player
        loadedSoundID = sound.id
        selectedSound = sound
        isPlaying = true
        errorMessage = nil
    }

    var hasLoadedSelectedSound: Bool {
        loadedSoundID == selectedSound?.id && audioPlayer != nil
    }
}
