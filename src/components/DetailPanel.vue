<script setup lang="ts">
import { Copy, ExternalLink, Star, Megaphone, MessageSquare, PictureInPicture2, RefreshCw, Shuffle, Skull, UserX, Ban as BanIcon, X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import MapArt from '@/components/MapArt.vue';
import TimeAgo from '@/components/TimeAgo.vue';
import { dateTime, formatUptime, gameName, modeName, modifierNames, number, percent, pingLevel, ratio, steamProfileUrl, zoneName } from '@/lib/format';
import { mapName } from '@/lib/maps';
import { killPlayer, openPlayerAction } from '@/lib/playerActions';
import { liftBan } from '@/lib/banlists';
import { isWatched, setWatchNote, toggleWatch, watchedEntry } from '@/lib/watchlist';
import { pickWidgets } from '@/lib/widgets';
import { openView, refreshLive, selectedLive, selectedServer, state, toast } from '@/lib/store';
import type { Ban } from '@/types';

/**
 * The right-hand panel, like the guide detail in the reference: the map
 * pictured on top, pills, a gold progress line, facts, and the main action
 * at the bottom. It shows the open player or ban when there is one, and
 * the server otherwise.
 */
const live = selectedLive;
const status = computed(() => live.value?.status ?? null);

const player = computed(() => (state.view === 'players' && state.selectedPlayer ? live.value?.players.find((entry) => entry.steamId === state.selectedPlayer) ?? null : null));

const ban = ref<Ban | null>(null);
const identity = ref<{ serverId: string | null; bannerUrl: string | null } | null>(null);
const nextEntry = ref<string | null>(null);

watch(
    () => [state.view, state.selectedBan, state.revision] as const,
    async () => {
        if (state.view === 'bans' && state.selectedBan && state.selectedId) {
            const answer = await window.panel.server.bans(state.selectedId);
            ban.value = answer.bans.find((entry) => entry.steamId === state.selectedBan) ?? null;
        } else {
            ban.value = null;
        }
    },
    { immediate: true },
);

// Separate sources, so this only runs when one of them changes, not on every reading.
watch(
    [() => state.selectedId, () => live.value?.online, () => status.value?.rotationNext, () => status.value?.map],
    async ([serverId, online]) => {
        if (!serverId || !online) {
            nextEntry.value = null;

            return;
        }

        identity.value = await window.panel.server.identity(serverId);
        const rotation = await window.panel.server.rotation(serverId);
        const next = rotation.entries.find((entry) => entry.status === 'next') ?? rotation.entries.find((entry) => entry.index === status.value?.rotationNext);
        nextEntry.value = rotation.enabled && next ? `${mapName(next.map)} · ${modeName(next.experiences)}` : null;
    },
    { immediate: true },
);

const fill = computed(() => (status.value ? percent(status.value.players, status.value.maxPlayers) : 0));
const leader = computed(() => [...(status.value?.factions ?? [])].sort((a, b) => b.score - a.score)[0] ?? null);

const openUrl = (url: string) => window.panel.openExternal(url);

function copy(text: string, what: string): void {
    navigator.clipboard.writeText(text);
    toast('info', `Copied the ${what}`);
}

function broadcast(): void {
    openView('overview');
    requestAnimationFrame(() => document.getElementById('broadcast')?.focus());
}

/** On a linked server this also offers to lift it on every linked server. */
function unban(entry: Ban): void {
    liftBan(entry).then((lifted) => {
        if (lifted) {
            state.selectedBan = null;
        }
    });
}
</script>

<template>
    <aside class="detail">
        <div class="full">
            <!-- A player -->
            <template v-if="player">
                <div class="hero player-hero" :style="{ '--faction': player.factionColor ?? 'var(--accent)' }">
                    <MapArt :map="status?.map" :lighting="status?.lighting" class="art" />
                    <div class="hero-buttons drag">
                        <button type="button" class="icon-btn" :class="{ starred: isWatched(player.steamId) }" :title="isWatched(player.steamId) ? 'Stop watching' : 'Watch this player'" @click="toggleWatch(player)"><Star /></button>
                        <button type="button" class="icon-btn" title="Steam profile" @click="openUrl(steamProfileUrl(player.steamId))"><ExternalLink /></button>
                        <button type="button" class="icon-btn" title="Close" @click="state.selectedPlayer = null"><X /></button>
                    </div>
                    <h2 class="title hero-title">{{ player.name }}</h2>
                </div>

                <div class="body">
                    <div class="pills">
                        <span class="pill faction-pill" :style="{ '--faction': player.factionColor ?? 'var(--muted)' }"><span class="swatch" />{{ player.faction ?? 'No faction' }}</span>
                        <span class="pill" :class="`ping-${pingLevel(player.pingMs)}`">{{ player.pingMs }} ms</span>
                    </div>

                    <div class="line">
                        <span>K/D {{ ratio(player.kills, player.deaths) }}</span>
                        <span class="num">{{ player.kills }} / {{ player.deaths }}</span>
                    </div>
                    <div class="progress"><span :style="{ '--fill': percent(player.kills, player.kills + player.deaths || 1) / 100 }" /></div>

                    <dl class="kv facts">
                        <dt>Kills</dt>
                        <dd class="num">{{ player.kills }}</dd>
                        <dt>Deaths</dt>
                        <dd class="num">{{ player.deaths }}</dd>
                        <dt>Cash</dt>
                        <dd class="num">${{ number(player.cash) }}</dd>
                        <dt>Steam ID</dt>
                        <dd>
                            <button type="button" class="copy mono" title="Copy" @click="copy(player.steamId, 'Steam ID')">{{ player.steamId }} <Copy /></button>
                        </dd>
                    </dl>

                    <label v-if="isWatched(player.steamId)" class="field watch-note">
                        <span class="field-label">Watch note</span>
                        <input class="input" :value="watchedEntry(player.steamId)?.note ?? ''" maxlength="200" placeholder="Why you watch them" @change="setWatchNote(player.steamId, ($event.target as HTMLInputElement).value)" />
                    </label>

                    <div class="tools">
                        <button type="button" class="btn" @click="openPlayerAction('faction', player)"><Shuffle /> Move</button>
                        <button type="button" class="btn" @click="killPlayer(player)"><Skull /> Kill</button>
                        <button type="button" class="btn btn-danger" @click="openPlayerAction('kick', player)"><UserX /> Kick</button>
                        <button type="button" class="btn btn-danger" @click="openPlayerAction('ban', player)"><BanIcon /> Ban</button>
                    </div>

                    <div class="grow" />
                    <button type="button" class="btn btn-primary btn-lg btn-block cta" @click="openPlayerAction('message', player)"><MessageSquare /> Message {{ player.name }}</button>
                </div>
            </template>

            <!-- A ban -->
            <template v-else-if="ban">
                <div class="hero">
                    <MapArt :map="status?.map" :lighting="status?.lighting" class="art" />
                    <div class="hero-buttons drag">
                        <button type="button" class="icon-btn" title="Steam profile" @click="openUrl(steamProfileUrl(ban.steamId))"><ExternalLink /></button>
                        <button type="button" class="icon-btn" title="Close" @click="state.selectedBan = null"><X /></button>
                    </div>
                    <h2 class="title hero-title">Banned player</h2>
                </div>
                <div class="body">
                    <div class="pills">
                        <span class="pill pill-bad">Banned</span>
                        <span v-if="ban.bannedBy" class="pill">by {{ ban.bannedBy }}</span>
                    </div>
                    <dl class="kv facts">
                        <dt>Steam ID</dt>
                        <dd>
                            <button type="button" class="copy mono" @click="copy(ban.steamId, 'Steam ID')">{{ ban.steamId }} <Copy /></button>
                        </dd>
                        <dt>Reason</dt>
                        <dd>{{ ban.reason || 'None given' }}</dd>
                        <dt>Banned</dt>
                        <dd>{{ ban.bannedAt ? dateTime(ban.bannedAt) : 'Before records (set in the server file)' }}</dd>
                    </dl>
                    <div class="grow" />
                    <button type="button" class="btn btn-primary btn-lg btn-block cta" @click="unban(ban)">Lift ban</button>
                </div>
            </template>

            <!-- The server -->
            <template v-else>
                <div class="hero">
                    <MapArt :map="status?.map" :lighting="status?.lighting" class="art" />
                    <div class="hero-buttons drag">
                        <button type="button" class="icon-btn" title="Widgets" @click="pickWidgets()"><PictureInPicture2 /></button>
                        <button type="button" class="icon-btn" :class="{ spinning: state.loading[state.selectedId ?? ''] }" title="Refresh (F5)" @click="state.selectedId && refreshLive(state.selectedId, true)"><RefreshCw /></button>
                    </div>
                    <h2 class="title hero-title">{{ status ? mapName(status.map) : selectedServer?.name }}</h2>
                </div>

                <div class="body">
                    <template v-if="live?.online && status">
                        <div class="pills">
                            <span class="pill pill-gold">{{ modeName(status.experiences) }}</span>
                            <span v-for="modifier in modifierNames(status.experiences)" :key="modifier" class="pill">{{ modifier }}</span>
                            <span v-if="status.lighting" class="pill">{{ gameName(status.lighting) }}</span>
                        </div>

                        <div class="line">
                            <span>Players · {{ status.players }} of {{ status.maxPlayers }}</span>
                            <span class="num">{{ fill }}%</span>
                        </div>
                        <div class="progress"><span :style="{ '--fill': fill / 100 }" /></div>

                        <dl class="kv facts">
                            <dt>Server</dt>
                            <dd class="truncate" :title="status.name">{{ status.name }}</dd>
                            <dt>Leading</dt>
                            <dd>
                                <span v-if="leader" class="lead"><span class="swatch" :style="{ background: leader.color }" />{{ leader.name }} · {{ leader.score }}</span>
                            </dd>
                            <dt v-if="status.zone">Zone</dt>
                            <dd v-if="status.zone">{{ zoneName(status.zone) }}</dd>
                            <dt>Uptime</dt>
                            <dd>{{ live.uptimeSeconds !== null ? formatUptime(live.uptimeSeconds) : '–' }}</dd>
                            <dt v-if="nextEntry">Next</dt>
                            <dd v-if="nextEntry">{{ nextEntry }}</dd>
                            <dt v-if="identity?.serverId">Join code</dt>
                            <dd v-if="identity?.serverId">
                                <button type="button" class="copy mono" title="Copy" @click="copy(identity.serverId, 'join code')">{{ identity.serverId.slice(0, 13) }}… <Copy /></button>
                            </dd>
                        </dl>

                        <p class="by muted">{{ selectedServer?.host }}:{{ selectedServer?.port }} · checked <TimeAgo :at="live.checkedAt" /></p>
                    </template>

                    <template v-else-if="live && !live.online">
                        <div class="pills"><span class="pill pill-bad">Offline</span></div>
                        <p class="offline">{{ live.error }}</p>
                        <p class="by muted">{{ selectedServer?.host }}:{{ selectedServer?.port }} · checked <TimeAgo :at="live.checkedAt" /></p>
                        <p class="muted small">Restart the server from your host's panel if it is down. This app retries on its own.</p>
                    </template>

                    <template v-else>
                        <div class="skeleton" style="height: 22px; width: 60%" />
                        <div class="skeleton" style="height: 3px; margin-top: 18px" />
                        <div class="skeleton" style="height: 110px; margin-top: 22px" />
                    </template>

                    <div class="grow" />
                    <button type="button" class="btn btn-primary btn-lg btn-block cta" :disabled="!live?.online" @click="broadcast"><Megaphone /> Broadcast to everyone</button>
                </div>
            </template>
        </div>
    </aside>
</template>

<style scoped>
.detail {
    position: relative;
    width: var(--detail-w);
    flex: none;
    overflow: hidden;
    background: var(--panel);
}

.full {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
}

.hero {
    position: relative;
    height: 165px;
    flex: none;
    border-bottom: 1px solid var(--line);
}

.art {
    position: absolute;
    inset: 0;
}

/* Just under the window's own buttons, which sit over the panel's top-right corner. */
.hero-buttons {
    position: absolute;
    top: calc(var(--caption-h) + 12px);
    right: 15.5px;
    left: 0;
    height: 44px;
    display: flex;
    justify-content: flex-end;
    gap: 2px;
    padding: 4.5px;
}

.hero-buttons .icon-btn {
    border-radius: 0;
}

.hero-buttons .icon-btn:first-child {
    border-radius: 1099px 0 0 1099px;
}

.hero-buttons .icon-btn:last-child {
    border-radius: 0 1099px 1099px 0;
}

.hero-title {
    position: absolute;
    left: 26.5px;
    right: 26.5px;
    bottom: 15.5px;
    font-size: 22px;
    font-weight: 700;
    text-shadow: 0 2px 13px rgb(0 0 0 / 0.6);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.player-hero::before {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 2px;
    z-index: 1;
    background: var(--faction);
}

.body {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 0;
    padding: 22px 26.5px 24px;
    overflow: auto;
}

.pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6.5px;
    margin-bottom: 20px;
}

.line {
    display: flex;
    justify-content: space-between;
    margin-bottom: 9px;
    color: var(--text-2);
    font-size: 14px;
}

.facts {
    margin: 24px 0 0;
    padding-top: 20px;
    border-top: 1px solid var(--line-soft);
}

.swatch {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 2px;
    background: var(--faction);
}

.lead {
    display: inline-flex;
    align-items: center;
    gap: 7.5px;
}

.faction-pill {
    background: color-mix(in srgb, var(--faction) 16%, transparent);
    color: color-mix(in srgb, var(--faction) 80%, white);
}

.ping-good {
    color: var(--ok);
}

.ping-fair {
    color: var(--warn);
}

.ping-poor {
    color: var(--bad);
}

.copy {
    display: inline-flex;
    align-items: center;
    gap: 6.5px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--text);
}

.copy svg {
    width: 13px;
    height: 13px;
    color: var(--muted);
}

.copy:hover svg {
    color: var(--accent);
}

.by {
    margin: 26.5px 0 0;
    font-size: 13px;
}

.small {
    font-size: 13px;
    line-height: 1.6;
}

.offline {
    margin: 0;
    color: var(--text-2);
    line-height: 1.6;
}

.tools {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 9px;
    margin-top: 26.5px;
}

.grow {
    flex: 1;
    min-height: 26.5px;
}

.cta {
    flex: none;
}

.starred svg {
    color: var(--warn);
    fill: var(--warn);
}

.watch-note {
    margin-top: 20px;
}

/* Spins only when a reading takes a moment, so the quick one every few seconds never makes it twitch. */
.spinning svg {
    animation: spin 0.8s linear 0.35s infinite;
}

/* Switching between the server, a player and a ban fades the new one in. */
.full > .hero,
.full > .body {
    animation: view-fade 0.15s ease-out both;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}
</style>
