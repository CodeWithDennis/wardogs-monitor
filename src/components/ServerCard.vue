<script setup lang="ts">
import { ArrowRight, Ellipsis, Lock, Pencil, PictureInPicture2, Trash2, WifiOff } from 'lucide-vue-next';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import FactionScores from '@/components/FactionScores.vue';
import MapArt from '@/components/MapArt.vue';
import TimeAgo from '@/components/TimeAgo.vue';
import { formatUptime, modeName, percent } from '@/lib/format';
import { BILLING_URL, openBilling } from '@/lib/licence';
import { mapName } from '@/lib/maps';
import { removeServer, selectServer, state } from '@/lib/store';
import type { SavedServer } from '@/types';

/**
 * One server as a card: its map pictured, status, players, the score race
 * and where it is. Clicking opens its controls; the ⋯ menu (or a right
 * click) edits, removes it or opens the mini monitor.
 */
const props = defineProps<{ server: SavedServer }>();

const live = computed(() => state.lives[props.server.id]);
const status = computed(() => live.value?.status ?? null);
const fill = computed(() => (status.value ? percent(status.value.players, status.value.maxPlayers) : 0));

const menu = ref(false);
const root = ref<HTMLElement | null>(null);

function open(): void {
    selectServer(props.server.id);
}

function edit(): void {
    menu.value = false;
    state.editingServer = props.server;
}

function remove(): void {
    menu.value = false;
    removeServer(props.server);
}

async function mini(): Promise<void> {
    menu.value = false;
    selectServer(props.server.id, false);
    await window.panel.mini.open(props.server.id);
    state.miniOpen = true;
}

function onDocument(event: MouseEvent): void {
    if (menu.value && root.value && !root.value.querySelector('.menu-wrap')?.contains(event.target as Node)) {
        menu.value = false;
    }
}

onMounted(() => document.addEventListener('mousedown', onDocument));
onUnmounted(() => document.removeEventListener('mousedown', onDocument));
</script>

<template>
    <article
        ref="root"
        class="card server-card"
        :class="{ offline: live && !live.online, selected: server.id === state.selectedId }"
        tabindex="0"
        @click="open"
        @keydown.enter.self="open"
        @contextmenu.prevent="menu = true"
    >
        <div class="art-wrap">
            <MapArt :map="status?.map" :lighting="status?.lighting" class="art" />
            <span class="status pill" :class="live === undefined ? '' : live.online ? 'pill-ok' : 'pill-bad'">
                <span class="dot" :class="live === undefined ? 'pending' : live.online ? 'online' : 'offline'" />
                {{ live === undefined ? 'Connecting' : live.online ? 'Online' : live.locked ? 'Locked' : 'Offline' }}
            </span>

            <div class="menu-wrap" @click.stop>
                <button type="button" class="icon-btn" title="More" :aria-expanded="menu" @click="menu = !menu"><Ellipsis /></button>
                <Transition name="pop">
                    <div v-if="menu" class="menu" role="menu">
                        <button type="button" role="menuitem" @click="open"><ArrowRight /> Open controls</button>
                        <button type="button" role="menuitem" @click="mini"><PictureInPicture2 /> Mini monitor</button>
                        <button type="button" role="menuitem" @click="edit"><Pencil /> Edit server</button>
                        <div class="divider" />
                        <button type="button" role="menuitem" class="bad" @click="remove"><Trash2 /> Remove server</button>
                    </div>
                </Transition>
            </div>

            <div class="heading">
                <h3 class="title truncate">{{ server.name }}</h3>
                <span v-if="server.demo" class="pill demo">Demo</span>
            </div>
        </div>

        <div class="body">
            <template v-if="live?.online && status">
                <div class="where muted truncate">{{ mapName(status.map) }} · {{ modeName(status.experiences) }} · up {{ formatUptime(live.uptimeSeconds ?? 0) }}</div>

                <div class="line">
                    <span>Players</span>
                    <span class="num"
                        ><strong>{{ status.players }}</strong> / {{ status.maxPlayers }}</span
                    >
                </div>
                <div class="progress"><span :style="{ '--fill': fill / 100 }" /></div>

                <FactionScores :factions="status.factions" compact class="scores" />
            </template>

            <template v-else-if="live">
                <div class="down">
                    <component :is="live.locked ? Lock : WifiOff" />
                    <span>{{ live.error }}</span>
                </div>
                <button v-if="live.lockedBy === 'plan' && BILLING_URL" type="button" class="btn btn-primary btn-sm upgrade" @click.stop="openBilling">Upgrade</button>
            </template>

            <template v-else>
                <div class="skeleton" style="height: 14px; width: 70%" />
                <div class="skeleton" style="height: 3px; margin-top: 22px" />
                <div class="skeleton" style="height: 40px; margin-top: 18px" />
            </template>
        </div>

        <footer class="foot">
            <span class="mono muted truncate">{{ server.host }}:{{ server.port }}</span>
            <span v-if="live" class="muted checked">
                <span v-if="state.loading[server.id]" class="updating slow-show"><span class="dot pending" /> updating</span>
                <template v-else>checked <TimeAgo :at="live.checkedAt" /></template>
            </span>
        </footer>
    </article>
