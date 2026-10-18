<script setup lang="ts">
import { CircleCheck, Info, Link2, LoaderCircle, Pencil, Plus, RefreshCw, Search, ShieldBan, Trash2, TriangleAlert } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { banLists, checkDifferences, describeDifferences, freeGroupName, groupOf, loadBanLists, openSyncPreview, removeBanList, saveBanList } from '@/lib/banlists';
import { ago } from '@/lib/format';
import { now, state } from '@/lib/store';
import type { BanGroup } from '@/types';

/**
 * Options → Ban lists: link servers so they share one ban list. The list
 * is kept on this PC and copied to the servers when you sync, always after
 * a preview you confirm.
 */
const newName = ref('');
const renaming = ref<string | null>(null);
const renameText = ref('');

onMounted(loadBanLists);

async function create(): Promise<void> {
    const group = await saveBanList({ name: newName.value.trim() || freeGroupName(), serverIds: [] });

    if (group) {
        newName.value = '';
    }
}

async function rename(group: BanGroup): Promise<void> {
    const name = renameText.value.trim();

    if (name && name !== group.name) {
        await saveBanList({ id: group.id, name });
    }

    renaming.value = null;
}

function toggleServer(group: BanGroup, serverId: string): void {
    const serverIds = group.serverIds.includes(serverId) ? group.serverIds.filter((id) => id !== serverId) : [...group.serverIds, serverId];
    saveBanList({ id: group.id, serverIds });
}

/** The other group a server is linked in, which keeps it out of this one. */
function elsewhere(group: BanGroup, serverId: string): BanGroup | null {
    const other = groupOf(serverId);

    return other && other.id !== group.id ? other : null;
}

const dot = (serverId: string) => (state.lives[serverId]?.online ? 'online' : state.lives[serverId] ? 'offline' : 'pending');
</script>

<template>
    <div class="banlists stack">
        <!-- What linking does, and a new list -->
        <section class="card panel">
            <header class="panel-head">
                <span class="panel-title"><span class="panel-icon"><Link2 /></span> Linked ban lists</span>
                <span v-if="banLists.loaded" class="panel-aside">{{ banLists.groups.length }} {{ banLists.groups.length === 1 ? 'list' : 'lists' }}</span>
            </header>
            <p class="panel-intro">
                Link servers so they share one ban list. A game server only keeps its own bans, so the shared list is kept on this PC and copied to each server when you sync. Every sync shows what it will change first, and nothing is sent until you confirm.
            </p>
            <form class="add-row" @submit.prevent="create">
                <input v-model="newName" class="input" maxlength="60" :placeholder="freeGroupName()" />
                <button type="submit" class="btn btn-primary"><Plus /> New ban list</button>
            </form>
        </section>

        <!-- One card per linked group -->
        <section v-for="group in banLists.groups" :key="group.id" class="card panel">
            <header class="panel-head">
                <form v-if="renaming === group.id" class="rename" @submit.prevent="rename(group)">
                    <input v-model="renameText" class="input" maxlength="60" autofocus @keydown.esc="renaming = null" />
                    <button type="submit" class="btn btn-primary btn-sm">Save</button>
                </form>
                <span v-else class="panel-title">
                    <span class="panel-icon"><ShieldBan /></span>
                    <span class="truncate">{{ group.name }}</span>
                </span>
                <span class="row-tools">
                    <button type="button" title="Rename" @click="renaming = group.id; renameText = group.name"><Pencil /></button>
                    <button type="button" title="Delete ban list" class="bad" @click="removeBanList(group)"><Trash2 /></button>
                </span>
            </header>

            <dl class="stats">
                <div class="stat">
                    <dt>Servers</dt>
                    <dd class="num">{{ group.serverIds.length }}</dd>
                </div>
                <div class="stat">
                    <dt>Shared bans</dt>
                    <dd class="num">
                        {{ group.banCount }}
                        <small v-if="group.liftedCount" class="muted">{{ group.liftedCount }} to lift</small>
                    </dd>
                </div>
                <div class="stat">
                    <dt>Last sync</dt>
                    <dd :class="{ muted: !group.lastSyncedAt }">{{ group.lastSyncedAt ? ago(group.lastSyncedAt, now) : 'Never' }}</dd>
                </div>
            </dl>

            <div class="servers-head label-caps">
                <span>Linked servers</span>
                <span class="num">{{ group.serverIds.length }}/{{ state.servers.length }}</span>
            </div>
            <div class="panel-flush servers">
                <label v-for="server in state.servers" :key="server.id" class="server" :class="{ on: group.serverIds.includes(server.id), taken: elsewhere(group, server.id) }">
                    <input type="checkbox" :checked="group.serverIds.includes(server.id)" :disabled="elsewhere(group, server.id) !== null" @change="toggleServer(group, server.id)" />
                    <span class="dot" :class="dot(server.id)" />
                    <span class="server-name truncate">{{ server.name }}</span>
                    <span v-if="elsewhere(group, server.id)" class="muted where">In “{{ elsewhere(group, server.id)!.name }}”</span>
                    <span v-else-if="state.lives[server.id]?.locked" class="muted where">Locked</span>
                    <span v-else-if="state.lives[server.id] && !state.lives[server.id]!.online" class="muted where">Offline</span>
                    <span class="mono muted address">{{ server.host }}:{{ server.port }}</span>
                </label>
                <p v-if="state.servers.length === 0" class="muted none">Add a server first.</p>
            </div>

            <!-- Where the servers stand, and the two ways to act on it -->
            <div class="footer">
                <p v-if="banLists.checks[group.id]?.loading" class="muted check"><LoaderCircle class="spin" /> Reading the linked servers…</p>
                <p v-else-if="banLists.checks[group.id]?.error" class="field-error check"><TriangleAlert /> {{ banLists.checks[group.id]!.error }}</p>
                <p v-else-if="banLists.checks[group.id]?.plan" class="check">
                    <template v-for="plan in [banLists.checks[group.id]!.plan!]" :key="plan.fingerprint">
                        <TriangleAlert v-if="describeDifferences(plan.missing, plan.lifting, plan.serversBehind)" class="gold" />
                        <CircleCheck v-else class="ok" />
                        <span>
                            <span v-if="describeDifferences(plan.missing, plan.lifting, plan.serversBehind)" class="gold">{{ describeDifferences(plan.missing, plan.lifting, plan.serversBehind) }}.</span>
                            <span v-else class="ok">All {{ plan.servers.length }} {{ plan.servers.length === 1 ? 'server that answered matches' : 'servers that answered match' }}.</span>
                            <span v-if="plan.skipped.length" class="muted"> Skipped: {{ plan.skipped.map((entry) => entry.serverName).join(', ') }}.</span>
                        </span>
                    </template>
                </p>
                <p v-else class="muted check"><Info /> {{ group.serverIds.length < 2 ? 'Tick at least two servers to link them.' : 'Check what differs, or sync to see a preview.' }}</p>

                <div class="actions">
                    <button type="button" class="btn" :disabled="group.serverIds.length < 2 || banLists.checks[group.id]?.loading" @click="checkDifferences(group.id)"><Search /> Check differences</button>
                    <button type="button" class="btn btn-primary" :disabled="group.serverIds.length < 2" @click="openSyncPreview(group.id)"><RefreshCw /> Sync now</button>
                </div>
            </div>
        </section>

        <section v-if="banLists.loaded && banLists.groups.length === 0" class="card panel">
            <div class="empty">
                <Link2 />
                <span>No linked ban lists yet. Create one, then tick the servers that should share it.</span>
            </div>
        </section>

        <section v-if="!banLists.loaded" class="card panel" aria-busy="true" aria-label="Loading ban lists">
            <header class="panel-head">
                <span class="panel-title"><span class="panel-icon"><ShieldBan /></span> <span class="skeleton" style="display: block; height: 14px; width: 140px" /></span>
            </header>
            <div class="stats">
                <div v-for="i in 3" :key="i" class="skeleton" style="height: 62px" />
            </div>
            <div class="skeleton-list">
                <div v-for="i in 3" :key="i" class="skeleton" style="height: 28px" />
            </div>
        </section>
    </div>
