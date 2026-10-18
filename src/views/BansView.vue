<script setup lang="ts">
import { Ban as BanIcon, Link2, LoaderCircle, Plus, RefreshCw, ShieldBan, ShieldCheck, UserX, WifiOff } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { dateTime } from '@/lib/format';
import { groupOf, openSyncPreview } from '@/lib/banlists';
import { act, busy, openOptions, searchTerm, state } from '@/lib/store';
import type { BanSyncPlan, BansAnswer } from '@/types';

/** Everyone banned from the server; open one to lift it, or ban a Steam ID that is not online. */
const answer = ref<BansAnswer | null>(null);
const form = reactive({ steamId: '', reason: '' });
const formError = ref<string | null>(null);
const steamIdInput = ref<HTMLInputElement | null>(null);

async function load(): Promise<void> {
    if (state.selectedId) {
        answer.value = await window.panel.server.bans(state.selectedId);
    }
}

onMounted(load);
watch(() => state.revision, load);

/**
 * A linked server shows which ban list it shares and marks the bans that
 * are not on every linked server yet. Reading the plan writes nothing.
 */
const group = computed(() => groupOf(state.selectedId));
const others = computed(() => (group.value ? group.value.serverIds.filter((id) => id !== state.selectedId).length : 0));
const linkedPlan = ref<BanSyncPlan | null>(null);

async function loadPlan(): Promise<void> {
    const groupId = group.value?.id;

    if (!groupId || others.value === 0) {
        linkedPlan.value = null;

        return;
    }

    const result = await window.panel.banLists.plan(groupId);
    linkedPlan.value = result.ok && group.value?.id === groupId ? result.plan : null;
}

watch([() => group.value?.id, () => group.value?.serverIds.join(), () => state.revision], loadPlan, { immediate: true });

/** Steam ID → the linked servers that still lack it, and the ones the shared list lifted. */
const missingElsewhere = computed(() => {
    const missing: Record<string, string[]> = {};

    for (const server of linkedPlan.value?.servers ?? []) {
        if (server.serverId !== state.selectedId) {
            for (const ban of server.toAdd) {
                (missing[ban.steamId] ??= []).push(server.serverName);
            }
        }
    }

    return missing;
});

/** Shared bans some linked server (this one included) still lacks. */
const notEverywhere = computed(() => new Set(linkedPlan.value?.servers.flatMap((server) => server.toAdd.map((ban) => ban.steamId)) ?? []).size);

const liftedHere = computed(() => new Set(linkedPlan.value?.servers.find((server) => server.serverId === state.selectedId)?.toRemove.map((entry) => entry.steamId) ?? []));
const pendingHere = computed(() => linkedPlan.value?.servers.find((server) => server.serverId === state.selectedId)?.toAdd.length ?? 0);

const bans = computed(() => {
    const term = searchTerm.value;

    return (answer.value?.bans ?? [])
        .filter((ban) => term === '' || ban.steamId.includes(term) || (ban.reason ?? '').toLowerCase().includes(term))
        .sort((a, b) => (b.bannedAt ?? '').localeCompare(a.bannedAt ?? ''));
});

/** The header button brings the "Add a ban" card into view, ready to type. */
function focusAdd(): void {
    steamIdInput.value?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    steamIdInput.value?.focus();
}

async function ban(): Promise<void> {
    const result = await act('ban', { steamId: form.steamId.trim(), reason: form.reason });

    if (result?.ok) {
        Object.assign(form, { steamId: '', reason: '' });
        formError.value = null;
    } else if (result && !result.ok) {
        formError.value = result.error;
    }
}
</script>

