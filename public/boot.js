/**
 * Runs before the page draws anything (a plain blocking script, so it is
 * done before the first frame). Main passes the open theme's colours in the
 * address (?bg=…&text=…&muted=…&accent=…), and this paints the boot screen
 * in index.html with them, so a non-default theme never flashes Midnight
 * first. Widget windows have no boot screen. Kept tiny and free
 * of imports so it costs nothing.
 */
(() => {
    const root = document.documentElement;

    if (location.hash.startsWith('#widget/')) {
        root.classList.add('widget-window');

        return;
    }

    const query = new URLSearchParams(location.search);

    for (const key of ['bg', 'text', 'muted', 'accent']) {
        const value = query.get(key);

        if (value && /^#[0-9a-f]{6}$/i.test(value)) {
            root.style.setProperty(`--boot-${key}`, value);
        }
    }
})();
