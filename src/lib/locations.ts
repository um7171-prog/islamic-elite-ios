export interface CityLocation {
  id: string;
  en: string;
  ar: string;
  lat: number;
  lng: number;
  tz: string;
  countryEn: string;
  countryAr: string;
  region?: string;
  source?: "local" | "global";
}

export const SAUDI_CITIES: CityLocation[] = [
  { id: "sa-buraydah", en: "Buraydah", ar: "بريدة", lat: 26.3260, lng: 43.9750, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-riyadh", en: "Riyadh", ar: "الرياض", lat: 24.7136, lng: 46.6753, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-makkah", en: "Makkah", ar: "مكة المكرمة", lat: 21.3891, lng: 39.8579, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-madinah", en: "Madinah", ar: "المدينة المنورة", lat: 24.5247, lng: 39.5692, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-jeddah", en: "Jeddah", ar: "جدة", lat: 21.4858, lng: 39.1925, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-dammam", en: "Dammam", ar: "الدمام", lat: 26.4207, lng: 50.0888, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khobar", en: "Al Khobar", ar: "الخبر", lat: 26.2172, lng: 50.1971, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-dhahran", en: "Dhahran", ar: "الظهران", lat: 26.2361, lng: 50.0393, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-jubail", en: "Jubail", ar: "الجبيل", lat: 27.0046, lng: 49.6460, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-qatif", en: "Qatif", ar: "القطيف", lat: 26.5652, lng: 50.0089, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-ahsa", en: "Al Ahsa", ar: "الأحساء", lat: 25.3833, lng: 49.5867, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-hofuf", en: "Hofuf", ar: "الهفوف", lat: 25.3646, lng: 49.5653, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-mubarraz", en: "Al Mubarraz", ar: "المبرز", lat: 25.4077, lng: 49.5903, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-ras-tanura", en: "Ras Tanura", ar: "رأس تنورة", lat: 26.6435, lng: 50.1592, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-saihat", en: "Saihat", ar: "سيهات", lat: 26.4852, lng: 50.0405, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-safwa", en: "Safwa", ar: "صفوى", lat: 26.6497, lng: 49.9556, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-abqaiq", en: "Abqaiq", ar: "بقيق", lat: 25.9340, lng: 49.6688, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khafji", en: "Khafji", ar: "الخفجي", lat: 28.4391, lng: 48.4913, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-nairiyah", en: "Nairiyah", ar: "النعيرية", lat: 27.4719, lng: 48.4840, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-qaryat-al-ulya", en: "Qaryat Al Ulya", ar: "قرية العليا", lat: 27.5583, lng: 47.7067, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-tabuk", en: "Tabuk", ar: "تبوك", lat: 28.3998, lng: 36.5700, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-tayma", en: "Tayma", ar: "تيماء", lat: 27.6198, lng: 38.5483, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-duba", en: "Duba", ar: "ضباء", lat: 27.3513, lng: 35.6901, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-haql", en: "Haql", ar: "حقل", lat: 29.2833, lng: 34.9500, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-wajh", en: "Al Wajh", ar: "الوجه", lat: 26.2455, lng: 36.4525, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-umluj", en: "Umluj", ar: "أملج", lat: 25.0500, lng: 37.2667, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-neom", en: "NEOM", ar: "نيوم", lat: 28.1117, lng: 35.1894, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-hail", en: "Hail", ar: "حائل", lat: 27.5114, lng: 41.7208, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-baqaa", en: "Baqaa", ar: "بقعاء", lat: 27.8876, lng: 42.4123, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-ghazalah", en: "Al Ghazalah", ar: "الغزالة", lat: 26.7920, lng: 41.3292, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-shinan", en: "Ash Shinan", ar: "الشنان", lat: 27.1800, lng: 42.4360, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-jubbah", en: "Jubbah", ar: "جبة", lat: 28.0062, lng: 40.9415, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-arar", en: "Arar", ar: "عرعر", lat: 30.9753, lng: 41.0381, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-rafha", en: "Rafha", ar: "رفحاء", lat: 29.6342, lng: 43.5195, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-turaif", en: "Turaif", ar: "طريف", lat: 31.6725, lng: 38.6637, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-uwayqilah", en: "Al Uwayqilah", ar: "العويقيلة", lat: 30.3595, lng: 42.2366, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-sakaka", en: "Sakaka", ar: "سكاكا", lat: 29.9697, lng: 40.2064, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-qurayyat", en: "Qurayyat", ar: "القريات", lat: 31.3318, lng: 37.3428, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-dumat-al-jandal", en: "Dumat Al Jandal", ar: "دومة الجندل", lat: 29.8114, lng: 39.8652, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-tabarjal", en: "Tabarjal", ar: "طبرجل", lat: 30.4999, lng: 38.2160, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-jazan", en: "Jazan", ar: "جازان", lat: 16.8892, lng: 42.5611, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-sabya", en: "Sabya", ar: "صبيا", lat: 17.1495, lng: 42.6254, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-abu-arish", en: "Abu Arish", ar: "أبو عريش", lat: 16.9689, lng: 42.8325, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-samtah", en: "Samtah", ar: "صامطة", lat: 16.5960, lng: 42.9444, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-ahad-al-masarihah", en: "Ahad Al Masarihah", ar: "أحد المسارحة", lat: 16.7111, lng: 42.9552, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-ardah", en: "Al Aridhah", ar: "العارضة", lat: 17.0366, lng: 43.0615, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-baish", en: "Baish", ar: "بيش", lat: 17.3746, lng: 42.5249, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-farasan", en: "Farasan", ar: "فرسان", lat: 16.7022, lng: 42.1183, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-darb", en: "Al Darb", ar: "الدرب", lat: 17.7248, lng: 42.2526, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-dayer", en: "Al Dayer", ar: "الداير", lat: 17.3438, lng: 43.1422, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-fifa", en: "Fifa", ar: "فيفاء", lat: 17.2500, lng: 43.1000, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-najran", en: "Najran", ar: "نجران", lat: 17.5656, lng: 44.2289, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-sharurah", en: "Sharurah", ar: "شرورة", lat: 17.4869, lng: 47.1214, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-hubuna", en: "Hubuna", ar: "حبونا", lat: 17.8389, lng: 44.2857, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-yadamah", en: "Yadamah", ar: "يدمة", lat: 18.5217, lng: 44.2165, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-badr-al-janub", en: "Badr Al Janub", ar: "بدر الجنوب", lat: 17.8856, lng: 43.7369, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-thar", en: "Thar", ar: "ثار", lat: 17.9833, lng: 44.1333, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khabash", en: "Khabash", ar: "خباش", lat: 17.5578, lng: 44.7464, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-abha", en: "Abha", ar: "أبها", lat: 18.2164, lng: 42.5053, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khamis-mushait", en: "Khamis Mushait", ar: "خميس مشيط", lat: 18.3064, lng: 42.7292, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-ahad-rafidah", en: "Ahad Rafidah", ar: "أحد رفيدة", lat: 18.2013, lng: 42.8284, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-sarat-abidah", en: "Sarat Abidah", ar: "سراة عبيدة", lat: 18.0774, lng: 43.1414, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-tathleeth", en: "Tathleeth", ar: "تثليث", lat: 19.5310, lng: 43.5063, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-bisha", en: "Bisha", ar: "بيشة", lat: 19.9847, lng: 42.6052, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-namas", en: "Al Namas", ar: "النماص", lat: 19.1190, lng: 42.1451, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-tanomah", en: "Tanomah", ar: "تنومة", lat: 18.9271, lng: 42.1778, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-rijal-almaa", en: "Rijal Almaa", ar: "رجال ألمع", lat: 18.2132, lng: 42.2000, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-muhayil", en: "Muhayil", ar: "محايل عسير", lat: 18.5442, lng: 42.0532, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-bareq", en: "Bareq", ar: "بارق", lat: 18.9281, lng: 41.9395, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-balqarn", en: "Balqarn", ar: "بلقرن", lat: 19.5636, lng: 41.9550, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-majardah", en: "Al Majardah", ar: "المجاردة", lat: 19.1236, lng: 41.9111, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-taif", en: "Taif", ar: "الطائف", lat: 21.4373, lng: 40.5127, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-rabigh", en: "Rabigh", ar: "رابغ", lat: 22.7986, lng: 39.0349, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-qunfudhah", en: "Al Qunfudhah", ar: "القنفذة", lat: 19.1264, lng: 41.0789, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-lith", en: "Al Lith", ar: "الليث", lat: 20.1486, lng: 40.2722, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khulais", en: "Khulais", ar: "خليص", lat: 22.1525, lng: 39.3378, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-kamil", en: "Al Kamil", ar: "الكامل", lat: 22.2587, lng: 39.7599, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-turabah", en: "Turabah", ar: "تربة", lat: 21.2141, lng: 41.6331, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-ranyah", en: "Ranyah", ar: "رنية", lat: 21.2636, lng: 42.8453, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khurmah", en: "Al Khurmah", ar: "الخرمة", lat: 21.9167, lng: 42.0333, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-bahrah", en: "Bahrah", ar: "بحرة", lat: 21.4028, lng: 39.4658, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-jumum", en: "Al Jumum", ar: "الجموم", lat: 21.6167, lng: 39.7000, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-yanbu", en: "Yanbu", ar: "ينبع", lat: 24.0895, lng: 38.0618, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-alula", en: "AlUla", ar: "العلا", lat: 26.6085, lng: 37.9232, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-khaybar", en: "Khaybar", ar: "خيبر", lat: 25.7046, lng: 39.2864, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-badr", en: "Badr", ar: "بدر", lat: 23.7829, lng: 38.7905, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-hanakiyah", en: "Al Hanakiyah", ar: "الحناكية", lat: 24.8841, lng: 40.5415, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-mahd-adh-dhahab", en: "Mahd Adh Dhahab", ar: "مهد الذهب", lat: 23.5034, lng: 40.8663, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-quwaieyah", en: "Al Quwaiiyah", ar: "القويعية", lat: 24.0733, lng: 45.2808, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-kharj", en: "Al Kharj", ar: "الخرج", lat: 24.1554, lng: 47.3346, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-dawadmi", en: "Dawadmi", ar: "الدوادمي", lat: 24.5077, lng: 44.3924, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-majmaah", en: "Al Majmaah", ar: "المجمعة", lat: 25.9051, lng: 45.3456, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-zulfi", en: "Az Zulfi", ar: "الزلفي", lat: 26.2995, lng: 44.8154, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-shaqra", en: "Shaqra", ar: "شقراء", lat: 25.2528, lng: 45.2529, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-afif", en: "Afif", ar: "عفيف", lat: 23.9065, lng: 42.9172, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-wadi-ad-dawasir", en: "Wadi Ad Dawasir", ar: "وادي الدواسر", lat: 20.4607, lng: 44.8457, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-muzahimiyah", en: "Al Muzahimiyah", ar: "المزاحمية", lat: 24.4710, lng: 46.2690, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-diriyah", en: "Diriyah", ar: "الدرعية", lat: 24.7481, lng: 46.5363, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-dhurma", en: "Dhurma", ar: "ضرما", lat: 24.5953, lng: 46.1383, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-huraymila", en: "Huraymila", ar: "حريملاء", lat: 25.1151, lng: 46.1030, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-rimah", en: "Rimah", ar: "رماح", lat: 25.5674, lng: 47.1596, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-hotat-bani-tamim", en: "Hotat Bani Tamim", ar: "حوطة بني تميم", lat: 23.5207, lng: 46.8643, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-hariq", en: "Al Hariq", ar: "الحريق", lat: 23.6239, lng: 46.5059, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-layla", en: "Layla", ar: "ليلى", lat: 22.2864, lng: 46.7319, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-sulayyil", en: "As Sulayyil", ar: "السليل", lat: 20.4608, lng: 45.5779, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-duruma", en: "Duruma", ar: "درما", lat: 24.6000, lng: 46.1500, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-unaizah", en: "Unaizah", ar: "عنيزة", lat: 26.0910, lng: 43.9877, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-rass", en: "Ar Rass", ar: "الرس", lat: 25.8694, lng: 43.4973, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-bukayriyah", en: "Al Bukayriyah", ar: "البكيرية", lat: 26.1392, lng: 43.6578, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-mithnab", en: "Al Mithnab", ar: "المذنب", lat: 25.8601, lng: 44.2223, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-badai", en: "Al Badayea", ar: "البدائع", lat: 25.9710, lng: 43.7850, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-riyadh-al-khabra", en: "Riyadh Al Khabra", ar: "رياض الخبراء", lat: 26.0577, lng: 43.6336, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-uqlat-as-suqur", en: "Uqlat As Suqur", ar: "عقلة الصقور", lat: 25.8333, lng: 42.2167, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-dariyah", en: "Dariyah", ar: "ضرية", lat: 24.7167, lng: 42.9333, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-bahah", en: "Al Bahah", ar: "الباحة", lat: 20.0129, lng: 41.4677, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-baljurashi", en: "Baljurashi", ar: "بلجرشي", lat: 19.8594, lng: 41.5568, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-mandaq", en: "Al Mandaq", ar: "المندق", lat: 20.1588, lng: 41.2834, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-al-makhwah", en: "Al Makhwah", ar: "المخواة", lat: 19.7534, lng: 41.4418, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-qilwah", en: "Qilwah", ar: "قلوة", lat: 19.9500, lng: 41.2333, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-aqiq", en: "Al Aqiq", ar: "العقيق", lat: 20.2667, lng: 41.6667, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
  { id: "sa-qura", en: "Al Qara", ar: "القرى", lat: 20.0833, lng: 41.3333, tz: "Asia/Riyadh", countryEn: "Saudi Arabia", countryAr: "السعودية", source: "local" },
];

export const FEATURED_GLOBAL_CITIES: CityLocation[] = [
  { id: "global-london", en: "London", ar: "لندن", lat: 51.5072, lng: -0.1276, tz: "Europe/London", countryEn: "United Kingdom", countryAr: "المملكة المتحدة", source: "local" },
  { id: "global-paris", en: "Paris", ar: "باريس", lat: 48.8566, lng: 2.3522, tz: "Europe/Paris", countryEn: "France", countryAr: "فرنسا", source: "local" },
  { id: "global-new-york", en: "New York", ar: "نيويورك", lat: 40.7128, lng: -74.0060, tz: "America/New_York", countryEn: "United States", countryAr: "الولايات المتحدة", source: "local" },
  { id: "global-toronto", en: "Toronto", ar: "تورونتو", lat: 43.6532, lng: -79.3832, tz: "America/Toronto", countryEn: "Canada", countryAr: "كندا", source: "local" },
  { id: "global-dubai", en: "Dubai", ar: "دبي", lat: 25.2048, lng: 55.2708, tz: "Asia/Dubai", countryEn: "United Arab Emirates", countryAr: "الإمارات", source: "local" },
  { id: "global-abu-dhabi", en: "Abu Dhabi", ar: "أبوظبي", lat: 24.4539, lng: 54.3773, tz: "Asia/Dubai", countryEn: "United Arab Emirates", countryAr: "الإمارات", source: "local" },
  { id: "global-kuwait-city", en: "Kuwait City", ar: "مدينة الكويت", lat: 29.3759, lng: 47.9774, tz: "Asia/Kuwait", countryEn: "Kuwait", countryAr: "الكويت", source: "local" },
  { id: "global-doha", en: "Doha", ar: "الدوحة", lat: 25.2854, lng: 51.5310, tz: "Asia/Qatar", countryEn: "Qatar", countryAr: "قطر", source: "local" },
  { id: "global-manama", en: "Manama", ar: "المنامة", lat: 26.2235, lng: 50.5876, tz: "Asia/Bahrain", countryEn: "Bahrain", countryAr: "البحرين", source: "local" },
  { id: "global-muscat", en: "Muscat", ar: "مسقط", lat: 23.5880, lng: 58.3829, tz: "Asia/Muscat", countryEn: "Oman", countryAr: "عُمان", source: "local" },
  { id: "global-cairo", en: "Cairo", ar: "القاهرة", lat: 30.0444, lng: 31.2357, tz: "Africa/Cairo", countryEn: "Egypt", countryAr: "مصر", source: "local" },
  { id: "global-amman", en: "Amman", ar: "عمّان", lat: 31.9539, lng: 35.9106, tz: "Asia/Amman", countryEn: "Jordan", countryAr: "الأردن", source: "local" },
  { id: "global-istanbul", en: "Istanbul", ar: "إسطنبول", lat: 41.0082, lng: 28.9784, tz: "Europe/Istanbul", countryEn: "Türkiye", countryAr: "تركيا", source: "local" },
  { id: "global-kuala-lumpur", en: "Kuala Lumpur", ar: "كوالالمبور", lat: 3.1319, lng: 101.6841, tz: "Asia/Kuala_Lumpur", countryEn: "Malaysia", countryAr: "ماليزيا", source: "local" },
  { id: "global-jakarta", en: "Jakarta", ar: "جاكرتا", lat: -6.2088, lng: 106.8456, tz: "Asia/Jakarta", countryEn: "Indonesia", countryAr: "إندونيسيا", source: "local" },
  { id: "global-karachi", en: "Karachi", ar: "كراتشي", lat: 24.8607, lng: 67.0011, tz: "Asia/Karachi", countryEn: "Pakistan", countryAr: "باكستان", source: "local" },
  { id: "global-delhi", en: "Delhi", ar: "دلهي", lat: 28.7041, lng: 77.1025, tz: "Asia/Kolkata", countryEn: "India", countryAr: "الهند", source: "local" },
  { id: "global-tokyo", en: "Tokyo", ar: "طوكيو", lat: 35.6762, lng: 139.6503, tz: "Asia/Tokyo", countryEn: "Japan", countryAr: "اليابان", source: "local" },
  { id: "global-sydney", en: "Sydney", ar: "سيدني", lat: -33.8688, lng: 151.2093, tz: "Australia/Sydney", countryEn: "Australia", countryAr: "أستراليا", source: "local" },
];

export const LOCAL_LOCATIONS: CityLocation[] = [...SAUDI_CITIES, ...FEATURED_GLOBAL_CITIES];

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/[ً-ٰٟ]/g, "");
}