<template>
    <ViewHeader title="Bans" :subtitle="answer ? `${answer.bans.length} ${answer.bans.length === 1 ? 'player is' : 'players are'} kept off the server` : 'Who is kept off the server'">
        <template #actions>
            <button type="button" class="btn" @click="focusAdd"><Plus /> Ban a Steam ID</button>
        </template>
    </ViewHeader>

    <div class="toolbar">
        <SearchField placeholder="Search by Steam ID or reason" :count="bans.length" />
    </div>

    <div class="view-body">
        <div class="stack">
            <!-- The shared ban list this server is linked to -->
            <section v-if="group" class="card panel">
                <header class="panel-head">
                    <span class="panel-title">
                        <span class="panel-icon"><Link2 /></span>
                        <span class="truncate">Linked to “{{ group.name }}”</span>
                    </span>
                    <button v-if="others > 0" type="button" class="btn btn-sm" @click="openSyncPreview(group.id)"><RefreshCw /> Sync now</button>
                    <button v-else type="button" class="btn btn-sm btn-ghost" @click="openOptions('banlists')">Link servers</button>
                </header>
                <p class="linked-text">
                    <template v-if="others > 0">Shares one ban list with {{ others }} other {{ others === 1 ? 'server' : 'servers' }}.</template>
                    <template v-else>No other servers share this list yet.</template>
                    <span v-if="linkedPlan && (notEverywhere > 0 || liftedHere.size > 0)" class="gold">
                        {{ notEverywhere }} {{ notEverywhere === 1 ? 'ban is' : 'bans are' }} not on every server{{ pendingHere ? `, ${pendingHere} missing here` : '' }}{{ liftedHere.size ? `, ${liftedHere.size} to lift here` : '' }}.
                    </span>
                    <span v-else-if="linkedPlan" class="ok">Every linked server has the same bans.</span>
                </p>
            </section>

            <!-- Ban a Steam ID that is not online -->
            <section class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><UserX /></span> Add a ban</span>
                    <span class="panel-aside">For players who are not online</span>
                </header>
                <p class="panel-intro">To ban someone playing now, open them under Players.</p>
                <form class="add" @submit.prevent="ban">
                    <label class="field">
                        <span class="field-label">Steam ID</span>
                        <input ref="steamIdInput" v-model="form.steamId" class="input mono" placeholder="76561198000000000" maxlength="17" inputmode="numeric" :aria-invalid="formError ? 'true' : undefined" />
                    </label>
                    <label class="field">
                        <span class="field-label">Reason (optional)</span>
                        <input v-model="form.reason" class="input" maxlength="200" placeholder="Cheating" />
                    </label>
                    <button type="submit" class="btn btn-danger" :disabled="!/^\d{17}$/.test(form.steamId.trim()) || busy.ban"><LoaderCircle v-if="busy.ban" class="spin" /><BanIcon v-else /> Ban</button>
                </form>
                <p v-if="formError" class="field-error form-note">{{ formError }}</p>
                <p v-else class="field-hint form-note">The 17-digit number in their Steam profile link.</p>
            </section>

            <!-- Everyone banned from the server -->
            <section v-if="answer" class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><ShieldBan /></span> Banned players</span>
                    <span v-if="!answer.error" class="panel-aside">{{ state.search ? `${bans.length} of ${answer.bans.length}` : answer.bans.length }}</span>
                </header>

                <div v-if="answer.error" class="empty">
                    <WifiOff />
                    <span>{{ answer.error }}</span>
                </div>

                <div v-else class="panel-flush">
                    <div v-if="bans.length > 0" class="head">
                        <span>Steam ID</span>
                        <span>Reason</span>
                        <span class="c-by">By</span>
                        <span class="right c-when">Banned</span>
                    </div>
                    <div
                        v-for="entry in bans"
                        :key="entry.steamId"
                        class="row ban"
                        :class="{ active: state.selectedBan === entry.steamId }"
                        @click="state.selectedBan = state.selectedBan === entry.steamId ? null : entry.steamId"
                    >
                        <span class="id mono"><BanIcon class="icon" />{{ entry.steamId }}</span>
                        <span class="reason">
                            <span class="truncate" :class="{ muted: !entry.reason }">{{ entry.reason || 'No reason' }}</span>
                            <span v-if="liftedHere.has(entry.steamId)" class="pill pill-ok mark" title="Lifted on the shared list: the next sync lifts it here">To lift</span>
                            <span v-else-if="missingElsewhere[entry.steamId]" class="pill pill-gold mark" :title="`Not yet on ${missingElsewhere[entry.steamId].join(', ')}`">Not synced</span>
                        </span>
                        <span class="muted truncate c-by">{{ entry.bannedBy ?? '–' }}</span>
                        <span class="right muted c-when">{{ entry.bannedAt ? dateTime(entry.bannedAt) : 'Undated' }}</span>
                    </div>
                    <div v-if="bans.length === 0" class="empty">
                        <ShieldCheck />
                        <span>{{ state.search ? 'No ban matches that search.' : 'Nobody is banned. Ban a Steam ID above, or a player who is online from Players.' }}</span>
                    </div>
                </div>
            </section>

            <section v-else class="card panel" aria-busy="true" aria-label="Loading bans">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><ShieldBan /></span> Banned players</span>
                    <div class="skeleton" style="height: 13px; width: 28px" />
                </header>
                <div class="panel-flush">
                    <div class="head">
                        <span>Steam ID</span>
                        <span>Reason</span>
                        <span class="c-by">By</span>
                        <span class="right c-when">Banned</span>
                    </div>
                    <div v-for="i in 6" :key="i" class="ban skeleton-row">
                        <div class="skeleton" style="height: 14px; width: 150px" />
                        <div class="skeleton" style="height: 14px" :style="{ width: `${30 + ((i * 23) % 50)}%` }" />
                        <div class="skeleton c-by" style="height: 14px; width: 60px" />
                        <div class="skeleton c-when" style="height: 14px; width: 90px; justify-self: end" />
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.linked-text {
    margin: -6px 0 0;
    color: var(--text-2);
    font-size: 13.5px;
    line-height: 1.5;
}

