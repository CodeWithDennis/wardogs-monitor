<script setup lang="ts">
import { Eye, EyeOff, KeyRound, Lock, Palette, Swords, Users } from 'lucide-vue-next';
import { computed, nextTick, onMounted, ref } from 'vue';
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
type Section = 'joining' | 'players' | 'match' | 'branding';

const form = ref<HTMLFormElement | null>(null);
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

/** How many fields in each card the server refused, shown in its header. */
const errorCounts = computed(() => {
    const counts: Partial<Record<Section, number>> = {};

    for (const field of Object.keys(errors.value)) {
        const section = sectionFor(field);
        counts[section] = (counts[section] ?? 0) + 1;
    }

    return counts;
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
                await nextTick();
                form.value?.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

function sectionFor(field: string): Section {
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
    <ViewHeader title="Server settings" subtitle="Saved into the server's config file">
        <template v-if="!writable" #filters>
            <span class="pill pill-bad"><Lock :size="12" /> Read only</span>
        </template>
    </ViewHeader>

    <div class="view-body narrow">
        <p v-if="error" class="muted">{{ error }}</p>

        <template v-else-if="draft && limits">
            <form ref="form" class="stack" @submit.prevent="save">
                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><KeyRound /></span> Joining</span>
                        <span v-if="errorCounts.joining" class="panel-aside bad">{{ errorCounts.joining }} to fix</span>
                        <span v-else class="panel-aside">{{ draft.server_password ? 'Password set' : 'Open server' }}</span>
                    </header>
                    <p class="panel-intro">Who can get in, and the spots held back for your regulars.</p>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-password">Join password</label>
                            <p class="setting-hint">Leave empty for an open server. Players type it when they join.</p>
                        </div>
                        <div class="field">
                            <div class="with-button">
                                <input id="setting-password" v-model="draft.server_password" class="input" :type="showPassword ? 'text' : 'password'" :maxlength="limits.passwordMax" placeholder="Open server" autocomplete="off" :aria-invalid="!!errors.server_password" />
                                <button type="button" class="btn btn-ghost" :title="showPassword ? 'Hide' : 'Show'" @click="showPassword = !showPassword"><component :is="showPassword ? EyeOff : Eye" /></button>
                            </div>
                            <span v-if="errors.server_password" class="field-error">{{ errors.server_password }}</span>
                        </div>
                    </div>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-reserved-slots">Reserved spots</label>
                            <p class="setting-hint">Slots held back for the players below, so they can join a full server.</p>
                        </div>
                        <div class="field">
                            <input id="setting-reserved-slots" :value="draft.max_reserved_slots" class="input num short" type="number" min="0" :max="draft.max_players" :aria-invalid="!!errors.max_reserved_slots" @input="int('max_reserved_slots', $event)" />
                            <span v-if="errors.max_reserved_slots" class="field-error">{{ errors.max_reserved_slots }}</span>
                        </div>
                    </div>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-reserved-ids">Reserved players</label>
                            <p class="setting-hint">Steam IDs, one per line. Up to {{ limits.maxReservedIds }}.</p>
                        </div>
                        <div class="field">
                            <textarea id="setting-reserved-ids" v-model="reservedText" class="textarea mono" rows="6" spellcheck="false" placeholder="76561198000000000" :aria-invalid="!!errors.reserved_steam_ids" />
                            <span class="field-hint">{{ reservedIds.length }} {{ reservedIds.length === 1 ? 'player' : 'players' }}</span>
                            <span v-if="errors.reserved_steam_ids" class="field-error">{{ errors.reserved_steam_ids }}</span>
                        </div>
                    </div>
                </section>

                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Users /></span> Players</span>
                        <span v-if="errorCounts.players" class="panel-aside bad">{{ errorCounts.players }} to fix</span>
                        <span v-else class="panel-aside">{{ draft.max_players }} slots</span>
                    </header>
                    <p class="panel-intro">How many players fit, and who is allowed to join.</p>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-max-players">Player slots</label>
                            <p class="setting-hint">{{ limits.maxPlayersMin }} to {{ limits.maxPlayersMax }}. Applies after the server restarts from your host's panel.</p>
                        </div>
                        <div class="field">
                            <div class="slider">
                                <input :value="draft.max_players" type="range" :min="limits.maxPlayersMin" :max="limits.maxPlayersMax" step="2" aria-label="Player slots" @input="int('max_players', $event)" />
                                <input id="setting-max-players" :value="draft.max_players" class="input num short" type="number" :min="limits.maxPlayersMin" :max="limits.maxPlayersMax" :aria-invalid="!!errors.max_players" @input="int('max_players', $event)" />
                            </div>
                            <span v-if="errors.max_players" class="field-error">{{ errors.max_players }}</span>
                        </div>
                    </div>

                    <div class="setting">
                        <div class="setting-text">
                            <span class="setting-name">Level limits</span>
                            <p class="setting-hint">Only players in this level range can join. 0 means no limit.</p>
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

                    <div class="setting">
                        <div class="setting-text">
                            <span class="setting-name">Cash limits</span>
                            <p class="setting-hint">Only players with this much cash can join. 0 means no limit.</p>
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
                </section>

                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Swords /></span> Match</span>
                        <span v-if="errorCounts.match" class="panel-aside bad">{{ errorCounts.match }} to fix</span>
                        <span v-else class="panel-aside">From the next match</span>
                    </header>
                    <p class="panel-intro">When a match starts, how fast it plays and how teams stay even.</p>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-min-players">Players needed to start</label>
                            <p class="setting-hint">The match waits until this many players have joined.</p>
                        </div>
                        <div class="field">
                            <input id="setting-min-players" :value="draft.min_players_to_start" class="input num short" type="number" min="0" :max="limits.maxPlayersMax" :aria-invalid="!!errors.min_players_to_start" @input="int('min_players_to_start', $event)" />
                            <span v-if="errors.min_players_to_start" class="field-error">{{ errors.min_players_to_start }}</span>
                        </div>
                    </div>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-score-period">Score period</label>
                            <p class="setting-hint">Seconds between points for holding the hill, {{ limits.scorePeriodMin }} to {{ limits.scorePeriodMax }}. Lower is a faster match.</p>
                        </div>
                        <div class="field">
                            <div class="slider">
                                <input :value="draft.score_period" type="range" :min="limits.scorePeriodMin" :max="limits.scorePeriodMax" aria-label="Score period" @input="int('score_period', $event)" />
                                <input id="setting-score-period" :value="draft.score_period" class="input num short" type="number" :min="limits.scorePeriodMin" :max="limits.scorePeriodMax" :aria-invalid="!!errors.score_period" @input="int('score_period', $event)" />
                            </div>
                            <span v-if="errors.score_period" class="field-error">{{ errors.score_period }}</span>
                        </div>
                    </div>

                    <div class="setting">
                        <div class="setting-text">
                            <span class="setting-name">Team balance</span>
                            <p class="setting-hint">Lock a team to new players while it is ahead by more than this many players.</p>
                        </div>
                        <div class="field">
                            <label class="switch">
                                <button type="button" role="switch" class="toggle" :aria-checked="draft.lock_overpopulated_teams" @click="draft.lock_overpopulated_teams = !draft.lock_overpopulated_teams" />
                                <span>{{ draft.lock_overpopulated_teams ? 'Lock bigger teams' : 'Anyone can join any team' }}</span>
                            </label>
                            <div v-if="draft.lock_overpopulated_teams" class="lead">
                                <span class="muted">Allowed lead</span>
                                <input :value="draft.overpopulated_team_threshold" class="input num short" type="number" min="0" :max="limits.teamLeadMax" aria-label="Allowed lead in players" :aria-invalid="!!errors.overpopulated_team_threshold" @input="int('overpopulated_team_threshold', $event)" />
                                <span class="muted">players</span>
                            </div>
                            <span v-if="errors.overpopulated_team_threshold" class="field-error">{{ errors.overpopulated_team_threshold }}</span>
                        </div>
                    </div>
                </section>

                <section class="card panel">
                    <header class="panel-head">
                        <span class="panel-title"><span class="panel-icon"><Palette /></span> Branding</span>
                        <span v-if="errorCounts.branding" class="panel-aside bad">{{ errorCounts.branding }} to fix</span>
                    </header>
                    <p class="panel-intro">How the server shows up in the server browser.</p>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-name">Server name</label>
                            <p class="setting-hint">{{ draft.server_name_locked ? 'Pinned by your host. Change it in their panel.' : 'Shown in the server browser.' }}</p>
                        </div>
                        <div class="field">
                            <div class="with-button">
                                <input id="setting-name" v-model="draft.server_name" class="input" maxlength="100" :disabled="draft.server_name_locked" :aria-invalid="!!errors.server_name" />
                                <Lock v-if="draft.server_name_locked" class="lock" />
                            </div>
                            <span v-if="errors.server_name" class="field-error">{{ errors.server_name }}</span>
                        </div>
                    </div>

                    <div class="setting">
                        <div class="setting-text">
                            <label class="setting-name" for="setting-banner">Banner</label>
                            <p class="setting-hint">An https:// image link shown in the server browser.</p>
                        </div>
                        <div class="field">
                            <input id="setting-banner" v-model="draft.image_url" class="input" placeholder="https://…" spellcheck="false" :aria-invalid="!!errors.image_url" />
                            <span v-if="errors.image_url" class="field-error">{{ errors.image_url }}</span>
                            <img v-if="draft.image_url.startsWith('https://')" :src="draft.image_url" alt="Banner preview" class="banner" @error="($event.target as HTMLImageElement).style.display = 'none'" @load="($event.target as HTMLImageElement).style.display = ''" />
                        </div>
                    </div>
                </section>
            </form>

            <SaveBar :show="dirty || !!saveError" :saving="saving" :error="saveError" @save="save" @discard="load" />
        </template>

        <div v-else class="stack" aria-busy="true" aria-label="Loading the settings">
            <section v-for="card in 3" :key="card" class="card panel">
                <header class="panel-head">
                    <span class="panel-title">
                        <span class="skeleton" style="width: 28px; height: 28px" />
                        <span class="skeleton" style="height: 14px" :style="{ width: `${70 + ((card * 23) % 40)}px` }" />
                    </span>
                </header>
                <div v-for="row in 3 - (card % 2)" :key="row" class="setting">
                    <div>
                        <div class="skeleton" style="height: 14px" :style="{ width: `${40 + (((card + row) * 13) % 30)}%` }" />
                        <div class="skeleton" style="height: 11px; width: 85%; margin-top: 9px" />
                    </div>
                    <div class="skeleton" style="height: 36px" />
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
/*
 * One setting in a card: its name and explanation on the left, its fields
 * on the right, with a soft line between settings.
 */
.setting {
    display: grid;
    grid-template-columns: minmax(180px, 1fr) minmax(0, 1.3fr);
    gap: 28px;
    padding: 16px 0;
}

.setting + .setting {
    border-top: 1px solid var(--line-soft);
}

.panel-head + .setting,
.panel-intro + .setting {
    padding-top: 4px;
}

.setting:last-child {
    padding-bottom: 2px;
}

.setting-name {
    display: block;
    color: var(--text);
    font-size: 14.5px;
    font-weight: 500;
}

.setting-hint {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.5;
}

.panel-aside.bad {
    color: var(--bad);
    font-weight: 500;
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
    min-width: 0;
    accent-color: var(--accent);
}

.switch {
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 36px;
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

/* A narrow page: each setting's explanation sits above its fields. */
@container page (max-width: 760px) {
    .setting {
        grid-template-columns: minmax(0, 1fr);
        gap: 12px;
    }
}

@container page (max-width: 480px) {
    .pair {
        grid-template-columns: minmax(0, 1fr);
    }
}
</style>
