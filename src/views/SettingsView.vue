<script setup lang="ts">
import { Eye, EyeOff, Lock } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import SaveBar from '@/components/SaveBar.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { act, state, toast } from '@/lib/store';
import type { ServerSettings } from '@/types';

/**
 * The server's own settings, read from and saved into its config document.
 * Only the lines of fields that changed are rewritten, and the server
 * refuses a save when someone else changed the settings in the meantime.
 * Player slots apply after a restart; the rest from the next match.
 */
const tab = ref('joining');
const tabs = [
    { id: 'joining', label: 'Joining' },
    { id: 'players', label: 'Players' },
    { id: 'match', label: 'Match' },
    { id: 'branding', label: 'Branding' },
];

const revision = ref<string | null>(null);
const writable = ref(true);
const error = ref<string | null>(null);
const saved = ref<ServerSettings | null>(null);
const draft = ref<ServerSettings | null>(null);
const reservedText = ref('');
const errors = ref<Record<string, string>>({});
const saveError = ref<string | null>(null);
const saving = ref(false);
const showPassword = ref(false);

const limits = computed(() => state.limits);

async function load(): Promise<void> {
    if (!state.selectedId) {
        return;
    }

    const answer = await window.panel.server.settings(state.selectedId);
    error.value = answer.error;
    revision.value = answer.revision;
    writable.value = answer.writable;
    saved.value = answer.settings ? JSON.parse(JSON.stringify(answer.settings)) : null;
    draft.value = answer.settings ? JSON.parse(JSON.stringify(answer.settings)) : null;
    reservedText.value = answer.settings?.reserved_steam_ids.join('\n') ?? '';
    errors.value = {};
    saveError.value = null;
}

onMounted(load);

const reservedIds = computed(() =>
    reservedText.value
        .split(/[\s,;]+/)
        .map((id) => id.trim())
        .filter(Boolean),
);

const dirty = computed(() => {
    if (!draft.value || !saved.value) {
        return false;
    }

    return JSON.stringify({ ...draft.value, reserved_steam_ids: reservedIds.value }) !== JSON.stringify(saved.value);
});

async function save(): Promise<void> {
    if (!draft.value || !revision.value) {
        return;
    }

    saving.value = true;
    saveError.value = null;
    errors.value = {};

    const values: Record<string, unknown> = { ...draft.value, reserved_steam_ids: reservedIds.value };
    delete values.server_name_locked;

    if (draft.value.server_name_locked) {
        delete values.server_name;
    }

    try {
        const result = await act('saveSettings', { revision: revision.value, values }, { quiet: true });

        if (result?.ok) {
            toast('ok', 'Settings saved', result.summary);
            await load();
        } else if (result && !result.ok) {
            errors.value = result.errors ?? {};
            saveError.value = result.errors ? 'Some values need fixing.' : result.error;

            if (result.errors) {
                const first = Object.keys(result.errors)[0];
                tab.value = tabFor(first);
            }

            if (result.configChanged) {
                await load();
                saveError.value = result.error;
            }
        }
    } finally {
        saving.value = false;
    }
}

function tabFor(field: string): string {
    if (['server_password', 'max_reserved_slots', 'reserved_steam_ids'].includes(field)) {
        return 'joining';
    }

    if (['score_period', 'lock_overpopulated_teams', 'overpopulated_team_threshold', 'min_players_to_start'].includes(field)) {
        return 'match';
    }

    if (['image_url', 'server_name'].includes(field)) {
        return 'branding';
    }

    return 'players';
}

/** Number inputs bound as whole numbers. */
function int(field: keyof ServerSettings, event: Event): void {
    if (draft.value) {
        const value = (event.target as HTMLInputElement).value;
        (draft.value as unknown as Record<string, unknown>)[field] = value === '' ? 0 : Math.trunc(Number(value));
    }
}
</script>

