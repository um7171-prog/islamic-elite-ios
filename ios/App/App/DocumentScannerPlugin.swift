import Foundation
import UIKit
import Capacitor

/// Native document scanner (Capacitor bridge).
///
/// Flow (all native, no web camera, no live detection):
///   scan() -> full-screen camera -> user taps capture -> the still is analysed with Vision
///   (VNDetectRectanglesRequest) -> the real corners are drawn on the photo -> user taps "مسح"
///   -> perspective correction + enhancement (Core Image) -> the scanned page comes back to JS.
///
/// JS API (see src/lib/scanner/nativeScanner.ts):
///   scan({ lang }) -> { cancelled: true } | { image: <base64 JPEG>, width, height }
///   cancel()       -> closes the scanner if it is open
@objc(DocumentScannerPlugin)
public class DocumentScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DocumentScannerPlugin"
    public let jsName = "DocumentScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    private var pendingCall: CAPPluginCall?
    private weak var scannerController: DocumentScannerViewController?

    @objc func scan(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            // Never two cameras at once: a second scan() while one is open is rejected.
            guard self.pendingCall == nil, self.scannerController == nil else {
                call.reject("The scanner is already open", "BUSY")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("No view controller available", "NO_VIEW_CONTROLLER")
                return
            }

            let language = call.getString("lang") ?? "ar"
            let controller = DocumentScannerViewController(language: language)
            controller.modalPresentationStyle = .fullScreen
            controller.onFinish = { [weak self] result in
                self?.finish(result)
            }

            self.pendingCall = call
            self.scannerController = controller
            host.present(controller, animated: true)
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.scannerController?.closeFromPlugin()
            call.resolve()
        }
    }

    /// Called exactly once per scan(): dismisses the controller and resolves the JS promise.
    private func finish(_ result: DocumentScannerViewController.Result) {
        let call = pendingCall
        let controller = scannerController
        pendingCall = nil
        scannerController = nil

        controller?.dismiss(animated: true) {
            guard let call = call else { return }
            switch result {
            case .cancelled:
                call.resolve(["cancelled": true])
            case .failed(let message):
                call.reject(message, "SCAN_FAILED")
            case .scanned(let image):
                // JPEG keeps the bridge payload small; 0.88 is visually lossless for text.
                guard let data = image.jpegData(compressionQuality: 0.88) else {
                    call.reject("Could not encode the scanned page", "ENCODE_FAILED")
                    return
                }
                call.resolve([
                    "cancelled": false,
                    "image": data.base64EncodedString(),
                    "mimeType": "image/jpeg",
                    "width": Int(image.size.width * image.scale),
                    "height": Int(image.size.height * image.scale)
                ])
            }
        }
    }
}
