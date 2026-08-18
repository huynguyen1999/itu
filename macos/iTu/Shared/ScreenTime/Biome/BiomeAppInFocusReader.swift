import Foundation
import iTuDomain

public struct BiomeStreamReadResult: Sendable {
    public let events: [BiomeAppInFocusEvent]
    public let scannedFilesCount: Int
    public let decodedFilesCount: Int
    public let unreadableFilesCount: Int
}

/// Reads App.InFocus SEGB files for a device from the local or remote Biome stream.
public enum BiomeAppInFocusReader {
    public static func deviceStreamDirectory(for device: ScreenTimeDevice) -> URL {
        if device.isMe {
            return BiomeDeviceDiscovery.localStreamsURL
        }
        return BiomeDeviceDiscovery.remoteStreamsURL
            .appendingPathComponent(device.deviceIdentifier, isDirectory: true)
    }

    /// Reads all App.InFocus events for a device occurring since the watermark date.
    public static func readEvents(
        for device: ScreenTimeDevice,
        since watermark: Date? = nil
    ) throws -> BiomeStreamReadResult {
        let streamDir = deviceStreamDirectory(for: device)
        let fileManager = FileManager.default

        guard fileManager.fileExists(atPath: streamDir.path) else {
            return BiomeStreamReadResult(
                events: [],
                scannedFilesCount: 0,
                decodedFilesCount: 0,
                unreadableFilesCount: 0
            )
        }

        let fileNames = try fileManager.contentsOfDirectory(atPath: streamDir.path)
            .filter { !$0.hasPrefix(".") && $0.lowercased() != "tombstone" }
            .sorted()

        var allEvents: [BiomeAppInFocusEvent] = []
        var scanned = 0
        var decoded = 0
        var unreadable = 0

        // Lookback window: if watermark is provided, look back 10 minutes (600s) to catch unclosed boundaries
        let filterDate = watermark?.addingTimeInterval(-600)

        for name in fileNames {
            let fileURL = streamDir.appendingPathComponent(name)
            scanned += 1

            guard let data = try? Data(contentsOf: fileURL, options: .mappedIfSafe) else {
                unreadable += 1
                continue
            }

            do {
                let fileEvents = try BiomeRecordDecoder.decodeAppInFocusEvents(from: data)
                decoded += 1

                for event in fileEvents {
                    if let filterDate, event.timestamp < filterDate {
                        continue
                    }
                    allEvents.append(event)
                }
            } catch {
                unreadable += 1
            }
        }

        allEvents.sort { $0.timestamp < $1.timestamp }

        return BiomeStreamReadResult(
            events: allEvents,
            scannedFilesCount: scanned,
            decodedFilesCount: decoded,
            unreadableFilesCount: unreadable
        )
    }
}
