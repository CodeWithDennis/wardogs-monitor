<script setup lang="ts">
import { Activity, Clock, History, LoaderCircle, Megaphone, RotateCcw, Send, SkipForward, Swords, Trophy, Users, WifiOff } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import FactionScores from '@/components/FactionScores.vue';
import MapArt from '@/components/MapArt.vue';
import PlayerChart from '@/components/PlayerChart.vue';
import TimeAgo from '@/components/TimeAgo.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { formatUptime, gameName, modeName, percent, ratio, zoneName } from '@/lib/format';
import { mapName } from '@/lib/maps';
import { openPlayerMenu } from '@/lib/playerActions';
import { act, busy, openOptions, openView, selectedLive, selectedServer, state } from '@/lib/store';
import type { ActivityEntry } from '@/types';

/**
 * The server at a glance, as a dashboard: four tiles with the numbers that
 * matter (players, who leads, the map, uptime), then cards for the match,
 * players over time, the best players, what was done lately and a
 * broadcast box.
 */
const BROADCAST_MAX = 200;

const live = selectedLive;
const status = computed(() => live.value?.status ?? null);
const message = ref('');
const activity = ref<ActivityEntry[] | null>(null);

const topPlayers = computed(() => [...(live.value?.players ?? [])].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 5));
const history = computed(() => (state.selectedId ? state.history[state.selectedId] ?? [] : []));
const fill = computed(() => (status.value ? percent(status.value.players, status.value.maxPlayers) : 0));
const ranked = computed(() => [...(status.value?.factions ?? [])].sort((a, b) => b.score - a.score));
const lead = computed(() => (ranked.value.length > 1 ? ranked.value[0].score - ranked.value[1].score : 0));
const peak = computed(() => Math.max(0, ...history.value.map((point) => point.players)));

let loadSeq = 0;

async function loadActivity(): Promise<void> {
    const seq = ++loadSeq;
    const list = (await window.panel.activity.list(state.selectedId)).slice(0, 6);

    if (seq !== loadSeq) {
        return;
    }

    activity.value = list;
}

onMounted(loadActivity);
watch(() => state.revision, loadActivity);

async function broadcast(): Promise<void> {
    const result = await act('broadcast', { message: message.value });

    if (result?.ok) {
        message.value = '';
    }
}

function endMatch(): void {
    act('endMatch', {}, {
        confirm: { title: 'End the match now?', body: 'Everyone sees the match-end screen, then the rotation moves on to the next map.', confirmLabel: 'End match', danger: true },
    });
}

function restartMatch(): void {
    act('restartMatch', {}, {
        confirm: { title: 'Restart the match?', body: 'The current map reloads and scores start from zero. The rotation stays where it is.', confirmLabel: 'Restart match', danger: true },
    });
}

function openPlayer(steamId: string): void {
    state.selectedPlayer = steamId;
    openView('players');
}
</script>

