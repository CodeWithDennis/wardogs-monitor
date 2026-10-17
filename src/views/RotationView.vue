<script setup lang="ts">
import { ArrowDown, ArrowUp, GripVertical, Pencil, Plus, Repeat, Trash2 } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import MapArt from '@/components/MapArt.vue';
import MapPicker from '@/components/MapPicker.vue';
import Modal from '@/components/Modal.vue';
import SaveBar from '@/components/SaveBar.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { gameName, modeName, modifierNames, zoneName } from '@/lib/format';
import { mapName } from '@/lib/maps';
import { act, state, toast } from '@/lib/store';
import type { Catalog, RotationAnswer, RotationEntry } from '@/types';

/**
 * The map rotation, edited like a playlist: drag to reorder, add, change
 * or remove matches, switch it on or off and between ordered and random.
 * Saved into the server's config; it applies from the next match.
 */
const catalog = ref<Catalog | null>(null);
const liveRotation = ref<RotationAnswer | null>(null);
const revision = ref<string | null>(null);
const error = ref<string | null>(null);
const saveError = ref<string | null>(null);
const saving = ref(false);

const saved = ref<{ enabled: boolean; mode: string; entries: RotationEntry[] } | null>(null);
const draft = ref<{ enabled: boolean; mode: string; entries: RotationEntry[] } | null>(null);

const editing = ref<{ index: number | null; entry: RotationEntry } | null>(null);
const dragging = ref<number | null>(null);
const dropAt = ref<number | null>(null);

const dirty = computed(() => JSON.stringify(saved.value) !== JSON.stringify(draft.value));
const max = computed(() => state.limits?.maxRotationEntries ?? 50);

async function load(): Promise<void> {
    if (!state.selectedId) {
        return;
    }

    const [settings, rotation, maps] = await Promise.all([
        window.panel.server.settings(state.selectedId),
        window.panel.server.rotation(state.selectedId),
        catalog.value ? Promise.resolve(catalog.value) : window.panel.server.catalog(state.selectedId),
    ]);

    error.value = settings.error;
    revision.value = settings.revision;
    liveRotation.value = rotation;
    catalog.value = maps;
    saved.value = settings.rotation ? JSON.parse(JSON.stringify(settings.rotation)) : null;
    draft.value = settings.rotation ? JSON.parse(JSON.stringify(settings.rotation)) : null;
    saveError.value = null;
}

onMounted(load);

/** Which saved entry the server is playing now and next (only while the draft keeps the saved order). */
function marker(index: number): 'now' | 'next' | null {
    if (dirty.value) {
        return null;
    }

    const entry = liveRotation.value?.entries.find((live) => live.index === index);

    return entry?.status === 'now' ? 'now' : entry?.status === 'next' ? 'next' : null;
}

function move(from: number, to: number): void {
    if (!draft.value || to < 0 || to >= draft.value.entries.length || from === to) {
        return;
    }

    const entries = [...draft.value.entries];
    const [entry] = entries.splice(from, 1);
    entries.splice(to, 0, entry);
    draft.value = { ...draft.value, entries };
}

function drop(): void {
    if (dragging.value !== null && dropAt.value !== null) {
        move(dragging.value, dropAt.value > dragging.value ? dropAt.value - 1 : dropAt.value);
    }

    dragging.value = null;
    dropAt.value = null;
}

function remove(index: number): void {
    if (draft.value) {
        draft.value = { ...draft.value, entries: draft.value.entries.filter((_, i) => i !== index) };
    }
}

function add(): void {
    const first = catalog.value?.maps[0];
    editing.value = { index: null, entry: { map: first?.id ?? '', experiences: first?.modes[0] ? [first.modes[0].id] : [], lighting: null, zone: null } };
}

function edit(index: number): void {
    if (draft.value) {
        editing.value = { index, entry: { ...draft.value.entries[index], experiences: [...draft.value.entries[index].experiences] } };
    }
}

