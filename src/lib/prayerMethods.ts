import { CalculationMethod, type CalculationParameters } from "adhan";

export type MethodId =
  | "ummAlQura"
  | "mwl"
  | "egyptian"
  | "karachi"
  | "dubai"
  | "qatar"
  | "kuwait"
  | "singapore"
  | "turkey"
  | "tehran"
  | "northAmerica"
  | "moonsighting";

export interface MethodOption {
  id: MethodId;
  ar: string;
  en: string;
  build: () => CalculationParameters;
}

export const PRAYER_METHODS: MethodOption[] = [
  { id: "ummAlQura",    ar: "تقويم أم القرى",        en: "Umm Al-Qura",              build: () => CalculationMethod.UmmAlQura() },
  { id: "mwl",          ar: "رابطة العالم الإسلامي",  en: "Muslim World League",      build: () => CalculationMethod.MuslimWorldLeague() },
  { id: "egyptian",     ar: "الهيئة المصرية",         en: "Egyptian Authority",       build: () => CalculationMethod.Egyptian() },
  { id: "karachi",      ar: "جامعة كراتشي",           en: "University of Karachi",    build: () => CalculationMethod.Karachi() },
  { id: "dubai",        ar: "دبي",                    en: "Dubai",                    build: () => CalculationMethod.Dubai() },
  { id: "qatar",        ar: "قطر",                    en: "Qatar",                    build: () => CalculationMethod.Qatar() },
  { id: "kuwait",       ar: "الكويت",                 en: "Kuwait",                   build: () => CalculationMethod.Kuwait() },
  { id: "singapore",    ar: "سنغافورة",               en: "Singapore",                build: () => CalculationMethod.Singapore() },
  { id: "turkey",       ar: "تركيا (ديانت)",          en: "Turkey (Diyanet)",         build: () => CalculationMethod.Turkey() },
  { id: "tehran",       ar: "طهران",                  en: "Tehran",                   build: () => CalculationMethod.Tehran() },
  { id: "northAmerica", ar: "أمريكا الشمالية (ISNA)", en: "North America (ISNA)",     build: () => CalculationMethod.NorthAmerica() },
  { id: "moonsighting", ar: "لجنة رؤية الهلال",       en: "Moonsighting Committee",   build: () => CalculationMethod.MoonsightingCommittee() },
];

export function methodOption(id: MethodId): MethodOption {
  return PRAYER_METHODS.find((m) => m.id === id) ?? PRAYER_METHODS[0];
}

export function buildParams(id: MethodId): CalculationParameters {
  return methodOption(id).build();
}