.linked-text .gold,
.linked-text .ok {
    margin-left: 4px;
}

.ok {
    color: var(--ok);
}

/* Steam ID and reason side by side, the button on the same line. */
.add {
    display: grid;
    grid-template-columns: minmax(0, 230px) minmax(0, 1fr) auto;
    align-items: end;
    gap: 13px;
}

.form-note {
    margin: 9px 0 0;
}

/* Columns line up with the card's padding; a row's 2px edge is part of its own. */
.head,
.ban {
    display: grid;
    grid-template-columns: 231px minmax(0, 1fr) 99px 132px;
    align-items: center;
    gap: 15.5px;
    padding: 0 20px;
}

.ban {
    min-height: 46px;
    padding-left: 18px;
    /* Rows out of view are skipped when laying out and painting, for long ban lists. */
    content-visibility: auto;
    contain-intrinsic-size: auto 46px;
}

.head {
    height: 36px;
    border-top: 1px solid var(--line-soft);
    border-bottom: 1px solid var(--line-soft);
    color: var(--faint);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.ban + .ban {
    border-top: 1px solid var(--line-soft);
}

.skeleton-row {
    border-left: 2px solid transparent;
}

.reason {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
}

.reason .truncate {
    min-width: 0;
}

.mark {
    height: 22px;
    flex: none;
    font-size: 12px;
}

.id {
    display: flex;
    align-items: center;
    gap: 11px;
}

.icon {
    width: 14.5px;
    height: 14.5px;
    color: var(--bad);
}

.right {
    text-align: right;
    font-size: 14px;
}

/* A narrower page drops who banned, then when, so the list never scrolls sideways. */
@container page (max-width: 760px) {
    .head,
    .ban {
        grid-template-columns: 200px minmax(0, 1fr) 120px;
    }

    .c-by {
        display: none;
    }

    .add {
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .add .btn {
        grid-column: 1 / -1;
        justify-self: start;
    }
}

@container page (max-width: 520px) {
    .head,
    .ban {
        grid-template-columns: 190px minmax(0, 1fr);
    }

    .c-when {
        display: none;
    }

    .add {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
