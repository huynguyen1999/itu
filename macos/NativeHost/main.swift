import Foundation
import Darwin

private let maxMessageBytes = 16 * 1024
private let protocolVersion = 1
private let appGroupID = "group.com.itu.browser-activity"
private let stateFileName = "browser-activity.json"
private let edgeBundleID = "com.microsoft.edgemac"

private struct ActivityMessage: Decodable {
    enum State: String, Codable {
        case active
        case inactive
    }

    let protocolVersion: Int
    let browserBundleId: String
    let sequence: UInt64
    let state: State
    let hostname: String?
    let incognito: Bool
}

private struct ActivityState: Encodable {
    let protocolVersion: Int
    let browserBundleId: String
    let sequence: UInt64
    let state: ActivityMessage.State
    let hostname: String?
    let incognito: Bool
    let connected: Bool
    let updatedAt: String
}

private struct HostResponse: Encodable {
    let ok: Bool
    let error: String?
}

private func nowString() -> String {
    ISO8601DateFormatter().string(from: Date())
}

private func stateURL() throws -> URL {
    guard let container = FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: appGroupID) else {
        throw NSError(domain: "BrowserActivityHost", code: 1, userInfo: [NSLocalizedDescriptionKey: "App Group container unavailable"])
    }
    try FileManager.default.createDirectory(at: container, withIntermediateDirectories: true)
    return container.appendingPathComponent(stateFileName)
}

private func writeState(_ state: ActivityState) throws {
    let data = try JSONEncoder().encode(state)
    try data.write(to: try stateURL(), options: .atomic)
}

private func readExactly(_ count: Int) throws -> Data? {
    var data = Data()
    while data.count < count {
        guard let chunk = try FileHandle.standardInput.read(upToCount: count - data.count), !chunk.isEmpty else {
            return data.isEmpty ? nil : nil
        }
        data.append(chunk)
    }
    return data
}

private func readLength() throws -> Int? {
    guard let data = try readExactly(4) else { return nil }
    let length = Int(data[data.startIndex])
        | Int(data[data.startIndex + 1]) << 8
        | Int(data[data.startIndex + 2]) << 16
        | Int(data[data.startIndex + 3]) << 24
    guard length > 0, length <= maxMessageBytes else { throw NSError(domain: "BrowserActivityHost", code: 2, userInfo: [NSLocalizedDescriptionKey: "Message length must be 1-16KB"] ) }
    return length
}

private func writeResponse(_ response: HostResponse) throws {
    let data = try JSONEncoder().encode(response)
    var frame = Data([UInt8(data.count & 0xff), UInt8((data.count >> 8) & 0xff), UInt8((data.count >> 16) & 0xff), UInt8((data.count >> 24) & 0xff)])
    frame.append(data)
    try FileHandle.standardOutput.write(contentsOf: frame)
}

private var lastState: ActivityState?
do {
    while let length = try readLength() {
        guard let data = try readExactly(length), let message = try? JSONDecoder().decode(ActivityMessage.self, from: data) else {
            try? writeResponse(HostResponse(ok: false, error: "Invalid JSON message"))
            continue
        }
        guard message.protocolVersion == protocolVersion,
              message.browserBundleId == edgeBundleID,
              !message.incognito else {
            try? writeResponse(HostResponse(ok: false, error: "Invalid protocol, browser bundle, or incognito state"))
            continue
        }
        let hostname: String?
        switch message.state {
        case .active:
            guard let value = message.hostname, let normalized = normalizeHostname(value) else {
                try? writeResponse(HostResponse(ok: false, error: "Active state requires a valid hostname"))
                continue
            }
            hostname = normalized
        case .inactive:
            guard message.hostname == nil else {
                try? writeResponse(HostResponse(ok: false, error: "Inactive state requires a nil hostname"))
                continue
            }
            hostname = nil
        }
        let state = ActivityState(
            protocolVersion: protocolVersion,
            browserBundleId: edgeBundleID,
            sequence: message.sequence,
            state: message.state,
            hostname: hostname,
            incognito: false,
            connected: true,
            updatedAt: nowString()
        )
        try writeState(state)
        lastState = state
        try writeResponse(HostResponse(ok: true, error: nil))
    }
    let disconnected = ActivityState(
        protocolVersion: protocolVersion,
        browserBundleId: edgeBundleID,
        sequence: lastState?.sequence ?? 0,
        state: .inactive,
        hostname: nil,
        incognito: false,
        connected: false,
        updatedAt: nowString()
    )
    try writeState(disconnected)
} catch {
    FileHandle.standardError.write(Data("BrowserActivityHost: \(error)\n".utf8))
    exit(1)
}

private func normalizeHostname(_ value: String) -> String? {
    let hostname = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        .trimmingCharacters(in: CharacterSet(charactersIn: "."))
    guard !hostname.isEmpty, hostname.count <= 253 else { return nil }
    let labels = hostname.split(separator: ".", omittingEmptySubsequences: false)
    guard !labels.isEmpty else { return nil }
    for label in labels {
        guard (1...63).contains(label.count),
              label.first!.isASCII,
              label.last!.isASCII,
              label.first!.isLetter || label.first!.isNumber,
              label.last!.isLetter || label.last!.isNumber,
              label.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" }) else { return nil }
    }
    return hostname
}
