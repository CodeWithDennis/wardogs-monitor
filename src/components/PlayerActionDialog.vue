<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Modal from '@/components/Modal.vue';
import { playerAction } from '@/lib/playerActions';
import { act, busy, selectedLive } from '@/lib/store';

/** Message, kick, ban or move one player, with the words or faction it needs. */
const MAX = 200;

const COPY = {
    message: { title: 'Message', label: 'Message', placeholder: 'Only they will see this.', button: 'Send message', danger: false },
    kick: { title: 'Kick', label: 'Reason', placeholder: 'They see this when they are kicked.', button: 'Kick player', danger: true },
    ban: { title: 'Ban', label: 'Reason (optional)', placeholder: 'Shown in the ban list.', button: 'Ban player', danger: true },
    faction: { title: 'Move', label: 'Faction', placeholder: '', button: 'Move player', danger: false },
};

const REASONS = {
    kick: ['Team killing', 'Toxic behaviour', 'Ignoring staff', 'AFK', 'Make room for an event'],
    ban: ['Cheating', 'Repeated team killing', 'Hate speech', 'Ban evasion'],
};

const text = ref('');
const faction = ref('');
const error = ref<string | null>(null);

const copy = computed(() => (playerAction.value ? COPY[playerAction.value.mode] : COPY.message));
const factions = computed(() => (selectedLive.value?.status?.factions ?? []).filter((entry) => entry.name !== playerAction.value?.player.faction));
const suggestions = computed(() => (playerAction.value && playerAction.value.mode in REASONS ? REASONS[playerAction.value.mode as 'kick' | 'ban'] : []));

watch(playerAction, (value) => {
    text.value = '';
    error.value = null;
    faction.value = factions.value[0]?.name ?? '';

    if (value?.mode === 'faction' && !faction.value) {
        error.value = 'There is no other faction to move them to.';
    }
});

function close(): void {
    playerAction.value = null;
}

async function submit(): Promise<void> {
    if (!playerAction.value) {
        return;
    }

    const { mode, player } = playerAction.value;
    const args = { steamId: player.steamId, name: player.name };
    const result = mode === 'message'
        ? await act('message', { ...args, message: text.value })
        : mode === 'kick'
          ? await act('kick', { ...args, reason: text.value })
          : mode === 'ban'
            ? await act('ban', { ...args, reason: text.value })
            : await act('faction', { ...args, faction: faction.value });

    if (result?.ok) {
        close();
    } else if (result && !result.ok) {
        error.value = result.error;
    }
}
</script>

<template>
    <Modal :open="playerAction !== null" :title="`${copy.title} ${playerAction?.player.name ?? ''}`" :width="440" @close="close">
        <form class="form" @submit.prevent="submit">
            <template v-if="playerAction?.mode === 'faction'">
                <p class="muted note">They move to the other team at once and keep playing. Their score stays with them.</p>
                <div class="factions">
                    <label v-for="entry in factions" :key="entry.name" class="faction" :class="{ on: faction === entry.name }">
                        <input v-model="faction" type="radio" :value="entry.name" />
                        <span class="swatch" :style="{ background: entry.color }" />
                        <span class="name">{{ entry.name }}</span>
                        <span class="muted num">{{ entry.players }} players</span>
                    </label>
                </div>
            </template>

            <label v-else class="field">
                <span class="field-label">{{ copy.label }}</span>
                <textarea v-model="text" class="textarea" :maxlength="MAX" :placeholder="copy.placeholder" rows="3" autofocus @keydown.ctrl.enter="submit" />
                <span class="hint">
                    <span v-if="playerAction?.mode === 'ban'" class="field-hint">A ban also kicks them, and keeps them out until you unban them.</span>
                    <span v-else class="field-hint">Ctrl+Enter sends.</span>
                    <span class="field-hint num">{{ text.length }}/{{ MAX }}</span>
                </span>
            </label>

            <div v-if="suggestions.length" class="chips">
                <button v-for="reason in suggestions" :key="reason" type="button" class="pill chip" @click="text = reason">{{ reason }}</button>
            </div>

            <p v-if="error" class="field-error" role="alert">{{ error }}</p>
        </form>

        <template #footer>
            <button type="button" class="btn btn-ghost" @click="close">Cancel</button>
            <button
                type="button"
                class="btn"
                :class="copy.danger ? 'btn-danger' : 'btn-primary'"
                :disabled="Object.values(busy).some(Boolean) || (playerAction?.mode === 'faction' ? !faction : playerAction?.mode !== 'ban' && text.trim() === '')"
                @click="submit"
            >
                {{ copy.button }}
            </button>
        </template>
    </Modal>
</template>

<style scoped>
.form {
    display: grid;
    gap: 15.5px;
}

.note {
    margin: 0;
    font-size: 14px;
}

.hint {
    display: flex;
    justify-content: space-between;
    gap: 13px;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6.5px;
}

.chip {
    border: 0;
    cursor: pointer;
}

.chip:hover {
    background: var(--select);
    color: var(--text);
}

.factions {
    display: grid;
    gap: 6.5px;
}

.faction {
    display: flex;
    align-items: center;
    gap: 11px;
    height: 46px;
    padding: 0 15.5px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    cursor: pointer;
}

.faction.on {
    border-color: var(--accent-line);
    background: var(--accent-soft);
}

.faction input {
    display: none;
}

.swatch {
    width: 11px;
    height: 11px;
    border-radius: 2px;
}

.name {
    flex: 1;
}
</style>
