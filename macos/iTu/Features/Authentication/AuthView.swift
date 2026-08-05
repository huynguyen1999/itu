import SwiftUI

struct AuthView: View {
    @Environment(AppModel.self) private var model
    @State private var identifier = ""
    @State private var password = ""
    @State private var displayName = ""
    @State private var isRegistration = false

    var body: some View {
        HStack(spacing: 0) {
            sanctuaryPanel
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            formPanel
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(iTuTheme.canvas)
        }
        .ignoresSafeArea()
        .preferredColorScheme(.light)
    }

    private var sanctuaryPanel: some View {
        ZStack {
            LinearGradient(
                colors: [iTuTheme.forest, iTuTheme.forestDeep],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            Circle()
                .fill(iTuTheme.mint.opacity(0.09))
                .frame(width: 520, height: 520)
                .blur(radius: 1)
                .offset(x: -170, y: 240)

            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 12) {
                    iTuBrandMark(size: 42)
                    Text("iTu")
                        .font(.system(size: 25, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)
                }

                Spacer()

                iTuSectionLabel(title: "Your daily sanctuary", color: iTuTheme.mint)

                Text("Plan with clarity.\nFocus without friction.")
                    .font(.system(size: 38, weight: .bold, design: .rounded))
                    .tracking(-1.1)
                    .foregroundStyle(.white)
                    .padding(.top, 12)

                Text("Your workspace is saved on this Mac first, so the important things remain available with or without a connection.")
                    .font(.system(size: 15))
                    .foregroundStyle(Color.white.opacity(0.62))
                    .lineSpacing(4)
                    .frame(maxWidth: 440, alignment: .leading)
                    .padding(.top, 18)

                HStack(spacing: 20) {
                    feature("internaldrive", "Offline ready")
                    feature("arrow.triangle.2.circlepath", "Syncs quietly")
                    feature("lock.shield", "Private by design")
                }
                .padding(.top, 34)
            }
            .padding(48)
        }
    }

    private var formPanel: some View {
        VStack {
            Spacer()

            VStack(alignment: .leading, spacing: 24) {
                VStack(alignment: .leading, spacing: 7) {
                    iTuSectionLabel(title: isRegistration ? "Begin your workspace" : "Welcome back", color: iTuTheme.teal)
                    Text(isRegistration ? "Create your account" : "Continue to iTu")
                        .font(.system(size: 29, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                    Text(isRegistration ? "One account keeps every device in step." : "Sign in to restore your personal workspace.")
                        .font(.system(size: 14))
                        .foregroundStyle(iTuTheme.inkDim)
                }

                HStack(spacing: 4) {
                    authMode("Sign in", value: false)
                    authMode("Create account", value: true)
                }
                .padding(4)
                .background(iTuTheme.borderSoft)
                .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

                VStack(spacing: 14) {
                    if isRegistration {
                        iTuField(title: "Display name", systemImage: "person", text: $displayName)
                    }
                    iTuField(title: "Email or username", systemImage: "at", text: $identifier)
                    iTuSecureField(title: "Password", systemImage: "lock", text: $password)
                }

                Button {
                    Task {
                        await model.authenticate(
                            identifier: identifier,
                            password: password,
                            displayName: isRegistration ? displayName : nil,
                            isRegistration: isRegistration
                        )
                    }
                } label: {
                    HStack {
                        if model.isAuthenticating {
                            ProgressView()
                                .controlSize(.small)
                                .tint(.white)
                        }
                        Text(isRegistration ? "Create account" : "Sign in")
                        Spacer()
                        Image(systemName: "arrow.right")
                    }
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(iTuPrimaryButtonStyle())
                .disabled(isActionDisabled)
                .opacity(isActionDisabled ? 0.58 : 1)

                HStack(spacing: 7) {
                    Image(systemName: "internaldrive")
                    Text("Cached tasks remain available when iTu is offline.")
                }
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkFaint)
            }
            .frame(maxWidth: 390)
            .padding(44)

            Spacer()
        }
    }

    private func authMode(_ title: String, value: Bool) -> some View {
        Button {
            isRegistration = value
        } label: {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(isRegistration == value ? iTuTheme.ink : iTuTheme.inkDim)
                .frame(maxWidth: .infinity)
                .frame(height: 34)
                .background(isRegistration == value ? iTuTheme.surface : Color.clear)
                .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                .shadow(color: iTuTheme.forest.opacity(isRegistration == value ? 0.06 : 0), radius: 2, y: 1)
        }
        .buttonStyle(.plain)
    }

    private func feature(_ icon: String, _ title: String) -> some View {
        HStack(spacing: 7) {
            Image(systemName: icon)
                .foregroundStyle(iTuTheme.mint)
            Text(title)
                .foregroundStyle(Color.white.opacity(0.72))
        }
        .font(.system(size: 11, weight: .medium))
    }

    private var isActionDisabled: Bool {
        identifier.isEmpty
            || password.isEmpty
            || (isRegistration && password.count < 8)
            || model.isAuthenticating
    }
}

private struct iTuField: View {
    let title: String
    let systemImage: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: systemImage)
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(width: 16)
            TextField(title, text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .textContentType(title == "Display name" ? .name : .username)
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }
}

private struct iTuSecureField: View {
    let title: String
    let systemImage: String
    @Binding var text: String

    var body: some View {
        HStack(spacing: 11) {
            Image(systemName: systemImage)
                .foregroundStyle(iTuTheme.inkFaint)
                .frame(width: 16)
            SecureField(title, text: $text)
                .textFieldStyle(.plain)
                .font(.system(size: 14))
                .textContentType(.password)
        }
        .padding(.horizontal, 14)
        .frame(height: 46)
        .background(iTuTheme.surface)
        .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 11, style: .continuous)
                .stroke(iTuTheme.border, lineWidth: 1)
        }
    }
}
