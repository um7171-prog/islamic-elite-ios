import { useEffect, useState } from "react";
import { Check, Heart, Sunrise, Sunset, BedDouble, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLocale } from "@/contexts/LocaleContext";
import { cn } from "@/lib/utils";

interface Athkar { ar: string; en: string; count: number; }

const AYAT_KURSI = "أَعُوذُ بِاللَّهِ مِنَ الشَّيْطَانِ الرَّجِيمِ. اللَّهُ لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ، لَا تَأْخُذُهُ سِنَةٌ وَلَا نَوْمٌ، لَهُ مَا فِي السَّمَاوَاتِ وَمَا فِي الْأَرْضِ، مَنْ ذَا الَّذِي يَشْفَعُ عِنْدَهُ إِلَّا بِإِذْنِهِ، يَعْلَمُ مَا بَيْنَ أَيْدِيهِمْ وَمَا خَلْفَهُمْ، وَلَا يُحِيطُونَ بِشَيْءٍ مِنْ عِلْمِهِ إِلَّا بِمَا شَاءَ، وَسِعَ كُرْسِيُّهُ السَّمَاوَاتِ وَالْأَرْضَ، وَلَا يَئُودُهُ حِفْظُهُمَا، وَهُوَ الْعَلِيُّ الْعَظِيمُ.";
const IKHLAS = "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ. قُلْ هُوَ اللَّهُ أَحَدٌ. اللَّهُ الصَّمَدُ. لَمْ يَلِدْ وَلَمْ يُولَدْ. وَلَمْ يَكُنْ لَهُ كُفُوًا أَحَدٌ.";
const FALAQ = "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ. قُلْ أَعُوذُ بِرَبِّ الْفَلَقِ. مِنْ شَرِّ مَا خَلَقَ. وَمِنْ شَرِّ غَاسِقٍ إِذَا وَقَبَ. وَمِنْ شَرِّ النَّفَّاثَاتِ فِي الْعُقَدِ. وَمِنْ شَرِّ حَاسِدٍ إِذَا حَسَدَ.";
const NAS = "بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ. قُلْ أَعُوذُ بِرَبِّ النَّاسِ. مَلِكِ النَّاسِ. إِلَهِ النَّاسِ. مِنْ شَرِّ الْوَسْوَاسِ الْخَنَّاسِ. الَّذِي يُوَسْوِسُ فِي صُدُورِ النَّاسِ. مِنَ الْجِنَّةِ وَالنَّاسِ.";

