<script setup lang="ts">
import { ArrowDown, ArrowUp, Check, ExternalLink, Minus, Pencil, Plus, RotateCcw, Star, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import LicencePanel from '@/components/LicencePanel.vue';
import MapArt from '@/components/MapArt.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { ago, steamProfileUrl } from '@/lib/format';
import { mapName } from '@/lib/maps';
import { now, removeServer, state, toast } from '@/lib/store';
import { ACCENTS, THEMES } from '@/lib/themes';
import { setWatchNote, toggleWatch } from '@/lib/watchlist';
import type { Preferences } from '@/types';

/** How the app looks and behaves, broadcasts, the watchlist, saved servers and shortcuts. */
const tab = computed({ get: () => state.optionsTab, set: (value: string) => (state.optionsTab = value) });
const tabs = computed(() => [
    { id: 'general', label: 'General' },
    { id: 'licence', label: 'Licence' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'broadcasts', label: 'Broadcasts', count: state.preferences.broadcasts.length },
    { id: 'watchlist', label: 'Watchlist', count: state.preferences.watchlist.length },
    { id: 'servers', label: 'Servers', count: state.servers.length },
    { id: 'shortcuts', label: 'Shortcuts' },
]);

const dataPath = ref('');
const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

onMounted(async () => {
    dataPath.value = (await window.panel.appInfo()).dataPath;
});

async function set(changes: Partial<Preferences>): Promise<void> {
    state.preferences = await window.panel.preferences.set(changes);
}

function resetZoom(): void {
    window.panel.setZoom(1);
}

function zoomBy(direction: number): void {
    const index = ZOOM_STEPS.findIndex((step) => step >= state.preferences.zoom - 0.001);
    window.panel.setZoom(ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, index + direction))]);
}

// Broadcasts ------------------------------------------------------------------

const newBroadcast = ref('');
const editing = ref<number | null>(null);
const editText = ref('');

function addBroadcast(): void {
    const message = newBroadcast.value.trim();

    if (message) {
        set({ broadcasts: [...state.preferences.broadcasts, message] });
        newBroadcast.value = '';
    }
}

function saveBroadcast(index: number): void {
    const list = [...state.preferences.broadcasts];
    list[index] = editText.value.trim() || list[index];
    set({ broadcasts: list });
    editing.value = null;
}

function moveBroadcast(index: number, to: number): void {
    const list = [...state.preferences.broadcasts];
    const [item] = list.splice(index, 1);
    list.splice(to, 0, item);
    set({ broadcasts: list });
}

function removeBroadcast(index: number): void {
    set({ broadcasts: state.preferences.broadcasts.filter((_, i) => i !== index) });
}

// Watchlist -------------------------------------------------------------------

const newWatch = ref({ steamId: '', name: '' });

/** Which server a watched player is on right now, if any. */
function whereIs(steamId: string): string | null {
    for (const server of state.servers) {
        if (state.lives[server.id]?.players.some((player) => player.steamId === steamId)) {
            return server.name;
        }
    }

    return null;
}

function addWatch(): void {
    if (!/^\d{17}$/.test(newWatch.value.steamId.trim())) {
        toast('error', 'That is not a Steam ID', 'A Steam ID is 17 digits, like 76561198000000000.');

        return;
    }

    toggleWatch({ steamId: newWatch.value.steamId.trim(), name: newWatch.value.name.trim() || newWatch.value.steamId.trim() });
    newWatch.value = { steamId: '', name: '' };
}

const openUrl = (url: string) => window.panel.openExternal(url);

const SHORTCUTS = [
    ['Ctrl+K', 'Search everything: players on every server, servers, views and actions'],
    ['Ctrl+H', 'All servers as cards'],
    ['Ctrl+B', 'Show or hide the sidebar'],
    ['Ctrl+1 … Ctrl+6', 'Open Overview, Players, Match, Rotation, Bans, Settings'],
    ['Ctrl + / Ctrl -', 'Zoom in and out (Ctrl+mouse wheel works too)'],
    ['Ctrl+0', 'Reset zoom'],
    ['F5 or Ctrl+R', 'Read the server again now'],
    ['Ctrl+F', 'Search in the open view'],
    ['↑ ↓', 'Move through players'],
    ['Right-click', 'Player actions, anywhere a player is listed'],
    ['Esc', 'Close the open player, menu or dialog'],
    ['Ctrl+Enter', 'Send a message'],
];
</script>

