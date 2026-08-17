import Foundation

public enum ULID {
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    public static func generate(now: Date = Date()) -> String {
        let milliseconds = now.timeIntervalSince1970 * 1_000
        precondition(milliseconds.isFinite && milliseconds >= 0 && milliseconds <= Double(0xffffffffffff), "ULID timestamp is out of range")
        var timestamp = UInt64(milliseconds)
        var timestampOutput = ""
        timestampOutput.reserveCapacity(10)
        for _ in 0..<10 {
            timestampOutput.append(alphabet[Int(timestamp & 0x1f)])
            timestamp >>= 5
        }

        var randomBytes = [UInt8](repeating: 0, count: 10)
        for index in randomBytes.indices {
            randomBytes[index] = UInt8.random(in: .min ... .max)
        }

        var randomOutput = ""
        randomOutput.reserveCapacity(16)
        var buffer: UInt32 = 0
        var bitCount = 0
        for byte in randomBytes {
            buffer = (buffer << 8) | UInt32(byte)
            bitCount += 8
            while bitCount >= 5 {
                bitCount -= 5
                randomOutput.append(alphabet[Int((buffer >> UInt32(bitCount)) & 0x1f)])
            }
            buffer = bitCount == 0 ? 0 : buffer & ((UInt32(1) << UInt32(bitCount)) - 1)
        }
        return String(timestampOutput.reversed()) + randomOutput
    }
}
