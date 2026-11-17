/**
 * The kinds of document MediThink reads.
 *
 * Ids are stored on records, so they are append-only: add a kind, never rename
 * or remove one (reordering is fine — the order is only how lists are shown).
 * Ids are lowercase letters only: the Assistant's "type:<id>" scope accepts
 * nothing else. The client keeps labels, colours and icons for the same ids in
 * client/src/lib/reportTypes.js.
 *
 * `imaging` predates the scan-specific kinds (xray, ultrasound, ct, mri …) and
 * stays for older records and any scan that fits none of them.
 */
export const REPORT_TYPES = [
  // Laboratory
  'blood', 'urine', 'stool', 'culture', 'semen', 'pathology', 'genetic',
  // Heart
  'ecg', 'echo', 'tmt', 'holter', 'angiography',
  // Scans
  'xray', 'ultrasound', 'ct', 'mri', 'mammography', 'dexa', 'nuclear', 'imaging',
  // Other tests and procedures
  'endoscopy', 'pft', 'sleep', 'neuro', 'audiometry', 'eye', 'dental', 'surgery',
  // Notes and records
  'prescription', 'discharge', 'vaccination', 'certificate', 'bill',
  'other',
];

export const isReportType = (value) => REPORT_TYPES.includes(value);

const NO_RANGES = 'It generally has no reference ranges, so do not look for them or remark on their absence.';
const PROSE = (what) => `This is ${what}: findings and an impression or conclusion in prose, with occasional measurements. ${NO_RANGES}`;

/**
 * How each kind is described to the model. Worth saying: a blood panel is
 * numbers against ranges, an endoscopy report is a description with no ranges,
 * and a model told which it is reading does not go looking for the other's
 * shape and narrate its absence.
 */
export const REPORT_TYPE_CONTEXT = {
  blood: 'This is a blood test report: numeric results measured against reference ranges.',
  urine: 'This is a urine test report: physical, chemical and microscopic findings, some numeric and some qualitative (e.g. "Nil", "Trace", "Positive").',
  stool:
    'This is a stool (faeces) test report: physical and microscopic findings, occult blood, ova and cysts, mostly qualitative (e.g. "Absent", "Present", "Nil").',
  culture:
    'This is a microbiology culture report: the specimen, whether any organism grew and, if so, an antibiotic sensitivity table (Sensitive / Intermediate / Resistant). ' +
    'The sensitivity table lists antibiotics tested, not medicines prescribed; never present them as a recommendation.',
  semen:
    'This is a semen analysis report: volume, count, motility and morphology, usually numeric against reference values.',
  pathology:
    'This is a pathology report — a biopsy, histopathology, cytology, FNAC or Pap smear: a description of the tissue or cells and a diagnosis or impression in prose. ' +
    NO_RANGES,
  genetic:
    'This is a genetic or molecular test report: the genes or variants tested, the result (e.g. detected / not detected, a variant and its classification) and an interpretation.',
  ecg:
    'This is an electrocardiogram (ECG) tracing: machine-printed intervals and axes (heart rate, PR, QRS, QT and so on), sometimes with an interpretation. ' +
    NO_RANGES,
  echo:
    'This is an echocardiogram report: chamber measurements, valve findings and an impression, sometimes with ultrasound screenshots. ' +
    'Text read from ultrasound screenshots is often unreliable; prefer the typed report pages. ' +
    NO_RANGES,
  tmt:
    'This is a treadmill / exercise stress test (TMT) report: the protocol, stages reached, heart rate and blood pressure response, symptoms and ECG changes, and a conclusion (e.g. "negative for inducible ischaemia"). ' +
    NO_RANGES,
  holter:
    'This is an ambulatory monitoring report — a Holter (24-hour ECG) or ambulatory blood pressure study: heart rates or pressures over the recording, events counted, and a summary. ' +
    NO_RANGES,
  angiography:
    'This is an angiography or cardiac catheterisation report (coronary angiogram, angioplasty / PCI): the vessels studied, any narrowing with its percentage, procedures done and a conclusion. ' +
    NO_RANGES,
  xray: PROSE("an X-ray report (a radiologist's reading of an X-ray)"),
  ultrasound: PROSE('an ultrasound / sonography report (abdomen, pelvis, pregnancy scan, Doppler or similar)'),
  ct: PROSE('a CT scan report'),
  mri: PROSE('an MRI scan report'),
  mammography: PROSE('a mammogram or breast imaging report, often ending with a BI-RADS category'),
  dexa:
    'This is a bone density (DEXA / DXA) report: bone mineral density at sites such as the spine and hip, with T-scores and Z-scores, and a conclusion (normal, osteopenia or osteoporosis).',
  nuclear: PROSE('a nuclear medicine or PET scan report (e.g. PET-CT, thyroid scan, bone scan, myocardial perfusion scan)'),
  imaging: PROSE("an imaging report (X-ray, ultrasound, CT or MRI): a radiologist's reading"),
  endoscopy:
    'This is an endoscopy report: a description of what was seen during the procedure, usually with findings and an impression. ' +
    NO_RANGES,
  pft:
    'This is a pulmonary function / spirometry report: lung volumes and flows (FEV1, FVC, FEV1/FVC and so on), often as measured values against predicted values and percent predicted, and an interpretation.',
  sleep:
    'This is a sleep study (polysomnography) report: sleep stages, breathing events (apnoea-hypopnoea index, AHI), oxygen levels and a conclusion.',
  neuro:
    'This is a neurophysiology report — an EEG, EMG or nerve conduction study: what was recorded and an impression. ' +
    NO_RANGES,
  audiometry:
    'This is a hearing test (audiometry) report: hearing thresholds in decibels across frequencies for each ear, and a conclusion on the type and degree of any hearing loss.',
  eye:
    'This is an eye examination report: vision, refraction or spectacle power, eye pressure and findings for each eye. ' +
    NO_RANGES,
  dental: PROSE('a dental report or dental X-ray reading'),
  surgery:
    'This is an operation or procedure note: the procedure done, findings during it, and what was removed or repaired. ' +
    NO_RANGES,
  prescription:
    'This is an outpatient consultation note or prescription: vital signs, diagnoses, investigations mentioned and medicines prescribed. ' +
    'Vital signs are the only measured results; medicines, doses and diagnoses are not results.',
  discharge:
    'This is a hospital discharge summary: the reason for admission, diagnoses, what was done in hospital, condition at discharge, medicines at discharge and follow-up advice. ' +
    'It may quote a few test results; medicines, doses and diagnoses are not results.',
  vaccination:
    'This is a vaccination record: the vaccines given, with dates and doses. It holds no test results.',
  certificate:
    'This is a medical or fitness certificate: a doctor\'s statement about the person\'s health, fitness or leave. It holds no test results.',
  bill:
    'This is a hospital or pharmacy bill: services, tests and items charged. It holds no test results; amounts are money, not results.',
  other: 'This is a medical report of an unspecified kind.',
};

