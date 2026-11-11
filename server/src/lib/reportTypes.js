/**
 * The kinds of document MediThink reads.
 *
 * Ids are stored on records, so they are append-only: add a kind, never rename
 * or remove one. The client keeps labels and colours for the same ids in
 * client/src/lib/reportTypes.js.
 */
export const REPORT_TYPES = ['blood', 'urine', 'endoscopy', 'imaging', 'other', 'ecg', 'echo', 'prescription'];

export const isReportType = (value) => REPORT_TYPES.includes(value);

/**
 * How each kind is described to the model. Worth saying: a blood panel is
 * numbers against ranges, an endoscopy report is a description with no ranges,
 * and a model told which it is reading does not go looking for the other's
 * shape and narrate its absence.
 */
export const REPORT_TYPE_CONTEXT = {
  blood: 'This is a blood test report: numeric results measured against reference ranges.',
  urine: 'This is a urine test report: physical, chemical and microscopic findings, some numeric and some qualitative (e.g. "Nil", "Trace", "Positive").',
  endoscopy:
    'This is an endoscopy report: a description of what was seen during the procedure, usually with findings and an impression. ' +
    'It generally has no numeric reference ranges, so do not look for them or remark on their absence.',
  imaging:
    'This is an imaging report (X-ray, ultrasound, CT or MRI): a radiologist\'s findings and impression in prose, with occasional measurements. ' +
    'It generally has no reference ranges, so do not look for them or remark on their absence.',
  other: 'This is a medical report of an unspecified kind.',
  ecg:
    'This is an electrocardiogram (ECG) tracing: machine-printed intervals and axes (heart rate, PR, QRS, QT and so on), sometimes with an interpretation. ' +
    'It generally prints no reference ranges, so do not look for them or remark on their absence.',
  echo:
    'This is an echocardiogram report: chamber measurements, valve findings and an impression, sometimes with ultrasound screenshots. ' +
    'Text read from ultrasound screenshots is often unreliable; prefer the typed report pages. ' +
    'It generally has no reference ranges, so do not look for them or remark on their absence.',
  prescription:
    'This is an outpatient consultation note or prescription: vital signs, diagnoses, investigations mentioned and medicines prescribed. ' +
    'Vital signs are the only measured results; medicines, doses and diagnoses are not results.',
};

/** Short names, as the comparison and its explanation print them. */
export const REPORT_TYPE_LABEL = {
  blood: 'Blood test', urine: 'Urine test', endoscopy: 'Endoscopy', imaging: 'Imaging', other: 'Other report',
  ecg: 'ECG', echo: 'Echocardiogram', prescription: 'Prescription',
};

/** One line per kind, for the model that sorts a bundle into documents. */
export const REPORT_TYPE_GUIDE = {
  blood: 'a laboratory report of blood tests (a lab report that also has a few urine rows still counts as blood)',
  urine: 'a laboratory report of urine tests only',
  endoscopy: 'an endoscopy or colonoscopy procedure report',
  imaging: 'X-ray, CT, MRI or ultrasound (other than an echocardiogram), with its images',
  ecg: 'an ECG / electrocardiogram tracing or report',
  echo: 'an echocardiogram (ECHO / 2D echo) report, with its ultrasound screenshot pages',
  prescription: 'an outpatient / OPD consultation note, case sheet or prescription',
  other: 'anything else: discharge summary, bill, letter, consent form',
};
