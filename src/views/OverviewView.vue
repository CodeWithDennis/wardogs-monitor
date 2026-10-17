<script setup lang="ts">
import { Lock, Megaphone, RotateCcw, Send, SkipForward, WifiOff } from 'lucide-vue-next';
import { computed, onMounted, ref, watch } from 'vue';
import FactionScores from '@/components/FactionScores.vue';
import PlayerChart from '@/components/PlayerChart.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { ago, formatUptime, modeName, ratio } from '@/lib/format';
import { BILLING_URL, openBilling } from '@/lib/licence';
import { mapName } from '@/lib/maps';
import { openPlayerMenu } from '@/lib/playerActions';
import { act, busy, now, openOptions, openView, selectedLive, selectedServer, state } from '@/lib/store';
import type { ActivityEntry } from '@/types';

/**
 * The server at a glance: the score race, a broadcast box, players over
 * time, the best players and what was done lately.
 */
const BROADCAST_MAX = 200;

const live = selectedLive;
const status = computed(() => live.value?.status ?? null);
const message = ref('');
const activity = ref<ActivityEntry[]>([]);

const topPlayers = computed(() => [...(live.value?.players ?? [])].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths).slice(0, 5));
const history = computed(() => (state.selectedId ? state.history[state.selectedId] ?? [] : []));

