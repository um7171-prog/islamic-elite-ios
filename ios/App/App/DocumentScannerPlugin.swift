import Foundation
import UIKit
import Photos
import Capacitor

/// Native document scanner (Capacitor bridge).
///
/// Flow (all native, no web camera, no live detection):
///   scan() -> full-screen camera -> user taps capture -> the still is analysed with Vision
///   (VNDetectRectanglesRequest) -> the real corners are drawn on the photo -> user taps "التالي"
///   -> perspective correction + enhancement (Core Image) -> the scanned page comes back to JS.
///
/// JS API (see src/lib/scanner/nativeScanner.ts):
///   scan({ lang }) -> { cancelled: true } | { image: <base64 JPEG>, width, height }
///   cancel()       -> closes the scanner if it is open
///   saveToPhotos({ images: [<base64 JPEG>] }) -> { saved: n } — adds the pages to the Photos app
///                  (add-only access; iOS asks the user the first time)
@objc(DocumentScannerPlugin)
public class DocumentScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DocumentScannerPlugin"
    public let jsName = "DocumentScanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveToPhotos", returnType: CAPPluginReturnPromise)
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

    /// Saves the given pages (the final, filtered JPEGs from JS) into the Photos app. Uses add-only
    /// access (NSPhotoLibraryAddUsageDescription): iOS shows its own permission dialog the first
    /// time; after a refusal only iPhone Settings can change it, so that is reported as PHOTOS_DENIED.
    @objc func saveToPhotos(_ call: CAPPluginCall) {
        guard let images = call.getArray("images", String.self), !images.isEmpty else {
            call.reject("No images to save", "NO_IMAGES")
            return
        }
        let pages = images.compactMap { Data(base64Encoded: $0) }
        guard pages.count == images.count, pages.allSatisfy({ UIImage(data: $0) != nil }) else {
            call.reject("Invalid image data", "DECODE_FAILED")
            return
        }
        PHPhotoLibrary.requestAuthorization(for: .addOnly) { status in
            guard status == .authorized || status == .limited else {
                call.reject("Photos access was not allowed", "PHOTOS_DENIED")
                return
            }
            PHPhotoLibrary.shared().performChanges({
                for data in pages {
                    PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
                }
            }) { success, error in
                if success {
                    call.resolve(["saved": pages.count])
                } else {
                    call.reject(error?.localizedDescription ?? "Saving to Photos failed", "SAVE_FAILED")
                }
            }
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