<template>
    <ViewHeader v-model:tab="tab" title="Options" subtitle="How this app works on this PC" :tabs="tabs" />

    <div class="view-body narrow">
        <template v-if="tab === 'general'">
            <div class="group">
                <div class="group-text">
                    <h3>Refresh every</h3>
                    <p class="muted">How often the open server is read. Other servers are read every 30 seconds.</p>
                </div>
                <div class="slider">
                    <input type="range" min="2" max="30" :value="state.preferences.refreshSeconds" @change="set({ refreshSeconds: Number(($event.target as HTMLInputElement).value) })" />
                    <span class="num value">{{ state.preferences.refreshSeconds }} s</span>
                </div>
            </div>

            <div class="group">
                <div class="group-text">
                    <h3>Confirm actions</h3>
                    <p class="muted">Ask before kicking, killing, ending a match or changing the map.</p>
                </div>
                <label class="switch">
                    <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.confirmActions" @click="set({ confirmActions: !state.preferences.confirmActions })" />
                    <span>{{ state.preferences.confirmActions ? 'Always ask first' : 'Act straight away' }}</span>
                </label>
            </div>

            <div class="group">
                <div class="group-text">
                    <h3>Desktop notices</h3>
                    <p class="muted">Windows notifications, even while the app is in the background.</p>
                </div>
                <div class="stack">
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.notifyServerDown" @click="set({ notifyServerDown: !state.preferences.notifyServerDown })" />
                        <span>When a server goes down or comes back</span>
                    </label>
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.notifyWatched" @click="set({ notifyWatched: !state.preferences.notifyWatched })" />
                        <span>When a watched player joins</span>
                    </label>
                </div>
            </div>

            <div class="group">
                <div class="group-text">
                    <h3>Mini monitor</h3>
                    <p class="muted">The small live window you can keep over the game.</p>
                </div>
                <div class="stack">
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.miniAlwaysOnTop" @click="set({ miniAlwaysOnTop: !state.preferences.miniAlwaysOnTop })" />
                        <span>Keep on top of other windows</span>
                    </label>
                    <div class="slider">
                        <span class="muted">Opacity</span>
                        <input type="range" min="50" max="100" :value="Math.round(state.preferences.miniOpacity * 100)" @input="set({ miniOpacity: Number(($event.target as HTMLInputElement).value) / 100 })" />
                        <span class="num value">{{ Math.round(state.preferences.miniOpacity * 100) }}%</span>
                    </div>
                </div>
            </div>

            <div class="group">
                <div class="group-text">
                    <h3>Your data</h3>
                    <p class="muted">Saved servers (passwords encrypted for your Windows account), preferences and the activity log.</p>
                </div>
                <p class="mono path">{{ dataPath }}</p>
            </div>
        </template>

        <LicencePanel v-else-if="tab === 'licence'" />

        <template v-else-if="tab === 'appearance'">
            <div class="group">
                <div class="group-text">
                    <h3>Zoom</h3>
                    <p class="muted">Ctrl + and Ctrl - change it anywhere, Ctrl 0 resets. Ctrl+mouse wheel works too.</p>
                </div>
                <div class="zoom">
                    <button type="button" class="btn" title="Zoom out" :disabled="state.preferences.zoom <= ZOOM_STEPS[0]" @click="zoomBy(-1)"><Minus /></button>
                    <span class="num zoom-value">{{ Math.round(state.preferences.zoom * 100) }}%</span>
                    <button type="button" class="btn" title="Zoom in" :disabled="state.preferences.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]" @click="zoomBy(1)"><Plus /></button>
                    <button type="button" class="btn btn-ghost" :disabled="state.preferences.zoom === 1" @click="resetZoom"><RotateCcw /> Reset</button>
                </div>
            </div>

            <div class="group">
                <div class="group-text">
                    <h3>Accent</h3>
                    <p class="muted">Buttons, highlights and the active tab. Signal red is the website's.</p>
                </div>
                <div class="accents">
                    <button v-for="accent in ACCENTS" :key="accent.value" type="button" class="accent" :class="{ on: state.preferences.accent === accent.value }" @click="set({ accent: accent.value })">
                        <span class="accent-swatch" :style="{ background: accent.color }"><Check v-if="state.preferences.accent === accent.value" :style="{ color: accent.ink }" /></span>
                        {{ accent.label }}
                    </button>
                </div>
            </div>

            <div class="section-label themes-label">
                <span>Theme</span>
                <span>The same themes as the website</span>
            </div>
            <div class="themes">
                <button
                    v-for="theme in THEMES"
                    :key="theme.value"
                    type="button"
                    class="theme"
                    :class="{ on: state.preferences.theme === theme.value }"
                    :style="{ '--p-bg': theme.palette.bg, '--p-surface': theme.palette.surface, '--p-raised': theme.palette.raised, '--p-border': theme.palette.border, '--p-text': theme.palette.text, '--p-muted': theme.palette.muted }"
                    @click="set({ theme: theme.value })"
                >
                    <span class="preview">
                        <span class="p-side" />
                        <span class="p-main">
                            <span class="p-line" style="width: 60%" />
                            <span class="p-card"><span class="p-accent" /></span>
                            <span class="p-line" style="width: 40%" />
                        </span>
                    </span>
                    <span class="theme-text">
                        <strong>{{ theme.label }} <Check v-if="state.preferences.theme === theme.value" /></strong>
                        <small class="muted">{{ theme.description }}</small>
                    </span>
                </button>
            </div>
        </template>

        <template v-else-if="tab === 'broadcasts'">
            <p class="muted intro">Ready-made messages shown under the broadcast box. Click one there to fill it in.</p>
            <form class="add-row" @submit.prevent="addBroadcast">
                <input v-model="newBroadcast" class="input" maxlength="200" placeholder="A new message, up to 200 characters" />
                <button type="submit" class="btn btn-primary" :disabled="!newBroadcast.trim()"><Plus /> Add</button>
            </form>
            <div v-for="(message, index) in state.preferences.broadcasts" :key="index + message" class="list-row">
                <template v-if="editing === index">
                    <input v-model="editText" class="input" maxlength="200" autofocus @keydown.enter="saveBroadcast(index)" @keydown.esc="editing = null" />
                    <button type="button" class="btn btn-primary btn-sm" @click="saveBroadcast(index)">Save</button>
                </template>
                <template v-else>
                    <span class="grow">{{ message }}</span>
                    <span class="row-tools">
                        <button type="button" title="Move up" :disabled="index === 0" @click="moveBroadcast(index, index - 1)"><ArrowUp /></button>
                        <button type="button" title="Move down" :disabled="index === state.preferences.broadcasts.length - 1" @click="moveBroadcast(index, index + 1)"><ArrowDown /></button>
                        <button type="button" title="Edit" @click="editing = index; editText = message"><Pencil /></button>
                        <button type="button" title="Remove" class="bad" @click="removeBroadcast(index)"><Trash2 /></button>
                    </span>
                </template>
            </div>
            <p v-if="state.preferences.broadcasts.length === 0" class="muted">No messages yet.</p>
        </template>

        <template v-else-if="tab === 'watchlist'">
            <p class="muted intro">Watched players get a star everywhere, their own tab under Players, and a notice when they join any server. Star someone from the player list, or add a Steam ID here.</p>
            <form class="add-row" @submit.prevent="addWatch">
                <input v-model="newWatch.steamId" class="input mono" maxlength="17" placeholder="Steam ID" inputmode="numeric" />
                <input v-model="newWatch.name" class="input" maxlength="64" placeholder="Name (optional)" />
                <button type="submit" class="btn btn-primary"><Star /> Watch</button>
            </form>
            <div v-for="entry in state.preferences.watchlist" :key="entry.steamId" class="list-row watch">
                <Star class="star" />
                <span class="watch-who">
                    <strong>{{ entry.name || entry.steamId }}</strong>
                    <small class="mono muted">{{ entry.steamId }} · added {{ ago(entry.addedAt, now) }}</small>
                </span>
                <span v-if="whereIs(entry.steamId)" class="pill pill-ok">On {{ whereIs(entry.steamId) }}</span>
                <input class="input note" :value="entry.note" maxlength="200" placeholder="Note, like why" @change="setWatchNote(entry.steamId, ($event.target as HTMLInputElement).value)" />
                <span class="row-tools">
                    <button type="button" title="Steam profile" @click="openUrl(steamProfileUrl(entry.steamId))"><ExternalLink /></button>
                    <button type="button" title="Stop watching" class="bad" @click="toggleWatch(entry)"><Trash2 /></button>
                </span>
            </div>
            <p v-if="state.preferences.watchlist.length === 0" class="muted">Nobody is watched yet.</p>
        </template>

        <template v-else-if="tab === 'servers'">
            <div class="section-label">
                <span>Saved servers</span>
                <span>{{ state.servers.length }}</span>
            </div>
            <div class="servers">
                <div v-for="server in state.servers" :key="server.id" class="server card">
                    <MapArt :map="state.lives[server.id]?.status?.map" :lighting="state.lives[server.id]?.status?.lighting" variant="wide" :fade="false" class="server-art" />
                    <div class="server-text">
                        <div class="server-name">
                            <span class="dot" :class="state.lives[server.id]?.online ? 'online' : state.lives[server.id] ? 'offline' : 'pending'" />
                            <strong class="truncate">{{ server.name }}</strong>
                            <span v-if="server.demo" class="pill tag">Demo</span>
                        </div>
                        <div class="server-meta">
                            <span class="mono">{{ server.host }}:{{ server.port }}</span>
                            <span v-if="state.lives[server.id]?.online && state.lives[server.id]?.status">
                                {{ state.lives[server.id]!.status!.players }}/{{ state.lives[server.id]!.status!.maxPlayers }} players · {{ mapName(state.lives[server.id]!.status!.map) }}
                            </span>
                            <span v-else-if="state.lives[server.id]" class="off">Offline</span>
                        </div>
                    </div>
                    <div class="server-actions">
                        <button type="button" class="btn btn-sm" @click="state.editingServer = server"><Pencil /> Edit</button>
                        <button type="button" class="btn btn-sm btn-danger" @click="removeServer(server)"><Trash2 /> Remove</button>
                    </div>
                </div>

                <button type="button" class="add-server" @click="state.addingServer = true">
                    <Plus />
                    <span>Add server</span>
                </button>
            </div>
        </template>

        <template v-else>
            <div v-for="[keys, what] in SHORTCUTS" :key="keys" class="shortcut">
                <span class="keys">
                    <span v-for="key in keys.split(' ')" :key="key" :class="{ kbd: !['or', '…', '/', '+', '-'].includes(key) }">{{ key }}</span>
                </span>
                <span class="muted">{{ what }}</span>
            </div>
        </template>
    </div>
