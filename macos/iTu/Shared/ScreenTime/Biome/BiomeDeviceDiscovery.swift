import Foundation
import SQLite3
import iTuDomain

/// Discovers Apple devices (this Mac and synced iPhone/iPad devices) from macOS Biome metadata.
public enum BiomeDeviceDiscovery {
    private static var homeDirectory: URL {
        if let userHome = FileManager.default.homeDirectory(forUser: ProcessInfo.processInfo.userName) {
            return userHome
        }
        return FileManager.default.homeDirectoryForCurrentUser
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

    public static var localStreamsURL: URL {
        biomeRootURL.appendingPathComponent("streams/restricted/App.InFocus/local", isDirectory: true)
    }

    /// Checks whether Full Disk Access is granted to read Biome system files.
    public static func hasFullDiskAccess() -> Bool {
        let fileManager = FileManager.default

        // 1. Check if sync database exists and is readable
        let dbPath = syncDatabaseURL.path
        if fileManager.fileExists(atPath: dbPath) {
            return fileManager.isReadableFile(atPath: dbPath)
        }

        // 2. Check if remote streams directory can be accessed and listed
        let streamsPath = remoteStreamsURL.path
        if fileManager.fileExists(atPath: streamsPath) {
            return (try? fileManager.contentsOfDirectory(atPath: streamsPath)) != nil
        }

        // 3. Check if local streams directory can be accessed and listed
        let localStreamsPath = localStreamsURL.path
        if fileManager.fileExists(atPath: localStreamsPath) {
            return (try? fileManager.contentsOfDirectory(atPath: localStreamsPath)) != nil
        }

        // 4. Check if Biome root directory can be accessed and listed
        let rootPath = biomeRootURL.path
        if fileManager.fileExists(atPath: rootPath) {
            return (try? fileManager.contentsOfDirectory(atPath: rootPath)) != nil
        }

        return false
    }

    /// Discovers remote Apple devices synced with this Mac via iCloud.
    public static func discoverDevices() throws -> [ScreenTimeDevice] {
        var devicesByIdentifier: [String: ScreenTimeDevice] = [:]

        // 1. Authoritative discovery from sync/sync.db (DevicePeer table)
        let dbDevices = queryDevicesFromSyncDatabase()
        for dev in dbDevices {
            devicesByIdentifier[dev.deviceIdentifier] = dev
        }

        // 2. Only fallback to remote directory inspection if sync.db is missing or returned no peers
        if dbDevices.isEmpty {
            let fileManager = FileManager.default
            let remotePath = remoteStreamsURL.path
            if fileManager.fileExists(atPath: remotePath),
               let contents = try? fileManager.contentsOfDirectory(atPath: remotePath) {
                for item in contents {
                    if item.hasPrefix(".") || item.lowercased() == "tombstone" { continue }
                    let itemPath = (remotePath as NSString).appendingPathComponent(item)
                    guard let itemContents = try? fileManager.contentsOfDirectory(atPath: itemPath),
                          itemContents.contains(where: { !$0.hasPrefix(".") && $0.lowercased() != "tombstone" }) else {
                        continue
                    }
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
        }

        // 3. Ensure local device ("This Mac") is included if local streams exist
        let hasLocalMe = devicesByIdentifier.values.contains { $0.isMe }
        let fileManager = FileManager.default
        if !hasLocalMe && (fileManager.fileExists(atPath: localStreamsURL.path) || fileManager.fileExists(atPath: biomeRootURL.path)) {
            let localName = Host.current().localizedName ?? "This Mac"
            let localId = "local-mac"
            devicesByIdentifier[localId] = ScreenTimeDevice(
                deviceIdentifier: localId,
                name: localName,
                model: "Mac",
                platform: "macOS",
                isMe: true,
                lastSyncDate: Date()
            )
        }

        return devicesByIdentifier.values
            .sorted {
                if $0.isMe != $1.isMe { return $0.isMe }
                return ($0.displayName) < ($1.displayName)
            }
    }

    private static func queryDevicesFromSyncDatabase() -> [ScreenTimeDevice] {
        guard FileManager.default.fileExists(atPath: syncDatabaseURL.path) else {
            return []
        }
        var db: OpaquePointer?
        let flags = SQLITE_OPEN_READONLY | SQLITE_OPEN_URI
        let uriPath = "file://\(syncDatabaseURL.path)?immutable=1"
        guard sqlite3_open_v2(uriPath, &db, flags, nil) == SQLITE_OK else {
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
                let nameText = sqlite3_column_text(stmt, 2)
                    .map { String(cString: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
                    .flatMap { $0.isEmpty ? nil : $0 }
                let modelText = sqlite3_column_text(stmt, 3)
                    .map { String(cString: $0).trimmingCharacters(in: .whitespacesAndNewlines) }
                    .flatMap { $0.isEmpty ? nil : $0 }
                let platformInt = sqlite3_column_int(stmt, 4)
                let lastSyncVal = sqlite3_column_double(stmt, 5)

                guard !idText.isEmpty else { continue }

                let lastSyncDate: Date? = lastSyncVal > 0 ? BiomeRecordDecoder.parseTimestamp(lastSyncVal) : nil
                let isMe = meInt != 0
                let platformName: String
                if isMe {
                    platformName = "macOS"
                } else {
                    platformName = platformInt == 2 ? "iOS" : "Apple"
                }

                let resolvedName: String?
                if let nameText {
                    resolvedName = nameText
                } else if isMe {
                    resolvedName = Host.current().localizedName ?? "This Mac"
                } else {
                    resolvedName = platformName == "iOS" ? "iPhone" : "Apple Device"
                }

                devices.append(ScreenTimeDevice(
                    deviceIdentifier: idText,
                    name: resolvedName,
                    model: modelText,
                    platform: platformName,
                    isMe: isMe,
                    lastSyncDate: lastSyncDate
                ))
            }
        }
        sqlite3_finalize(stmt)
        return devices
    }
}
