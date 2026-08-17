import SwiftUI
import UIKit
import iTuDesignCore
import iTuNetworking

struct LoginView: View {
    @EnvironmentObject private var model: AppModel
    @Environment(\.colorScheme) private var colorScheme
    @State private var identifier = ""
    @State private var password = ""
    @State private var isSubmitting = false
    @State private var apiURL = APIConfiguration.baseURL.absoluteString
    @State private var endpointMessage: String?
    @State private var showEndpoint = false
    @FocusState private var focusedField: Field?

    private enum Field: Hashable { case identifier, password, endpoint }

    var body: some View {
        NavigationStack {
            ZStack {
                iTuTheme.color(iTuDesignTokens.surfaceMuted, scheme: colorScheme)
                    .ignoresSafeArea()

                ScrollView {
                    VStack(alignment: .leading, spacing: 24) {
                        header
                        accountPanel
                        connectionPanel
                        Text("Your work, routines, and learning stay available offline and sync when you’re back online.")
                            .font(.footnote)
                            .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(.horizontal, 4)
                    }
                    .frame(maxWidth: 560)
                    .padding(.horizontal, 20)
                    .padding(.vertical, 28)
                }
                .scrollDismissesKeyboard(.interactively)
            }
            .toolbar(.hidden, for: .navigationBar)
        }
        .alert("Connection", isPresented: Binding(
            get: { endpointMessage != nil },
            set: { if !$0 { endpointMessage = nil } }
        )) {
            Button("OK", role: .cancel) { endpointMessage = nil }
        } message: {
            Text(endpointMessage ?? "")
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 14) {
            Image(systemName: "leaf.fill")
                .font(.title2.weight(.semibold))
                .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
                .frame(width: 48, height: 48)
                .background(
                    iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme).opacity(0.14),
                    in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                )
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 6) {
                Text("Welcome back")
                    .font(.system(.largeTitle, design: .rounded).weight(.bold))
                Text("Make space for what matters.")
                    .font(.title3.weight(.medium))
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
            }
        }
        .accessibilityElement(children: .combine)
    }

    private var accountPanel: some View {
        VStack(alignment: .leading, spacing: 18) {
            VStack(alignment: .leading, spacing: 5) {
                Text("Sign in to iTu")
                    .font(.headline)
                Text("Pick up where you left off.")
                    .font(.subheadline)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
            }

            loginField(
                title: "Email or username",
                placeholder: "you@example.com",
                text: $identifier,
                field: .identifier,
                contentType: .username,
                submitLabel: .next
            ) {
                focusedField = .password
            }

            loginField(
                title: "Password",
                placeholder: "Enter your password",
                text: $password,
                field: .password,
                contentType: .password,
                submitLabel: .done,
                secure: true,
                onSubmit: submit
            )

            Button(action: submit) {
                HStack(spacing: 10) {
                    Text("Sign in")
                        .fontWeight(.semibold)
                    Spacer()
                    if isSubmitting {
                        ProgressView()
                            .tint(.white)
                    } else {
                        Image(systemName: "arrow.right")
                            .font(.subheadline.weight(.bold))
                    }
                }
                .frame(minHeight: 24)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .frame(maxWidth: .infinity)
            .disabled(!canSubmit || isSubmitting)
            .accessibilityHint(isSubmitting ? "Signing in" : "Signs in to your iTu account")
        }
        .padding(20)
        .iTuMobilePanel(cornerRadius: 22)
    }

    private var connectionPanel: some View {
        DisclosureGroup(isExpanded: $showEndpoint) {
            VStack(alignment: .leading, spacing: 12) {
                TextField("https://api.example.com", text: $apiURL)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    .autocorrectionDisabled()
                    .focused($focusedField, equals: .endpoint)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 50)
                    .background(
                        iTuTheme.color(iTuDesignTokens.surfaceMuted, scheme: colorScheme),
                        in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                    )
                    .overlay {
                        RoundedRectangle(cornerRadius: 14, style: .continuous)
                            .stroke(iTuTheme.color(iTuDesignTokens.borderSoft, scheme: colorScheme), lineWidth: 1)
                    }
                    .accessibilityLabel("API endpoint URL")

                Button("Save endpoint") {
                    do {
                        try IOSAPIEndpoint.save(apiURL)
                        apiURL = APIConfiguration.baseURL.absoluteString
                        endpointMessage = "API endpoint saved."
                    } catch {
                        endpointMessage = error.localizedDescription
                    }
                }
                .font(.subheadline.weight(.semibold))

                Text("Use an HTTPS endpoint reachable from this device. HTTP is intended for local development only.")
                    .font(.caption)
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.top, 12)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: "server.rack")
                    .foregroundStyle(iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Server connection")
                        .font(.subheadline.weight(.semibold))
                    Text(endpointSummary)
                        .font(.caption)
                        .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }
        }
        .tint(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))
        .padding(.horizontal, 18)
        .padding(.vertical, 16)
        .iTuMobilePanel(cornerRadius: 18)
    }

    private func loginField(
        title: String,
        placeholder: String,
        text: Binding<String>,
        field: Field,
        contentType: UITextContentType,
        submitLabel: SubmitLabel,
        secure: Bool = false,
        onSubmit: @escaping () -> Void
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title)
                .font(.caption.weight(.semibold))
                .foregroundStyle(iTuTheme.color(iTuDesignTokens.inkDim, scheme: colorScheme))

            Group {
                if secure {
                    SecureField(placeholder, text: text)
                } else {
                    TextField(placeholder, text: text)
                }
            }
            .textContentType(contentType)
            .textInputAutocapitalization(.never)
            .autocorrectionDisabled()
            .focused($focusedField, equals: field)
            .submitLabel(submitLabel)
            .onSubmit(onSubmit)
            .padding(.horizontal, 14)
            .frame(minHeight: 50)
            .background(
                iTuTheme.color(iTuDesignTokens.surfaceMuted, scheme: colorScheme),
                in: RoundedRectangle(cornerRadius: 14, style: .continuous)
            )
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(
                        focusedField == field
                            ? iTuTheme.color(iTuDesignTokens.teal, scheme: colorScheme)
                            : iTuTheme.color(iTuDesignTokens.borderSoft, scheme: colorScheme),
                        lineWidth: focusedField == field ? 2 : 1
                    )
            }
        }
    }

    private var canSubmit: Bool {
        !identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !password.isEmpty
    }

    private var endpointSummary: String {
        guard let url = URL(string: apiURL.trimmingCharacters(in: .whitespacesAndNewlines)),
              let host = url.host else {
            return "Endpoint needs attention"
        }
        return "\(url.scheme?.uppercased() ?? "HTTP") · \(host)"
    }

    private func submit() {
        guard !isSubmitting, canSubmit else { return }
        isSubmitting = true
        let submittedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
        let submittedPassword = password
        Task { @MainActor in
            await model.login(identifier: submittedIdentifier, password: submittedPassword)
            isSubmitting = false
        }
    }
}