</template>

<style scoped>
.group {
    display: grid;
    grid-template-columns: minmax(198px, 308px) minmax(0, 1fr);
    gap: 31px;
    padding: 22px 0;
    border-bottom: 1px solid var(--line-soft);
}

.group:first-child {
    padding-top: 4.5px;
}

.group h3 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 500;
}

.group p {
    margin: 4.5px 0 0;
    font-size: 14px;
    line-height: 1.55;
}

.slider {
    display: flex;
    align-items: center;
    gap: 15.5px;
}

.slider input {
    flex: 1;
    accent-color: var(--accent);
}

.value {
    width: 48.5px;
    text-align: right;
}

.switch {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 37.5px;
}

.stack {
    display: grid;
    gap: 11px;
}

.path {
    margin: 0;
    color: var(--text-2);
    user-select: text;
    overflow-wrap: anywhere;
}

.zoom {
    display: flex;
    align-items: center;
    gap: 9px;
}

.zoom .btn:not(.btn-ghost) {
    width: 37.5px;
    padding: 0;
}

.zoom-value {
    width: 59.5px;
    text-align: center;
    font-family: var(--font-title);
    font-weight: 600;
}

.accents {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
}

.accent {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    height: 39.5px;
    padding: 0 15.5px 0 9px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    font-size: 14.5px;
}

