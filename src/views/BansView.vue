<script setup lang="ts">
import { Ban as BanIcon, Plus, ShieldCheck } from 'lucide-vue-next';
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import SearchField from '@/components/SearchField.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { dateTime } from '@/lib/format';
import { act, busy, state } from '@/lib/store';
import type { BansAnswer } from '@/types';

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

const bans = computed(() => {
    const term = state.search.trim().toLowerCase();

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

    <div class="view-body flush">
        <p v-if="answer?.error" class="muted pad">{{ answer.error }}</p>

        <template v-else-if="answer">
            <div class="head">
                <span>Steam ID</span>
                <span>Reason</span>
                <span>By</span>
                <span class="right">Banned</span>
            </div>
            <div
                v-for="entry in bans"
                :key="entry.steamId"
                class="row ban"
                :class="{ active: state.selectedBan === entry.steamId }"
                @click="state.selectedBan = state.selectedBan === entry.steamId ? null : entry.steamId"
            >
                <span class="id mono"><BanIcon class="icon" />{{ entry.steamId }}</span>
                <span class="truncate" :class="{ muted: !entry.reason }">{{ entry.reason || 'No reason' }}</span>
                <span class="muted truncate">{{ entry.bannedBy ?? '–' }}</span>
                <span class="right muted">{{ entry.bannedAt ? dateTime(entry.bannedAt) : 'Undated' }}</span>
            </div>
            <div v-if="bans.length === 0" class="empty">
                <ShieldCheck />
                <span>{{ state.search ? 'No ban matches that search.' : 'Nobody is banned.' }}</span>
            </div>
        </template>

        <template v-else>
            <div v-for="i in 5" :key="i" class="skeleton" style="height: 36px; margin: 6px 30px" />
        </template>
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
            <button type="button" class="btn btn-danger" :disabled="!/^\d{17}$/.test(form.steamId.trim()) || busy.ban" @click="ban">Ban</button>
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
    height: 37.5px;
    color: var(--faint);
    font-size: 12.5px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
}

.ban {
    min-height: 44px;
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
</style>
