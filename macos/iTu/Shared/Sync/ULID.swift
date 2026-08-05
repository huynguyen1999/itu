import Foundation

enum ULID {
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    static func generate(now: Date = Date()) -> String {
        var bytes = [UInt8](repeating: 0, count: 16)
        let timestamp = UInt64(max(0, now.timeIntervalSince1970 * 1_000))
        bytes[0] = UInt8((timestamp >> 40) & 0xff)
        bytes[1] = UInt8((timestamp >> 32) & 0xff)
        bytes[2] = UInt8((timestamp >> 24) & 0xff)
        bytes[3] = UInt8((timestamp >> 16) & 0xff)
        bytes[4] = UInt8((timestamp >> 8) & 0xff)
        bytes[5] = UInt8(timestamp & 0xff)
        for index in 6..<bytes.count {
            bytes[index] = UInt8.random(in: .min ... .max)
        }

        var output = ""
        output.reserveCapacity(26)
        var buffer: UInt32 = 0
        var bitCount = 0
        for byte in bytes {
            buffer = (buffer << 8) | UInt32(byte)
            bitCount += 8
            while bitCount >= 5 {
                bitCount -= 5
                output.append(alphabet[Int((buffer >> UInt32(bitCount)) & 0x1f)])
            }
        }
        if bitCount > 0 {
            output.append(alphabet[Int((buffer << UInt32(5 - bitCount)) & 0x1f)])
        }
        return String(output.prefix(26))
    }
}