<template>
    <ViewHeader :title="selectedServer?.name ?? 'Overview'">
        <template #subtitle>
            <template v-if="live?.online && status">
                <span class="live" :class="{ updating: state.loading[state.selectedId ?? ''] }"><span class="dot online" /> Live</span>
                · {{ mapName(status.map) }} · {{ modeName(status.experiences) }} · up {{ formatUptime(live.uptimeSeconds ?? 0) }}
            </template>
            <template v-else-if="live">Offline · checked <TimeAgo :at="live.checkedAt" /></template>
            <template v-else>Connecting…</template>
        </template>
    </ViewHeader>

    <div class="view-body">
        <div v-if="live && !live.online" class="card offline">
            <WifiOff />
            <div>
                <strong>The server is not answering</strong>
                <p>{{ live.error }}</p>
            </div>
        </div>

        <div v-if="live?.online && status" class="dash">
            <!-- The numbers that matter -->
            <div class="tiles">
                <button type="button" class="card tile" @click="openView('players')">
                    <span class="tile-label"><Users /> Players</span>
                    <span class="tile-value num">{{ status.players }}<span class="of">/{{ status.maxPlayers }}</span></span>
                    <span class="tile-meter"><span :style="{ '--fill': fill / 100 }" /></span>
                    <span class="tile-sub">{{ fill }}% full<template v-if="peak"> · peak {{ peak }}</template></span>
                </button>

                <div class="card tile" :style="{ '--faction': ranked[0]?.color ?? 'var(--accent)' }">
                    <span class="tile-label"><Trophy /> Leading</span>
                    <span v-if="lead > 0" class="tile-value leader truncate">{{ ranked[0].name }}</span>
                    <span v-else class="tile-value">Level</span>
                    <span class="tile-sub">
                        <template v-if="lead > 0"><span class="num">{{ ranked[0].score }}</span> points · ahead by <span class="num">{{ lead }}</span></template>
                        <template v-else>No faction ahead yet</template>
                    </span>
                </div>

                <button type="button" class="card tile map-tile" @click="openView('match')">
                    <MapArt :map="status.map" :lighting="status.lighting" class="tile-art" />
                    <span class="tile-label"><Swords /> Map</span>
                    <span class="tile-value truncate">{{ mapName(status.map) }}</span>
                    <span class="tile-sub truncate">{{ modeName(status.experiences) }}<template v-if="status.lighting"> · {{ gameName(status.lighting) }}</template></span>
                </button>

                <div class="card tile">
                    <span class="tile-label"><Clock /> Uptime</span>
                    <span class="tile-value num">{{ formatUptime(live.uptimeSeconds ?? 0) }}</span>
                    <span class="tile-sub truncate">
                        <template v-if="status.zone">{{ zoneName(status.zone) }}</template>
                        <template v-if="status.zone && status.scoreTick"> · </template>
                        <template v-if="status.scoreTick">+1 every {{ status.scoreTick.current }}s</template>
                    </span>
                </div>
            </div>

            <!-- The match and players over time -->
            <div class="pair">
                <section class="card panel match">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Swords /></span> Match</span>
                        <span v-if="status.scoreTick" class="muted small">a point every {{ status.scoreTick.current }}s</span>
                    </header>
                    <FactionScores :factions="status.factions" />
                    <div class="match-actions">
                        <button type="button" class="btn" :disabled="busy.restartMatch" @click="restartMatch"><LoaderCircle v-if="busy.restartMatch" class="spin" /><RotateCcw v-else /> Restart match</button>
                        <button type="button" class="btn" :disabled="busy.endMatch" @click="endMatch"><LoaderCircle v-if="busy.endMatch" class="spin" /><SkipForward v-else /> End match</button>
                        <button type="button" class="btn btn-ghost" @click="openView('match')">Change map…</button>
                    </div>
                </section>

                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Activity /></span> Players online</span>
                        <span class="muted small num">{{ status.players }} / {{ status.maxPlayers }}</span>
                    </header>
                    <PlayerChart :points="history" :max="status.maxPlayers" class="chart" />
                </section>
            </div>

            <!-- The best players, what was done, and a broadcast -->
            <div class="trio">
                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Trophy /></span> Top players</span>
                        <button type="button" class="link" @click="openView('players')">All {{ live.players.length }}</button>
                    </header>
                    <div class="list">
                        <div v-for="(player, index) in topPlayers" :key="player.steamId" class="row" @click="openPlayer(player.steamId)" @contextmenu="openPlayerMenu($event, player)">
                            <span class="rank num" :class="{ podium: index < 3 }">{{ index + 1 }}</span>
                            <span class="swatch" :style="{ background: player.factionColor ?? 'var(--faint)' }" />
                            <span class="truncate grow">{{ player.name }}</span>
                            <span class="num muted">{{ player.kills }}/{{ player.deaths }}</span>
                            <span class="num kd">{{ ratio(player.kills, player.deaths) }}</span>
                        </div>
                        <p v-if="topPlayers.length === 0" class="muted none">Nobody is playing right now.</p>
                    </div>
                </section>

                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><History /></span> Recent activity</span>
                        <button type="button" class="link" @click="state.activityServer = state.selectedId; openView('activity')">All</button>
                    </header>
                    <div class="list">
                        <div v-for="(entry, index) in activity" :key="`${entry.at}:${index}`" class="row activity" :title="entry.error ?? entry.summary">
                            <span class="dot" :class="entry.ok ? 'online' : 'offline'" />
                            <span class="truncate grow">{{ entry.summary }}</span>
                            <TimeAgo class="muted when" :at="entry.at" />
                        </div>
                        <div v-if="activity === null" class="skeleton-list rows-skeleton">
                            <div v-for="i in 3" :key="i" class="skeleton" style="height: 24px" />
                        </div>
                        <p v-else-if="activity.length === 0" class="muted none">Nothing done from this app yet. Kicks, bans, broadcasts and map changes show up here.</p>
                    </div>
                </section>

                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Megaphone /></span> Broadcast</span>
                        <span class="muted small num">{{ message.length }}/{{ BROADCAST_MAX }}</span>
                    </header>
                    <form class="broadcast" @submit.prevent="broadcast">
                        <input id="broadcast" v-model="message" class="input" :maxlength="BROADCAST_MAX" placeholder="A message everyone sees" />
                        <button type="submit" class="btn btn-primary" :disabled="message.trim() === '' || busy.broadcast" title="Send to everyone"><LoaderCircle v-if="busy.broadcast" class="spin" /><Send v-else /></button>
                    </form>
                    <div class="templates">
                        <button v-for="template in state.preferences.broadcasts" :key="template" type="button" class="pill template" :title="template" @click="message = template">{{ template }}</button>
                    </div>
                    <button type="button" class="link edit-templates" @click="openOptions('broadcasts')">Edit saved messages</button>
                </section>
            </div>
        </div>

        <div v-else-if="!live" class="dash" aria-busy="true" aria-label="Loading the server">
            <div class="tiles">
                <div v-for="i in 4" :key="i" class="skeleton" style="height: 116px" />
            </div>
            <div class="pair">
                <div class="skeleton" style="height: 300px" />
                <div class="skeleton" style="height: 300px" />
            </div>
        </div>
    </div>
</template>

