<script setup lang="ts">
import { Map as MapIcon, RotateCcw, SkipForward } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import MapArt from '@/components/MapArt.vue';
import MapPicker from '@/components/MapPicker.vue';
import ViewHeader from '@/components/ViewHeader.vue';
import { gameName, modeName, modifierNames, zoneName } from '@/lib/format';
import { mapId, mapName } from '@/lib/maps';
import { act, busy, selectedLive, state } from '@/lib/store';
import type { Catalog, RotationEntry } from '@/types';

/** The match playing now, and controls to end it, restart it or travel to another map. */
const live = selectedLive;
const status = computed(() => live.value?.status ?? null);
const catalog = ref<Catalog | null>(null);
const choice = ref<RotationEntry>({ map: '', experiences: [], lighting: null, zone: null });

onMounted(async () => {
    if (!state.selectedId) {
        return;
    }

    catalog.value = await window.panel.server.catalog(state.selectedId);
    const current = status.value ? mapId(status.value.map) : catalog.value.maps[0]?.id ?? '';
    choice.value = { map: current, experiences: status.value?.experiences ?? [], lighting: status.value?.lighting ?? null, zone: null };
});

const summary = computed(() => [mapName(choice.value.map), modeName(choice.value.experiences), ...modifierNames(choice.value.experiences), choice.value.lighting ? gameName(choice.value.lighting) : null].filter(Boolean).join(' · '));

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

function changeMap(): void {
    act('changeMap', { ...choice.value }, {
        confirm: { title: `Travel to ${mapName(choice.value.map)}?`, body: `The match ends now and the server loads ${summary.value}. Everyone stays connected.`, confirmLabel: 'Change map', danger: true },
    });
}
</script>

<template>
    <ViewHeader title="Match" subtitle="End, restart, or send everyone to another map" />

    <div class="view-body narrow">
        <section v-if="status">
            <div class="section-label">
                <span>Playing now</span>
                <span v-if="status.rotationNow !== null" class="muted">rotation #{{ status.rotationNow + 1 }}</span>
            </div>
            <div class="card now">
                <MapArt :map="status.map" :lighting="status.lighting" variant="square" :fade="false" class="thumb" />
                <div class="now-text">
                    <h3 class="title">{{ mapName(status.map) }}</h3>
                    <div class="pills">
                        <span class="pill pill-gold">{{ modeName(status.experiences) }}</span>
                        <span v-for="modifier in modifierNames(status.experiences)" :key="modifier" class="pill">{{ modifier }}</span>
                        <span v-if="status.lighting" class="pill">{{ gameName(status.lighting) }}</span>
                        <span v-if="status.zone" class="pill">{{ zoneName(status.zone) }}</span>
                    </div>
                    <div class="now-actions">
                        <button type="button" class="btn" :disabled="busy.restartMatch" @click="restartMatch"><RotateCcw /> Restart match</button>
                        <button type="button" class="btn" :disabled="busy.endMatch" @click="endMatch"><SkipForward /> End match</button>
                    </div>
                </div>
            </div>
            <p class="hint muted">Restart reloads this map from zero. End match shows the end screen and moves to the next map in the rotation.</p>
        </section>

        <section class="change">
            <div class="section-label">
                <span>Change map</span>
            </div>

            <div v-if="catalog?.error" class="muted">{{ catalog.error }}</div>
            <template v-else-if="catalog">
                <MapPicker v-model="choice" :catalog="catalog" />
                <div class="go">
                    <span class="muted truncate">{{ summary }}</span>
                    <button type="button" class="btn btn-primary btn-lg" :disabled="!choice.map || busy.changeMap || !live?.online" @click="changeMap"><MapIcon /> Change map</button>
                </div>
            </template>
            <template v-else>
                <div class="skeleton" style="height: 96px" />
                <div class="skeleton" style="height: 34px; margin-top: 18px" />
            </template>
        </section>
    </div>
</template>

<style scoped>
.now {
    display: flex;
    gap: 22px;
    padding: 17.5px;
}

.thumb {
    width: 145px;
    height: 145px;
    flex: none;
    border-radius: var(--radius);
}

.now-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.now-text .title {
    font-size: 23px;
    font-weight: 700;
}

.pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6.5px;
    margin-top: 11px;
}

.now-actions {
    display: flex;
    gap: 9px;
    margin-top: auto;
    padding-top: 17.5px;
}

.hint {
    margin: 11px 0 0;
    font-size: 14px;
}

.change {
    margin-top: 35px;
}

.go {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 17.5px;
    margin-top: 24px;
    padding-top: 20px;
    border-top: 1px solid var(--line-soft);
}
</style>