/** Short names, as the comparison and its explanation print them. */
export const REPORT_TYPE_LABEL = {
  blood: 'Blood test', urine: 'Urine test', stool: 'Stool test', culture: 'Culture test', semen: 'Semen analysis',
  pathology: 'Biopsy / pathology', genetic: 'Genetic test',
  ecg: 'ECG', echo: 'Echocardiogram', tmt: 'Stress test (TMT)', holter: 'Holter / BP monitor', angiography: 'Angiography',
  xray: 'X-ray', ultrasound: 'Ultrasound', ct: 'CT scan', mri: 'MRI scan', mammography: 'Mammogram', dexa: 'Bone density',
  nuclear: 'PET / nuclear scan', imaging: 'Imaging',
  endoscopy: 'Endoscopy', pft: 'Lung function', sleep: 'Sleep study', neuro: 'EEG / nerve study', audiometry: 'Hearing test',
  eye: 'Eye test', dental: 'Dental', surgery: 'Operation note',
  prescription: 'Prescription', discharge: 'Discharge summary', vaccination: 'Vaccination record',
  certificate: 'Medical certificate', bill: 'Bill', other: 'Other report',
};

/** One line per kind, for the model that sorts a bundle into documents. */
export const REPORT_TYPE_GUIDE = {
  blood: 'a laboratory report of blood tests — blood count, sugar, HbA1c, lipids, kidney, liver, thyroid, hormones, vitamins, serology and the like (a lab report that also has a few urine rows still counts as blood)',
  urine: 'a laboratory report of urine tests only (routine urine, urine culture goes under culture)',
  stool: 'a laboratory report of stool / faeces tests only',
  culture: 'a microbiology culture and sensitivity report (urine, blood, sputum, pus or swab culture)',
  semen: 'a semen analysis report',
  pathology: 'a biopsy, histopathology, cytology, FNAC or Pap smear report',
  genetic: 'a genetic, molecular or DNA test report (e.g. a gene panel, karyotype)',
  ecg: 'an ECG / electrocardiogram tracing or report',
  echo: 'an echocardiogram (ECHO / 2D echo) report, with its ultrasound screenshot pages',
  tmt: 'a treadmill test (TMT) / exercise stress test report',
  holter: 'a Holter (24-hour ECG) or ambulatory blood pressure monitoring report',
  angiography: 'a coronary angiogram, angioplasty / PCI or cardiac catheterisation report',
  xray: 'an X-ray report, with its images',
  ultrasound: 'an ultrasound / sonography / Doppler report (other than an echocardiogram), including pregnancy scans, with its images',
  ct: 'a CT scan report, with its images',
  mri: 'an MRI scan report, with its images',
  mammography: 'a mammogram or breast imaging report',
  dexa: 'a bone density (DEXA / DXA) scan report',
  nuclear: 'a PET, PET-CT or nuclear medicine scan report (thyroid scan, bone scan, perfusion scan)',
  imaging: 'any other imaging report that fits none of the scan kinds above',
  endoscopy: 'an endoscopy, colonoscopy, bronchoscopy or similar scope procedure report',
  pft: 'a pulmonary function test (PFT) / spirometry report',
  sleep: 'a sleep study / polysomnography report',
  neuro: 'an EEG, EMG or nerve conduction study (NCV / NCS) report',
  audiometry: 'a hearing test / audiometry report',
  eye: 'an eye examination, vision or spectacle prescription report',
  dental: 'a dental report or dental X-ray (OPG) reading',
  surgery: 'an operation note, surgery report or procedure note (other than endoscopy and angiography)',
  prescription: 'an outpatient / OPD consultation note, case sheet or prescription',
  discharge: 'a hospital discharge summary',
  vaccination: 'a vaccination / immunisation record or certificate',
  certificate: 'a medical certificate, fitness certificate or sick-leave note',
  bill: 'a hospital, lab or pharmacy bill, invoice or receipt',
  other: 'anything else: a referral letter, consent form, insurance form or a page that fits no kind above',
};
