import SwiftUI

struct PlanningView: View {
    @Environment(AppModel.self) private var model
    let section: AppSection

    @State private var searchText = ""
    @State private var showGroupAndSortPopover = false
    @State private var showViewOptionsPopover = false

    var body: some View {
        VStack(spacing: 0) {
            // Unified Planning Top Bar Header (Matching Web Plan / All Tasks)
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    iTuSectionLabel(title: section == .today ? "Daily Planning" : "Smart List", color: iTuTheme.teal)
                    Text(model.selectedTaskListId.flatMap { id in
                        model.taskLists.first(where: { $0.id == id })?.name
                    } ?? (section == .inbox ? "All Tasks" : section.title))
                        .font(.system(size: 24, weight: .bold, design: .rounded))
                        .foregroundStyle(iTuTheme.ink)
                }

                Spacer()

                // Search Bar
                HStack(spacing: 8) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkFaint)
                    TextField("Search tasks…", text: $searchText)
                        .textFieldStyle(.plain)
                        .font(.system(size: 13))
                }
                .padding(.horizontal, 10)
                .frame(width: 170, height: 32)
                .background(iTuTheme.surface)
                .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .stroke(iTuTheme.border, lineWidth: 1)
                }

                // Group & Sort Button (≡ / ListFilter icon button matching Web Image 3)
                Button {
                    showGroupAndSortPopover.toggle()
                } label: {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 32, height: 32)
                        .background(iTuTheme.mintTint.opacity(0.6))
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(iTuTheme.teal.opacity(0.3), lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                .help("Group & Sort options")
                .popover(isPresented: $showGroupAndSortPopover, arrowEdge: .top) {
                    GroupAndSortPopoverView(onDismiss: { showGroupAndSortPopover = false })
                }

                // View Options Menu Button (... icon button matching Web Image 2)
                Button {
                    showViewOptionsPopover.toggle()
                } label: {
                    Image(systemName: "ellipsis")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(iTuTheme.inkDim)
                        .frame(width: 32, height: 32)
                        .background(iTuTheme.surface)
                        .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                        .overlay {
                            RoundedRectangle(cornerRadius: 8, style: .continuous)
                                .stroke(iTuTheme.border, lineWidth: 1)
                        }
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
                .help("View options")
                .popover(isPresented: $showViewOptionsPopover, arrowEdge: .top) {
                    ViewOptionsPopoverView(onDismiss: { showViewOptionsPopover = false })
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 24)
            .padding(.bottom, 16)
            .background(iTuTheme.surface.opacity(0.88))
            .overlay(alignment: .bottom) {
                Rectangle()
                    .fill(iTuTheme.border)
                    .frame(height: 1)
            }

            // Main Content Area
            if model.planningViewMode == .matrix {
                EisenhowerMatrixView()
            } else {
                TaskListView(
                    section: section,
                    filterQuery: searchText,
                    taskListId: model.selectedTaskListId
                )
            }
        }
    }
}

// MARK: - Group & Sort Popover View (Matching Web Image 3 100%)

private struct GroupAndSortPopoverView: View {
    @Environment(AppModel.self) private var model
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Group & Sort")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)

            Rectangle()
                .fill(iTuTheme.border)
                .frame(height: 1)

            Text("Task grouping will become available with server-backed lists and sections.")
                .font(.system(size: 11))
                .foregroundStyle(iTuTheme.inkDim)
                .fixedSize(horizontal: false, vertical: true)

            // Sort by Submenu
            Menu {
                Button("Manual order") { model.sortOption = .manual; onDismiss() }
                Button("Due date") { model.sortOption = .dueDate; onDismiss() }
                Button("Priority") { model.sortOption = .priority; onDismiss() }
                Button("Title") { model.sortOption = .title; onDismiss() }
            } label: {
                HStack {
                    Image(systemName: "line.3.horizontal.decrease")
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkDim)
                    Text("Sort by")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                    Spacer()
                    Text(model.sortOption.title)
                        .font(.system(size: 12))
                        .foregroundStyle(iTuTheme.inkFaint)
                    Image(systemName: "chevron.right")
                        .font(.system(size: 10))
                        .foregroundStyle(iTuTheme.inkFaint)
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .menuStyle(.borderlessButton)
            .menuIndicator(.hidden)
            .pointingHandCursor()

            Rectangle()
                .fill(iTuTheme.border)
                .frame(height: 1)

            // Restore defaults
            Button {
                model.sortOption = .priority
                onDismiss()
            } label: {
                Text("Restore defaults")
                    .font(.system(size: 13, weight: .medium))
                    .foregroundStyle(iTuTheme.ink)
                    .padding(.vertical, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
            .pointingHandCursor()
        }
        .padding(14)
        .frame(width: 240)
        .background(iTuTheme.surface)
    }
}

// MARK: - View Options Popover View (Matching Web Image 2 100%)

private struct ViewOptionsPopoverView: View {
    @Environment(AppModel.self) private var model
    let onDismiss: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("View")
                .font(.system(size: 15, weight: .bold, design: .rounded))
                .foregroundStyle(iTuTheme.ink)

            // Layout Picker: List vs Matrix
            HStack(spacing: 8) {
                Button {
                    model.planningViewMode = .list
                } label: {
                    HStack(spacing: 5) {
                        if model.planningViewMode == .list {
                            Circle()
                                .fill(iTuTheme.ink)
                                .frame(width: 5, height: 5)
                        }
                        Image(systemName: "list.bullet")
                            .font(.system(size: 12))
                        Text("List")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(iTuTheme.ink)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity)
                    .background(model.planningViewMode == .list ? iTuTheme.surfaceMuted : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .pointingHandCursor()

                Button {
                    model.planningViewMode = .matrix
                } label: {
                    HStack(spacing: 5) {
                        if model.planningViewMode == .matrix {
                            Circle()
                                .fill(iTuTheme.ink)
                                .frame(width: 5, height: 5)
                        }
                        Image(systemName: "square.grid.2x2")
                            .font(.system(size: 12))
                        Text("Matrix")
                            .font(.system(size: 13, weight: .medium))
                    }
                    .foregroundStyle(iTuTheme.ink)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity)
                    .background(model.planningViewMode == .matrix ? iTuTheme.surfaceMuted : Color.clear)
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
                .pointingHandCursor()
            }

            Rectangle()
                .fill(iTuTheme.border)
                .frame(height: 1)

            // Checkbox 1: Show completed & won't do
            Button {
                model.hideCompletedTasks.toggle()
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: !model.hideCompletedTasks ? "checkmark" : "")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(iTuTheme.ink)
                        .frame(width: 14)

                    Image(systemName: "checkmark.square")
                        .font(.system(size: 13))
                        .foregroundStyle(iTuTheme.inkDim)

                    Text("Show completed &\nwon’t do")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundStyle(iTuTheme.ink)
                        .multilineTextAlignment(.leading)
                    Spacer()
                }
                .padding(.vertical, 4)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .pointingHandCursor()

        }
        .padding(14)
        .frame(width: 250)
        .background(iTuTheme.surface)
    }
}
