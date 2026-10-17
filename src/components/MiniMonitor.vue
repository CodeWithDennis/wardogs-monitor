<script setup lang="ts">
import { AppWindow, MapPin, Users, X } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import FactionScores from '@/components/FactionScores.vue';
import BrandMark from '@/components/BrandMark.vue';
import { formatUptime, gameName, modeName, percent, zoneName } from '@/lib/format';
import { mapName } from '@/lib/maps';
import type { Live, SavedServer } from '@/types';

/**
 * The small always-on-top window, like the floating guide tracker in the
 * reference: one server's map, score race and player count, readable over
 * the game.
 */
const props = defineProps<{ serverId: string }>();

const serverId = ref(props.serverId);
const server = ref<SavedServer | null>(null);
const live = ref<Live | null>(null);
const next = ref<string | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let refreshSeconds = 5;

const status = computed(() => live.value?.status ?? null);
const fill = computed(() => (status.value ? percent(status.value.players, status.value.maxPlayers) : 0));

async function poll(): Promise<void> {
    clearTimeout(timer);

    try {
        live.value = await window.panel.server.live(serverId.value);

        if (live.value.online) {
            const rotation = await window.panel.server.rotation(serverId.value);
            const entry = rotation.entries.find((item) => item.status === 'next');
            next.value = rotation.enabled && entry ? `${mapName(entry.map)} · ${modeName(entry.experiences)}` : null;
        }
    } finally {
        timer = setTimeout(poll, refreshSeconds * 1000);
    }
}

async function load(): Promise<void> {
    server.value = (await window.panel.servers.list()).find((entry) => entry.id === serverId.value) ?? null;
    poll();
}

onMounted(async () => {
    document.documentElement.classList.add('mini-window');
    refreshSeconds = (await window.panel.preferences.get()).refreshSeconds;
    window.panel.preferences.onChange((next) => (refreshSeconds = next.refreshSeconds));
    window.panel.mini.onServer((id) => {
        serverId.value = id;
        live.value = null;
        load();
    });
    load();
});

const focusMain = () => window.panel.focusMain();
const closeMini = () => window.panel.mini.close();

onUnmounted(() => clearTimeout(timer));
</script>

<template>
    <div class="mini">
        <header class="head drag">
            <span class="tab">
                <BrandMark class="tab-mark" />
                <span class="truncate">{{ server?.name ?? 'Server' }}</span>
            </span>
            <span class="spacer" />
            <button type="button" class="head-btn" title="Open the panel" @click="focusMain"><AppWindow /></button>
            <button type="button" class="head-btn" title="Close" @click="closeMini"><X /></button>
        </header>

        <div v-if="live?.online && status" class="body">
            <div class="where">
                <MapPin class="pin" />
                <div class="min">
                    <div class="map">{{ mapName(status.map) }}</div>
                    <div class="sub truncate">{{ modeName(status.experiences) }}<template v-if="status.zone"> · {{ zoneName(status.zone) }}</template><template v-if="status.lighting"> · {{ gameName(status.lighting) }}</template></div>
                </div>
            </div>

            <FactionScores :factions="status.factions" compact class="scores" />

            <div class="facts">
                <span><Users class="tiny" /> <span class="num">{{ status.players }}</span><span class="faint">/{{ status.maxPlayers }}</span></span>
                <span class="faint">up {{ formatUptime(live.uptimeSeconds ?? 0) }}</span>
            </div>

            <div v-if="next" class="next">Then: <span class="gold">{{ next }}</span></div>

            <div class="foot">
                <div class="progress"><span :style="{ width: `${fill}%` }" /></div>
                <span class="num">{{ fill }}%</span>
            </div>
        </div>

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
html.mini-window,
html.mini-window body {
    background: transparent;
}
</style>

<style scoped>
.mini {
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
    gap: 9px;
    min-width: 0;
    max-width: 75%;
    padding: 0 15.5px 0 13px;
    border-bottom: 2px solid var(--accent);
    background: var(--select);
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 600;
    letter-spacing: 0.01em;
}

.tab .tab-mark {
    width: 14px;
    height: 14px;
    flex: none;
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
    padding: 13px 17.5px 13px;
    overflow: hidden;
}

.where {
    display: flex;
    gap: 11px;
}

.pin {
    width: 16.5px;
    height: 16.5px;
    margin-top: 3.5px;
    color: var(--text-2);
    flex: none;
}

.min {
    min-width: 0;
}

.map {
    font-family: var(--font-title);
    font-size: calc(17.5px * var(--title-scale, 1));
    line-height: 1.2;
}

.sub {
    color: var(--text-2);
    font-size: 12.5px;
}

.scores {
    margin-top: 13px;
}

.facts {
    display: flex;
    justify-content: space-between;
    margin-top: 13px;
    font-size: 14px;
}

.facts > span {
    display: inline-flex;
    align-items: center;
    gap: 5.5px;
}

.tiny {
    width: 14.5px;
    height: 14.5px;
    color: var(--muted);
}

.next {
    margin-top: 6.5px;
    color: var(--text-2);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.foot {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-top: auto;
    padding-top: 11px;
    font-size: 12.5px;
    color: var(--text-2);
}

.foot .progress {
    flex: 1;
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