const MORNING: Athkar[] = [
  { ar: AYAT_KURSI, en: "Ayat al-Kursi", count: 1 },
  { ar: IKHLAS, en: "Surah Al-Ikhlas", count: 3 },
  { ar: FALAQ, en: "Surah Al-Falaq", count: 3 },
  { ar: NAS, en: "Surah An-Nas", count: 3 },
  { ar: "أَصْبَحْنَا وَأَصْبَحَ الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ. رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذَا الْيَوْمِ وَخَيْرَ مَا بَعْدَهُ، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذَا الْيَوْمِ وَشَرِّ مَا بَعْدَهُ، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.", en: "Morning supplication", count: 1 },
  { ar: "اللَّهُمَّ بِكَ أَصْبَحْنَا، وَبِكَ أَمْسَيْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ النُّشُورُ.", en: "O Allah, by You we reach the morning…", count: 1 },
  { ar: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ.", en: "Glory and praise be to Allah", count: 100 },
  { ar: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ.", en: "None has the right to be worshipped except Allah…", count: 10 },
];

const EVENING: Athkar[] = [
  { ar: AYAT_KURSI, en: "Ayat al-Kursi", count: 1 },
  { ar: IKHLAS, en: "Surah Al-Ikhlas", count: 3 },
  { ar: FALAQ, en: "Surah Al-Falaq", count: 3 },
  { ar: NAS, en: "Surah An-Nas", count: 3 },
  { ar: "أَمْسَيْنَا وَأَمْسَى الْمُلْكُ لِلَّهِ، وَالْحَمْدُ لِلَّهِ، لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ. رَبِّ أَسْأَلُكَ خَيْرَ مَا فِي هَذِهِ اللَّيْلَةِ وَخَيْرَ مَا بَعْدَهَا، وَأَعُوذُ بِكَ مِنْ شَرِّ مَا فِي هَذِهِ اللَّيْلَةِ وَشَرِّ مَا بَعْدَهَا، رَبِّ أَعُوذُ بِكَ مِنَ الْكَسَلِ وَسُوءِ الْكِبَرِ، رَبِّ أَعُوذُ بِكَ مِنْ عَذَابٍ فِي النَّارِ وَعَذَابٍ فِي الْقَبْرِ.", en: "Evening supplication", count: 1 },
  { ar: "اللَّهُمَّ بِكَ أَمْسَيْنَا، وَبِكَ أَصْبَحْنَا، وَبِكَ نَحْيَا، وَبِكَ نَمُوتُ، وَإِلَيْكَ الْمَصِيرُ.", en: "O Allah, by You we reach the evening…", count: 1 },
  { ar: "أَعُوذُ بِكَلِمَاتِ اللَّهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ.", en: "I seek refuge in the perfect words of Allah…", count: 3 },
  { ar: "بِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ.", en: "In the name of Allah, with whose name nothing is harmed…", count: 3 },
];

const SLEEP: Athkar[] = [
  { ar: AYAT_KURSI, en: "Ayat al-Kursi", count: 1 },
  { ar: IKHLAS, en: "Surah Al-Ikhlas", count: 1 },
  { ar: FALAQ, en: "Surah Al-Falaq", count: 1 },
  { ar: NAS, en: "Surah An-Nas", count: 1 },
  { ar: "آمَنَ الرَّسُولُ بِمَا أُنْزِلَ إِلَيْهِ مِنْ رَبِّهِ وَالْمُؤْمِنُونَ، كُلٌّ آمَنَ بِاللَّهِ وَمَلَائِكَتِهِ وَكُتُبِهِ وَرُسُلِهِ، لَا نُفَرِّقُ بَيْنَ أَحَدٍ مِنْ رُسُلِهِ، وَقَالُوا سَمِعْنَا وَأَطَعْنَا، غُفْرَانَكَ رَبَّنَا وَإِلَيْكَ الْمَصِيرُ. لَا يُكَلِّفُ اللَّهُ نَفْسًا إِلَّا وُسْعَهَا، لَهَا مَا كَسَبَتْ وَعَلَيْهَا مَا اكْتَسَبَتْ، رَبَّنَا لَا تُؤَاخِذْنَا إِنْ نَسِينَا أَوْ أَخْطَأْنَا، رَبَّنَا وَلَا تَحْمِلْ عَلَيْنَا إِصْرًا كَمَا حَمَلْتَهُ عَلَى الَّذِينَ مِنْ قَبْلِنَا، رَبَّنَا وَلَا تُحَمِّلْنَا مَا لَا طَاقَةَ لَنَا بِهِ، وَاعْفُ عَنَّا وَاغْفِرْ لَنَا وَارْحَمْنَا، أَنْتَ مَوْلَانَا فَانْصُرْنَا عَلَى الْقَوْمِ الْكَافِرِينَ.", en: "Last two verses of Surah Al-Baqarah", count: 1 },
  { ar: "اللَّهُمَّ بِاسْمِكَ أَمُوتُ وَأَحْيَا.", en: "In Your name O Allah I die and I live", count: 1 },
  { ar: "اللَّهُمَّ قِنِي عَذَابَكَ يَوْمَ تَبْعَثُ عِبَادَكَ.", en: "O Allah save me from Your punishment…", count: 3 },
  { ar: "بِاسْمِكَ رَبِّي وَضَعْتُ جَنْبِي، وَبِكَ أَرْفَعُهُ، فَإِنْ أَمْسَكْتَ نَفْسِي فَارْحَمْهَا، وَإِنْ أَرْسَلْتَهَا فَاحْفَظْهَا بِمَا تَحْفَظُ بِهِ عِبَادَكَ الصَّالِحِينَ.", en: "In Your name my Lord I lay my side…", count: 1 },
  { ar: "اللَّهُمَّ أَسْلَمْتُ نَفْسِي إِلَيْكَ، وَفَوَّضْتُ أَمْرِي إِلَيْكَ، وَوَجَّهْتُ وَجْهِي إِلَيْكَ، وَأَلْجَأْتُ ظَهْرِي إِلَيْكَ، رَغْبَةً وَرَهْبَةً إِلَيْكَ، لَا مَلْجَأَ وَلَا مَنْجَا مِنْكَ إِلَّا إِلَيْكَ، آمَنْتُ بِكِتَابِكَ الَّذِي أَنْزَلْتَ، وَنَبِيِّكَ الَّذِي أَرْسَلْتَ.", en: "O Allah, I submit myself to You…", count: 1 },
  { ar: "سُبْحَانَ اللَّهِ.", en: "SubhanAllah", count: 33 },
  { ar: "الْحَمْدُ لِلَّهِ.", en: "Alhamdulillah", count: 33 },
  { ar: "اللَّهُ أَكْبَرُ.", en: "Allahu Akbar", count: 34 },
  { ar: "اللَّهُمَّ رَبَّ السَّمَاوَاتِ السَّبْعِ وَرَبَّ الْعَرْشِ الْعَظِيمِ، رَبَّنَا وَرَبَّ كُلِّ شَيْءٍ، فَالِقَ الْحَبِّ وَالنَّوَى، وَمُنْزِلَ التَّوْرَاةِ وَالْإِنْجِيلِ وَالْفُرْقَانِ، أَعُوذُ بِكَ مِنْ شَرِّ كُلِّ شَيْءٍ أَنْتَ آخِذٌ بِنَاصِيَتِهِ. اللَّهُمَّ أَنْتَ الْأَوَّلُ فَلَيْسَ قَبْلَكَ شَيْءٌ، وَأَنْتَ الْآخِرُ فَلَيْسَ بَعْدَكَ شَيْءٌ، وَأَنْتَ الظَّاهِرُ فَلَيْسَ فَوْقَكَ شَيْءٌ، وَأَنْتَ الْبَاطِنُ فَلَيْسَ دُونَكَ شَيْءٌ، اقْضِ عَنَّا الدَّيْنَ وَأَغْنِنَا مِنَ الْفَقْرِ.", en: "O Allah, Lord of the seven heavens…", count: 1 },
  { ar: "الْحَمْدُ لِلَّهِ الَّذِي أَطْعَمَنَا وَسَقَانَا، وَكَفَانَا وَآوَانَا، فَكَمْ مِمَّنْ لَا كَافِيَ لَهُ وَلَا مُؤْوِيَ.", en: "Praise be to Allah Who fed us…", count: 1 },
];

const POST_PRAYER: Athkar[] = [
  { ar: "أَسْتَغْفِرُ اللَّهَ (ثلاثاً)", en: "I seek forgiveness from Allah (3 times)", count: 3 },
  { ar: "اللَّهُمَّ أَنْتَ السَّلَامُ، وَمِنْكَ السَّلَامُ، تَبَارَكْتَ يَا ذَا الْجَلَالِ وَالْإِكْرَامِ", en: "O Allah, You are As-Salam…", count: 1 },
  { ar: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", en: "None has the right to be worshipped except Allah…", count: 1 },
  { ar: "سُبْحَانَ اللَّهِ (33 مرة)، وَالْحَمْدُ لِلَّهِ (33 مرة)، وَاللَّهُ أَكْبَرُ (33 مرة)", en: "SubhanAllah, Alhamdulillah, Allahu Akbar (33 each)", count: 99 },
  { ar: "لَا إِلَهَ إِلَّا اللَّهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ، وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ (بعد التكبيرات)", en: "Takbir after Salah", count: 1 },
  { ar: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ", en: "O Allah, send blessings upon Muhammad…", count: 1 },
  { ar: AYAT_KURSI, en: "Ayat al-Kursi (once)", count: 1 },
];

// The app advertises "progress saved" for Athkar, but tallies were only ever
// in-memory React state — closing the dialog (a Radix Dialog, unmounted on
// close) silently lost all progress. Persist per list, keyed by today's date
// so tomorrow's Athkar start fresh rather than carrying over yesterday's tally.
function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function List({ items, storageKey }: { items: Athkar[]; storageKey: string }) {
  const fullKey = `athkar.counts.${storageKey}.${todayKey()}`;
  const [counts, setCounts] = useState<number[]>(() => {
    try {
      const raw = localStorage.getItem(fullKey);
      const arr = raw ? JSON.parse(raw) : null;
      if (Array.isArray(arr) && arr.length === items.length && arr.every((n) => typeof n === "number")) {
        return arr;
      }
    } catch {
      /* ignore malformed/unavailable storage */
    }
    return items.map(() => 0);
  });

  useEffect(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(counts));
    } catch {
      /* storage unavailable */
    }
  }, [counts, fullKey]);

  const tap = (i: number) => setCounts(c => c.map((v, idx) => idx === i ? Math.min(v + 1, items[i].count) : v));
  return (
    <div className="space-y-2.5 max-h-[58vh] overflow-y-auto pe-1">
      {items.map((it, i) => {
        const done = counts[i] >= it.count;
        return (
          <button
            key={i}
            onClick={() => tap(i)}
            className={cn(
              "w-full text-start rounded-2xl p-4 transition-all border active:scale-[0.99]",
              done ? "bg-primary/10 border-primary/40" : "bg-card/60 border-foreground/10 hover:bg-foreground/5",
            )}
          >
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "shrink-0 h-8 w-8 rounded-full grid place-items-center text-[11px] font-bold transition-colors",
                  done ? "bg-primary text-primary-foreground" : "bg-foreground/8 text-foreground/50",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <div className="min-w-0 flex-1 font-arabic text-lg leading-loose text-foreground">{it.ar}</div>
            </div>
            <div className="mt-2 ps-11 flex items-center justify-between gap-2">
              <span className="text-[11px] text-foreground/60 truncate">{it.en}</span>
              <span
                className={cn(
                  "shrink-0 font-display tabular-nums text-[11px] font-bold rounded-full px-2.5 py-0.5",
                  done ? "bg-primary/20 text-primary" : "bg-accent/15 text-accent",
                )}
              >
                {counts[i]} / {it.count}
              </span>
            </div>
          </button>
        );
      })}
    </div>
  );
}

const tabTrigger =
  "min-w-0 flex-col h-auto gap-1 py-2 px-1 whitespace-normal text-center leading-tight data-[state=active]:shadow-none";

export function AthkarDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { t, dir } = useLocale();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir={dir} className="max-w-lg p-0 overflow-hidden bg-background">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2">
            <Heart className="h-5 w-5" style={{ color: "hsl(var(--elite-gold-start))" }} />
            <span className="text-elite-gold">{t("Athkar", "الأذكار")}</span>
          </DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="morning" className="min-w-0 px-5 pb-5">
          <TabsList className="grid grid-cols-4 w-full min-w-0 h-auto bg-secondary/50">
            <TabsTrigger value="morning" className={tabTrigger}>
              <Sunrise className="h-4 w-4" />
              <span className="text-[10px] font-semibold truncate w-full">{t("Morning", "الصباح")}</span>
            </TabsTrigger>
            <TabsTrigger value="evening" className={tabTrigger}>
              <Sunset className="h-4 w-4" />
              <span className="text-[10px] font-semibold truncate w-full">{t("Evening", "المساء")}</span>
            </TabsTrigger>
            <TabsTrigger value="sleep" className={tabTrigger}>
              <BedDouble className="h-4 w-4" />
              <span className="text-[10px] font-semibold truncate w-full">{t("Sleep", "النوم")}</span>
            </TabsTrigger>
            <TabsTrigger value="post-prayer" className={tabTrigger}>
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-[10px] font-semibold truncate w-full">{t("Post-Prayer", "بعد الصلاة")}</span>
            </TabsTrigger>
          </TabsList>
          <TabsContent value="morning" className="pt-3"><List items={MORNING} storageKey="morning" /></TabsContent>
          <TabsContent value="evening" className="pt-3"><List items={EVENING} storageKey="evening" /></TabsContent>
          <TabsContent value="sleep" className="pt-3"><List items={SLEEP} storageKey="sleep" /></TabsContent>
          <TabsContent value="post-prayer" className="pt-3"><List items={POST_PRAYER} storageKey="post-prayer" /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
