<script setup lang="ts">
import {
    ArrowDown,
    ArrowUp,
    Bell,
    Check,
    ExternalLink,
    HardDrive,
    Keyboard,
    Megaphone,
    Minimize2,
    Minus,
    Paintbrush,
    Palette,
    Pencil,
    PictureInPicture2,
    Plus,
    RefreshCw,
    RotateCcw,
    Server,
    ShieldCheck,
    Star,
    Trash2,
    ZoomIn,
} from 'lucide-vue-next';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import BanListsPanel from '@/components/BanListsPanel.vue';
import MapArt from '@/components/MapArt.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { banLists } from '@/lib/banlists';
import { ago, steamProfileUrl } from '@/lib/format';
import { mapName } from '@/lib/maps';
import { now, removeServer, state, toast } from '@/lib/store';
import { ACCENTS, THEMES } from '@/lib/themes';
import { setWatchNote, toggleWatch } from '@/lib/watchlist';
import type { Preferences } from '@/types';

/**
 * How the app looks and behaves, broadcasts and shortcuts, all as cards on
 * General; the watchlist, saved servers and linked ban lists each have a
 * tab of their own.
 */
const tabs = computed(() => [
    { id: 'general', label: 'General' },
    { id: 'watchlist', label: 'Watchlist', count: state.preferences.watchlist.length },
    { id: 'servers', label: 'Servers', count: state.servers.length },
    { id: 'banlists', label: 'Ban lists', count: banLists.groups.length },
]);

/** Tabs that became cards on General: openOptions('broadcasts') scrolls to that card there. */
const ON_GENERAL = ['appearance', 'broadcasts', 'shortcuts'];

const tab = computed({ get: () => (ON_GENERAL.includes(state.optionsTab) ? 'general' : state.optionsTab), set: (value: string) => (state.optionsTab = value) });

const body = ref<HTMLElement | null>(null);
/** The card just scrolled to, outlined for a moment so the eye finds it. */
const found = ref<string | null>(null);
let foundTimer: ReturnType<typeof setTimeout> | undefined;

