/**
 * The languages the Assistant can answer in — the same list as
 * server/src/lib/languages.js. `short` is what the language button shows;
 * `speech` is the code the mic listens in;
 * `status` is the word a table's Status column uses in that language.
 */
export const LANGUAGES = [
  { code: 'en', speech: 'en-IN', name: 'English', native: 'English', short: 'EN', status: { low: 'Low', high: 'High', normal: 'Normal', abnormal: 'Abnormal' } },
  { code: 'hi', speech: 'hi-IN', name: 'Hindi', native: 'हिन्दी', short: 'हि', status: { low: 'कम', high: 'अधिक', normal: 'सामान्य', abnormal: 'असामान्य' } },
  { code: 'bn', speech: 'bn-IN', name: 'Bengali', native: 'বাংলা', short: 'বা', status: { low: 'কম', high: 'বেশি', normal: 'স্বাভাবিক', abnormal: 'অস্বাভাবিক' } },
  { code: 'mr', speech: 'mr-IN', name: 'Marathi', native: 'मराठी', short: 'म', status: { low: 'कमी', high: 'जास्त', normal: 'सामान्य', abnormal: 'असामान्य' } },
  { code: 'te', speech: 'te-IN', name: 'Telugu', native: 'తెలుగు', short: 'తె', status: { low: 'తక్కువ', high: 'ఎక్కువ', normal: 'సాధారణం', abnormal: 'అసాధారణం' } },
  { code: 'ta', speech: 'ta-IN', name: 'Tamil', native: 'தமிழ்', short: 'த', status: { low: 'குறைவு', high: 'அதிகம்', normal: 'இயல்பு', abnormal: 'அசாதாரணம்' } },
  { code: 'gu', speech: 'gu-IN', name: 'Gujarati', native: 'ગુજરાતી', short: 'ગુ', status: { low: 'ઓછું', high: 'વધારે', normal: 'સામાન્ય', abnormal: 'અસામાન્ય' } },
  { code: 'ur', speech: 'ur-IN', name: 'Urdu', native: 'اردو', short: 'ار', status: { low: 'کم', high: 'زیادہ', normal: 'نارمل', abnormal: 'غیر معمولی' } },
  { code: 'kn', speech: 'kn-IN', name: 'Kannada', native: 'ಕನ್ನಡ', short: 'ಕ', status: { low: 'ಕಡಿಮೆ', high: 'ಹೆಚ್ಚು', normal: 'ಸಾಮಾನ್ಯ', abnormal: 'ಅಸಾಮಾನ್ಯ' } },
  { code: 'or', speech: 'or-IN', name: 'Odia', native: 'ଓଡ଼ିଆ', short: 'ଓ', status: { low: 'କମ୍', high: 'ଅଧିକ', normal: 'ସାଧାରଣ', abnormal: 'ଅସାଧାରଣ' } },
  { code: 'ml', speech: 'ml-IN', name: 'Malayalam', native: 'മലയാളം', short: 'മ', status: { low: 'കുറവ്', high: 'കൂടുതൽ', normal: 'സാധാരണം', abnormal: 'അസാധാരണം' } },
];

export const languageByCode = (code) => LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];

/** Every language's status word → low | high | normal | abnormal, for colouring table cells. */
export const STATUS_WORDS = new Map(
  LANGUAGES.flatMap((l) => Object.entries(l.status).map(([status, word]) => [word.toLowerCase(), status])),
);

/*
 * The chosen answer language is remembered per profile in this browser —
 * a grandparent's profile can stay in Tamil while yours stays in English.
 */
const key = (profileId) => `medithink.answerLanguage.${profileId}`;

export function savedLanguage(profileId) {
  try {
    return languageByCode(window.localStorage.getItem(key(profileId))).code;
  } catch {
    return 'en';
  }
}

export function saveLanguage(profileId, code) {
  try {
    window.localStorage.setItem(key(profileId), code);
  } catch { /* private mode: the choice lasts until the page is closed */ }
}
