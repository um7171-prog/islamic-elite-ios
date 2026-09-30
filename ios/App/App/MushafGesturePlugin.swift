import Foundation
import UIKit
import Capacitor

/// A native two-finger pinch for the Mushaf reader.
///
/// In the web view, touch events stop being cancelable as soon as WebKit's scroll view starts
/// panning, so a pinch that begins with a little vertical movement is taken over by the scroll.
/// Here a UIKit pinch recognizer runs alongside WebKit's own gestures, and while it pinches it
/// pauses the pan of every scroll view inside the web view, so the vertical scroll cannot steal
/// the gesture; the pans are restored the moment the pinch ends. One finger is never touched:
/// scrolling stays WebKit's own, with momentum.
///
/// JS API (see src/components/mushaf/nativePinch.ts):
///   enable()  / disable()  — only while the Mushaf reader is open
///   "pinch" events: { phase: "start" | "change" | "end" | "cancel", scale, x, y }
///   (x, y: the point between the fingers in web view points = CSS pixels, the page is never zoomed)
@objc(MushafGesturePlugin)
public class MushafGesturePlugin: CAPPlugin, CAPBridgedPlugin, UIGestureRecognizerDelegate {
    public let identifier = "MushafGesturePlugin"
    public let jsName = "MushafGesture"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "enable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "disable", returnType: CAPPluginReturnPromise)
    ]

    private var pinch: UIPinchGestureRecognizer?
    private var pausedPans: [UIGestureRecognizer] = []

    @objc func enable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let webView = self.bridge?.webView else {
                call.reject("No web view", "NO_WEB_VIEW")
                return
            }
            if self.pinch == nil {
                let recognizer = UIPinchGestureRecognizer(target: self, action: #selector(self.handlePinch(_:)))
                recognizer.delegate = self
                recognizer.cancelsTouchesInView = false
                recognizer.delaysTouchesBegan = false
                recognizer.delaysTouchesEnded = false
                webView.addGestureRecognizer(recognizer)
                self.pinch = recognizer
            }
            call.resolve()
        }
    }

    @objc func disable(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.restorePans()
            if let recognizer = self.pinch {
                recognizer.view?.removeGestureRecognizer(recognizer)
            }
            self.pinch = nil
            call.resolve()
        }
    }

    @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
        guard let view = recognizer.view else { return }
        let point = recognizer.location(in: view)
        switch recognizer.state {
        case .began:
            pausePans(in: view)
            emit("start", recognizer.scale, point)
        case .changed:
            emit("change", recognizer.scale, point)
        case .ended:
            restorePans()
            emit("end", recognizer.scale, point)
        case .cancelled, .failed:
            restorePans()
            emit("cancel", recognizer.scale, point)
        default:
            break
        }
    }

    private func emit(_ phase: String, _ scale: CGFloat, _ point: CGPoint) {
        notifyListeners("pinch", data: [
            "phase": phase,
            "scale": Double(scale),
            "x": Double(point.x),
            "y": Double(point.y)
        ])
    }

    /// Stops every scroll view inside the web view from panning (a pan in progress is cancelled).
    private func pausePans(in root: UIView) {
        restorePans()
        var stack: [UIView] = [root]
        while let view = stack.popLast() {
            if let scrollView = view as? UIScrollView, scrollView.panGestureRecognizer.isEnabled {
                scrollView.panGestureRecognizer.isEnabled = false
                pausedPans.append(scrollView.panGestureRecognizer)
            }
            stack.append(contentsOf: view.subviews)
        }
    }

    private func restorePans() {
        for pan in pausedPans {
            pan.isEnabled = true
        }
        pausedPans.removeAll()
    }

    // Runs alongside WebKit's own recognizers: touches still reach the page (taps, one-finger scroll).
    public func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer,
                                  shouldRecognizeSimultaneouslyWith otherGestureRecognizer: UIGestureRecognizer) -> Bool {
        return true
    }
}