async function reveal(section: string): Promise<void> {
    if (!ON_GENERAL.includes(section)) {
        return;
    }

    await nextTick();
    body.value?.querySelector(`[data-section="${section}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    found.value = section;
    clearTimeout(foundTimer);
    foundTimer = setTimeout(() => (found.value = null), 1600);
    state.optionsTab = 'general';
}

watch(() => state.optionsTab, reveal, { flush: 'post' });

const dataPath = ref('');
const ZOOM_STEPS = [0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2];

onMounted(async () => {
    reveal(state.optionsTab);
    dataPath.value = (await window.panel.appInfo()).dataPath;
});

onBeforeUnmount(() => clearTimeout(foundTimer));

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

const accentLabel = computed(() => ACCENTS.find((accent) => accent.value === state.preferences.accent)?.label ?? '');
const themeLabel = computed(() => THEMES.find((theme) => theme.value === state.preferences.theme)?.label ?? '');

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

    <div ref="body" class="view-body narrow">
        <div v-if="tab === 'general'" class="cards">
            <section class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><RefreshCw /></span> Refresh every</span>
                </header>
                <p class="panel-intro">How often the open server is read. Other servers are read every 30 seconds.</p>
                <div class="controls slider">
                    <input type="range" min="2" max="30" :value="state.preferences.refreshSeconds" @change="set({ refreshSeconds: Number(($event.target as HTMLInputElement).value) })" />
                    <span class="num value">{{ state.preferences.refreshSeconds }} s</span>
                </div>
            </section>

            <section class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><ShieldCheck /></span> Confirm actions</span>
                </header>
                <p class="panel-intro">Ask before kicking, killing, ending a match or changing the map.</p>
                <label class="controls switch">
                    <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.confirmActions" @click="set({ confirmActions: !state.preferences.confirmActions })" />
                    <span>{{ state.preferences.confirmActions ? 'Always ask first' : 'Act straight away' }}</span>
                </label>
            </section>

            <section class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Bell /></span> Desktop notices</span>
                </header>
                <p class="panel-intro">Windows notifications, even while the app is in the background.</p>
                <div class="controls switches">
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.notifyServerDown" @click="set({ notifyServerDown: !state.preferences.notifyServerDown })" />
                        <span>When a server goes down or comes back</span>
                    </label>
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.notifyWatched" @click="set({ notifyWatched: !state.preferences.notifyWatched })" />
                        <span>When a watched player joins</span>
                    </label>
                </div>
            </section>

            <section class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><PictureInPicture2 /></span> Widgets</span>
                </header>
                <p class="panel-intro">Small live windows you can keep over the game: status, score, top players and quick actions. Open them from the sidebar; they reopen where you left them.</p>
                <div class="controls switches">
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
            </section>

            <section class="card panel wide">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Minimize2 /></span> Background</span>
                </header>
                <p class="panel-intro">Keep watching your servers from the tray by the clock, with the window out of the way. Right-click the tray icon to quit.</p>
                <div class="switches two">
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.closeToTray" @click="set({ closeToTray: !state.preferences.closeToTray })" />
                        <span>Closing the window keeps the app running in the tray</span>
                    </label>
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.minimizeToTray" @click="set({ minimizeToTray: !state.preferences.minimizeToTray })" />
                        <span>Minimise to the tray instead of the taskbar</span>
                    </label>
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.startMinimized" @click="set({ startMinimized: !state.preferences.startMinimized })" />
                        <span>Start hidden in the tray</span>
                    </label>
                    <label class="switch">
                        <button type="button" role="switch" class="toggle" :aria-checked="state.preferences.launchAtLogin" @click="set({ launchAtLogin: !state.preferences.launchAtLogin })" />
                        <span>Start with Windows, hidden in the tray</span>
                    </label>
                </div>
            </section>

            <section class="card panel" data-section="appearance" :class="{ found: found === 'appearance' }">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><ZoomIn /></span> Zoom</span>
                </header>
                <p class="panel-intro">Ctrl + and Ctrl - change it anywhere, Ctrl 0 resets. Ctrl+mouse wheel works too.</p>
                <div class="controls zoom">
                    <button type="button" class="btn" title="Zoom out" :disabled="state.preferences.zoom <= ZOOM_STEPS[0]" @click="zoomBy(-1)"><Minus /></button>
                    <span class="num zoom-value">{{ Math.round(state.preferences.zoom * 100) }}%</span>
                    <button type="button" class="btn" title="Zoom in" :disabled="state.preferences.zoom >= ZOOM_STEPS[ZOOM_STEPS.length - 1]" @click="zoomBy(1)"><Plus /></button>
                    <button type="button" class="btn btn-ghost" :disabled="state.preferences.zoom === 1" @click="resetZoom"><RotateCcw /> Reset</button>
                </div>
            </section>

            <section class="card panel" :class="{ found: found === 'appearance' }">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Paintbrush /></span> Accent</span>
                    <span class="panel-aside">{{ accentLabel }}</span>
                </header>
                <p class="panel-intro">Buttons, highlights and the active tab. Signal red is the website's.</p>
                <div class="controls accents">
                    <button v-for="accent in ACCENTS" :key="accent.value" type="button" class="accent" :class="{ on: state.preferences.accent === accent.value }" @click="set({ accent: accent.value })">
                        <span class="accent-swatch" :style="{ background: accent.color }"><Check v-if="state.preferences.accent === accent.value" :style="{ color: accent.ink }" /></span>
                        {{ accent.label }}
                    </button>
                </div>
            </section>

            <section class="card panel wide" :class="{ found: found === 'appearance' }">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Palette /></span> Theme</span>
                    <span class="panel-aside">{{ themeLabel }}</span>
                </header>
                <p class="panel-intro">The same themes as the website.</p>
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
            </section>

            <section class="card panel wide" data-section="broadcasts" :class="{ found: found === 'broadcasts' }">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Megaphone /></span> Broadcasts</span>
                    <span class="panel-aside">{{ state.preferences.broadcasts.length }} saved</span>
                </header>
                <p class="panel-intro">Ready-made messages shown under the broadcast box. Click one there to fill it in.</p>
                <form class="add-row" @submit.prevent="addBroadcast">
                    <input v-model="newBroadcast" class="input" maxlength="200" placeholder="A new message, up to 200 characters" />
                    <button type="submit" class="btn btn-primary" :disabled="!newBroadcast.trim()"><Plus /> Add</button>
                </form>
                <div v-if="state.preferences.broadcasts.length" class="panel-flush">
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
                </div>
                <p v-else class="muted empty">No messages yet.</p>
            </section>

            <section class="card panel wide" data-section="shortcuts" :class="{ found: found === 'shortcuts' }">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Keyboard /></span> Shortcuts</span>
                </header>
                <div class="panel-flush">
                    <div v-for="[keys, what] in SHORTCUTS" :key="keys" class="shortcut">
                        <span class="keys">
                            <span v-for="key in keys.split(' ')" :key="key" :class="{ kbd: !['or', '…', '/', '+', '-'].includes(key) }">{{ key }}</span>
                        </span>
                        <span class="muted">{{ what }}</span>
                    </div>
                </div>
            </section>

            <section class="card panel wide">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><HardDrive /></span> Your data</span>
                </header>
                <p class="panel-intro">Saved servers (passwords encrypted for your Windows account), preferences, linked ban lists and the activity log.</p>
                <p class="mono path">{{ dataPath }}</p>
            </section>
        </div>

        <section v-else-if="tab === 'watchlist'" class="card panel">
            <header class="panel-head">
                <span class="panel-title"><span class="panel-icon"><Star /></span> Watched players</span>
                <span class="panel-aside">{{ state.preferences.watchlist.length }}</span>
            </header>
            <p class="panel-intro">Watched players get a star everywhere, their own tab under Players, and a notice when they join any server. Star someone from the player list, or add a Steam ID here.</p>
            <form class="add-row" @submit.prevent="addWatch">
                <input v-model="newWatch.steamId" class="input mono" maxlength="17" placeholder="Steam ID" inputmode="numeric" />
                <input v-model="newWatch.name" class="input" maxlength="64" placeholder="Name (optional)" />
                <button type="submit" class="btn btn-primary"><Star /> Watch</button>
            </form>
            <div v-if="state.preferences.watchlist.length" class="panel-flush">
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
            </div>
            <p v-else class="muted empty">Nobody is watched yet.</p>
        </section>

        <section v-else-if="tab === 'servers'" class="card panel">
            <header class="panel-head">
                <span class="panel-title"><span class="panel-icon"><Server /></span> Saved servers</span>
                <span class="panel-aside">{{ state.servers.length }}</span>
            </header>
            <p class="panel-intro">The servers this app watches. Passwords are encrypted for your Windows account.</p>
            <div class="servers">
                <div v-for="server in state.servers" :key="server.id" class="server">
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
        </section>

        <BanListsPanel v-else-if="tab === 'banlists'" />
    </div>
</template>

<style scoped>
/* General's cards, two to a row; .wide ones take the whole row. */
.cards {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
    align-items: stretch;
}

.wide {
    grid-column: 1 / -1;
}

/* Room above a card scrolled to from openOptions(), and a short outline to find it by. */
.panel {
    scroll-margin-top: 18px;
    transition:
        border-color 0.3s,
        box-shadow 0.3s;
}

.panel.found {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 1px var(--accent-line);
}

/* In two cards side by side, the controls line up along the bottom whatever the length of the text above. */
.controls {
    margin-top: auto;
}

.slider {
    display: flex;
    align-items: center;
    gap: 15.5px;
}

.slider input {
    flex: 1;
    min-width: 0;
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
    font-size: 14px;
}

.switch .toggle {
    flex: none;
}

.switches {
    display: grid;
    gap: 6.5px 22px;
}

.switches.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
}

.path {
    margin: 0;
    padding: 10px 13px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--input);
    color: var(--text-2);
    user-select: text;
    overflow-wrap: anywhere;
}

.zoom {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 9px;
}

.zoom .btn:not(.btn-ghost) {
    width: 36px;
    padding: 0;
}

.zoom-value {
    width: 59.5px;
    text-align: center;
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
    background: var(--panel);
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

/* Card names are Inter like the other labels; a font card's sample above shows the font itself. */
.theme-text strong {
    display: flex;
    align-items: center;
    gap: 6.5px;
    font-size: 14.5px;
    font-weight: 600;
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

.add-row {
    display: flex;
    gap: 9px;
    margin-bottom: 16px;
}

.add-row .input {
    min-width: 0;
}

.empty {
    margin: 0;
    font-size: 14px;
}

/* Rows run edge to edge in the card, a hairline above each. */
.list-row {
    display: flex;
    align-items: center;
    gap: 15.5px;
    min-height: 55px;
    padding: 9px 14px 9px 20px;
    border-top: 1px solid var(--line-soft);
    font-size: 14.5px;
}

.list-row:hover {
    background: var(--hover);
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
    min-width: 0;
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
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
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
    gap: 8px;
    height: 70.5px;
    border: 1px dashed var(--line-strong);
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
    font-weight: 600;
    letter-spacing: 0.01em;
    transition:
        border-color 0.12s,
        color 0.12s;
}

.add-server:hover {
    border-color: var(--accent-line);
    color: var(--text);
}

.add-server svg {
    width: 16px;
    height: 16px;
    color: var(--accent);
}

.shortcut {
    display: grid;
    grid-template-columns: 220px 1fr;
    align-items: center;
    gap: 22px;
    padding: 11px 20px;
    border-top: 1px solid var(--line-soft);
    font-size: 14px;
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

/* A narrow page: one card to a row, switches one under another, and server rows wrap their buttons below. */
@container page (max-width: 760px) {
    .cards,
    .switches.two {
        grid-template-columns: minmax(0, 1fr);
    }

    .themes {
        grid-template-columns: repeat(auto-fill, minmax(min(253px, 100%), 1fr));
    }

    .list-row.watch {
        flex-wrap: wrap;
    }

    .server {
        flex-wrap: wrap;
        gap: 13px 17.5px;
    }

    .server-text {
        flex-basis: calc(100% - 140px);
    }

    .server-actions {
        flex-wrap: wrap;
        margin-left: auto;
    }

    .shortcut {
        grid-template-columns: minmax(0, 1fr);
        gap: 6.5px;
    }
}

@container page (max-width: 480px) {
    .server-art {
        display: none;
    }

    .server-text {
        flex-basis: 100%;
    }
}
</style>
