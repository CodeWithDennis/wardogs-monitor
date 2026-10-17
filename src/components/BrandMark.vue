<script setup lang="ts">
/**
 * The app's mark: a pair of military dog tags on a bead chain, the front tag
 * carrying a pulse line. Drawn in the text colour with the theme's accent for
 * the pulse, so it follows every theme. The back tag is only drawn where it
 * peeks out past the front one. Mirrors src/assets/brand/mark.svg, which the
 * app icon is rendered from.
 */
</script>

<template>
    <svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path
            d="M24.6 12.89A5.5 5.5 0 0 1 29.37 12.13L38.93 15.05A5.5 5.5 0 0 1 42.58 21.92L37.9 37.22A5.5 5.5 0 0 1 31.3 40.95"
            stroke="currentColor"
            stroke-width="3"
        />
        <circle cx="32.83" cy="17.89" r="1.3" stroke="currentColor" stroke-width="1.5" />
        <path d="M16.73 12.94A8.3 8.3 0 0 1 32.79 8.94" stroke="currentColor" stroke-width="2.9" stroke-dasharray="0 1" pathLength="7" />
        <rect x="6" y="17" width="21" height="27" rx="5.5" stroke="currentColor" stroke-width="3" />
        <circle cx="16.5" cy="21.5" r="1.3" stroke="currentColor" stroke-width="1.5" />
        <path d="M10 32h2.5l2-4.5 3 9 2.5-6.5 1.5 2h2" stroke="var(--accent)" stroke-width="3" />
    </svg>
</template>

<style scoped>
.brand-mark {
    display: block;
    color: var(--text);
}
</style>
