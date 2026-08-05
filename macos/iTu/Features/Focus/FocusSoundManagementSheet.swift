import SwiftUI
import UniformTypeIdentifiers

struct FocusSoundManagementSheet: View {
    let model: AppModel
    let onClose: () -> Void

    @State private var audioPlayer = AudioPlayerManager.shared
    @State private var showFileImporter = false
    @State private var soundToRename: FocusSound?
    @State private var renameText = ""
    @State private var soundToDelete: FocusSound?
    @State private var errorMessage: String?
    @State private var isUploading = false

    private var uploadedSounds: [FocusSound] {
        audioPlayer.sounds.filter { $0.source == "uploaded" || !$0.id.hasPrefix("builtin:") }
    }

    private var builtinSounds: [FocusSound] {
        audioPlayer.sounds.filter { $0.source == "builtin" || $0.id.hasPrefix("builtin:") }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Header
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Focus Sounds")
                        .font(.system(size: 16, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                    Text("Manage built-in ambient sounds and your custom uploads")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                Spacer()
                Button {
                    onClose()
                } label: {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(iTuTheme.inkDim)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 16)
            .background(iTuTheme.surfaceMuted)

            Divider()

            if let errorMessage {
                HStack(spacing: 8) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(iTuTheme.coral)
                    Text(errorMessage)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.coral)
                    Spacer()
                }
                .padding(.horizontal, 20)
                .padding(.vertical, 8)
                .background(iTuTheme.coral.opacity(0.1))
            }

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Upload section
                    HStack {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Upload Custom Sound")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(iTuTheme.ink)
                            Text("Supported formats: MP3, WAV, AAC, M4A")
                                .font(.system(size: 11))
                                .foregroundStyle(iTuTheme.inkDim)
                        }
                        Spacer()
                        Button {
                            showFileImporter = true
                        } label: {
                            HStack(spacing: 6) {
                                if isUploading {
                                    ProgressView()
                                        .controlSize(.small)
                                } else {
                                    Image(systemName: "square.and.arrow.up")
                                }
                                Text(isUploading ? "Uploading..." : "Upload Sound...")
                            }
                            .font(.system(size: 12, weight: .medium))
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .disabled(isUploading)
                    }
                    .padding(14)
                    .background(
                        RoundedRectangle(cornerRadius: 10, style: .continuous)
                            .fill(iTuTheme.surface)
                            .shadow(color: .black.opacity(0.04), radius: 2, y: 1)
                    )

                    // Uploaded sounds section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("YOUR CUSTOM SOUNDS (\(uploadedSounds.count))")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)

                        if uploadedSounds.isEmpty {
                            HStack {
                                Spacer()
                                Text("No custom audio files uploaded yet")
                                    .font(.system(size: 12))
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .padding(.vertical, 12)
                                Spacer()
                            }
                            .background(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(iTuTheme.border, style: StrokeStyle(lineWidth: 1, dash: [4]))
                            )
                        } else {
                            VStack(spacing: 6) {
                                ForEach(uploadedSounds) { sound in
                                    soundRow(sound: sound, isCustom: true)
                                }
                            }
                        }
                    }