</template>

<style scoped>
.add-row {
    display: flex;
    gap: 9px;
}

.add-row .input {
    flex: 1;
    min-width: 0;
}

.rename {
    display: flex;
    gap: 9px;
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

.row-tools button:hover {
    background: var(--hover);
    color: var(--text);
}

.row-tools button.bad:hover {
    color: var(--bad);
}

.row-tools svg {
    width: 15.5px;
    height: 15.5px;
}

/* Three small tiles: how many servers, how many bans, when it last synced. */
.stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 11px;
    margin: 0 0 20px;
}

.stat {
    display: grid;
    gap: 5px;
    min-width: 0;
    padding: 11px 13px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--panel);
}

.stat dt {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.stat dd {
    display: flex;
    align-items: baseline;
    gap: 7px;
    min-width: 0;
    margin: 0;
    color: var(--text);
    font-size: 17px;
    font-weight: 600;
    white-space: nowrap;
}

.stat dd.muted {
    color: var(--muted);
}

.stat small {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: 12.5px;
    font-weight: 400;
}

.servers-head {
    display: flex;
    justify-content: space-between;
    gap: 13px;
    padding-bottom: 9px;
    color: var(--muted);
}

/* Servers run edge to edge, a soft line between each. */
.server {
    display: flex;
    align-items: center;
    gap: 11px;
    min-height: 44px;
    padding: 0 20px;
    border-top: 1px solid var(--line-soft);
    font-size: 14.5px;
    cursor: pointer;
    transition: background 0.1s;
}

.server:last-of-type {
    border-bottom: 1px solid var(--line-soft);
}

.server:hover {
    background: var(--hover);
}

.server.taken {
    cursor: default;
    opacity: 0.55;
}

.server.taken:hover {
    background: transparent;
}

.server input {
    width: 15.5px;
    height: 15.5px;
    margin: 0;
    flex: none;
    accent-color: var(--accent);
}

.server-name {
    flex: 1;
    min-width: 0;
    color: var(--text-2);
}

.server.on .server-name {
    color: var(--text);
    font-weight: 500;
}

.where {
    flex: none;
    font-size: 13px;
}

.address {
    width: 176px;
    flex: none;
    font-size: 13px;
    text-align: right;
}

.none {
    margin: 0;
    padding: 13px 20px;
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
}

.footer {
    display: flex;
    align-items: center;
    gap: 13px;
    padding-top: 16px;
}

.check {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: 14px;
    line-height: 1.5;
}

.check svg {
    width: 15.5px;
    height: 15.5px;
    flex: none;
    margin-top: 2.5px;
}

.actions {
    display: flex;
    gap: 9px;
    flex: none;
}

.ok {
    color: var(--ok);
}

/* A narrow page: the address goes, and the buttons drop under the status. */
@container page (max-width: 760px) {
    .address {
        display: none;
    }

    .footer {
        flex-wrap: wrap;
    }

    .check {
        flex-basis: 100%;
    }
}
</style>
