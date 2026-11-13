import AfishaKit
import AfishaUI
import SwiftUI

/// «Сообщить о неточности»: причина + комментарий → очередь модерации (`POST /v1/reports`).
struct ReportSheet: View {
    @Environment(AppEnvironment.self) private var app
    @Environment(\.loc) private var loc
    @Environment(\.dismiss) private var dismiss
    @State private var reason: ReportReason = .wrongTime
    @State private var comment = ""
    let model: EventDetailModel
    let sessionID: String?

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Picker(loc("report.reason"), selection: $reason) {
                        ForEach(ReportReason.allCases, id: \.self) { reason in
                            Text(reason.title(app.settings.language)).tag(reason)
                        }
                    }
                    .pickerStyle(.inline)
                    .labelsHidden()
                } header: {
                    Text(loc("report.reason"))
                } footer: {
                    Text(loc("report.footer"))
                }
                Section(loc("report.comment")) {
                    TextField(loc("report.comment.placeholder"), text: $comment, axis: .vertical)
                        .lineLimit(3...8)
                }
                switch model.reportState {
                case .sent:
                    Section { Label(loc("report.sent"), systemImage: "checkmark.seal.fill").foregroundStyle(Palette.meadow) }
                case let .failed(error):
                    Section { Text(error.message(app.settings.language)).foregroundStyle(Palette.accent) }
                default:
                    EmptyView()
                }
            }
            .navigationTitle(loc("event.report"))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(loc("common.close")) { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if model.reportState == .sending {
                        ProgressView()
                    } else {
                        Button(loc("report.send")) {
                            Task {
                                await model.report(reason: reason, comment: comment, occurrenceID: sessionID)
                                if model.reportState == .sent {
                                    try? await Task.sleep(for: .seconds(1.2))
                                    dismiss()
                                }
                            }
                        }
                        .disabled(model.reportState == .sent)
                    }
                }
            }
            .onAppear { model.resetReport() }
        }
        .presentationDetents([.medium, .large])
    }
}
