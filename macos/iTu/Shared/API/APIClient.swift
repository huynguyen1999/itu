import Foundation
import os

struct APIError: LocalizedError, Sendable {
    let statusCode: Int
    let message: String
    let code: String?
    let retryAfter: TimeInterval?

    init(statusCode: Int, message: String, code: String? = nil, retryAfter: TimeInterval? = nil) {
        self.statusCode = statusCode
        self.message = message
        self.code = code
        self.retryAfter = retryAfter
    }

    var errorDescription: String? { message }

    var isTerminalAuthFailure: Bool {
        statusCode == 401 && code.map(Self.terminalAuthenticationCodes.contains) == true
    }

    private static let terminalAuthenticationCodes: Set<String> = [
        "REFRESH_TOKEN_EXPIRED",
        "REFRESH_TOKEN_REVOKED",
        "REFRESH_TOKEN_INVALID",
        "ACCOUNT_DISABLED",
        "ACCOUNT_DELETED"
    ]
}

enum CredentialPersistenceError: LocalizedError, Sendable {
    case keychain(KeychainError)
    case failure(String)

    var errorDescription: String? {
        switch self {
        case let .keychain(error): error.localizedDescription
        case let .failure(message): "Credential persistence failed: \(message)"
        }
    }
}

private struct APIErrorBody: Decodable {
    let message: String?
    let code: String?
}

struct CursorPageMeta: Decodable {
    let hasNextPage: Bool
    let nextCursor: String?
}

struct CursorPageResponse<Item: Decodable>: Decodable {
    let data: [Item]
    let meta: CursorPageMeta?
}

struct AiCredential: Codable, Identifiable, Equatable, Sendable {
    let id: String
    let keyHint: String
    let enabled: Bool
    let status: String
    let lastError: String?
    let lastUsedAt: String?
    let cooldownUntil: String?
    let createdAt: String
    let updatedAt: String
    let usable: Bool
}

