import Foundation
import iTuDomain

private struct SafariExtensionDsnResponse: Decodable {
    let dsnKey: String
}

public extension APIClient {
    func generateSafariExtensionDsn() async throws -> String {
        let response: SafariExtensionDsnResponse = try await request(
            path: "/usage/websites/dsn",
            method: "POST",
            body: ["kind": JSONValue.string("SAFARI_IOS")]
        )
        return response.dsnKey
    }
}
