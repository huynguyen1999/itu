import Foundation

/// Raw decoded focus event from an App.InFocus Biome stream SEGB file.
public struct BiomeAppInFocusEvent: Sendable {
    public let timestamp: Date
    public let bundleId: String
    public let starting: Bool
    public let transitionReason: String?
    public let type: Int
    public let version: String?
    public let build: String?

    public init(
        timestamp: Date,
        bundleId: String,
        starting: Bool,
        transitionReason: String? = nil,
        type: Int = 1,
        version: String? = nil,
        build: String? = nil
    ) {
        self.timestamp = timestamp
        self.bundleId = bundleId
        self.starting = starting
        self.transitionReason = transitionReason
        self.type = type
        self.version = version
        self.build = build
    }
}

public enum BiomeRecordDecoderError: Error, LocalizedError {
    case invalidFileLength
    case invalidMagicHeader
    case malformedTrailer
    case malformedEntry

    public var errorDescription: String? {
        switch self {
        case .invalidFileLength: "File is too small to be a valid SEGB stream"
        case .invalidMagicHeader: "Invalid SEGB magic header"
        case .malformedTrailer: "Corrupt or truncated SEGB trailer"
        case .malformedEntry: "Corrupt or unreadable SEGB entry payload"
        }
    }
}

public enum BiomeRecordDecoder {
    private static let segbMagic = Data([0x53, 0x45, 0x47, 0x42]) // "SEGB"
    private static let headerSize = 32
    private static let trailerRecordSize = 16
    private static let entryHeaderSize = 8

    /// Safely parses a timestamp supporting Unix epoch (seconds/milliseconds) and Apple CFAbsoluteTime.
    public static func parseTimestamp(_ ts: Double) -> Date {
        if ts > 1_000_000_000_000 {
            // Milliseconds since 1970
            return Date(timeIntervalSince1970: ts / 1000.0)
        } else if ts > 1_000_000_000 {
            // Seconds since 1970 (Unix epoch)
            return Date(timeIntervalSince1970: ts)
        } else {
            // CFAbsoluteTime (seconds since 2001-01-01)
            return Date(timeIntervalSinceReferenceDate: ts)
        }
    }

    /// Decodes all valid App.InFocus events from a SEGB binary data blob.
    public static func decodeAppInFocusEvents(from data: Data) throws -> [BiomeAppInFocusEvent] {
        let totalSize = data.count
        guard totalSize >= headerSize else {
            throw BiomeRecordDecoderError.invalidFileLength
        }

        // Verify "SEGB" header
        guard data.prefix(4) == segbMagic else {
            throw BiomeRecordDecoderError.invalidMagicHeader
        }

        // Read entriesCount (UInt32 little-endian at offset 4..8)
        let entriesCount = data.subdata(in: 4..<8).withUnsafeBytes {
            UInt32(littleEndian: $0.load(as: UInt32.self))
        }

        guard entriesCount > 0 else {
            return []
        }

        let trailerTotalSize = Int(entriesCount) * trailerRecordSize
        guard totalSize >= headerSize + trailerTotalSize else {
            throw BiomeRecordDecoderError.malformedTrailer
        }

        // Read trailer entries from EOF backwards
        // Trailer entries: entry 0 is at (fileSize - 16), entry 1 is at (fileSize - 32), etc.
        struct TrailerEntry {
            let endOffsetRel32: Int
            let state: UInt32
            let timestamp: Double
        }

        var trailers: [TrailerEntry] = []
        trailers.reserveCapacity(Int(entriesCount))

        for i in 0..<Int(entriesCount) {
            let offset = totalSize - (i + 1) * trailerRecordSize
            guard offset >= headerSize && offset + trailerRecordSize <= totalSize else {
                throw BiomeRecordDecoderError.malformedTrailer
            }

            let endOffsetRel = data.subdata(in: offset..<(offset + 4)).withUnsafeBytes {
                UInt32(littleEndian: $0.load(as: UInt32.self))
            }
            let state = data.subdata(in: (offset + 4)..<(offset + 8)).withUnsafeBytes {
                UInt32(littleEndian: $0.load(as: UInt32.self))
            }
            let tsBitPattern = data.subdata(in: (offset + 8)..<(offset + 16)).withUnsafeBytes {
                UInt64(littleEndian: $0.load(as: UInt64.self))
            }
            let timestamp = Double(bitPattern: tsBitPattern)

            trailers.append(TrailerEntry(
                endOffsetRel32: Int(endOffsetRel),
                state: state,
                timestamp: timestamp
            ))
        }

        // Sort trailers by endOffsetRel32 matching ccl_segb specification
        trailers.sort { $0.endOffsetRel32 < $1.endOffsetRel32 }

        var events: [BiomeAppInFocusEvent] = []
        var currentStreamPos = headerSize

        for trailer in trailers {
            let entryEnd = headerSize + trailer.endOffsetRel32
            let remainder = trailer.endOffsetRel32 % 4
            let nextPos = entryEnd + (remainder != 0 ? (4 - remainder) : 0)

            defer {
                currentStreamPos = nextPos
            }

            // State 4 is an empty record; state 1 is written/active entry
            guard trailer.state == 1 else {
                continue
            }

            guard currentStreamPos >= headerSize,
                  entryEnd <= totalSize - trailerTotalSize,
                  entryEnd >= currentStreamPos + entryHeaderSize else {
                continue
            }

            // Skip 8-byte entry header (CRC32 + Info)
            let payloadData = data.subdata(in: (currentStreamPos + entryHeaderSize)..<entryEnd)
            let fields = BiomeProtobufDecoder.decodeFields(from: payloadData)

            // Extract App.InFocus protobuf fields:
            // Tag 1 (string): transitionReason
            // Tag 2 (varint): mode/type (1 = app, 3 = system)
            // Tag 3 (varint): starting (1 = start, 0 = end)
            // Tag 4 (double): absoluteTimestamp (CFAbsoluteTime or Unix timestamp)
            // Tag 6 (string): bundleId
            // Tag 9 (string): version
            // Tag 10 (string): build

            var bundleId: String?
            var starting: Bool?
            var absoluteTimestamp: Double?
            var transitionReason: String?
            var typeVal = 1
            var version: String?
            var build: String?

            for field in fields {
                switch field.fieldNumber {
                case 1:
                    transitionReason = field.stringValue
                case 2:
                    if let v = field.varintValue { typeVal = Int(v) }
                case 3:
                    if let v = field.varintValue { starting = (v != 0) }
                case 4:
                    absoluteTimestamp = field.doubleValue
                case 6:
                    bundleId = field.stringValue
                case 9:
                    version = field.stringValue
                case 10:
                    build = field.stringValue
                default:
                    break
                }
            }

            guard let finalBundleId = bundleId, !finalBundleId.isEmpty,
                  let finalStarting = starting else {
                continue
            }

            let rawTimestamp = absoluteTimestamp ?? trailer.timestamp
            let eventDate = parseTimestamp(rawTimestamp)

            events.append(BiomeAppInFocusEvent(
                timestamp: eventDate,
                bundleId: finalBundleId,
                starting: finalStarting,
                transitionReason: transitionReason,
                type: typeVal,
                version: version,
                build: build
            ))
        }

        // Sort chronologically
        return events.sorted { $0.timestamp < $1.timestamp }
    }
}
