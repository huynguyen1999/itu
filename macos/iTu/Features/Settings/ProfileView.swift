import AppKit
import SwiftUI
import UniformTypeIdentifiers

struct ProfileView: View {
    @Environment(AppModel.self) private var model

    @State private var displayName: String = ""
    @State private var username: String = ""
    @State private var showPasswordModal = false
    @State private var currentPassword = ""
    @State private var newPassword = ""
    @State private var confirmPassword = ""
    @State private var isSaving = false
    @State private var isChangingPassword = false
    @State private var showDeleteConfirm = false
    @State private var deletePassword = ""
    @State private var statusMessage: String?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                if let user = model.user {
                    // Profile Card
                    HStack(spacing: 20) {
                        Text(String(user.accountLabel.prefix(1)).uppercased())
                            .font(.system(size: 28, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 64, height: 64)
                            .background(iTuTheme.teal)
                            .clipShape(Circle())

                        VStack(alignment: .leading, spacing: 4) {
                            Text(user.accountLabel)
                                .font(.system(size: 18, weight: .bold))
                                .foregroundStyle(iTuTheme.ink)
                            Text(user.email ?? user.username ?? "Account")
                                .font(.system(size: 13))
                                .foregroundStyle(iTuTheme.inkDim)
                        }

                        Spacer()
                    }
                    .padding(20)
                    .iTuPanel(radius: 16)

                    // Profile Details Form
                    VStack(alignment: .leading, spacing: 16) {
                        Text("Personal Information")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)

                        VStack(alignment: .leading, spacing: 6) {
                            Text("USERNAME")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            TextField("Username", text: $username)
                                .textFieldStyle(.roundedBorder)
                                .frame(maxWidth: 360)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("EMAIL")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            TextField("Email", text: .constant(user.email ?? ""))
                                .textFieldStyle(.roundedBorder)
                                .disabled(true)
                                .frame(maxWidth: 360)
                            Text("Your email address cannot be changed.")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkFaint)
                        }

                        VStack(alignment: .leading, spacing: 6) {
                            Text("DISPLAY NAME")
                                .font(.system(size: 10, weight: .bold, design: .monospaced))
                                .foregroundStyle(iTuTheme.inkFaint)
                            TextField("Display Name", text: $displayName)
                                .textFieldStyle(.roundedBorder)
                                .frame(maxWidth: 360)
                        }

                        Button {
                            isSaving = true
                            statusMessage = nil
                            Task {
                                let saved = await model.updateProfile(displayName: displayName, username: username)
                                isSaving = false
                                statusMessage = saved ? "Profile updated successfully." : model.errorMessage
                            }
                        } label: {
                            if isSaving {
                                ProgressView()
                                    .controlSize(.small)
                            }
                            Text(isSaving ? "Saving…" : "Save Changes")
                        }
                        .buttonStyle(iTuPrimaryButtonStyle(height: 34))
                        .disabled(isSaving || displayName.count > 120 || username.count > 30)

                        if let statusMessage {
                            Text(statusMessage)
                                .font(.system(size: 12))
                                .foregroundStyle(statusMessage.contains("success") ? iTuTheme.mint : iTuTheme.coral)
                        }
                    }
                    .padding(20)
                    .iTuPanel(radius: 16)

                    // Account Actions
                    VStack(alignment: .leading, spacing: 14) {
                        Text("Security & Data")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(iTuTheme.ink)

                        HStack(spacing: 12) {
                            Button("Change Password") {
                                showPasswordModal = true
                            }
                            .buttonStyle(iTuSecondaryButtonStyle(height: 34))

                            Button("Export Account Data") {
                                exportAccountData()
                            }
                            .buttonStyle(iTuSecondaryButtonStyle(height: 34))
                        }

                        Divider()

                        VStack(alignment: .leading, spacing: 8) {
                            Text("Delete account")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.coral)
                            Text("Permanently delete your account and study data.")
                                .font(.system(size: 12))
                                .foregroundStyle(iTuTheme.inkDim)
                            SecureField("Confirm password (optional)", text: $deletePassword)
                                .textFieldStyle(.roundedBorder)
                                .frame(maxWidth: 300)
                            Button("Delete Account", role: .destructive) {
                                showDeleteConfirm = true
                            }
                            .buttonStyle(iTuDangerButtonStyle())
                        }
                    }
                    .padding(20)
                    .iTuPanel(radius: 16)
                } else {
                    Text("No active session found.")
                        .foregroundStyle(iTuTheme.inkDim)
                }
            }
            .padding(24)
            .frame(maxWidth: 980)
            .frame(maxWidth: .infinity, alignment: .topLeading)
        }
        .iTuPinnedHeader { headerBar }
        .background(iTuTheme.canvas)
        .onAppear {
            if let user = model.user {
                displayName = user.displayName ?? ""
                username = user.username ?? ""
            }
        }
        .sheet(isPresented: $showPasswordModal) {
            VStack(spacing: 20) {
                Text("Change Password")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(iTuTheme.ink)

                SecureField("Current Password", text: $currentPassword)
                    .textFieldStyle(.roundedBorder)

                SecureField("New Password", text: $newPassword)
                    .textFieldStyle(.roundedBorder)

                SecureField("Confirm Password", text: $confirmPassword)
                    .textFieldStyle(.roundedBorder)

                HStack {
                    Button("Cancel") { showPasswordModal = false }
                        .buttonStyle(iTuGhostButtonStyle())
                    Spacer()
                    Button {
                        isChangingPassword = true
                        Task {
                            let changed = await model.changePassword(
                                currentPassword: currentPassword,
                                newPassword: newPassword
                            )
                            isChangingPassword = false
                            if changed {
                                currentPassword = ""
                                newPassword = ""
                                confirmPassword = ""
                                showPasswordModal = false
                                statusMessage = "Password changed successfully."
                            }
                        }
                    } label: {
                        Text(isChangingPassword ? "Updating…" : "Update Password")
                    }
                    .buttonStyle(iTuPrimaryButtonStyle())
                    .disabled(isChangingPassword || currentPassword.isEmpty || newPassword.count < 8 || newPassword != confirmPassword)
                }
            }
            .padding(24)
            .frame(width: 360, height: 240)
        }
        .alert("Delete account?", isPresented: $showDeleteConfirm) {
            Button("Delete Account", role: .destructive) {
                Task {
                    _ = await model.deleteAccount(password: deletePassword.isEmpty ? nil : deletePassword)
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This permanently deletes your iTu account and study data. This action cannot be undone.")
        }
    }

    private var headerBar: some View {
        VStack(alignment: .leading, spacing: 6) {
            iTuSectionLabel(title: "ACCOUNT", color: iTuTheme.teal)
            Text("User Profile")
                .font(.system(size: 24, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)
            Text("Manage account settings, credentials, and data.")
                .font(.system(size: 13))
                .foregroundStyle(iTuTheme.inkDim)
        }
        .padding(.horizontal, 28)
        .padding(.vertical, 18)
    }

    private func exportAccountData() {
        Task {
            do {
                let value = try await model.exportAccountData()
                let panel = NSSavePanel()
                panel.nameFieldStringValue = "itu-export-\(exportDateString()).json"
                panel.allowedContentTypes = [.json]
                guard panel.runModal() == .OK, let url = panel.url else { return }
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                try encoder.encode(value).write(to: url, options: .atomic)
                statusMessage = "Personal data export generated."
            } catch {
                statusMessage = error.localizedDescription
            }
        }
    }

    private func exportDateString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }
}
