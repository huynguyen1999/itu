import SwiftUI
import iTuDomain

enum Phase6ProfileValidation {
    static func passwordError(current: String, new: String, confirmation: String) -> String? {
        guard !current.isEmpty else { return "Enter your current password." }
        guard new.count >= 8 else { return "The new password must contain at least 8 characters." }
        guard new == confirmation else { return "The new passwords do not match." }
        return nil
    }
}

struct Phase6ProfileView: View {
    @ObservedObject var model: AppModel
    @State private var displayName = ""
    @State private var username = ""
    @State private var savedDisplayName = ""
    @State private var savedUsername = ""
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmationPassword = ""
    @State private var statusMessage: String?
    @State private var exportURL: URL?
    @State private var isSaving = false
    @State private var isChangingPassword = false
    @State private var showDeleteConfirmation = false
    @State private var deletePassword = ""

    init(model: AppModel) {
        self.model = model
    }

    private var hasPasswordDraft: Bool {
        !currentPassword.isEmpty || !newPassword.isEmpty || !confirmationPassword.isEmpty
    }
    private var isDirty: Bool {
        displayName != savedDisplayName || username != savedUsername || hasPasswordDraft
    }
    private var passwordError: String? {
        guard !currentPassword.isEmpty || !newPassword.isEmpty || !confirmationPassword.isEmpty else { return nil }
        return Phase6ProfileValidation.passwordError(current: currentPassword, new: newPassword, confirmation: confirmationPassword)
    }

    var body: some View {
        List {
            if let user = model.user {
                Section("User Account") {
                    LabeledContent("Account", value: user.accountLabel)
                    LabeledContent("Account ID", value: user.id)
                    LabeledContent("Email", value: user.email ?? "Not provided")
                    LabeledContent("Platform", value: "iOS")
                }

                Section("Profile") {
                    TextField("Display name", text: $displayName)
                        .textContentType(.name)
                    TextField("Username", text: $username)
                        .textContentType(.username)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                    HStack {
                        Button("Discard") { restoreSavedValues() }
                            .disabled(!isDirty || isSaving)
                        Spacer()
                        Button(isSaving ? "Saving…" : "Save") { saveProfile() }
                            .disabled(!isDirty || isSaving || displayName.count > 120 || username.count > 30)
                    }
                }

                Section("Password") {
                    SecureField("Current password", text: $currentPassword)
                    SecureField("New password", text: $newPassword)
                    SecureField("Confirm new password", text: $confirmationPassword)
                    if let passwordError {
                        Text(passwordError).font(.footnote).foregroundStyle(.orange)
                    }
                    HStack {
                        Button("Discard password") { clearPasswordDraft() }
                            .disabled(!hasPasswordDraft || isChangingPassword)
                        Spacer()
                        Button(isChangingPassword ? "Changing…" : "Change password") { changePassword() }
                            .disabled(passwordError != nil || isChangingPassword)
                    }
                }

                Section("Your data") {
                    if let exportURL {
                        ShareLink(item: exportURL) {
                            Label("Share exported data", systemImage: "square.and.arrow.up")
                        }
                    }
                    Button("Generate data export") { generateExport() }
                    Text("The export is generated from the server response and saved as a share-ready JSON file.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                }

                Section {
                    SecureField("Password (optional)", text: $deletePassword)
                    Button("Delete account", role: .destructive) { showDeleteConfirmation = true }
                } header: {
                    Text("Delete User Account")
                } footer: {
                    Text("This permanently deletes your account and its data. You will be signed out and cannot undo this action.")
                }
            } else {
                IOSContentUnavailableView("No active account", systemImage: "person.crop.circle.badge.xmark")
            }
        }
        .navigationTitle("Profile")
        .navigationBarTitleDisplayMode(.inline)
        .task { hydrateFromUser() }
        .alert("Profile", isPresented: Binding(get: { statusMessage != nil }, set: { if !$0 { statusMessage = nil } })) {
            Button("OK", role: .cancel) { statusMessage = nil }
        } message: {
            Text(statusMessage ?? "")
        }
        .confirmationDialog("Delete this User Account?", isPresented: $showDeleteConfirmation) {
            Button("Delete account", role: .destructive) {
                Task {
                    if await model.deleteAccount(password: deletePassword.isEmpty ? nil : deletePassword) {
                        statusMessage = "The User Account was deleted and this device was signed out."
                    }
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This terminal action permanently deletes the account and cannot be undone.")
        }
        .preference(key: IOSNavigationDirtyPreferenceKey.self, value: isDirty ? [.profile] : [])
    }

    private func hydrateFromUser() {
        guard let user = model.user else { return }
        let display = user.displayName ?? ""
        let name = user.username ?? ""
        if !isDirty {
            displayName = display
            username = name
            savedDisplayName = display
            savedUsername = name
        }
    }

    private func restoreSavedValues() {
        displayName = savedDisplayName
        username = savedUsername
    }

    private func saveProfile() {
        isSaving = true
        Task {
            let saved = await model.updateProfile(displayName: displayName, username: username.isEmpty ? nil : username)
            if saved {
                savedDisplayName = displayName
                savedUsername = username
                statusMessage = "Profile saved."
            }
            isSaving = false
        }
    }

    private func changePassword() {
        guard passwordError == nil else { return }
        isChangingPassword = true
        Task {
            let changed = await model.changePassword(currentPassword: currentPassword, newPassword: newPassword)
            if changed {
                currentPassword = ""
                newPassword = ""
                confirmationPassword = ""
                statusMessage = "Password changed."
            }
            isChangingPassword = false
        }
    }

    private func generateExport() {
        Task {
            do {
                let value = try await model.exportAccountData()
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                let url = FileManager.default.temporaryDirectory
                    .appendingPathComponent("itu-export-\(UUID().uuidString).json")
                try encoder.encode(value).write(to: url, options: .atomic)
                exportURL = url
                statusMessage = "Personal data export generated."
            } catch is CancellationError {
                // The operation was cancelled or its account context changed.
            } catch {
                statusMessage = "Could not export account data: \(error.localizedDescription)"
            }
        }
    }

    private func clearPasswordDraft() {
        currentPassword = ""
        newPassword = ""
        confirmationPassword = ""
    }
}
