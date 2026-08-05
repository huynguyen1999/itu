import Foundation

final class FocusAudioCache: Sendable {
    static let shared = FocusAudioCache()

    private init() {}

    private var cacheDirectory: URL {
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        let dir = appSupport.appendingPathComponent("iTu/AudioCache", isDirectory: true)
        if !FileManager.default.fileExists(atPath: dir.path) {
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
        return dir
    }

    private func fileURL(soundId: String, version: Int) -> URL {
        cacheDirectory.appendingPathComponent("\(soundId)_v\(version).mp3")
    }

    func isCached(soundId: String, version: Int) -> Bool {
        let url = fileURL(soundId: soundId, version: version)
        return FileManager.default.fileExists(atPath: url.path)
    }

    func getCachedAudioURL(soundId: String, version: Int) -> URL? {
        let url = fileURL(soundId: soundId, version: version)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    func saveAudioToCache(soundId: String, version: Int, data: Data) throws -> URL {
        invalidateOldVersions(soundId: soundId, currentVersion: version)
        let url = fileURL(soundId: soundId, version: version)
        try data.write(to: url, options: .atomic)
        return url
    }

    func invalidate(soundId: String) {
        if let files = try? FileManager.default.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil) {
            for file in files where file.lastPathComponent.startsWith("\(soundId)_v") {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }

    private func invalidateOldVersions(soundId: String, currentVersion: Int) {
        if let files = try? FileManager.default.contentsOfDirectory(at: cacheDirectory, includingPropertiesForKeys: nil) {
            let currentFileName = "\(soundId)_v\(currentVersion).mp3"
            for file in files where file.lastPathComponent.startsWith("\(soundId)_v") && file.lastPathComponent != currentFileName {
                try? FileManager.default.removeItem(at: file)
            }
        }
    }
}

private extension String {
    func startsWith(_ prefix: String) -> Bool {
        hasPrefix(prefix)
    }
}
