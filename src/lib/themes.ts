/**
 * The website's backend themes (App\Enums\ForumTheme and the
 * --forum-* palettes in resources/css/app.css), plus Midnight, this app's
 * own navy look and its default. Each gives the nine steps the site uses; style.css
 * works every other colour out from them, so a theme is just data.
 */
export interface Palette {
    bg: string;
    surface: string;
    raised: string;
    hover: string;
    border: string;
    borderStrong: string;
    text: string;
    muted: string;
    faint: string;
}

export interface Theme {
    value: string;
    label: string;
    description: string;
    palette: Palette;
}

const p = (bg: string, surface: string, raised: string, hover: string, border: string, borderStrong: string, text: string, muted: string, faint: string): Palette => ({
    bg,
    surface,
    raised,
    hover,
    border,
    borderStrong,
    text,
    muted,
    faint,
});

export const THEMES: Theme[] = [
    { value: 'midnight', label: 'Midnight', description: 'Starry navy, the look this app started with.', palette: p('#0e1222', '#151b32', '#1a2140', '#1e2546', '#262d4a', '#343c62', '#ebe6d8', '#868ba3', '#5b6080') },
    { value: 'carbon', label: 'Carbon', description: 'Darker than Graphite, lighter than Blackout.', palette: p('#0e1114', '#181c20', '#20242a', '#272b31', '#2c3238', '#41484f', '#ecece8', '#989ba0', '#686c72') },
    { value: 'graphite', label: 'Graphite', description: 'The standard dark grey.', palette: p('#14171a', '#22272c', '#2a3036', '#313840', '#353c43', '#4b535b', '#e8e8e4', '#9b9ea4', '#6c6f76') },
    { value: 'blackout', label: 'Blackout', description: 'Near-black, like the landing page.', palette: p('#08090a', '#0e1012', '#15181b', '#1c1f23', '#24282c', '#383d43', '#f1f1ed', '#8f9396', '#62666a') },
    { value: 'olive-drab', label: 'Olive Drab', description: 'Dark military green.', palette: p('#13150f', '#191c14', '#21251a', '#282d20', '#323927', '#4a5339', '#e7e9dd', '#9da18c', '#6c715c') },
    { value: 'coyote', label: 'Coyote', description: 'Dusty desert brown.', palette: p('#16130f', '#1d1914', '#26211a', '#2e2820', '#3a3228', '#564b3c', '#ebe5d8', '#a89d88', '#74695a') },
    { value: 'navy', label: 'Navy', description: 'Deep naval blue.', palette: p('#0d1117', '#121820', '#19212b', '#1f2934', '#283441', '#3d4d5f', '#e3e8ee', '#8e9aa8', '#5f6b79') },
    { value: 'red-lamp', label: 'Red Lamp', description: 'Dim red, like a blacked-out ops room.', palette: p('#120c0c', '#181010', '#211616', '#291b1b', '#352222', '#503333', '#eee3e1', '#a88f8c', '#735f5d') },
    { value: 'arctic', label: 'Arctic', description: 'Cold blue-grey, like a frozen outpost.', palette: p('#111619', '#172025', '#1f292f', '#263139', '#2f3c44', '#47575f', '#e6eef2', '#93a4ad', '#63727a') },
    { value: 'woodland', label: 'Woodland', description: 'Deep forest green.', palette: p('#0e1411', '#131b17', '#1a241f', '#202c26', '#29372f', '#3e5146', '#e2ebe5', '#8fa397', '#5f7166') },
    { value: 'night-ops', label: 'Night Ops', description: 'Dark violet, for after midnight.', palette: p('#110f17', '#16141e', '#1e1b28', '#252131', '#2f2a3d', '#463f59', '#e8e5ef', '#9c96ab', '#6b6579') },
    { value: 'concrete', label: 'Concrete', description: 'A softer, lighter grey.', palette: p('#1e1f21', '#262729', '#2f3033', '#36383b', '#414347', '#585b60', '#ececea', '#a5a7aa', '#75777b') },
    { value: 'sonar', label: 'Sonar', description: 'Dark teal, like a sonar screen.', palette: p('#0c1414', '#111b1b', '#172424', '#1d2c2c', '#253838', '#395252', '#e0eceb', '#8aa3a1', '#5b7270') },
    { value: 'ember', label: 'Ember', description: 'Burnt orange, like coals after the fire.', palette: p('#160f0b', '#1d140f', '#261b14', '#2e2119', '#3b2a1f', '#573e2e', '#efe4dc', '#ab9483', '#776455') },
    { value: 'nord', label: 'Nord', description: 'Arctic frost blue-grey, from the Nord palette.', palette: p('#242933', '#2e3440', '#3b4252', '#434c5e', '#434c5e', '#4c566a', '#eceff4', '#a7b1c2', '#616e88') },
    { value: 'dracula', label: 'Dracula', description: 'Dusky purple-grey, from the Dracula palette.', palette: p('#21222c', '#282a36', '#303241', '#383a4a', '#44475a', '#565a73', '#f8f8f2', '#b0b4cc', '#6272a4') },
    { value: 'gruvbox', label: 'Gruvbox', description: 'Warm retro brown-grey, from the Gruvbox palette.', palette: p('#1d2021', '#282828', '#32302f', '#3c3836', '#45403d', '#665c54', '#ebdbb2', '#a89984', '#7c6f64') },
    { value: 'tokyo-night', label: 'Tokyo Night', description: 'Neon-city indigo, from the Tokyo Night palette.', palette: p('#16161e', '#1a1b26', '#1f2335', '#292e42', '#2f3549', '#414868', '#c0caf5', '#9aa5ce', '#565f89') },
    { value: 'catppuccin', label: 'Catppuccin', description: 'Soft pastel night, from Catppuccin Mocha.', palette: p('#181825', '#1e1e2e', '#262637', '#313244', '#3a3b50', '#585b70', '#cdd6f4', '#a6adc8', '#6c7086') },
    { value: 'everforest', label: 'Everforest', description: 'Muted forest green-grey, from the Everforest palette.', palette: p('#232a2e', '#2d353b', '#343f44', '#3d484d', '#424d53', '#56635f', '#d3c6aa', '#9da9a0', '#7a8478') },
    { value: 'rose-pine', label: 'Rosé Pine', description: 'Deep plum, from the Rosé Pine palette.', palette: p('#191724', '#1f1d2e', '#26233a', '#2f2b45', '#403d52', '#524f67', '#e0def4', '#908caa', '#6e6a86') },
    { value: 'solarized', label: 'Solarized', description: 'Deep sea teal, from Solarized Dark.', palette: p('#00212b', '#002b36', '#073642', '#0b3f4c', '#0f4553', '#2a5965', '#eee8d5', '#93a1a1', '#657b83') },
    { value: 'kanagawa', label: 'Kanagawa', description: 'Ink and old paper, from the Kanagawa palette.', palette: p('#16161d', '#1f1f28', '#2a2a37', '#363646', '#3b3b4f', '#54546d', '#dcd7ba', '#a8a48c', '#727169') },
    { value: 'one-dark', label: 'One Dark', description: 'Cool editor grey, from the One Dark palette.', palette: p('#21252b', '#282c34', '#2c313a', '#333842', '#3e4451', '#4b5263', '#d7dae0', '#abb2bf', '#5c6370') },
];

