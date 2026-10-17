import brand from '../../brand.json';

/**
 * The product's name and wording, from brand.json at the project root, so
 * the app can be renamed in one place (package.json's productName too).
 */
export const BRAND = brand;

/** The name for the wordmark: the last word ("RCON") is set in the accent colour. */
const words = brand.name.split(' ');
export const WORDMARK = { lead: words.slice(0, -1).join(' '), last: words[words.length - 1] };
