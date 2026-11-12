import { createSvgIcon } from '@mui/material/utils';

/* A medical report: a clipboard with a cross and a line of text. */

export const MedicalReportOutlinedIcon = createSvgIcon(
  <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 4.5H7.5a2.5 2.5 0 0 0-2.5 2.5v11.5a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5V7a2.5 2.5 0 0 0-2.5-2.5H15" />
    <rect x="9" y="2.75" width="6" height="3.5" rx="1.2" />
    <path d="M12 9.75v4.5M9.75 12h4.5M9.5 17.25h5" />
  </g>,
  'MedicalReportOutlined',
);

export const MedicalReportIcon = createSvgIcon(
  <g strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" fill="currentColor" />
    <rect x="9" y="2.75" width="6" height="3.5" rx="1.2" fill="currentColor" stroke="#fff" strokeWidth="1.4" />
    <path d="M12 9.75v4.5M9.75 12h4.5M9.5 17.25h5" fill="none" stroke="#fff" strokeWidth="1.8" />
  </g>,
  'MedicalReport',
);

/*
 * Feather icons (feathericons.com, MIT) — 24px grid, 2px round strokes.
 * Drawn inline so no icon package is needed.
 */
const feather = (children, name) => createSvgIcon(
  <g fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</g>,
  name,
);

export const FeatherHome = feather(
  <>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <polyline points="9 22 9 12 15 12 15 22" />
  </>,
  'FeatherHome',
);

/** Feather's clipboard, with a plus inside for a medical report. */
export const FeatherReport = feather(
  <>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
    <path d="M12 11v6M9 14h6" />
  </>,
  'FeatherReport',
);

export const FeatherMessage = feather(
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  'FeatherMessage',
);

export const FeatherUser = feather(
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </>,
  'FeatherUser',
);

export const FeatherPlus = feather(
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>,
  'FeatherPlus',
);

/*
 * Filled versions of the Feather icons above, for the selected tab. Feather
 * has no filled set, so these are the same outlines filled in, with the
 * inner details cut out in white.
 */
const filled = (children, name) => createSvgIcon(
  <g fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</g>,
  name,
);

export const FeatherHomeFilled = filled(
  <>
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <rect x="9.75" y="13.25" width="4.5" height="8.75" rx="0.6" fill="#fff" stroke="none" />
  </>,
  'FeatherHomeFilled',
);

export const FeatherReportFilled = filled(
  <>
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" stroke="#fff" strokeWidth="1.5" />
    <path d="M12 11v6M9 14h6" fill="none" stroke="#fff" />
  </>,
  'FeatherReportFilled',
);

export const FeatherMessageFilled = filled(
  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />,
  'FeatherMessageFilled',
);

export const FeatherUserFilled = filled(
  <>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2z" />
    <circle cx="12" cy="7" r="4" />
  </>,
  'FeatherUserFilled',
);
