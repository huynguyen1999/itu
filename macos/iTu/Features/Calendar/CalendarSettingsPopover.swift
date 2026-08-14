import SwiftUI

struct CalendarSettingsPopover: View {
    @Environment(AppModel.self) private var model
    @State private var sources: [ExternalCalendarModel] = []
    @State private var isLoadingSources = false
    @State private var sourceError: String?
    @State private var newIcsUrl = ""
    @State private var newIcsName = ""
    @State private var isAddingIcs = false
    @State private var addIcsError: String?

    private var visibleKinds: Set<String> {
        Set(model.calendarPreferences.visibleKinds)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            Text("Calendar Settings")
                .font(.system(size: 14, weight: .bold))
                .foregroundStyle(iTuTheme.ink)

            VStack(alignment: .leading, spacing: 8) {
                Toggle("Show completed tasks", isOn: Binding(
                    get: { model.calendarPreferences.showCompleted },
                    set: { value in Task { await model.updateCalendarPreferences(["showCompleted": .bool(value)]) } }
                ))
                .font(.system(size: 12))

                HStack {
                    Text("Week starts on")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Picker("Week starts on", selection: Binding(
                        get: { model.calendarPreferences.weekStart },
                        set: { value in Task { await model.updateCalendarPreferences(["weekStart": .string(value)]) } }
                    )) {
                        Text("Monday").tag("MONDAY")
                        Text("Sunday").tag("SUNDAY")
                    }
                    .labelsHidden()
                    .pickerStyle(.menu)
                    .frame(width: 110)
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Text("VISIBLE KINDS")
                    .font(.system(size: 10, weight: .bold, design: .monospaced))
                    .foregroundStyle(iTuTheme.inkDim)

                ForEach(CalendarKind.allCases) { kind in
                    Toggle(kind.title, isOn: Binding(
                        get: { visibleKinds.contains(kind.rawValue) },
                        set: { value in updateVisibleKind(kind.rawValue, visible: value) }
                    ))
                    .font(.system(size: 12))
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("CALENDAR SUBSCRIPTIONS")
                        .font(.system(size: 10, weight: .bold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                    Spacer()
                    if isLoadingSources {
                        ProgressView().controlSize(.small)
                    } else {
                        Button {
                            Task { await loadSources() }
                        } label: {
                            Image(systemName: "arrow.clockwise")
                        }
                        .buttonStyle(.borderless)
                        .font(.system(size: 11))
                        .accessibilityLabel("Refresh calendar subscriptions")
                    }
                }

                // Add ICS Form
                VStack(alignment: .leading, spacing: 6) {
                    TextField("https://example.com/calendar.ics", text: $newIcsUrl)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 11))
                    HStack(spacing: 6) {
                        TextField("Feed name (optional)", text: $newIcsName)
                            .textFieldStyle(.roundedBorder)
                            .font(.system(size: 11))
                        Button(isAddingIcs ? "Adding…" : "Add") {
                            addIcsFeed()
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(iTuTheme.teal)
                        .controlSize(.small)
                        .disabled(newIcsUrl.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isAddingIcs)
                    }
                    if let addIcsError {
                        Text(addIcsError)
                            .font(.system(size: 10))
                            .foregroundStyle(iTuTheme.coral)
                    }
                }
                .padding(8)
                .background(iTuTheme.surfaceMuted)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                // Sources list
                if sources.isEmpty && !isLoadingSources {
                    Text("No connected subscriptions yet.")
                        .font(.system(size: 11))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.vertical, 4)
                } else {
                    ScrollView {
                        VStack(spacing: 6) {
                            ForEach(sources) { source in
                                HStack(spacing: 8) {
                                    Circle()
                                        .fill(Color.fromHex(source.color) ?? iTuTheme.teal)
                                        .frame(width: 8, height: 8)

                                    VStack(alignment: .leading, spacing: 1) {
                                        Text(source.name)
                                            .font(.system(size: 11, weight: .medium))
                                            .foregroundStyle(iTuTheme.ink)
                                            .lineLimit(1)
                                        if let lastSync = source.lastSuccessfulSyncAt {
                                            Text("Synced \(formattedDate(lastSync))")
                                                .font(.system(size: 9, design: .monospaced))
                                                .foregroundStyle(iTuTheme.inkDim)
                                        }
                                    }

                                    Spacer()

                                    Button {
                                        Task { await refreshSource(source.id) }
                                    } label: {
                                        Image(systemName: "arrow.clockwise")
                                    }
                                    .buttonStyle(.borderless)
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.inkDim)
                                    .accessibilityLabel("Refresh \(source.name)")

                                    Button {
                                        Task { await toggleSourceVisibility(source) }
                                    } label: {
                                        Image(systemName: source.visible ? "eye" : "eye.slash")
                                    }
                                    .buttonStyle(.borderless)
                                    .font(.system(size: 11))
                                    .foregroundStyle(source.visible ? iTuTheme.teal : iTuTheme.inkDim)
                                    .accessibilityLabel("Toggle visibility for \(source.name)")

                                    Button {
                                        Task { await deleteSource(source.id) }
                                    } label: {
                                        Image(systemName: "trash")
                                    }
                                    .buttonStyle(.borderless)
                                    .font(.system(size: 11))
                                    .foregroundStyle(iTuTheme.coral)
                                    .accessibilityLabel("Delete \(source.name)")
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 6)
                                .background(iTuTheme.surface)
                                .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
                            }
                        }
                    }
                    .frame(maxHeight: 140)
                }
            }
        }
        .padding(16)
        .frame(width: 320)
        .task {
            await loadSources()
        }
    }

    private func updateVisibleKind(_ kind: String, visible: Bool) {
        var kinds = model.calendarPreferences.visibleKinds
        if visible {
            if !kinds.contains(kind) { kinds.append(kind) }
        } else {
            kinds.removeAll { $0 == kind }
        }
        Task { await model.updateCalendarPreferences(["visibleKinds": .array(kinds.map(JSONValue.string))]) }
    }

    private func loadSources() async {
        isLoadingSources = true
        sourceError = nil
        do {
            sources = try await model.apiClient.fetchCalendarSources()
        } catch {
            sourceError = "Could not load calendar sources."
        }
        isLoadingSources = false
    }

    private func addIcsFeed() {
        let trimmedUrl = newIcsUrl.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedName = newIcsName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedUrl.isEmpty else { return }

        isAddingIcs = true
        addIcsError = nil
        Task {
            do {
                let created = try await model.apiClient.createIcsCalendar(
                    url: trimmedUrl,
                    name: trimmedName.isEmpty ? "ICS Feed" : trimmedName
                )
                sources.append(created)
                newIcsUrl = ""
                newIcsName = ""
            } catch {
                addIcsError = "Failed to connect ICS feed. Verify URL format."
            }
            isAddingIcs = false
        }
    }

    private func refreshSource(_ id: String) async {
        do {
            try await model.apiClient.refreshCalendarSource(id: id)
            await loadSources()
        } catch {}
    }

    private func toggleSourceVisibility(_ source: ExternalCalendarModel) async {
        do {
            try await model.apiClient.updateCalendarSource(id: source.id, visible: !source.visible)
            await loadSources()
        } catch {}
    }

    private func deleteSource(_ id: String) async {
        do {
            try await model.apiClient.deleteCalendarSource(id: id)
            sources.removeAll { $0.id == id }
        } catch {}
    }

    private func formattedDate(_ isoString: String) -> String {
        guard let date = iTuDateSupport.parse(isoString) else { return isoString }
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter.string(from: date)
    }
}