async function loadActivity(): Promise<void> {
    activity.value = (await window.panel.activity.list(state.selectedId)).slice(0, 6);
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
                <span class="live"><span class="dot online" /> Live</span>
                · {{ mapName(status.map) }} · {{ modeName(status.experiences) }} · up {{ formatUptime(live.uptimeSeconds ?? 0) }}
            </template>
            <template v-else-if="live?.locked">Locked</template>
            <template v-else-if="live">Offline · checked {{ ago(live.checkedAt, now) }}</template>
            <template v-else>Connecting…</template>
        </template>
    </ViewHeader>

    <div class="view-body">
        <div v-if="live && !live.online" class="card offline">
            <component :is="live.locked ? Lock : WifiOff" />
            <div>
                <strong>{{ live.locked ? 'This server is locked' : 'The server is not answering' }}</strong>
                <p>{{ live.error }}</p>
                <button v-if="live.lockedBy === 'plan' && BILLING_URL" type="button" class="btn btn-primary btn-sm" @click="openBilling">Upgrade</button>
            </div>
        </div>

        <template v-if="live?.online && status">
            <section>
                <div class="section-label">
                    <span>Match</span>
                    <span v-if="status.scoreTick" class="muted">a point every {{ status.scoreTick.current }}s</span>
                </div>
                <div class="card card-gold match">
                    <FactionScores :factions="status.factions" />
                    <div class="match-actions">
                        <button type="button" class="btn" :disabled="busy.restartMatch" @click="restartMatch"><RotateCcw /> Restart match</button>
                        <button type="button" class="btn" :disabled="busy.endMatch" @click="endMatch"><SkipForward /> End match</button>
                        <button type="button" class="btn btn-ghost" @click="openView('match')">Change map…</button>
                    </div>
                </div>
            </section>

            <section>
                <div class="section-label">
                    <span>Broadcast</span>
                    <span class="muted num">{{ message.length }}/{{ BROADCAST_MAX }}</span>
                </div>
                <form class="broadcast" @submit.prevent="broadcast">
                    <Megaphone class="lead-icon" />
                    <input id="broadcast" v-model="message" class="input" :maxlength="BROADCAST_MAX" placeholder="A message everyone on the server sees" />
                    <button type="submit" class="btn btn-primary" :disabled="message.trim() === '' || busy.broadcast"><Send /> Send</button>
                </form>
                <div class="templates">
                    <button v-for="template in state.preferences.broadcasts" :key="template" type="button" class="pill template" @click="message = template">{{ template }}</button>
                    <button type="button" class="link edit-templates" @click="openOptions('broadcasts')">Edit messages</button>
                </div>
            </section>

            <section>
                <div class="section-label">
                    <span>Players online</span>
                    <span>{{ status.players }} / {{ status.maxPlayers }}</span>
                </div>
                <PlayerChart :points="history" :max="status.maxPlayers" />
            </section>

            <div class="split">
                <section>
                    <div class="section-label">
                        <span>Top players</span>
                        <button type="button" class="link" @click="openView('players')">All {{ live.players.length }}</button>
                    </div>
                    <div class="list">
                        <div v-for="(player, index) in topPlayers" :key="player.steamId" class="row" @click="openPlayer(player.steamId)" @contextmenu="openPlayerMenu($event, player)">
                            <span class="rank num muted">{{ index + 1 }}</span>
                            <span class="swatch" :style="{ background: player.factionColor ?? 'var(--faint)' }" />
                            <span class="truncate grow">{{ player.name }}</span>
                            <span class="num muted">{{ player.kills }}/{{ player.deaths }}</span>
                            <span class="num kd">{{ ratio(player.kills, player.deaths) }}</span>
                        </div>
                        <p v-if="topPlayers.length === 0" class="muted none">Nobody is playing right now.</p>
                    </div>
                </section>

                <section>
                    <div class="section-label">
                        <span>Recent activity</span>
                        <button type="button" class="link" @click="state.activityServer = state.selectedId; openView('activity')">All</button>
                    </div>
                    <div class="list">
                        <div v-for="entry in activity" :key="entry.at + entry.summary" class="row activity" :title="entry.error ?? entry.summary">
                            <span class="dot" :class="entry.ok ? 'online' : 'offline'" />
                            <span class="truncate grow">{{ entry.summary }}</span>
                            <span class="muted when">{{ ago(entry.at, now) }}</span>
                        </div>
                        <p v-if="activity.length === 0" class="muted none">Nothing done from this app yet.</p>
                    </div>
                </section>
            </div>
        </template>

        <template v-else-if="!live">
            <div class="skeleton" style="height: 150px" />
            <div class="skeleton" style="height: 40px; margin-top: 28px" />
            <div class="skeleton" style="height: 120px; margin-top: 28px" />
        </template>
    </div>
</template>

<style scoped>
section + section,
section + .split,
.offline + section {
    margin-top: 33px;
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

.match {
    padding: 22px 24px;
}

.match-actions {
    display: flex;
    gap: 9px;
    margin-top: 24px;
    padding-top: 17.5px;
    border-top: 1px solid var(--line-soft);
}

.match-actions .btn-ghost {
    margin-left: auto;
}

.broadcast {
    position: relative;
    display: flex;
    gap: 9px;
}

.broadcast .input {
    height: 39.5px;
    padding-left: 39.5px;
}

.broadcast .btn {
    height: 39.5px;
}

.lead-icon {
    position: absolute;
    left: 13px;
    top: 11px;
    width: 17.5px;
    height: 17.5px;
    color: var(--accent);
}

.templates {
    display: flex;
    flex-wrap: wrap;
    gap: 6.5px;
    margin-top: 11px;
}

.template {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    border: 0;
    cursor: pointer;
}

.edit-templates {
    align-self: center;
    margin-left: 4.5px;
}

.template:hover {
    background: var(--select);
    color: var(--text);
}

.split {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(286px, 1fr));
    gap: 33px;
}

.split section + section {
    margin-top: 0;
}

.list {
    margin: 0 -15.5px;
}

.list .row {
    min-height: 39.5px;
    font-size: 14.5px;
}

.rank {
    width: 15.5px;
    text-align: right;
    font-size: 13px;
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
    font-size: 13px;
    white-space: nowrap;
}

.activity {
    cursor: default;
}

.none {
    margin: 0;
    padding: 11px 15.5px;
    font-size: 14px;
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

.offline .btn {
    margin-top: 12px;
}
</style>
