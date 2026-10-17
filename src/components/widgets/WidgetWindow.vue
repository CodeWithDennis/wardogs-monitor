<script setup lang="ts">
import { AppWindow, X } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import QuickActionsWidget from '@/components/widgets/QuickActionsWidget.vue';
import ScoreWidget from '@/components/widgets/ScoreWidget.vue';
import StatusWidget from '@/components/widgets/StatusWidget.vue';
import TopPlayersWidget from '@/components/widgets/TopPlayersWidget.vue';
import { modeName } from '@/lib/format';
import { mapName } from '@/lib/maps';
import { WIDGETS } from '@/lib/widgets';
import type { Live, Preferences, SavedServer, WidgetKind } from '@/types';

/**
 * A widget's window, like the floating guide tracker in the reference: a
 * small always-on-top frame with a tab naming the widget and its server,
 * readable over the game. It reads its server on the usual schedule and
 * hands the reading to the widget it shows.
 */
const props = defineProps<{ kind: WidgetKind; serverId: string }>();

const bodies = { status: StatusWidget, score: ScoreWidget, players: TopPlayersWidget, actions: QuickActionsWidget };

const meta = computed(() => WIDGETS.find((widget) => widget.kind === props.kind) ?? WIDGETS[0]);
const server = ref<SavedServer | null>(null);
const live = ref<Live | null>(null);
const next = ref<string | null>(null);
const preferences = ref<Preferences | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

async function poll(): Promise<void> {
    clearTimeout(timer);

    try {
        live.value = await window.panel.server.live(props.serverId);

        if (live.value.online && props.kind === 'status') {
            const rotation = await window.panel.server.rotation(props.serverId);
            const entry = rotation.entries.find((item) => item.status === 'next');
            next.value = rotation.enabled && entry ? `${mapName(entry.map)} · ${modeName(entry.experiences)}` : null;
        }
    } finally {
        timer = setTimeout(poll, (preferences.value?.refreshSeconds ?? 5) * 1000);
    }
}

onMounted(async () => {
    document.documentElement.classList.add('widget-window');
    preferences.value = await window.panel.preferences.get();
    window.panel.preferences.onChange((value) => (preferences.value = value));
    server.value = (await window.panel.servers.list()).find((entry) => entry.id === props.serverId) ?? null;
    poll();
});

onUnmounted(() => clearTimeout(timer));

const focusMain = () => window.panel.focusMain();
const close = () => window.panel.widgets.close();
</script>

<template>
    <div class="widget">
        <header class="head drag">
            <span class="tab">
                <component :is="meta.icon" class="tab-icon" />
                <span class="tab-kind">{{ meta.label }}</span>
                <span class="tab-server truncate">{{ server?.name ?? 'Server' }}</span>
            </span>
            <span class="spacer" />
            <button type="button" class="head-btn" title="Open the app" @click="focusMain"><AppWindow /></button>
            <button type="button" class="head-btn" title="Close this widget" @click="close"><X /></button>
        </header>

        <component :is="bodies[kind]" v-if="live?.online && live.status && preferences" :live="live" :status="live.status" :next="next" :server-id="serverId" :preferences="preferences" class="body" @refresh="poll" />

        <div v-else-if="live" class="body off">
            <span class="dot offline" />
            <span>{{ live.error }}</span>
        </div>

        <div v-else class="body">
            <div class="skeleton" style="height: 18px; width: 60%" />
            <div class="skeleton" style="height: 50px; margin-top: 14px" />
        </div>
    </div>
</template>

<style>
html.widget-window,
html.widget-window body {
    background: transparent;
}
</style>

<style scoped>
.widget {
    display: flex;
    flex-direction: column;
    height: 100vh;
    border: 1px solid var(--line-strong);
    border-radius: 6.5px;
    overflow: hidden;
    background:
        radial-gradient(1px 1px at 20% 30%, rgb(255 255 255 / 0.35), transparent 60%),
        radial-gradient(1px 1px at 70% 60%, rgb(255 255 255 / 0.25), transparent 60%),
        radial-gradient(1px 1px at 85% 20%, rgb(255 255 255 / 0.3), transparent 60%),
        linear-gradient(180deg, var(--panel), var(--bg));
}

.head {
    display: flex;
    align-items: stretch;
    height: 35px;
    flex: none;
    border-bottom: 1px solid var(--line);
    background: var(--scrim);
}

.tab {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 78%;
    padding: 0 15.5px 0 12px;
    border-bottom: 2px solid var(--accent);
    background: var(--select);
    font-family: var(--font-body);
    font-size: 12.5px;
    letter-spacing: 0.01em;
}

.tab-icon {
    width: 14px;
    height: 14px;
    flex: none;
    color: var(--accent);
}

.tab-kind {
    flex: none;
    font-weight: 600;
}

.tab-server {
    color: var(--text-2);
}

.spacer {
    flex: 1;
}

.head-btn {
    display: grid;
    place-items: center;
    width: 37.5px;
    border: 0;
    background: transparent;
    color: var(--muted);
}

.head-btn:hover {
    background: rgb(255 255 255 / 0.06);
    color: var(--text);
}

.head-btn svg {
    width: 15.5px;
    height: 15.5px;
}

.body {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    padding: 13px 17.5px;
    overflow: hidden;
}

.off {
    flex-direction: row;
    align-items: flex-start;
    gap: 11px;
    color: var(--text-2);
    font-size: 14px;
}

.off .dot {
    margin-top: 6.5px;
}
</style>
