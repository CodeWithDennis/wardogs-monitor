<script setup lang="ts">
/**
 * The app's mark: a hexagon badge with rank chevrons, in the text colour
 * and the theme's accent, so it follows every theme.
 */
</script>

<template>
    <svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M24 3.5 41.5 13.5v21L24 44.5 6.5 34.5v-21Z" stroke="currentColor" stroke-width="3" />
        <path d="M14.5 35.5 24 27l9.5 8.5" stroke="currentColor" stroke-opacity="0.5" stroke-width="3.5" />
        <path d="M14.5 28 24 19.5l9.5 8.5" stroke="var(--accent)" stroke-width="3.5" />
        <circle cx="24" cy="12.5" r="2.75" fill="var(--accent)" />
    </svg>
</template>

<style scoped>
.brand-mark {
    display: block;
    color: var(--text);
}
</style>
