import Foundation
import UIKit
import Capacitor

/// Opens a mosque in Apple Maps or Google Maps and reports whether iOS actually opened it.
///
/// A plain link from the web view is handed to iOS with no answer back, so a Google Maps link on
/// an iPhone without Google Maps would silently do nothing. Here the result of
/// `UIApplication.open` comes back to JS, which then falls back to Google Maps on the web.
///
/// JS API (see src/lib/mosques/mapsLauncher.ts):
///   open({ url })    -> { completed: Bool }  false when no installed app handles the URL
///   canOpen({ url }) -> { value: Bool }      comgooglemaps is listed in LSApplicationQueriesSchemes
///
/// Only map URLs are accepted: the comgooglemaps scheme and https links to Apple / Google Maps.
@objc(MapsLauncherPlugin)
public class MapsLauncherPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "MapsLauncherPlugin"
    public let jsName = "MapsLauncher"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "canOpen", returnType: CAPPluginReturnPromise)
    ]

    private static let mapHosts: Set<String> = ["maps.apple.com", "www.google.com", "maps.google.com"]

    /// The call's URL when it is a map URL; otherwise the call is rejected and nil returned.
    private func mapURL(_ call: CAPPluginCall) -> URL? {
        guard let raw = call.getString("url"), let url = URL(string: raw), let scheme = url.scheme?.lowercased() else {
            call.reject("Missing or invalid URL", "INVALID_URL")
            return nil
        }
        let isGoogleMapsApp = scheme == "comgooglemaps"
        let isMapsWeb = scheme == "https" && MapsLauncherPlugin.mapHosts.contains(url.host?.lowercased() ?? "")
        guard isGoogleMapsApp || isMapsWeb else {
            call.reject("Not a maps URL", "UNSUPPORTED_URL")
            return nil
        }
        return url
    }

    @objc func open(_ call: CAPPluginCall) {
        guard let url = mapURL(call) else { return }
        DispatchQueue.main.async {
            UIApplication.shared.open(url, options: [:]) { completed in
                call.resolve(["completed": completed])
            }
        }
    }

    @objc func canOpen(_ call: CAPPluginCall) {
        guard let url = mapURL(call) else { return }
        DispatchQueue.main.async {
            call.resolve(["value": UIApplication.shared.canOpenURL(url)])
        }
    }
}