<style scoped>
/*
 * Tiles two by two on a narrow page and four in a row from 860px; the
 * match and chart side by side from 900px; the bottom cards as many across
 * as fit at 280px each. One gap everywhere, so it reads as one grid.
 */
.dash {
    display: grid;
    gap: 18px;
}

.tiles {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 18px;
}

@container page (min-width: 860px) {
    .tiles {
        grid-template-columns: repeat(4, minmax(0, 1fr));
    }
}

.pair {
    display: grid;
    gap: 18px;
    align-items: start;
}

@container page (min-width: 900px) {
    .pair {
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        align-items: stretch;
    }
}

.trio {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
    gap: 18px;
}

/* Tiles ------------------------------------------------------------------ */

.tile {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-width: 0;
    padding: 16px 18px;
    overflow: hidden;
    color: var(--text);
    font: inherit;
    text-align: left;
}

button.tile {
    cursor: pointer;
    transition:
        border-color 0.12s,
        background 0.12s;
}

button.tile:hover {
    border-color: var(--line-strong);
    background: color-mix(in srgb, var(--hover) 60%, var(--card));
}

.tile-label {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.tile-label svg {
    width: 14px;
    height: 14px;
    color: var(--accent);
}

.tile-value {
    position: relative;
    font-family: var(--font-title);
    font-size: 26px;
    font-weight: 700;
    line-height: 1.15;
}

.of {
    margin-left: 2px;
    font-family: var(--font-body);
    font-size: 14px;
    font-weight: 400;
    color: var(--muted);
}

.leader {
    color: color-mix(in srgb, var(--faction) 60%, white);
}

.tile-sub {
    position: relative;
    color: var(--text-2);
    font-size: 13px;
}

.tile-meter {
    height: 4px;
    margin: 2px 0;
    border-radius: 2px;
    background: var(--track);
    overflow: hidden;
}

.tile-meter span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform: scaleX(var(--fill));
    transform-origin: left;
    transition: transform 0.4s ease;
}

/* The map pictured behind its tile, faded so the text stays readable. */
.tile-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0.35;
    pointer-events: none;
}

.map-tile::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(90deg, var(--card) 15%, transparent);
    pointer-events: none;
}

.map-tile > :not(.tile-art) {
    z-index: 1;
}

/* Cards ------------------------------------------------------------------ */

.panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 18px 20px;
}

.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 16px;
}

.panel-title {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 14.5px;
    font-weight: 600;
}

.panel-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius);
    background: var(--accent-soft);
    color: var(--accent);
}

.panel-icon svg {
    width: 15px;
    height: 15px;
}

.small {
    font-size: 13px;
}

.match {
    border-top-color: var(--accent-line);
}

.match-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    margin-top: auto;
    padding-top: 18px;
    border-top: 1px solid var(--line-soft);
}

.match :deep(.scores) {
    margin-bottom: 20px;
}

.match-actions .btn-ghost {
    margin-left: auto;
}

.chart {
    margin-top: auto;
}

.list {
    margin: -4px -20px 0;
}

.list .row {
    min-height: 38px;
    padding: 0 20px;
    font-size: 14px;
}

.rank {
    width: 15.5px;
    color: var(--faint);
    text-align: right;
    font-size: 12.5px;
}

.rank.podium {
    color: var(--accent);
    font-weight: 700;
}

.swatch {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    flex: none;
}

.grow {
    flex: 1;
    min-width: 0;
}

.kd {
    width: 42px;
    text-align: right;
    color: var(--text);
    font-weight: 600;
}

.when {
    font-size: 12.5px;
    white-space: nowrap;
}

.activity {
    cursor: default;
}

.none {
    margin: 0;
    padding: 8px 20px;
    font-size: 14px;
}

.broadcast {
    display: flex;
    gap: 8px;
}

.broadcast .input {
    flex: 1;
    min-width: 0;
    height: 38px;
}

.broadcast .btn {
    flex: none;
    width: 42px;
    height: 38px;
    padding: 0;
}

.templates {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
}

.template {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    border: 0;
    border-radius: var(--radius);
    cursor: pointer;
    text-align: left;
}

.template:hover {
    background: var(--select);
    color: var(--text);
}

.edit-templates {
    align-self: flex-start;
    margin-top: 12px;
}

.link {
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font-size: 13px;
}

.link:hover {
    color: var(--accent-hi);
}

.rows-skeleton {
    padding: 8px 20px;
}

.live.updating .dot {
    animation: pulse 1.2s ease-in-out 0.4s infinite;
}

.live {
    display: inline-flex;
    align-items: center;
    gap: 7.5px;
    color: var(--ok);
}

.live .dot {
    width: 7.5px;
    height: 7.5px;
}

.offline {
    display: flex;
    gap: 15.5px;
    padding: 20px 22px;
    border-color: color-mix(in srgb, var(--bad) 35%, transparent);
    background: var(--bad-soft);
}

.offline svg {
    width: 22px;
    height: 22px;
    color: var(--bad);
    flex: none;
}

.offline p {
    margin: 4.5px 0 0;
    color: var(--text-2);
}
</style>
