import Foundation
import AppKit

@MainActor
final class FocusURLRouter {
    static let shared = FocusURLRouter()

    private var queuedURL: URL?
    private var isHydrated: Bool = false
    private var isAuthenticated: Bool = true

    private init() {}

    func setHydrated(_ hydrated: Bool, authenticated: Bool) {
        self.isHydrated = hydrated
        self.isAuthenticated = authenticated
        if hydrated, let url = queuedURL {
            queuedURL = nil
            handleURL(url)
        }
    }

    func handleURL(_ url: URL) {
        guard url.scheme?.lowercased() == "itu" else { return }

        guard isHydrated else {
            queuedURL = url
            return
        }

        guard isAuthenticated else {
            openErrorCallback(for: url, errorCode: "authentication-required", errorMessage: "Authentication required")
            return
        }

        let path = url.path.lowercased()
        let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        var params: [String: String] = [:]
        for item in queryItems {
            if let value = item.value {
                params[item.name] = value
            }
        }

        let xSuccess = params["x-success"]
        let xError = params["x-error"]

        switch path {
        case "/v1/start-focus":
            let title = params["customTitle"]
            let planned = params["plannedSeconds"].flatMap { Int($0) }
            let taskId = params["taskId"]
            let tagIds = params["tagIds"]?.components(separatedBy: ",")
            let presetId = params["presetId"]
            let policyId = params["policyId"]
            let idempotencyKey = params["idempotencyKey"]

            let session = FocusCommandService.shared.startFocus(
                customTitle: title,
                plannedSeconds: planned,
                taskId: taskId,
                tagIds: tagIds,
                presetId: presetId,
                policyId: policyId,
                idempotencyKey: idempotencyKey
            )
            triggerSuccess(xSuccess: xSuccess, params: [
                "success": "true",
                "sessionId": session.id,
                "status": session.status.rawValue.lowercased(),
                "phase": session.phase.rawValue,
                "syncStatus": "pending"
            ])

        case "/v1/start-short-break":
            let planned = params["plannedSeconds"].flatMap { Int($0) }
            let idempotencyKey = params["idempotencyKey"]
            let session = FocusCommandService.shared.startShortBreak(plannedSeconds: planned, idempotencyKey: idempotencyKey)
            triggerSuccess(xSuccess: xSuccess, params: [
                "success": "true",
                "sessionId": session.id,
                "status": session.status.rawValue.lowercased(),
                "phase": session.phase.rawValue,
                "syncStatus": "pending"
            ])

        case "/v1/start-long-break":
            let planned = params["plannedSeconds"].flatMap { Int($0) }
            let idempotencyKey = params["idempotencyKey"]
            let session = FocusCommandService.shared.startLongBreak(plannedSeconds: planned, idempotencyKey: idempotencyKey)
            triggerSuccess(xSuccess: xSuccess, params: [
                "success": "true",
                "sessionId": session.id,
                "status": session.status.rawValue.lowercased(),
                "phase": session.phase.rawValue,
                "syncStatus": "pending"
            ])

        case "/v1/pause":
            if let session = FocusCommandService.shared.pause() {
                triggerSuccess(xSuccess: xSuccess, params: [
                    "success": "true",
                    "sessionId": session.id,
                    "status": "paused",
                    "syncStatus": "pending"
                ])
            } else {
                openErrorCallback(xError: xError, errorCode: "no-active-session", errorMessage: "No active focus session")
            }

        case "/v1/resume":
            if let session = FocusCommandService.shared.resume() {
                triggerSuccess(xSuccess: xSuccess, params: [
                    "success": "true",
                    "sessionId": session.id,
                    "status": "active",
                    "syncStatus": "pending"
                ])
            } else {
                openErrorCallback(xError: xError, errorCode: "no-paused-session", errorMessage: "No paused focus session")
            }

        case "/v1/complete":
            if let session = FocusCommandService.shared.complete() {
                triggerSuccess(xSuccess: xSuccess, params: [
                    "success": "true",
                    "sessionId": session.id,
                    "status": "completed",
                    "syncStatus": "pending"
                ])
            } else {
                openErrorCallback(xError: xError, errorCode: "no-active-session", errorMessage: "No active focus session")
            }

        case "/v1/abandon":
            if let session = FocusCommandService.shared.abandon() {
                triggerSuccess(xSuccess: xSuccess, params: [
                    "success": "true",
                    "sessionId": session.id,
                    "status": "abandoned",
                    "syncStatus": "pending"
                ])
            } else {
                openErrorCallback(xError: xError, errorCode: "no-active-session", errorMessage: "No active focus session")
            }

        case "/v1/get-remaining-seconds":
            let remaining = FocusCommandService.shared.getRemainingSeconds()
            triggerSuccess(xSuccess: xSuccess, params: [
                "success": "true",
                "remainingSeconds": String(remaining),
                "syncStatus": "pending"
            ])

        case "/v1/get-session-title":
            let title = FocusCommandService.shared.getSessionTitle()
            triggerSuccess(xSuccess: xSuccess, params: [
                "success": "true",
                "title": title,
                "syncStatus": "pending"
            ])

        case "/v1/get-state":
            let state = FocusCommandService.shared.getFocusState()
            triggerSuccess(xSuccess: xSuccess, params: [
                "success": "true",
                "active": String(state.active),
                "status": state.status,
                "phase": state.phase,
                "remainingSeconds": String(state.remainingSeconds),
                "elapsedSeconds": String(state.elapsedSeconds),
                "plannedSeconds": String(state.plannedSeconds),
                "title": state.title,
                "taskId": state.taskId ?? "",
                "isPaused": String(state.isPaused),
                "cycle": String(state.cycle),
                "cyclesBeforeLongBreak": String(state.cyclesBeforeLongBreak),
                "nextPhase": state.nextPhase,
                "syncStatus": "pending"
            ])

        default:
            openErrorCallback(xError: xError, errorCode: "invalid-action", errorMessage: "Unknown action: \(path)")
        }
    }

    private func triggerSuccess(xSuccess: String?, params: [String: String]) {
        guard let xSuccess, var components = URLComponents(string: xSuccess) else { return }
        var queryItems = components.queryItems ?? []
        for (key, value) in params {
            queryItems.append(URLQueryItem(name: key, value: value))
        }
        components.queryItems = queryItems
        if let targetURL = components.url {
            NSWorkspace.shared.open(targetURL)
        }
    }

    private func openErrorCallback(for url: URL, errorCode: String, errorMessage: String) {
        let queryItems = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        let xError = queryItems.first(where: { $0.name == "x-error" })?.value
        openErrorCallback(xError: xError, errorCode: errorCode, errorMessage: errorMessage)
    }

    private func openErrorCallback(xError: String?, errorCode: String, errorMessage: String) {
        guard let xError, var components = URLComponents(string: xError) else { return }
        var queryItems = components.queryItems ?? []
        queryItems.append(URLQueryItem(name: "errorCode", value: errorCode))
        queryItems.append(URLQueryItem(name: "errorMessage", value: errorMessage))
        components.queryItems = queryItems
        if let targetURL = components.url {
            NSWorkspace.shared.open(targetURL)
        }
    }
}
