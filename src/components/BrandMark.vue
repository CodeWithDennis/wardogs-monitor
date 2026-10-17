<script setup lang="ts">
/**
 * The app's mark: a monitor with a pulse line, in the text colour and the
 * theme's accent, so it follows every theme.
 */
</script>

<template>
    <svg class="brand-mark" viewBox="0 0 48 48" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="5" y="7" width="38" height="27" rx="4.5" stroke="currentColor" stroke-width="3" />
        <path d="M24 34v6.5M16.5 41h15" stroke="currentColor" stroke-width="3" />
        <path d="M11 21.5h6l3-6.5 5 13 3.5-8.5 2 2h6.5" stroke="var(--accent)" stroke-width="3" />
    </svg>
</template>

<style scoped>
.brand-mark {
    display: block;
    color: var(--text);
}
</style>