.accent:hover {
    border-color: var(--line-strong);
}

.accent.on {
    border-color: var(--accent-line);
    color: var(--text);
}

.accent-swatch {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 3.5px;
}

.accent-swatch svg {
    width: 14.5px;
    height: 14.5px;
}

.themes-label {
    margin-top: 28.5px;
}

.themes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(253px, 1fr));
    gap: 11px;
}

.theme {
    display: flex;
    gap: 13px;
    padding: 11px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: transparent;
    text-align: left;
    transition: border-color 0.12s;
}

.theme:hover {
    border-color: var(--line-strong);
}

.theme.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent) inset;
}

.preview {
    display: flex;
    width: 81.5px;
    height: 57px;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--p-border);
    border-radius: 3.5px;
    background: var(--p-bg);
}

.p-side {
    width: 20px;
    background: color-mix(in srgb, var(--p-bg) 55%, var(--p-surface));
    border-right: 1px solid var(--p-border);
}

.p-main {
    display: grid;
    align-content: start;
    gap: 5.5px;
    flex: 1;
    padding: 6.5px;
}

.p-line {
    height: 3.5px;
    border-radius: 2px;
    background: var(--p-muted);
    opacity: 0.7;
}

.p-card {
    position: relative;
    height: 17.5px;
    border: 1px solid var(--p-border);
    border-radius: 2px;
    background: var(--p-surface);
}