actor APIClient {
    private let session: URLSession
    private let credentialStore: any CredentialStore
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private let logger = Logger(subsystem: "com.itu.macos", category: "auth")
    private var accessToken: String?
    private var refreshTask: Task<AuthSession, Error>?

    init(session: URLSession? = nil, credentialStore: any CredentialStore = KeychainCredentialStore()) {
        self.session = session ?? Self.makeSession()
        self.credentialStore = credentialStore
        encoder = JSONEncoder()
        decoder = JSONDecoder()
        do {
            accessToken = try credentialStore.load(.accessToken)
        } catch {
            accessToken = nil
            logger.error("auth.keychain.read.failure")
        }
    }

    nonisolated static func makeSession(configuration: URLSessionConfiguration = .default) -> URLSession {
        configuration.httpShouldSetCookies = false
        configuration.httpCookieStorage = nil
        return URLSession(configuration: configuration)
    }

    func login(identifier: String, password: String) async throws -> AuthSession {
        let body: [String: JSONValue] = [
            "identifier": .string(identifier),
            "password": .string(password)
        ]
        let session: AuthSession = try await request(
            path: "/auth/login",
            method: "POST",
            body: body,
            authorize: false
        )
        try persistSession(session)
        accessToken = session.accessToken
        return session
    }

    func register(identifier: String, password: String, displayName: String) async throws -> AuthSession {
        let identifierKey = identifier.contains("@") ? "email" : "username"
        var body: [String: JSONValue] = [
            identifierKey: .string(identifier),
            "password": .string(password)
        ]
        let trimmedName = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        if !trimmedName.isEmpty {
            body["displayName"] = .string(trimmedName)
        }
        let session: AuthSession = try await request(
            path: "/auth/register",
            method: "POST",
            body: body,
            authorize: false
        )
        try persistSession(session)
        accessToken = session.accessToken
        return session
    }

    func restoreSession() async throws -> AuthSession {
        do {
            return try await refresh()
        } catch {
            if error is CredentialPersistenceError || error is KeychainError {
                throw error
            }
            if let apiError = error as? APIError, apiError.isTerminalAuthFailure {
                throw error
            }
            if let user = SessionCache.loadUser() {
                return AuthSession(
                    user: user,
                    accessToken: accessToken ?? "",
                    refreshToken: (try? credentialStore.load(.refreshToken)) ?? ""
                )
            }
            throw error
        }
    }

    func hasRefreshToken() throws -> Bool {
        try credentialStore.load(.refreshToken) != nil
    }

    func logout() async throws {
        logger.debug("auth.logout.started")
        guard let refreshToken = try credentialStore.load(.refreshToken) else {
            logger.debug("auth.logout.no_refresh_token")
            return
        }
        do {
            let _: EmptyResponse = try await request(
                path: "/auth/logout",
                method: "POST",
                body: ["refreshToken": .string(refreshToken)] as [String: JSONValue],
                authorize: false,
                retryAfterUnauthorized: false
            )
            logger.debug("auth.logout.server_revoke_succeeded")
        } catch {
            logger.debug("auth.logout.server_revoke_skipped")
        }
        accessToken = nil
    }

    func updateProfile(displayName: String?, username: String?) async throws -> AuthSession {
        let session: AuthSession = try await request(
            path: "/auth/me",
            method: "PATCH",
            body: [
                "displayName": displayName.map(JSONValue.string) ?? .null,
                "username": username.map(JSONValue.string) ?? .null
            ] as [String: JSONValue]
        )
        try persistSession(session)
        accessToken = session.accessToken
        return session
    }

    func changePassword(currentPassword: String, newPassword: String) async throws {
        _ = try await request(
            path: "/auth/password",
            method: "POST",
            body: [
                "currentPassword": .string(currentPassword),
                "newPassword": .string(newPassword)
            ] as [String: JSONValue]
        ) as EmptyResponse
    }

    func exportAccountData() async throws -> JSONValue {
        try await request(path: "/auth/data-export")
    }

    func deleteAccount(password: String?) async throws {
        _ = try await request(
            path: "/auth/me",
            method: "DELETE",
            body: ["password": password.map(JSONValue.string) ?? .null] as [String: JSONValue]
        ) as EmptyResponse
    }

    func token() -> String? {
        accessToken
    }

    func clearAccessToken() {
        accessToken = nil
    }

    func requestRawBody<ResponseBody: Decodable>(
        path: String,
        method: String,
        contentType: String,
        bodyData: Data
    ) async throws -> ResponseBody {
        let baseURL = APIConfiguration.baseURL
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError(statusCode: 0, message: "The API URL is invalid", code: nil)
        }
        var req = URLRequest(url: url)
        req.httpMethod = method
        req.timeoutInterval = 60
        req.setValue("application/json", forHTTPHeaderField: "Accept")
        req.setValue(contentType, forHTTPHeaderField: "Content-Type")
        req.httpBody = bodyData
        if let accessToken {
            req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }

        var (data, response) = try await session.data(for: req)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }

        if httpResponse.statusCode == 401 {
            _ = try await refresh()
            if let accessToken {
                req.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
            }
            (data, response) = try await session.data(for: req)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        if ResponseBody.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! ResponseBody
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }


    func downloadFocusSound(path: String) async throws -> Data {
        var request = try makeRequest(path: path, method: "GET", body: Optional<String>.none, authorize: true)
        var (data, response) = try await session.data(for: request)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }
        if httpResponse.statusCode == 401 {
            _ = try await refresh()
            request = try makeRequest(path: path, method: "GET", body: Optional<String>.none, authorize: true)
            (data, response) = try await session.data(for: request)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }
        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        return data
    }

    private func refresh() async throws -> AuthSession {
        if let refreshTask {
            return try await refreshTask.value
        }
        logger.debug("auth.refresh.started")
        guard let storedRefresh = try credentialStore.load(.refreshToken) else {
            throw APIError(statusCode: 401, message: "No refresh credential is available", code: nil)
        }
        let body: [String: JSONValue] = ["refreshToken": .string(storedRefresh)]
        let task = Task<AuthSession, Error> {
            do {
                let refreshed: AuthSession = try await self.request(
                    path: "/auth/refresh",
                    method: "POST",
                    body: body,
                    authorize: false,
                    retryAfterUnauthorized: false
                )
                try self.persistSession(refreshed)
                self.accessToken = refreshed.accessToken
                self.logger.debug("auth.refresh.success")
                return refreshed
            } catch {
                if let apiError = error as? APIError {
                    if apiError.isTerminalAuthFailure {
                        self.logger.debug("auth.refresh.terminal_failure")
                    } else {
                        self.logger.debug("auth.refresh.server_failure status=\(apiError.statusCode, privacy: .public)")
                    }
                } else if error is URLError {
                    self.logger.debug("auth.refresh.network_failure")
                } else if error is CredentialPersistenceError || error is KeychainError {
                    self.logger.error("auth.keychain.persistence_failure")
                }
                throw error
            }
        }
        refreshTask = task
        defer { refreshTask = nil }
        return try await task.value
    }

    private func persistSession(_ session: AuthSession) throws {
        do {
            try credentialStore.save(session.refreshToken, for: .refreshToken)
            try credentialStore.save(session.accessToken, for: .accessToken)
            SessionCache.saveUser(session.user)
        } catch let error as KeychainError {
            throw CredentialPersistenceError.keychain(error)
        } catch {
            throw CredentialPersistenceError.failure(error.localizedDescription)
        }
    }

    func request<RequestBody: Encodable, ResponseBody: Decodable>(
        path: String,
        method: String = "GET",
        body: RequestBody? = Optional<String>.none,
        authorize: Bool = true,
        retryAfterUnauthorized: Bool = true
    ) async throws -> ResponseBody {
        var request = try makeRequest(path: path, method: method, body: body, authorize: authorize)
        var (data, response) = try await session.data(for: request)
        guard var httpResponse = response as? HTTPURLResponse else {
            throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
        }

        if httpResponse.statusCode == 401, authorize, retryAfterUnauthorized {
            _ = try await refresh()
            request = try makeRequest(path: path, method: method, body: body, authorize: true)
            (data, response) = try await session.data(for: request)
            guard let retriedResponse = response as? HTTPURLResponse else {
                throw APIError(statusCode: 0, message: "The server returned an invalid response", code: nil)
            }
            httpResponse = retriedResponse
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            let errorBody = try? decoder.decode(APIErrorBody.self, from: data)
            throw APIError(
                statusCode: httpResponse.statusCode,
                message: errorBody?.message ?? HTTPURLResponse.localizedString(forStatusCode: httpResponse.statusCode),
                code: errorBody?.code,
                retryAfter: Self.retryAfter(from: httpResponse)
            )
        }
        if ResponseBody.self == EmptyResponse.self, data.isEmpty {
            return EmptyResponse() as! ResponseBody
        }
        return try decoder.decode(ResponseBody.self, from: data)
    }

    private func makeRequest<Body: Encodable>(
        path: String,
        method: String,
        body: Body?,
        authorize: Bool
    ) throws -> URLRequest {
        let baseURL = APIConfiguration.baseURL
        guard let url = URL(string: path, relativeTo: baseURL)?.absoluteURL else {
            throw APIError(statusCode: 0, message: "The API URL is invalid", code: nil)
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.httpBody = try encoder.encode(body)
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if authorize, let accessToken {
            request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")
        }
        return request
    }

    func escapedPath(_ value: String) -> String {
        var allowed = CharacterSet.urlPathAllowed
        allowed.remove(charactersIn: "/")
        return value.addingPercentEncoding(withAllowedCharacters: allowed) ?? value
    }

    private static func retryAfter(from response: HTTPURLResponse) -> TimeInterval? {
        guard let raw = response.value(forHTTPHeaderField: "Retry-After") else { return nil }
        if let seconds = TimeInterval(raw) { return max(0, seconds) }
        guard let date = HTTPDateFormatter.date(from: raw) else { return nil }
        return max(0, date.timeIntervalSinceNow)
    }
}

private enum HTTPDateFormatter {
    static func date(from value: String) -> Date? {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "EEE, dd MMM yyyy HH:mm:ss zzz"
        return formatter.date(from: value)
    }
}

struct EmptyResponse: Codable, Sendable {}

enum APIConfiguration {
    private static let baseURLKey = "apiBaseURL"
    private static let fallbackURL = URL(string: "http://localhost:3000")!

    static var baseURL: URL {
        guard
            let value = UserDefaults.standard.string(forKey: baseURLKey),
            let url = URL(string: value)
        else {
            return fallbackURL
        }
        return url
    }

    static func saveBaseURL(_ value: String) throws {
        guard let url = URL(string: value), let scheme = url.scheme, ["http", "https"].contains(scheme) else {
            throw APIError(statusCode: 0, message: "Enter a valid HTTP or HTTPS API URL", code: nil)
        }
        UserDefaults.standard.set(url.absoluteString.trimmingCharacters(in: CharacterSet(charactersIn: "/")), forKey: baseURLKey)
    }
}
