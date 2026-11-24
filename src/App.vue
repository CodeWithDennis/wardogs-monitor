<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, onUnmounted, ref } from 'vue';
import { applyTheme } from '@/lib/themes';
import type { WidgetKind } from '@/types';

/**
 * One page for every window: the main panel, or a widget when the window
 * was opened at #widget/<kind>/<server id>.
 */
const WIDGET_ROUTE = /^widget\/(status|score|players|actions)\/([A-Za-z0-9_-]{1,64})$/;

function hashRoute(): string {
    return location.hash.replace(/^#/, '');
}

const initialRoute = hashRoute();
const initialMatch = initialRoute.match(WIDGET_ROUTE);
const initialIsWidget = initialMatch !== null;
const route = ref(initialRoute);

const widget = computed(() => {
    if (!initialIsWidget) {
        return null;
    }

    const match = route.value.match(WIDGET_ROUTE) ?? initialMatch;
    const kind = match?.[1] as WidgetKind | undefined;
    const serverId = match?.[2];

    return kind && serverId ? { kind, serverId } : null;
});
const isWidget = computed(() => widget.value !== null);

const Shell = defineAsyncComponent(() => import('@/components/Shell.vue'));
const BootScreen = defineAsyncComponent(() => import('@/components/BootScreen.vue'));
const WidgetWindow = defineAsyncComponent(() => import('@/components/widgets/WidgetWindow.vue'));

let lastTheme = '';
let lastAccent = '';
let stopPrefs: (() => void) | null = null;

/**
 * Apply the theme. The main window also hands its colours to main, which
 * paints the next start's window and boot screen in them from the first
 * frame (main only writes them when they changed).
 */
function theme(themeValue: string, accentValue: string): void {
    if (themeValue === lastTheme && accentValue === lastAccent) {
        return;
    }

    lastTheme = themeValue;
    lastAccent = accentValue;
    applyTheme(themeValue, accentValue);

    if (!isWidget.value) {
        const style = document.documentElement.style;
        window.panel.rememberBootColors({ bg: style.getPropertyValue('--t-bg'), text: style.getPropertyValue('--t-text'), muted: style.getPropertyValue('--t-muted'), accent: style.getPropertyValue('--accent') });
    }
}

function onHashChange(): void {
    const next = hashRoute();
    const nextIsWidget = WIDGET_ROUTE.test(next);

    if (nextIsWidget !== initialIsWidget) {
        return;
    }

    route.value = next;
}

onMounted(async () => {
    window.addEventListener('hashchange', onHashChange);

    if (isWidget.value) {
        document.getElementById('boot')?.remove();
    } else {
        const { startTray } = await import('@/lib/tray');
        startTray();
    }

    // Both windows follow the chosen theme, live.
    const preferences = await window.panel.preferences.get();
    theme(preferences.theme, preferences.accent);
    stopPrefs = window.panel.preferences.onChange((next) => theme(next.theme, next.accent));
});

onUnmounted(() => {
    window.removeEventListener('hashchange', onHashChange);
    stopPrefs?.();
});
</script>

<template>
    <WidgetWindow v-if="widget" :kind="widget.kind" :server-id="widget.serverId" />
    <template v-else>
        <Shell />
        <BootScreen />
    </template>
</template>