.p-accent {
    position: absolute;
    left: 4.5px;
    bottom: 4.5px;
    width: 15.5px;
    height: 3.5px;
    border-radius: 2px;
    background: var(--accent);
}

.theme-text {
    display: grid;
    align-content: center;
    gap: 3.5px;
    min-width: 0;
}

.theme-text strong {
    display: flex;
    align-items: center;
    gap: 6.5px;
    font-family: var(--font-title);
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.theme-text strong svg {
    width: 14.5px;
    height: 14.5px;
    color: var(--accent);
}

.theme-text small {
    font-size: 12.5px;
    line-height: 1.4;
}

.intro {
    margin: 0 0 17.5px;
    font-size: 14px;
    line-height: 1.6;
}

.add-row {
    display: flex;
    gap: 9px;
    margin-bottom: 15.5px;
}

.list-row {
    display: flex;
    align-items: center;
    gap: 15.5px;
    min-height: 59.5px;
    padding: 9px 6.5px;
    border-bottom: 1px solid var(--line-soft);
    font-size: 14.5px;
}

.grow {
    flex: 1;
    min-width: 0;
}

.row-tools {
    display: flex;
    gap: 2px;
    flex: none;
}

.row-tools button {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

.row-tools button:hover:not(:disabled) {
    background: var(--hover);
    color: var(--text);
}

.row-tools button.bad:hover {
    color: var(--bad);
}

.row-tools button:disabled {
    opacity: 0.3;
}

.row-tools svg {
    width: 15.5px;
    height: 15.5px;
}

.star {
    width: 16.5px;
    height: 16.5px;
    flex: none;
    color: var(--warn);
    fill: var(--warn);
}

.watch-who {
    display: grid;
    min-width: 187px;
}

.watch-who strong {
    font-weight: 500;
}

.watch-who small {
    font-size: 12px;
}

.note {
    flex: 1;
    height: 33px;
}

.servers {
    display: grid;
    gap: 11px;
}

.server {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 13px 17.5px 13px 13px;
    background: var(--panel);
}

.server-art {
    width: 123px;
    height: 66px;
    flex: none;
    border-radius: var(--radius);
}

.server-text {
    display: grid;
    gap: 6.5px;
    flex: 1;
    min-width: 0;
}

.server-name {
    display: flex;
    align-items: center;
    gap: 11px;
    min-width: 0;
}

.server-name strong {
    font-size: 16px;
    font-weight: 600;
}

.tag {
    height: 21px;
    padding: 0 9px;
    flex: none;
    font-size: 11.5px;
}

.server-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6.5px 20px;
    padding-left: 20px;
    color: var(--muted);
    font-size: 14px;
}

.server-meta .mono {
    font-size: 13px;
}

.server-meta .off {
    color: var(--bad);
}

.server-actions {
    display: flex;
    gap: 9px;
    flex: none;
}

.add-server {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 11px;
    height: 70.5px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    font-family: var(--font-title);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    transition:
        border-color 0.12s,
        color 0.12s;
}

.add-server:hover {
    border-color: var(--accent-line);
    color: var(--text);
}

.add-server svg {
    width: 17.5px;
    height: 17.5px;
    color: var(--accent);
}

.shortcut {
    display: grid;
    grid-template-columns: 220px 1fr;
    align-items: center;
    gap: 22px;
    padding: 13px 0;
    border-bottom: 1px solid var(--line-soft);
}

.keys {
    display: flex;
    align-items: center;
    gap: 6.5px;
    color: var(--muted);
    font-size: 13px;
}

.kbd {
    padding: 0 6.5px;
    color: var(--text-2);
}
</style>
