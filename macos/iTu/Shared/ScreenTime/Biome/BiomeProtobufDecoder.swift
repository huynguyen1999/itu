import Foundation

/// Lightweight zero-dependency Protobuf wire-format parser for Biome stream payloads.
public struct BiomeProtobufField: Sendable {
    public let fieldNumber: Int
    public let wireType: Int
    public let varintValue: UInt64?
    public let doubleValue: Double?
    public let floatValue: Float?
    public let dataValue: Data?

    public var stringValue: String? {
        guard let data = dataValue else { return nil }
        return String(data: data, encoding: .utf8)
    }

    public var boolValue: Bool? {
        guard let varintValue else { return nil }
        return varintValue != 0
    }
}

public enum BiomeProtobufDecoder {
    public static func decodeFields(from data: Data) -> [BiomeProtobufField] {
        var fields: [BiomeProtobufField] = []
        var offset = 0
        let count = data.count

        while offset < count {
            guard let (tagVarint, tagBytes) = readVarint(from: data, offset: offset) else {
                break
            }
            offset += tagBytes

            let fieldNumber = Int(tagVarint >> 3)
            let wireType = Int(tagVarint & 0x07)

            switch wireType {
            case 0: // Varint
                guard let (val, valBytes) = readVarint(from: data, offset: offset) else { return fields }
                offset += valBytes
                fields.append(BiomeProtobufField(
                    fieldNumber: fieldNumber,
                    wireType: wireType,
                    varintValue: val,
                    doubleValue: nil,
                    floatValue: nil,
                    dataValue: nil
                ))

            case 1: // 64-bit fixed
                guard offset + 8 <= count else { return fields }
                let bitPattern = data.subdata(in: offset..<(offset + 8)).withUnsafeBytes {
                    $0.load(as: UInt64.self)
                }
                let doubleVal = Double(bitPattern: UInt64(littleEndian: bitPattern))
                offset += 8
                fields.append(BiomeProtobufField(
                    fieldNumber: fieldNumber,
                    wireType: wireType,
                    varintValue: nil,
                    doubleValue: doubleVal,
                    floatValue: nil,
                    dataValue: nil
                ))

            case 2: // Length-delimited
                guard let (lengthVarint, lenBytes) = readVarint(from: data, offset: offset) else { return fields }
                offset += lenBytes
                let length = Int(lengthVarint)
                guard offset + length <= count else { return fields }
                let subdata = data.subdata(in: offset..<(offset + length))
                offset += length
                fields.append(BiomeProtobufField(
                    fieldNumber: fieldNumber,
                    wireType: wireType,
                    varintValue: nil,
                    doubleValue: nil,
                    floatValue: nil,
                    dataValue: subdata
                ))

            case 5: // 32-bit fixed
                guard offset + 4 <= count else { return fields }
                let bitPattern = data.subdata(in: offset..<(offset + 4)).withUnsafeBytes {
                    $0.load(as: UInt32.self)
                }
                let floatVal = Float(bitPattern: UInt32(littleEndian: bitPattern))
                offset += 4
                fields.append(BiomeProtobufField(
                    fieldNumber: fieldNumber,
                    wireType: wireType,
                    varintValue: nil,
                    doubleValue: nil,
                    floatValue: floatVal,
                    dataValue: nil
                ))

            default:
                // Unknown wire type - stop decoding
                return fields
            }
        }

        return fields
    }

    private static func readVarint(from data: Data, offset: Int) -> (UInt64, Int)? {
        var result: UInt64 = 0
        var shift: UInt64 = 0
        var bytesRead = 0
        let count = data.count

        while offset + bytesRead < count {
            let byte = data[offset + bytesRead]
            bytesRead += 1
            result |= UInt64(byte & 0x7F) << shift
            if (byte & 0x80) == 0 {
                return (result, bytesRead)
            }
            shift += 7
            if shift >= 64 {
                return nil
            }
        }
        return nil
    }
}