function labelParts(displayName: string) {
  const parts = displayName.split(",").map((p) => p.trim()).filter(Boolean);
  return { city: parts[0] || displayName, country: parts[parts.length - 1] || "" };
}

export function searchLocalLocations(query: string, limit = 40): CityLocation[] {
  const q = normalize(query);
  const base = q
    ? LOCAL_LOCATIONS.filter((c) =>
        normalize(`${c.en} ${c.ar} ${c.countryEn} ${c.countryAr}`).includes(q),
      )
    : SAUDI_CITIES;
  return base.slice(0, limit);
}

export async function searchGlobalLocations(query: string): Promise<CityLocation[]> {
  const q = query.trim();
  if (q.length < 2) return searchLocalLocations(q, 20);
  const local = searchLocalLocations(q, 12);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", q);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "12");
  url.searchParams.set("accept-language", "ar,en");

  try {
    const res = await fetch(url.toString(), { headers: { Accept: "application/json" } });
    if (!res.ok) return local;
    const data = (await res.json()) as Array<{
      place_id: number; lat: string; lon: string; display_name: string;
      address?: Record<string, string>;
    }>;
    const remote = data.map((item) => {
      const address = item.address || {};
      const name = address.city || address.town || address.village || address.municipality || address.county || labelParts(item.display_name).city;
      const country = address.country || labelParts(item.display_name).country;
      return {
        id: `osm-${item.place_id}`,
        en: name, ar: name,
        lat: Number(item.lat), lng: Number(item.lon),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        countryEn: country, countryAr: country,
        region: address.state || address.region,
        source: "global" as const,
      };
    }).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    const seen = new Set<string>();
    return [...local, ...remote].filter((item) => {
      const key = `${item.en}-${item.lat.toFixed(2)}-${item.lng.toFixed(2)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 24);
  } catch {
    return local;
  }
}

export const DEFAULT_LOCATION = SAUDI_CITIES[0];
