<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { applyTheme } from '@/lib/themes';
import { startTray } from '@/lib/tray';
import BootScreen from '@/components/BootScreen.vue';
import Shell from '@/components/Shell.vue';
import WidgetWindow from '@/components/widgets/WidgetWindow.vue';
import type { WidgetKind } from '@/types';

/**
 * One page for every window: the main panel, or a widget when the window
 * was opened at #widget/<kind>/<server id>.
 */
const route = ref(location.hash.replace(/^#/, ''));
const widget = computed(() => {
    const [, kind, serverId] = route.value.match(/^widget\/(status|score|players|actions)\/(.+)$/) ?? [];

    return kind && serverId ? { kind: kind as WidgetKind, serverId } : null;
});
const isWidget = computed(() => widget.value !== null);

/**
 * Apply the theme. The main window also hands its colours to main, which
 * paints the next start's window and boot screen in them from the first
 * frame (main only writes them when they changed).
 */
function theme(themeValue: string, accentValue: string): void {
    applyTheme(themeValue, accentValue);

    if (!isWidget.value) {
        const style = document.documentElement.style;
        window.panel.rememberBootColors({ bg: style.getPropertyValue('--t-bg'), text: style.getPropertyValue('--t-text'), muted: style.getPropertyValue('--t-muted'), accent: style.getPropertyValue('--accent') });
    }
}

onMounted(async () => {
    window.addEventListener('hashchange', () => (route.value = location.hash.replace(/^#/, '')));

    if (isWidget.value) {
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
    <WidgetWindow v-if="widget" :kind="widget.kind" :server-id="widget.serverId" />
    <template v-else>
        <Shell />
        <BootScreen />
    </template>
</template>
