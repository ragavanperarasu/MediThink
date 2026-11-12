/**
 * The languages the Assistant can answer in: English and the ten most spoken
 * languages of India. `status` is what a table's Status column says in that
 * language; the client colours exactly these words (client/src/lib/languages.js
 * keeps the same list).
 */
export const LANGUAGES = {
  en: { name: 'English', native: 'English', status: { low: 'Low', high: 'High', normal: 'Normal', abnormal: 'Abnormal' } },
  hi: { name: 'Hindi', native: 'हिन्दी', status: { low: 'कम', high: 'अधिक', normal: 'सामान्य', abnormal: 'असामान्य' } },
  bn: { name: 'Bengali', native: 'বাংলা', status: { low: 'কম', high: 'বেশি', normal: 'স্বাভাবিক', abnormal: 'অস্বাভাবিক' } },
  mr: { name: 'Marathi', native: 'मराठी', status: { low: 'कमी', high: 'जास्त', normal: 'सामान्य', abnormal: 'असामान्य' } },
  te: { name: 'Telugu', native: 'తెలుగు', status: { low: 'తక్కువ', high: 'ఎక్కువ', normal: 'సాధారణం', abnormal: 'అసాధారణం' } },
  ta: { name: 'Tamil', native: 'தமிழ்', status: { low: 'குறைவு', high: 'அதிகம்', normal: 'இயல்பு', abnormal: 'அசாதாரணம்' } },
  gu: { name: 'Gujarati', native: 'ગુજરાતી', status: { low: 'ઓછું', high: 'વધારે', normal: 'સામાન્ય', abnormal: 'અસામાન્ય' } },
  ur: { name: 'Urdu', native: 'اردو', status: { low: 'کم', high: 'زیادہ', normal: 'نارمل', abnormal: 'غیر معمولی' } },
  kn: { name: 'Kannada', native: 'ಕನ್ನಡ', status: { low: 'ಕಡಿಮೆ', high: 'ಹೆಚ್ಚು', normal: 'ಸಾಮಾನ್ಯ', abnormal: 'ಅಸಾಮಾನ್ಯ' } },
  or: { name: 'Odia', native: 'ଓଡ଼ିଆ', status: { low: 'କମ୍', high: 'ଅଧିକ', normal: 'ସାଧାରଣ', abnormal: 'ଅସାଧାରଣ' } },
  ml: { name: 'Malayalam', native: 'മലയാളം', status: { low: 'കുറവ്', high: 'കൂടുതൽ', normal: 'സാധാരണം', abnormal: 'അസാധാരണം' } },
};

/** A known language code, or English. */
export const languageOf = (code) => (LANGUAGES[code] ? code : 'en');

/** The instruction that makes the whole answer come back in `code`, whatever language the question was asked in. */
export function languageInstruction(code) {
  const lang = LANGUAGES[languageOf(code)];
  const words = lang.status;
  if (code === 'en' || !LANGUAGES[code]) {
    return 'Write your answer in English.';
  }
  return `Write your whole answer in ${lang.name} (${lang.native}), even when the question is asked in English or another language. Use simple, everyday ${lang.name} that a patient's family would use.
- Use only ${lang.name} script, plus English for test names, units and citation tags. Never use characters from any other language or script.
- Keep each test name as the report prints it (usually English); you may add the ${lang.name} word in brackets after it the first time.
- Copy numbers, units and ranges exactly as printed.
- Keep citation tags such as [C12] or [D3] exactly as they are.
- In a table, translate the column headings. A Status cell holds exactly one word and nothing else: ${words.low} for low, ${words.high} for high, ${words.normal} for normal, ${words.abnormal} for abnormal.
- Translate any fixed line you were told to end with, such as the food-ideas note.`;
}
