import Foundation
import SQLite3
import iTuDomain

/// Discovers connected remote Apple devices (iPhone/iPad) from macOS Biome sync metadata.
public enum BiomeDeviceDiscovery {
    private static var homeDirectory: URL {
        FileManager.default.homeDirectoryForCurrentUser
    }

    public static var biomeRootURL: URL {
        homeDirectory.appendingPathComponent("Library/Biome", isDirectory: true)
    }

    public static var syncDatabaseURL: URL {
        biomeRootURL.appendingPathComponent("sync/sync.db", isDirectory: false)
    }

    public static var remoteStreamsURL: URL {
        biomeRootURL.appendingPathComponent("streams/restricted/App.InFocus/remote", isDirectory: true)
    }

    /// Checks whether Full Disk Access is granted to read Biome system files.
    public static func hasFullDiskAccess() -> Bool {
        let dbPath = syncDatabaseURL.path
        if FileManager.default.fileExists(atPath: dbPath) {
            return FileManager.default.isReadableFile(atPath: dbPath)
        }
        let streamsPath = remoteStreamsURL.path
        if FileManager.default.fileExists(atPath: streamsPath) {
            return FileManager.default.isReadableFile(atPath: streamsPath)
        }
        // If neither exists yet, check Biome root
        let rootPath = biomeRootURL.path
        if FileManager.default.fileExists(atPath: rootPath) {
            return FileManager.default.isReadableFile(atPath: rootPath)
        }
        return false
    }

    /// Discovers remote Apple devices synced with this Mac via iCloud.
    public static func discoverDevices() throws -> [ScreenTimeDevice] {
        var devicesByIdentifier: [String: ScreenTimeDevice] = [:]

        // 1. Try reading from sync/sync.db
        if FileManager.default.fileExists(atPath: syncDatabaseURL.path) {
            let dbDevices = queryDevicesFromSyncDatabase()
            for dev in dbDevices {
                devicesByIdentifier[dev.deviceIdentifier] = dev
            }
        }

        // 2. Discover from remote directory structure if any remote device folders exist
        let fileManager = FileManager.default
        let remotePath = remoteStreamsURL.path
        if fileManager.fileExists(atPath: remotePath),
           let contents = try? fileManager.contentsOfDirectory(atPath: remotePath) {
            for item in contents {
                if item.hasPrefix(".") || item.lowercased() == "tombstone" { continue }
                if devicesByIdentifier[item] == nil {
                    // Create entry from directory UUID
                    devicesByIdentifier[item] = ScreenTimeDevice(
                        deviceIdentifier: item,
                        name: "iOS Device (\(item.prefix(8)))",
                        model: "iPhone/iPad",
                        platform: "iOS",
                        isMe: false,
                        lastSyncDate: nil
                    )
                }
            }
        }

        // Only return remote devices (isMe == false)
        return devicesByIdentifier.values
            .filter { !$0.isMe }
            .sorted { ($0.name ?? $0.deviceIdentifier) < ($1.name ?? $1.deviceIdentifier) }
    }

    private static func queryDevicesFromSyncDatabase() -> [ScreenTimeDevice] {
        var db: OpaquePointer?
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_URI
        guard sqlite3_open_v2(syncDatabaseURL.path, &db, flags, nil) == SQLITE_OK else {
            if let db { sqlite3_close(db) }
            return []
        }
        defer { sqlite3_close(db) }

        var devices: [ScreenTimeDevice] = []
        let query = "SELECT device_identifier, me, name, model, platform, last_sync_date FROM DevicePeer;"
        var stmt: OpaquePointer?

        if sqlite3_prepare_v2(db, query, -1, &stmt, nil) == SQLITE_OK {
            while sqlite3_step(stmt) == SQLITE_ROW {
                let idText = sqlite3_column_text(stmt, 0).map { String(cString: $0) } ?? ""
                let meInt = sqlite3_column_int(stmt, 1)
                let nameText = sqlite3_column_text(stmt, 2).map { String(cString: $0) }
                let modelText = sqlite3_column_text(stmt, 3).map { String(cString: $0) }
                let platformInt = sqlite3_column_int(stmt, 4)
                let lastSyncVal = sqlite3_column_double(stmt, 5)

                guard !idText.isEmpty else { continue }

                let lastSyncDate: Date? = lastSyncVal > 0 ? Date(timeIntervalSinceReferenceDate: lastSyncVal) : nil
                let platformName = platformInt == 2 ? "iOS" : (platformInt == 1 ? "macOS" : "Apple")

                devices.append(ScreenTimeDevice(
                    deviceIdentifier: idText,
                    name: nameText,
                    model: modelText,
                    platform: platformName,
                    isMe: meInt != 0,
                    lastSyncDate: lastSyncDate
                ))
            }
        }
        sqlite3_finalize(stmt)
        return devices
    }
}
