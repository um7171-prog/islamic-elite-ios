import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLocale } from "@/contexts/LocaleContext";
import { AthanSettingsCard } from "./AthanSettingsCard";
import { loadAthanSettings, type AthanSettings } from "@/lib/athanSettings";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  settings: AthanSettings;
  onSettingsChange: (s: AthanSettings) => void;
  scheduledCount: number;
}

export function NotificationsDialog({ open, onOpenChange, settings, onSettingsChange, scheduledCount }: Props) {
  const { t, dir } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("Notifications", "الإشعارات")}</DialogTitle>
        </DialogHeader>
        <AthanSettingsCard settings={settings} onChange={onSettingsChange} scheduledCount={scheduledCount} />
      </DialogContent>
    </Dialog>
  );
}
