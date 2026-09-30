import { useEffect, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { useLocale } from "@/contexts/LocaleContext";
import { OptionSheet, SettingsRow } from "@/components/site/SettingsUI";
import { isIOSNativeApp } from "@/lib/platform";
import { loadMapsApp, saveMapsApp, type MapsApp } from "@/lib/mosques/maps";
import { isGoogleMapsInstalled } from "@/lib/mosques/mapsLauncher";

/**
 * Which maps app opens a mosque in the iPhone app: Apple Maps or Google Maps. Asked on the
 * first tap on a mosque's map button, and changeable any time in Settings → Location.
 */
function useMapsAppLabel() {
  const { t } = useLocale();
  return (app: MapsApp) => (app === "google" ? t("Google Maps", "خرائط Google") : t("Apple Maps", "خرائط Apple"));
}

export function MapsAppSheet({
  open,
  onOpenChange,
  value,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: MapsApp | null;
  onChange: (app: MapsApp) => void;
}) {
  const { t } = useLocale();
  const label = useMapsAppLabel();
  const [googleInstalled, setGoogleInstalled] = useState<boolean | null>(null);

  // Ask iOS each time the choice opens: Google Maps may have been installed or removed since.
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void isGoogleMapsInstalled().then((installed) => {
      if (alive) setGoogleInstalled(installed);
    });
    return () => {
      alive = false;
    };
  }, [open]);

  return (
    <OptionSheet<MapsApp | "">
      open={open}
      onOpenChange={onOpenChange}
      title={t("Maps app", "تطبيق الخرائط")}
      description={t(
        "Directions to mosques open in this app. You can change it any time in Settings → Location.",
        "تُفتح الاتجاهات إلى المساجد في هذا التطبيق. يمكنك تغييره في أي وقت من الإعدادات ← الموقع."
      )}
      value={value ?? ""}
      onChange={(v) => {
        if (v) onChange(v);
      }}
      options={[
        { value: "apple", label: label("apple") },
        {
          value: "google",
          label: label("google"),
          description:
            googleInstalled === false
              ? t("Not installed on this device — opens in the browser", "غير مثبت على جهازك — سيُفتح في المتصفح")
              : undefined,
        },
      ]}
    />
  );
}

/** Settings → Location → Maps app (the iPhone app only: the web always uses Google Maps links). */
export function MapsAppSettingRow() {
  const { t } = useLocale();
  const label = useMapsAppLabel();
  const [app, setApp] = useState<MapsApp | null>(() => loadMapsApp());
  const [open, setOpen] = useState(false);
  if (!isIOSNativeApp()) return null;
  return (
    <>
      <SettingsRow
        icon={MapIcon}
        label={t("Maps app", "تطبيق الخرائط")}
        description={t("For directions to mosques", "للاتجاهات إلى المساجد")}
        value={app ? label(app) : t("Ask on first use", "يُسأل عند أول استخدام")}
        onClick={() => setOpen(true)}
        data-testid="settings-maps-app"
      />
      <MapsAppSheet
        open={open}
        onOpenChange={setOpen}
        value={app}
        onChange={(next) => {
          saveMapsApp(next);
          setApp(next);
        }}
      />
    </>
  );
}
