/*
 * When the app uses its phone layout (slim top bar + bottom tab bar) instead
 * of the desktop sidebar:
 *   - any screen narrower than 1200px — phones, and iPads in portrait;
 *   - touch screens up to 1366px — every iPad Pro, in landscape too.
 * A laptop or desktop with a mouse keeps the sidebar from 1200px up.
 */
const QUERY = '(max-width: 1199.95px), (hover: none) and (pointer: coarse) and (max-width: 1366px)';

/** For sx: `{ display: 'none', [APP_LAYOUT]: { display: 'flex' } }`. */
export const APP_LAYOUT = `@media ${QUERY}`;

/** For useMediaQuery. */
export const APP_LAYOUT_QUERY = QUERY;