                    // Built-in sounds section
                    VStack(alignment: .leading, spacing: 8) {
                        Text("BUILT-IN CATALOG (\(builtinSounds.count))")
                            .font(.system(size: 11, weight: .bold, design: .monospaced))
                            .foregroundStyle(iTuTheme.inkDim)

                        VStack(spacing: 6) {
                            ForEach(builtinSounds) { sound in
                                soundRow(sound: sound, isCustom: false)
                            }
                        }
                    }
                }
                .padding(20)
            }

            Divider()

            // Footer
            HStack {
                Spacer()
                Button("Done") {
                    onClose()
                }
                .keyboardShortcut(.defaultAction)
            }
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .background(iTuTheme.surfaceMuted)
        }
        .frame(width: 480, height: 520)
        .fileImporter(
            isPresented: $showFileImporter,
            allowedContentTypes: [.audio, .mp3, .mpeg4Audio, .wav, UTType(filenameExtension: "m4a") ?? .audio],
            allowsMultipleSelection: false
        ) { result in
            handleFileImport(result: result)
        }
        .alert("Rename Sound", isPresented: Binding(
            get: { soundToRename != nil },
            set: { if !$0 { soundToRename = nil } }
        )) {
            TextField("Sound Name", text: $renameText)
            Button("Cancel", role: .cancel) { soundToRename = nil }
            Button("Save") {
                if let sound = soundToRename {
                    Task { await performRename(sound: sound, newName: renameText) }
                }
            }
        } message: {
            Text("Enter a new display name for this custom sound.")
        }
        .alert("Delete Custom Sound?", isPresented: Binding(
            get: { soundToDelete != nil },
            set: { if !$0 { soundToDelete = nil } }
        )) {
            Button("Cancel", role: .cancel) { soundToDelete = nil }
            Button("Delete", role: .destructive) {
                if let sound = soundToDelete {
                    Task { await performDelete(sound: sound) }
                }
            }
        } message: {
            Text("Are you sure you want to delete \"\(soundToDelete?.name ?? "")\"? This action cannot be undone.")
        }
    }

    @ViewBuilder
    private func soundRow(sound: FocusSound, isCustom: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: isCustom ? "waveform.and.mic" : soundIcon(sound))
                .font(.system(size: 14))
                .foregroundStyle(audioPlayer.selectedSound?.id == sound.id ? iTuTheme.teal : iTuTheme.inkDim)
                .frame(width: 24, height: 24)

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    Text(sound.name)
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.ink)
                    if audioPlayer.selectedSound?.id == sound.id {
                        Text("Active")
                            .font(.system(size: 9, weight: .bold))
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(iTuTheme.teal.opacity(0.15))
                            .foregroundStyle(iTuTheme.teal)
                            .clipShape(Capsule())
                    }
                }
                Text(isCustom ? (sound.originalName ?? "Uploaded sound") : sound.category.capitalized)
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }

            Spacer()

            if isCustom {
                HStack(spacing: 4) {
                    Button {
                        soundToRename = sound
                        renameText = sound.name
                    } label: {
                        Image(systemName: "pencil")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.inkDim)
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                    .help("Rename sound")

                    Button {
                        soundToDelete = sound
                    } label: {
                        Image(systemName: "trash")
                            .font(.system(size: 12))
                            .foregroundStyle(iTuTheme.coral)
                            .padding(6)
                    }
                    .buttonStyle(.plain)
                    .help("Delete sound")
                }
            } else {
                Text("Built-in")
                    .font(.system(size: 11))
                    .foregroundStyle(iTuTheme.inkDim)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(
            RoundedRectangle(cornerRadius: 8, style: .continuous)
                .fill(audioPlayer.selectedSound?.id == sound.id ? iTuTheme.mintTint.opacity(0.4) : iTuTheme.surface)
        )
    }

    private func soundIcon(_ sound: FocusSound) -> String {
        switch sound.category.lowercased() {
        case "rain": return "cloud.rain.fill"
        case "waves", "water", "ocean": return "wave.3.forward"
        case "forest", "nature": return "leaf.fill"
        case "space": return "sparkles"
        case "fire", "fireplace": return "flame.fill"
        case "cafe": return "cup.and.saucer.fill"
        case "noise", "white noise": return "speaker.wave.2.fill"
        default: return "music.note"
        }
    }

    private func handleFileImport(result: Result<[URL], Error>) {
        switch result {
        case .success(let urls):
            guard let url = urls.first else { return }
            guard url.startAccessingSecurityScopedResource() else {
                errorMessage = "Permission denied for accessing the selected file."
                return
            }
            defer { url.stopAccessingSecurityScopedResource() }

            do {
                let data = try Data(contentsOf: url)
                let ext = url.pathExtension.lowercased()
                let mimeType: String
                switch ext {
                case "mp3": mimeType = "audio/mpeg"
                case "wav": mimeType = "audio/wav"
                case "m4a", "aac": mimeType = "audio/aac"
                default: mimeType = "audio/mpeg"
                }

                let name = url.deletingPathExtension().lastPathComponent
                isUploading = true
                errorMessage = nil

                Task {
                    do {
                        try await model.uploadFocusSound(
                            name: name,
                            fileData: data,
                            fileName: url.lastPathComponent,
                            mimeType: mimeType
                        )
                        isUploading = false
                    } catch {
                        isUploading = false
                        errorMessage = error.localizedDescription
                    }
                }
            } catch {
                errorMessage = "Could not read file data: \(error.localizedDescription)"
            }
        case .failure(let error):
            errorMessage = error.localizedDescription
        }
    }

    private func performRename(sound: FocusSound, newName: String) async {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        do {
            try await model.updateFocusSound(id: sound.id, name: trimmed)
            soundToRename = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    private func performDelete(sound: FocusSound) async {
        do {
            try await model.deleteFocusSound(id: sound.id)
            soundToDelete = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}
