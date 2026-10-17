<script setup lang="ts">
import { Ban as BanIcon, Link2, LoaderCircle, Plus, ShieldCheck } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { dateTime } from '@/lib/format';
import { groupOf, openSyncPreview } from '@/lib/banlists';
import { act, busy, searchTerm, state } from '@/lib/store';
import type { BanSyncPlan, BansAnswer } from '@/types';

/** Everyone banned from the server; open one to lift it, or ban a Steam ID that is not online. */
const answer = ref<BansAnswer | null>(null);
const adding = ref(false);
const form = reactive({ steamId: '', reason: '' });
const formError = ref<string | null>(null);

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

function openAdd(): void {
    Object.assign(form, { steamId: '', reason: '' });
    formError.value = null;
    adding.value = true;
}

async function ban(): Promise<void> {
    const result = await act('ban', { steamId: form.steamId.trim(), reason: form.reason });

    if (result?.ok) {
        adding.value = false;
    } else if (result && !result.ok) {
        formError.value = result.error;
    }
}
</script>

<template>
    <ViewHeader title="Bans" :subtitle="answer ? `${answer.bans.length} ${answer.bans.length === 1 ? 'player is' : 'players are'} kept off the server` : 'Who is kept off the server'">
        <template #actions>
            <button type="button" class="btn" @click="openAdd"><Plus /> Ban a Steam ID</button>
        </template>
    </ViewHeader>

    <div class="toolbar">
        <SearchField placeholder="Search by Steam ID or reason" :count="bans.length" />
    </div>

    <div v-if="group" class="linked">
        <Link2 class="linked-icon" />
        <span class="linked-text">
            Linked to “{{ group.name }}”{{ others > 0 ? ` with ${others} other ${others === 1 ? 'server' : 'servers'}` : ', with no other servers yet' }}
            <template v-if="linkedPlan && (notEverywhere > 0 || liftedHere.size > 0)">
                · <span class="gold">{{ notEverywhere }} {{ notEverywhere === 1 ? 'ban is' : 'bans are' }} not on every server{{ pendingHere ? `, ${pendingHere} missing here` : '' }}{{ liftedHere.size ? `, ${liftedHere.size} to lift here` : '' }}</span>
            </template>
        </span>
        <button v-if="others > 0" type="button" class="btn btn-sm" @click="openSyncPreview(group.id)">Sync now</button>
    </div>

    <div class="view-body flush">
        <p v-if="answer?.error" class="muted pad">{{ answer.error }}</p>

        <template v-else-if="answer">
            <div class="head">
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
                <span>{{ state.search ? 'No ban matches that search.' : 'Nobody is banned. Ban a Steam ID with the button above, or a player who is online from Players.' }}</span>
            </div>
        </template>

        <div v-else aria-busy="true" aria-label="Loading bans">
            <div class="head">
                <span>Steam ID</span>
                <span>Reason</span>
                <span class="c-by">By</span>
                <span class="right c-when">Banned</span>
            </div>
            <div class="skeleton-list rows-skeleton">
                <div v-for="i in 6" :key="i" class="skeleton" style="height: 30px" />
            </div>
        </div>
    </div>

    <Modal :open="adding" title="Ban a Steam ID" @close="adding = false">
        <form class="form" @submit.prevent="ban">
            <p class="muted note">For players who are not online. To ban someone playing now, open them under Players.</p>
            <label class="field">
                <span class="field-label">Steam ID</span>
                <input v-model="form.steamId" class="input mono" placeholder="76561198000000000" maxlength="17" inputmode="numeric" autofocus />
                <span class="field-hint">The 17-digit number in their Steam profile link.</span>
            </label>
            <label class="field">
                <span class="field-label">Reason (optional)</span>
                <input v-model="form.reason" class="input" maxlength="200" placeholder="Cheating" />
            </label>
            <p v-if="formError" class="field-error">{{ formError }}</p>
            <button type="submit" hidden />
        </form>
        <template #footer>
            <button type="button" class="btn btn-ghost" @click="adding = false">Cancel</button>
            <button type="button" class="btn btn-danger" :disabled="!/^\d{17}$/.test(form.steamId.trim()) || busy.ban" @click="ban"><LoaderCircle v-if="busy.ban" class="spin" />Ban</button>
        </template>
    </Modal>
</template>

<style scoped>
.flush {
    padding: 9px 0 26.5px;
}

.pad {
    padding: 17.5px 35px;
}

.head,
.ban {
    display: grid;
    grid-template-columns: 231px minmax(0, 1fr) 99px 132px;
    align-items: center;
    gap: 15.5px;
    padding: 0 28.5px 0 33px;
}

.head {
    height: 38px;
    color: var(--faint);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.ban {
    min-height: 44px;
    /* Rows out of view are skipped when laying out and painting, for long ban lists. */
    content-visibility: auto;
    contain-intrinsic-size: auto 44px;
}

.rows-skeleton {
    padding: 6px 28.5px 0 33px;
}

/* The linked ban list strip under the toolbar. */
.linked {
    display: flex;
    flex: none;
    align-items: center;
    gap: 11px;
    padding: 9px 35px;
    border-bottom: 1px solid var(--line-soft);
    background: var(--panel);
    font-size: 14px;
}

.linked-icon {
    width: 15.5px;
    height: 15.5px;
    flex: none;
    color: var(--accent);
}

.linked-text {
    flex: 1;
    min-width: 0;
    color: var(--text-2);
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

.form {
    display: grid;
    gap: 15.5px;
}

.note {
    margin: 0;
    font-size: 14px;
}

/* A narrower page drops who banned, then when, so the list never scrolls sideways. */
@container page (max-width: 720px) {
    .head,
    .ban {
        grid-template-columns: 200px minmax(0, 1fr) 120px;
        padding: 0 18px 0 22px;
    }

    .c-by {
        display: none;
    }

    .linked {
        flex-wrap: wrap;
        padding: 9px 20px;
    }

    .pad {
        padding: 17.5px 20px;
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
}
</style>