<template>
    <ViewHeader v-model:tab="tab" title="Server settings" subtitle="Saved into the server's config file" :tabs="tabs">
        <template v-if="!writable" #filters>
            <span class="pill pill-bad"><Lock :size="12" /> Read only</span>
        </template>
    </ViewHeader>

    <div class="view-body narrow">
        <p v-if="error" class="muted">{{ error }}</p>

        <form v-else-if="draft && limits" class="form" @submit.prevent="save">
            <template v-if="tab === 'joining'">
                <div class="group">
                    <div class="group-text">
                        <h3>Join password</h3>
                        <p class="muted">Leave empty for an open server. Players type it when they join.</p>
                    </div>
                    <div class="field">
                        <div class="with-button">
                            <input v-model="draft.server_password" class="input" :type="showPassword ? 'text' : 'password'" :maxlength="limits.passwordMax" placeholder="Open server" autocomplete="off" :aria-invalid="!!errors.server_password" />
                            <button type="button" class="btn btn-ghost" :title="showPassword ? 'Hide' : 'Show'" @click="showPassword = !showPassword"><component :is="showPassword ? EyeOff : Eye" /></button>
                        </div>
                        <span v-if="errors.server_password" class="field-error">{{ errors.server_password }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Reserved spots</h3>
                        <p class="muted">Slots held back for the players below, so they can join a full server.</p>
                    </div>
                    <div class="field">
                        <input :value="draft.max_reserved_slots" class="input num short" type="number" min="0" :max="draft.max_players" :aria-invalid="!!errors.max_reserved_slots" @input="int('max_reserved_slots', $event)" />
                        <span v-if="errors.max_reserved_slots" class="field-error">{{ errors.max_reserved_slots }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Reserved players</h3>
                        <p class="muted">Steam IDs, one per line. Up to {{ limits.maxReservedIds }}.</p>
                    </div>
                    <div class="field">
                        <textarea v-model="reservedText" class="textarea mono" rows="6" spellcheck="false" placeholder="76561198000000000" :aria-invalid="!!errors.reserved_steam_ids" />
                        <span class="field-hint">{{ reservedIds.length }} {{ reservedIds.length === 1 ? 'player' : 'players' }}</span>
                        <span v-if="errors.reserved_steam_ids" class="field-error">{{ errors.reserved_steam_ids }}</span>
                    </div>
                </div>
            </template>

            <template v-else-if="tab === 'players'">
                <div class="group">
                    <div class="group-text">
                        <h3>Player slots</h3>
                        <p class="muted">{{ limits.maxPlayersMin }} to {{ limits.maxPlayersMax }}. Applies after the server restarts from your host's panel.</p>
                    </div>
                    <div class="field">
                        <div class="slider">
                            <input :value="draft.max_players" type="range" :min="limits.maxPlayersMin" :max="limits.maxPlayersMax" step="2" @input="int('max_players', $event)" />
                            <input :value="draft.max_players" class="input num short" type="number" :min="limits.maxPlayersMin" :max="limits.maxPlayersMax" :aria-invalid="!!errors.max_players" @input="int('max_players', $event)" />
                        </div>
                        <span v-if="errors.max_players" class="field-error">{{ errors.max_players }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Level limits</h3>
                        <p class="muted">Only players in this level range can join. 0 means no limit.</p>
                    </div>
                    <div class="pair">
                        <label class="field">
                            <span class="field-label">Minimum</span>
                            <input :value="draft.min_level" class="input num" type="number" min="0" :max="limits.levelMax" :aria-invalid="!!errors.min_level" @input="int('min_level', $event)" />
                        </label>
                        <label class="field">
                            <span class="field-label">Maximum</span>
                            <input :value="draft.max_level" class="input num" type="number" min="0" :max="limits.levelMax" :aria-invalid="!!errors.max_level" @input="int('max_level', $event)" />
                        </label>
                        <span v-if="errors.min_level || errors.max_level" class="field-error span">{{ errors.min_level || errors.max_level }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Cash limits</h3>
                        <p class="muted">Only players with this much cash can join. 0 means no limit.</p>
                    </div>
                    <div class="pair">
                        <label class="field">
                            <span class="field-label">Minimum</span>
                            <input :value="draft.min_cash" class="input num" type="number" min="0" :max="limits.cashMax" :aria-invalid="!!errors.min_cash" @input="int('min_cash', $event)" />
                        </label>
                        <label class="field">
                            <span class="field-label">Maximum</span>
                            <input :value="draft.max_cash" class="input num" type="number" min="0" :max="limits.cashMax" :aria-invalid="!!errors.max_cash" @input="int('max_cash', $event)" />
                        </label>
                        <span v-if="errors.min_cash || errors.max_cash" class="field-error span">{{ errors.min_cash || errors.max_cash }}</span>
                    </div>
                </div>
            </template>

            <template v-else-if="tab === 'match'">
                <div class="group">
                    <div class="group-text">
                        <h3>Players needed to start</h3>
                        <p class="muted">The match waits until this many players have joined.</p>
                    </div>
                    <div class="field">
                        <input :value="draft.min_players_to_start" class="input num short" type="number" min="0" :max="limits.maxPlayersMax" :aria-invalid="!!errors.min_players_to_start" @input="int('min_players_to_start', $event)" />
                        <span v-if="errors.min_players_to_start" class="field-error">{{ errors.min_players_to_start }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Score period</h3>
                        <p class="muted">Seconds between points for holding the hill, {{ limits.scorePeriodMin }} to {{ limits.scorePeriodMax }}. Lower is a faster match.</p>
                    </div>
                    <div class="field">
                        <div class="slider">
                            <input :value="draft.score_period" type="range" :min="limits.scorePeriodMin" :max="limits.scorePeriodMax" @input="int('score_period', $event)" />
                            <input :value="draft.score_period" class="input num short" type="number" :min="limits.scorePeriodMin" :max="limits.scorePeriodMax" :aria-invalid="!!errors.score_period" @input="int('score_period', $event)" />
                        </div>
                        <span v-if="errors.score_period" class="field-error">{{ errors.score_period }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Team balance</h3>
                        <p class="muted">Lock a team to new players while it is ahead by more than this many players.</p>
                    </div>
                    <div class="field">
                        <label class="switch">
                            <button type="button" role="switch" class="toggle" :aria-checked="draft.lock_overpopulated_teams" @click="draft.lock_overpopulated_teams = !draft.lock_overpopulated_teams" />
                            <span>{{ draft.lock_overpopulated_teams ? 'Lock bigger teams' : 'Anyone can join any team' }}</span>
                        </label>
                        <div v-if="draft.lock_overpopulated_teams" class="lead">
                            <span class="muted">Allowed lead</span>
                            <input :value="draft.overpopulated_team_threshold" class="input num short" type="number" min="0" :max="limits.teamLeadMax" :aria-invalid="!!errors.overpopulated_team_threshold" @input="int('overpopulated_team_threshold', $event)" />
                            <span class="muted">players</span>
                        </div>
                        <span v-if="errors.overpopulated_team_threshold" class="field-error">{{ errors.overpopulated_team_threshold }}</span>
                    </div>
                </div>
            </template>

            <template v-else>
                <div class="group">
                    <div class="group-text">
                        <h3>Server name</h3>
                        <p class="muted">{{ draft.server_name_locked ? 'Pinned by your host. Change it in their panel.' : 'Shown in the server browser.' }}</p>
                    </div>
                    <div class="field">
                        <div class="with-button">
                            <input v-model="draft.server_name" class="input" maxlength="100" :disabled="draft.server_name_locked" :aria-invalid="!!errors.server_name" />
                            <Lock v-if="draft.server_name_locked" class="lock" />
                        </div>
                        <span v-if="errors.server_name" class="field-error">{{ errors.server_name }}</span>
                    </div>
                </div>

                <div class="group">
                    <div class="group-text">
                        <h3>Banner</h3>
                        <p class="muted">An https:// image link shown in the server browser.</p>
                    </div>
                    <div class="field">
                        <input v-model="draft.image_url" class="input" placeholder="https://…" spellcheck="false" :aria-invalid="!!errors.image_url" />
                        <span v-if="errors.image_url" class="field-error">{{ errors.image_url }}</span>
                        <img v-if="draft.image_url.startsWith('https://')" :src="draft.image_url" alt="Banner preview" class="banner" @error="($event.target as HTMLImageElement).style.display = 'none'" @load="($event.target as HTMLImageElement).style.display = ''" />
                    </div>
                </div>
            </template>

            <SaveBar :show="dirty || !!saveError" :saving="saving" :error="saveError" @save="save" @discard="load" />
        </form>

        <template v-else>
            <div v-for="i in 3" :key="i" class="skeleton" style="height: 64px; margin-bottom: 16px" />
        </template>
    </div>
</template>

<style scoped>
.form {
    display: grid;
}

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

.short {
    width: 105.5px;
}

.pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 13px;
    align-content: start;
}

.span {
    grid-column: 1 / -1;
}

.with-button {
    position: relative;
    display: flex;
    gap: 6.5px;
}

.with-button .btn {
    width: 36px;
    padding: 0;
    flex: none;
}

.lock {
    position: absolute;
    right: 12px;
    top: 10px;
    width: 15.5px;
    height: 15.5px;
    color: var(--muted);
}

.slider {
    display: flex;
    align-items: center;
    gap: 17.5px;
}

.slider input[type='range'] {
    flex: 1;
    accent-color: var(--accent);
}

.switch {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 37.5px;
}

.lead {
    display: flex;
    align-items: center;
    gap: 11px;
    margin-top: 6.5px;
}

.banner {
    max-width: 100%;
    max-height: 132px;
    margin-top: 6.5px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    object-fit: contain;
    align-self: start;
}
</style>