/** The accent colour: the website's signal red, or this app's first gold. */
export interface Accent {
    value: string;
    label: string;
    color: string;
    hover: string;
    ink: string;
}

export const ACCENTS: Accent[] = [
    { value: 'gold', label: 'Gold', color: '#e8b54e', hover: '#f4ca70', ink: '#1d1708' },
    { value: 'signal-red', label: 'Signal red', color: '#d52b27', hover: '#e5443f', ink: '#ffffff' },
    { value: 'steel', label: 'Steel blue', color: '#4c8fd6', hover: '#65a3e6', ink: '#ffffff' },
    { value: 'green', label: 'Field green', color: '#3fb97a', hover: '#55cd8e', ink: '#08170f' },
];

/**
 * The headline font, for titles, buttons and uppercase labels (body text stays
 * Inter). Condensed faces read smaller than wide ones at the same size, so each
 * carries a scale the wordmark and the previews multiply their size by.
 */
export interface Font {
    value: string;
    label: string;
    description: string;
    family: string;
    scale: number;
}

export const FONTS: Font[] = [
    { value: 'barlow-condensed', label: 'Barlow Condensed', description: "Tall and narrow, the website's stand-in for its DIN Condensed brand face.", family: "'Barlow Condensed', Impact, sans-serif", scale: 1.12 },
    { value: 'oxanium', label: 'Oxanium', description: 'Wide and blocky with chamfered corners.', family: "'Oxanium', 'Barlow Condensed', Impact, sans-serif", scale: 1 },
    { value: 'saira-stencil', label: 'Saira Stencil One', description: 'Stencilled, like paint on an ammo crate.', family: "'Saira Stencil One', 'Barlow Condensed', Impact, sans-serif", scale: 1 },
    { value: 'russo-one', label: 'Russo One', description: 'Heavy and square, like the landing page.', family: "'Russo One', 'Barlow Condensed', Impact, sans-serif", scale: 1 },
    { value: 'teko', label: 'Teko', description: 'Squared-off and compact, like a HUD readout.', family: "'Teko', 'Barlow Condensed', Impact, sans-serif", scale: 1.22 },
    { value: 'black-ops-one', label: 'Black Ops One', description: 'Rough military stencil, loud and heavy.', family: "'Black Ops One', 'Barlow Condensed', Impact, sans-serif", scale: 0.92 },
];

