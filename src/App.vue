<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { applyTheme } from '@/lib/themes';
import { startTray } from '@/lib/tray';
import BootScreen from '@/components/BootScreen.vue';
import MiniMonitor from '@/components/MiniMonitor.vue';
import Shell from '@/components/Shell.vue';

/**
 * One page for both windows: the main panel, or the mini monitor when the
 * window was opened at #mini/<server id>.
 */
const route = ref(location.hash.replace(/^#/, ''));
const isMini = computed(() => route.value.startsWith('mini/'));

/**
 * Apply the theme. The main window also hands its colours to main, which
 * paints the next start's window and boot screen in them from the first
 * frame (main only writes them when they changed).
 */
function theme(themeValue: string, accentValue: string): void {
    applyTheme(themeValue, accentValue);

    if (!isMini.value) {
        const style = document.documentElement.style;
        window.panel.rememberBootColors({ bg: style.getPropertyValue('--t-bg'), text: style.getPropertyValue('--t-text'), muted: style.getPropertyValue('--t-muted'), accent: style.getPropertyValue('--accent') });
    }
}

onMounted(async () => {
    window.addEventListener('hashchange', () => (route.value = location.hash.replace(/^#/, '')));

    if (isMini.value) {
        document.getElementById('boot')?.remove();
    } else {
        startTray();
    }

    // Both windows follow the chosen theme, live.
    const preferences = await window.panel.preferences.get();
    theme(preferences.theme, preferences.accent);
    window.panel.preferences.onChange((next) => theme(next.theme, next.accent));
});
</script>

<template>
    <MiniMonitor v-if="isMini" :server-id="route.slice(5)" />
    <template v-else>
        <Shell />
        <BootScreen />
    </template>
</template>