function keepEdit(): void {
    if (!draft.value || !editing.value) {
        return;
    }

    const entries = [...draft.value.entries];

    if (editing.value.index === null) {
        entries.push(editing.value.entry);
    } else {
        entries[editing.value.index] = editing.value.entry;
    }

    draft.value = { ...draft.value, entries };
    editing.value = null;
}

async function save(): Promise<void> {
    if (!draft.value || !revision.value) {
        return;
    }

    saving.value = true;
    saveError.value = null;

    try {
        const result = await act('saveRotation', { revision: revision.value, ...draft.value }, { quiet: true });

        if (result?.ok) {
            toast('ok', 'Rotation saved', 'It applies from the next match.');
            await load();
        } else if (result && !result.ok) {
            saveError.value = result.error;

            if (result.configChanged) {
                await load();
                saveError.value = result.error;
            }
        }
    } finally {
        saving.value = false;
    }
}

function describe(entry: RotationEntry): string {
    return [...modifierNames(entry.experiences), entry.lighting ? gameName(entry.lighting) : null, entry.zone ? zoneName(entry.zone) : null].filter(Boolean).join(' · ');
}
</script>

<template>
    <ViewHeader title="Rotation" subtitle="The maps the server plays, one after another">
        <template #actions>
            <button type="button" class="btn" :disabled="!draft || draft.entries.length >= max" @click="add"><Plus /> Add match</button>
        </template>
    </ViewHeader>

    <div class="view-body narrow">
        <p v-if="error" class="muted">{{ error }}</p>

        <template v-else-if="draft">
            <div class="card controls">
                <label class="switch">
                    <button type="button" role="switch" class="toggle" :aria-checked="draft.enabled" @click="draft.enabled = !draft.enabled" />
                    <span>
                        <strong>{{ draft.enabled ? 'Rotation on' : 'Rotation off' }}</strong>
                        <small class="muted">{{ draft.enabled ? 'The server moves through these maps.' : 'The map reloads when a match ends.' }}</small>
                    </span>
                </label>
                <div class="segmented" role="group" aria-label="Order">
                    <button v-for="mode in state.limits?.rotationModes ?? ['Ordered', 'Random']" :key="mode" type="button" :class="{ on: draft.mode === mode }" @click="draft.mode = mode">{{ mode }}</button>
                </div>
            </div>

            <div class="section-label list-label">
                <span>Matches</span>
                <span>{{ draft.entries.length }} / {{ max }}</span>
            </div>

            <ol class="entries" @dragover.prevent @drop.prevent="drop">
                <li
                    v-for="(entry, index) in draft.entries"
                    :key="`${index}-${entry.map}-${entry.experiences.join('+')}`"
                    class="entry"
                    :class="{ dragging: dragging === index, 'drop-before': dropAt === index && dragging !== null && dragging !== index && dragging !== index - 1, now: marker(index) === 'now' }"
                    draggable="true"
                    @dragstart="dragging = index"
                    @dragend="dragging = null; dropAt = null"
                    @dragover.prevent="dropAt = ($event.offsetY > ($event.currentTarget as HTMLElement).offsetHeight / 2) ? index + 1 : index"
                    @dblclick="edit(index)"
                >
                    <GripVertical class="grip" />
                    <span class="pos num muted">{{ index + 1 }}</span>
                    <MapArt :map="entry.map" :lighting="entry.lighting" variant="wide" :fade="false" class="thumb" />
                    <span class="text">
                        <span class="name">
                            {{ mapName(entry.map) }} <span class="muted">· {{ modeName(entry.experiences) }}</span>
                            <span v-if="marker(index)" class="pill" :class="marker(index) === 'now' ? 'pill-gold' : ''">{{ marker(index) === 'now' ? 'Playing' : 'Next' }}</span>
                        </span>
                        <small class="muted truncate">{{ describe(entry) || 'Server picks lighting and zone' }}</small>
                    </span>
                    <span class="tools">
                        <button type="button" title="Move up" :disabled="index === 0" @click="move(index, index - 1)"><ArrowUp /></button>
                        <button type="button" title="Move down" :disabled="index === draft.entries.length - 1" @click="move(index, index + 1)"><ArrowDown /></button>
                        <button type="button" title="Change" @click="edit(index)"><Pencil /></button>
                        <button type="button" title="Remove" class="bad" @click="remove(index)"><Trash2 /></button>
                    </span>
                </li>
                <li v-if="dropAt === draft.entries.length && dragging !== null" class="drop-end" />
            </ol>

            <div v-if="draft.entries.length === 0" class="empty">
                <Repeat />
                <span>No matches yet. Add the first one.</span>
            </div>

            <SaveBar :show="dirty || !!saveError" :saving="saving" :error="saveError" note="Unsaved rotation. It applies from the next match." @save="save" @discard="load" />
        </template>

        <template v-else>
            <div class="skeleton" style="height: 60px" />
            <div v-for="i in 4" :key="i" class="skeleton" style="height: 58px; margin-top: 8px" />
        </template>
    </div>

    <Modal :open="editing !== null" :title="editing?.index === null ? 'Add a match' : 'Change match'" :width="640" @close="editing = null">
        <MapPicker v-if="editing && catalog" v-model="editing.entry" :catalog="catalog" />
        <template #footer>
            <button type="button" class="btn btn-ghost" @click="editing = null">Cancel</button>
            <button type="button" class="btn btn-primary" :disabled="!editing?.entry.map || !editing?.entry.experiences.length" @click="keepEdit">{{ editing?.index === null ? 'Add to rotation' : 'Keep changes' }}</button>
        </template>
    </Modal>