/** Midnight with gold and Barlow Condensed, unless someone picks another. */
export const DEFAULT_THEME = 'midnight';
export const DEFAULT_ACCENT = 'gold';
export const DEFAULT_FONT = 'barlow-condensed';

/** Put a theme, accent and headline font on the page, as the --t-*, --accent* and --font-title variables style.css reads. */
export function applyTheme(themeValue: string | undefined, accentValue: string | undefined, fontValue?: string): void {
    const theme = THEMES.find((entry) => entry.value === (themeValue ?? DEFAULT_THEME)) ?? THEMES.find((entry) => entry.value === DEFAULT_THEME)!;
    const accent = ACCENTS.find((entry) => entry.value === (accentValue ?? DEFAULT_ACCENT)) ?? ACCENTS.find((entry) => entry.value === DEFAULT_ACCENT)!;
    const font = FONTS.find((entry) => entry.value === (fontValue ?? DEFAULT_FONT)) ?? FONTS.find((entry) => entry.value === DEFAULT_FONT)!;
    const root = document.documentElement;
    const { palette } = theme;

    root.dataset.theme = theme.value;
    root.style.setProperty('--t-bg', palette.bg);
    root.style.setProperty('--t-surface', palette.surface);
    root.style.setProperty('--t-raised', palette.raised);
    root.style.setProperty('--t-hover', palette.hover);
    root.style.setProperty('--t-border', palette.border);
    root.style.setProperty('--t-border-strong', palette.borderStrong);
    root.style.setProperty('--t-text', palette.text);
    root.style.setProperty('--t-muted', palette.muted);
    root.style.setProperty('--t-faint', palette.faint);
    root.style.setProperty('--accent', accent.color);
    root.style.setProperty('--accent-hi', accent.hover);
    root.style.setProperty('--accent-ink', accent.ink);

    // data-font lets style.css stop single-weight fonts from being drawn fake-bold.
    root.dataset.font = font.value;
    root.style.setProperty('--font-title', font.family);
    root.style.setProperty('--title-scale', String(font.scale));
}
