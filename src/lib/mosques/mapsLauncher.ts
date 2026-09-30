/**
 * Opens a mosque in the chosen maps app from the iPhone app, through the app-local MapsLauncher
 * plugin (ios/App/App/MapsLauncherPlugin.swift). Unlike a plain link, the plugin reports iOS's
 * real answer, so an app that isn't installed is noticed and the next option is tried instead of
 * the tap silently doing nothing.
 */
import { registerPlugin } from "@capacitor/core";
import { appleMapsUrl, googleMapsAppUrl, googleMapsWebUrl, type MapPoint, type MapsAction, type MapsApp } from "./maps";

interface MapsLauncherPlugin {
  open(options: { url: string }): Promise<{ completed: boolean }>;
  canOpen(options: { url: string }): Promise<{ value: boolean }>;
}

/** Opens URLs and says whether it worked (injectable for tests). */
export interface UrlOpener {
  open(url: string): Promise<boolean>;
  canOpen(url: string): Promise<boolean>;
}

let plugin: MapsLauncherPlugin | null = null;
const getPlugin = () => (plugin ??= registerPlugin<MapsLauncherPlugin>("MapsLauncher"));

/** Any failure of the bridge counts as "not opened", never as success. */
export const nativeMapsOpener: UrlOpener = {
  open: async (url) => {
    try {
      return (await getPlugin().open({ url })).completed === true;
    } catch {
      return false;
    }
  },
  canOpen: async (url) => {
    try {
      return (await getPlugin().canOpen({ url })).value === true;
    } catch {
      return false;
    }
  },
};

/** Is the Google Maps app installed (LSApplicationQueriesSchemes lists comgooglemaps)? */
export function isGoogleMapsInstalled(opener: UrlOpener = nativeMapsOpener): Promise<boolean> {
  return opener.canOpen("comgooglemaps://");
}

export interface MapsOpenResult {
  opened: boolean;
  via: "apple" | "google-app" | "google-web" | null;
}

async function tryOpen(opener: UrlOpener, url: string): Promise<boolean> {
  try {
    return await opener.open(url);
  } catch {
    return false;
  }
}

/**
 * Opens the mosque in `app`. Google Maps: the app when iOS opens it, otherwise Google Maps on
 * the web. Only an open that iOS confirmed counts as opened.
 */
export async function openInMaps(
  app: MapsApp,
  action: MapsAction,
  p: MapPoint,
  label: string,
  opener: UrlOpener = nativeMapsOpener,
): Promise<MapsOpenResult> {
  if (app === "apple") {
    return (await tryOpen(opener, appleMapsUrl(action, p, label))) ? { opened: true, via: "apple" } : { opened: false, via: null };
  }
  if (await tryOpen(opener, googleMapsAppUrl(action, p))) return { opened: true, via: "google-app" };
  if (await tryOpen(opener, googleMapsWebUrl(action, p))) return { opened: true, via: "google-web" };
  return { opened: false, via: null };
}
