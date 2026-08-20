import Foundation
import SafariServices

final class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {
    func beginRequest(with context: NSExtensionContext) {
        guard let item = context.inputItems.first as? NSExtensionItem,
              let message = item.userInfo?[SFExtensionMessageKey],
              let configuration = IOSSafariExtensionConfigurationStore.response(to: message) else {
            context.completeRequest(returningItems: nil, completionHandler: nil)
            return
        }
        let response = NSExtensionItem()
        response.userInfo = [SFExtensionMessageKey: configuration]
        context.completeRequest(returningItems: [response], completionHandler: nil)
    }
}
