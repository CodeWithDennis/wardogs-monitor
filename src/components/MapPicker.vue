<script setup lang="ts">
import { Check } from 'lucide-vue-next';
import { computed, watch } from 'vue';
import MapArt from '@/components/MapArt.vue';
import { gameName, modifierName, zoneName } from '@/lib/format';
import type { Catalog, RotationEntry } from '@/types';

/**
 * Pick a match: the map (as pictures), its game mode, modifiers, the
 * lighting and the starting zone. Used to change the map and to build the
 * rotation.
 */
const props = defineProps<{ catalog: Catalog }>();
const value = defineModel<RotationEntry>({ required: true });

const map = computed(() => props.catalog.maps.find((entry) => entry.id === value.value.map) ?? null);
const mode = computed(() => value.value.experiences.find((id) => map.value?.modes.some((entry) => entry.id === id)) ?? '');
const modifiers = computed(() => value.value.experiences.filter((id) => map.value?.modifiers.some((entry) => entry.id === id)));

/** A new map keeps the modifiers it also has, and starts on its first mode. */
watch(
    () => value.value.map,
    () => {
        if (!map.value) {
            return;
        }

        const keepMode = map.value.modes.some((entry) => entry.id === mode.value) ? mode.value : map.value.modes[0]?.id;
        const keepModifiers = modifiers.value.filter((id) => map.value?.modifiers.some((entry) => entry.id === id));
        const keepZone = map.value.zones.some((zone) => zone.id === value.value.zone) ? value.value.zone : null;

        value.value = { ...value.value, experiences: [keepMode, ...keepModifiers].filter(Boolean) as string[], zone: keepZone };
    },
    { immediate: true },
);

function setMap(id: string): void {
    value.value = { ...value.value, map: id };
}

function setMode(id: string): void {
    value.value = { ...value.value, experiences: [id, ...modifiers.value] };
}

function toggleModifier(id: string): void {
    const next = modifiers.value.includes(id) ? modifiers.value.filter((entry) => entry !== id) : [...modifiers.value, id];
    value.value = { ...value.value, experiences: [mode.value, ...next].filter(Boolean) };
}
</script>

<template>
    <div class="picker">
        <div class="maps">
            <button v-for="entry in catalog.maps" :key="entry.id" type="button" class="map" :class="{ on: entry.id === value.map }" @click="setMap(entry.id)">
                <MapArt :map="entry.id" :lighting="value.map === entry.id ? value.lighting : null" variant="wide" :fade="false" class="map-art" />
                <span class="map-name">
                    <span>{{ entry.name }}</span>
                    <small>{{ gameName(entry.id) }}</small>
                </span>
                <Check v-if="entry.id === value.map" class="check" />
            </button>
        </div>

        <template v-if="map">
            <div class="grid">
                <label class="field">
                    <span class="field-label">Game mode</span>
                    <select class="select" :value="mode" @change="setMode(($event.target as HTMLSelectElement).value)">
                        <option v-for="entry in map.modes" :key="entry.id" :value="entry.id">{{ entry.name }}</option>
                    </select>
                </label>

                <label class="field">
                    <span class="field-label">Starting zone</span>
                    <select class="select" :value="value.zone ?? ''" @change="value = { ...value, zone: ($event.target as HTMLSelectElement).value || null }">
                        <option value="">Server picks</option>
                        <option v-for="zone in map.zones" :key="zone.id" :value="zone.id">{{ zoneName(zone.name) }}</option>
                    </select>
                </label>
            </div>

            <div v-if="map.modifiers.length" class="field">
                <span class="field-label">Modifiers</span>
                <div class="chips">
                    <button v-for="entry in map.modifiers" :key="entry.id" type="button" class="chip" :class="{ on: modifiers.includes(entry.id) }" @click="toggleModifier(entry.id)">
                        <Check v-if="modifiers.includes(entry.id)" />
                        {{ modifierName(entry.name) }}
                    </button>
                </div>
            </div>

            <div class="field">
                <span class="field-label">Lighting</span>
                <div class="chips">
                    <button type="button" class="chip" :class="{ on: !value.lighting }" @click="value = { ...value, lighting: null }">Server picks</button>
                    <button v-for="entry in catalog.lightings" :key="entry.id" type="button" class="chip" :class="{ on: value.lighting === entry.id }" @click="value = { ...value, lighting: entry.id }">
                        {{ gameName(entry.name) }}
                    </button>
                </div>
            </div>
        </template>
    </div>
</template>

<style scoped>
.picker {
    display: grid;
    gap: 20px;
}

.maps {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(187px, 1fr));
    gap: 11px;
}

.map {
    position: relative;
    height: 105.5px;
    padding: 0;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    overflow: hidden;
    background: var(--raise);
    text-align: left;
    transition: border-color 0.12s;
}

.map:hover {
    border-color: var(--line-strong);
}

.map.on {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent) inset;
}

.map-art {
    position: absolute;
    inset: 0;
    opacity: 0.75;
    transition: opacity 0.15s;
}

.map:hover .map-art,
.map.on .map-art {
    opacity: 1;
}

.map-name {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    display: grid;
    padding: 20px 13px 10px;
    background: linear-gradient(180deg, transparent, rgb(8 11 22 / 0.85));
    font-family: var(--font-title);
    font-size: calc(16.5px * var(--title-scale, 1));
}

.map-name small {
    font-family: var(--font-body);
    font-size: 12px;
    color: var(--text-2);
}

.check {
    position: absolute;
    top: 9px;
    right: 9px;
    width: 22px;
    height: 22px;
    padding: 3.5px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--accent-ink);
}

.grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 15.5px;
}

.chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6.5px;
}

.chip {
    display: inline-flex;
    align-items: center;
    gap: 5.5px;
    height: 31px;
    padding: 0 12px;
    border: 1px solid var(--line);
    border-radius: 1099px;
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
}

.chip:hover {
    border-color: var(--line-strong);
    color: var(--text);
}

.chip.on {
    border-color: var(--accent-line);
    background: var(--accent-soft);
    color: var(--accent);
}

.chip svg {
    width: 14.5px;
    height: 14.5px;
}
</style>