</template>

<style scoped>
.server-card {
    position: relative;
    display: flex;
    flex-direction: column;
    overflow: visible;
    background: var(--panel);
    cursor: pointer;
    transition: border-color 0.15s;
    animation: rise 0.2s ease both;
}

.server-card:hover {
    border-color: var(--line-strong);
}

.server-card.selected {
    border-color: var(--accent-line);
}

.server-card:focus-visible {
    outline: none;
    border-color: var(--accent-line);
    box-shadow: 0 0 0 2px var(--accent-line);
}

.art-wrap {
    position: relative;
    height: 145px;
    border-radius: var(--radius) var(--radius) 0 0;
}

.art {
    position: absolute;
    inset: 0;
    border-radius: var(--radius) var(--radius) 0 0;
}

.offline .art {
    filter: grayscale(1) brightness(0.6);
}

.status {
    position: absolute;
    top: 13px;
    left: 13px;
    height: 24px;
    background: var(--scrim-strong);
    backdrop-filter: blur(6.5px);
}

.status .dot {
    width: 6.5px;
    height: 6.5px;
    box-shadow: none;
}

.menu-wrap {
    position: absolute;
    top: 11px;
    right: 11px;
    z-index: 3;
}

.menu {
    position: absolute;
    top: calc(100% + 6.5px);
    right: 0;
    width: 215.5px;
    padding: 5px;
    border: 1px solid var(--pop-line);
    border-top-color: var(--accent-line);
    border-radius: var(--radius-pop);
    background: var(--panel);
    box-shadow: var(--shadow-pop);
}

.menu button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
    text-align: left;
}

.menu button:hover {
    background: var(--hover);
    color: var(--text);
}

.menu button svg {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--muted);
}

.menu button:hover svg {
    color: var(--text-2);
}

.menu .bad,
.menu .bad svg,
.menu .bad:hover svg {
    color: var(--bad);
}

.menu .bad:hover {
    background: var(--bad-soft);
    color: var(--bad);
}

.divider {
    height: 1px;
    margin: 5px 4px;
    background: var(--line-soft);
}

.heading {
    position: absolute;
    left: 20px;
    right: 20px;
    bottom: 11px;
    display: flex;
    align-items: center;
    gap: 9px;
}

.heading .title {
    font-size: 18.5px;
    text-shadow: 0 2px 13px rgb(0 0 0 / 0.6);
}

.demo {
    height: 20px;
    padding: 0 7.5px;
    font-size: 11.5px;
    flex: none;
}

.body {
    flex: 1;
    padding: 13px 20px 17.5px;
}

.where {
    font-size: 14px;
}

.line {
    display: flex;
    justify-content: space-between;
    margin: 15.5px 0 7.5px;
    color: var(--text-2);
    font-size: 14px;
}

.line strong {
    color: var(--text);
    font-weight: 600;
}

.scores {
    margin-top: 17.5px;
}

.down {
    display: flex;
    gap: 11px;
    color: var(--text-2);
    font-size: 14px;
    line-height: 1.55;
}

.down svg {
    width: 17.5px;
    height: 17.5px;
    flex: none;
    margin-top: 2px;
    color: var(--bad);
}

.upgrade {
    margin-top: 12px;
}

.foot {
    display: flex;
    justify-content: space-between;
    gap: 13px;
    padding: 11px 20px;
    border-top: 1px solid var(--line-soft);
    font-size: 12.5px;
}

.foot .mono {
    font-size: 12.5px;
}

.checked {
    flex: none;
    white-space: nowrap;
}

.updating {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.updating .dot {
    width: 6px;
    height: 6px;
}

.pop-enter-active,
.pop-leave-active {
    transition:
        opacity 0.12s,
        transform 0.12s;
}

.pop-enter-from,
.pop-leave-to {
    opacity: 0;
    transform: translateY(-4.5px);
}
</style>