</template>

<style scoped>
.controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 17.5px;
    padding: 15.5px 20px;
}

.switch {
    display: flex;
    align-items: center;
    gap: 15.5px;
}

.switch span {
    display: grid;
}

.switch strong {
    font-weight: 500;
}

.switch small {
    font-size: 13px;
}

.list-label {
    margin-top: 31px;
}

.entries {
    margin: 0;
    padding: 0;
    list-style: none;
}

.entry {
    position: relative;
    display: flex;
    align-items: center;
    gap: 13px;
    min-height: 64px;
    padding: 9px 11px 9px 6.5px;
    border-left: 2px solid transparent;
    border-bottom: 1px solid var(--line-soft);
    cursor: grab;
}

.entry:hover {
    background: var(--hover);
}

.entry.now {
    border-left-color: var(--accent);
    background: var(--select);
}

.entry.dragging {
    opacity: 0.4;
}

.entry.drop-before::before,
.drop-end {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    top: -1px;
    height: 2px;
    background: var(--accent);
}

.drop-end {
    position: relative;
    display: block;
}

.grip {
    width: 15.5px;
    height: 15.5px;
    color: var(--faint);
    flex: none;
}

.pos {
    width: 20px;
    text-align: right;
    font-size: 13px;
}

.thumb {
    width: 81.5px;
    height: 44px;
    flex: none;
    border-radius: 2px;
}

.text {
    display: grid;
    flex: 1;
    min-width: 0;
}

.name {
    display: flex;
    align-items: center;
    gap: 6.5px;
    font-size: 15.5px;
}

.name .pill {
    height: 21px;
    font-size: 12px;
}

.text small {
    font-size: 13px;
}

.tools {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.1s;
}

.entry:hover .tools {
    opacity: 1;
}

.tools button {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

.tools button:hover:not(:disabled) {
    background: rgb(255 255 255 / 0.06);
    color: var(--text);
}

.tools button.bad:hover {
    color: var(--bad);
}

.tools button:disabled {
    opacity: 0.3;
}

.tools svg {
    width: 15.5px;
    height: 15.5px;
}
</style>
