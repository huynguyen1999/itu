import SwiftUI

struct JournalSidebarView: View {
    @Environment(AppModel.self) private var model
    @Binding var destination: JournalDestination
    @Binding var searchQuery: String
    @Binding var selectedTagID: String
    var onNewNoteClicked: () -> Void

    private var allNotes: [JournalNoteModel] {
        model.journalNotes.filter { $0.deletedAt == nil }
    }

    private var dailyNotesCount: Int {
        allNotes.filter { $0.kind == "DAILY" }.count
    }

    private var dailyReviewsCount: Int {
        allNotes.filter { $0.kind == "DAILY_REVIEW" || $0.dailyReview != nil }.count
    }

    private var weeklyReviewsCount: Int {
        allNotes.filter { $0.kind == "WEEKLY_REVIEW" || $0.weeklyReview != nil }.count
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            // Header
            VStack(alignment: .leading, spacing: 4) {
                Text("WORKSPACE")
                    .font(.system(size: 10, weight: .bold))
                    .tracking(1.4)
                    .foregroundStyle(iTuTheme.mint)
                Text("Journal")
                    .font(.system(size: 22, weight: .bold, design: .rounded))
                    .foregroundStyle(iTuTheme.ink)
            }
            .padding(.horizontal, 18)
            .padding(.top, 20)
            .padding(.bottom, 14)

            // Search Bar
            HStack(spacing: 6) {
                Image(systemName: "magnifyingglass")
                    .font(.system(size: 12))
                    .foregroundStyle(iTuTheme.inkDim)
                TextField("Search journal…", text: $searchQuery)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(iTuTheme.surface)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(iTuTheme.border, lineWidth: 1)
            }
            .padding(.horizontal, 14)
            .padding(.bottom, 14)

            Divider().overlay(iTuTheme.border)

            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    // TRACK Section
                    VStack(alignment: .leading, spacing: 3) {
                        sectionHeader("TRACK")
                        navItem(title: "Overview", icon: "square.grid.2x2", dest: .overview)
                        navItem(title: "Daily Notes", icon: "calendar", dest: .dailyNotes, count: dailyNotesCount)
                        navItem(title: "Daily Reviews", icon: "sun.max", dest: .dailyReviews, count: dailyReviewsCount)
                        navItem(title: "Weekly Reviews", icon: "sparkles", dest: .weeklyReviews, count: weeklyReviewsCount)
                    }

                    // LIBRARY Section
                    VStack(alignment: .leading, spacing: 3) {
                        sectionHeader("LIBRARY")
                        navItem(title: "All Notes", icon: "doc.text", dest: .notes, count: allNotes.count)
                        navItem(title: "Templates", icon: "square.stack", dest: .templates, count: model.journalTemplates.filter { $0.archivedAt == nil }.count)
                    }

                    // TAGS Section
                    let tags = model.journalTags
                    if !tags.isEmpty {
                        VStack(alignment: .leading, spacing: 3) {
                            sectionHeader("TAGS")
                            ForEach(tags) { tag in
                                tagItem(tag)
                            }
                        }
                    }
                }
                .padding(.horizontal, 10)
                .padding(.top, 12)
            }

            Spacer()

            Divider().overlay(iTuTheme.border)

            // New Note Action
            Button {
                onNewNoteClicked()
            } label: {
                Label("New Note", systemImage: "plus")
                    .font(.system(size: 13, weight: .semibold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(iTuTheme.teal)
            .padding(14)
        }
        .frame(width: 220)
        .background(iTuTheme.surfaceMuted)
        .overlay(alignment: .trailing) {
            Rectangle().fill(iTuTheme.border).frame(width: 1)
        }
    }

    private func sectionHeader(_ title: String) -> some View {
        Text(title)
            .font(.system(size: 10, weight: .bold, design: .monospaced))
            .foregroundStyle(iTuTheme.inkDim)
            .padding(.horizontal, 10)
            .padding(.top, 4)
            .padding(.bottom, 2)
    }

    private func navItem(title: String, icon: String, dest: JournalDestination, count: Int? = nil) -> some View {
        let isSelected = destination == dest && selectedTagID.isEmpty
        return Button {
            selectedTagID = ""
            destination = dest
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 13))
                    .frame(width: 18)
                    .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)

                Text(title)
                    .font(.system(size: 13, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? iTuTheme.ink : iTuTheme.inkDim)

                Spacer()

                if let count, count > 0 {
                    Text("\(count)")
                        .font(.system(size: 10, weight: .semibold, design: .monospaced))
                        .foregroundStyle(iTuTheme.inkDim)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 1)
                        .background(iTuTheme.surface)
                        .clipShape(Capsule())
                }
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(isSelected ? iTuTheme.teal.opacity(0.1) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
    }

    private func tagItem(_ tag: JournalTagModel) -> some View {
        let isSelected = selectedTagID == tag.id
        return Button {
            selectedTagID = tag.id
            destination = .notes
        } label: {
            HStack(spacing: 8) {
                Circle()
                    .fill(iTuTheme.teal)
                    .frame(width: 6, height: 6)

                Text(tag.name)
                    .font(.system(size: 12, weight: isSelected ? .semibold : .regular))
                    .foregroundStyle(isSelected ? iTuTheme.teal : iTuTheme.inkDim)

                Spacer()
            }
            .padding(.horizontal, 10)
            .padding(.vertical, 5)
            .background(isSelected ? iTuTheme.teal.opacity(0.1) : Color.clear)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
        }
        .buttonStyle(.plain)
    }
}
