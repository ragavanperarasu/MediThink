/**
 * A person's name in Proper Case: "ragavan ENGINEER" → "Ragavan Engineer".
 * Each word starts upper-case and the rest is lower-case, including after a
 * hyphen, apostrophe or full stop ("mary-jane o'brien" → "Mary-Jane O'Brien",
 * "a.r. rahman" → "A.R. Rahman"). Scripts without letter case, such as Tamil,
 * are left as they are. Extra spaces are collapsed.
 */
export function properCase(value) {
  return String(value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
    .replace(/(^|[\s\-'’.])(\p{L})/gu, (_, before, letter) => before + letter.toLocaleUpperCase());
}
