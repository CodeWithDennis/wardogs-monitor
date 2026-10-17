<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { applyTheme } from '@/lib/themes';
import MiniMonitor from '@/components/MiniMonitor.vue';
import Shell from '@/components/Shell.vue';

/**
 * One page for both windows: the main panel, or the mini monitor when the
 * window was opened at #mini/<server id>.
 */
const route = ref(location.hash.replace(/^#/, ''));

onMounted(async () => {
    window.addEventListener('hashchange', () => (route.value = location.hash.replace(/^#/, '')));

    // Both windows follow the chosen theme and headline font, live.
    const preferences = await window.panel.preferences.get();
    applyTheme(preferences.theme, preferences.accent, preferences.titleFont);
    window.panel.preferences.onChange((next) => applyTheme(next.theme, next.accent, next.titleFont));
});
</script>

<template>
    <MiniMonitor v-if="route.startsWith('mini/')" :server-id="route.slice(5)" />
    <Shell v-else />
</template>
