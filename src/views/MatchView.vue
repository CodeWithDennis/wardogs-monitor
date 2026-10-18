<script setup lang="ts">
import { LoaderCircle, Lock, Map as MapIcon, RotateCcw, SkipForward, Swords, WifiOff } from 'lucide-vue-next';
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
        <div class="stack">
            <section v-if="!live" class="card panel" aria-busy="true" aria-label="Loading the match">
                <header class="panel-head">
                    <div class="skeleton" style="height: 28px; width: 130px" />
                    <div class="skeleton" style="height: 12px; width: 80px" />
                </header>
                <div class="now">
                    <div class="skeleton thumb" />
                    <div class="now-text grow">
                        <div class="skeleton" style="height: 24px; width: 45%" />
                        <div class="skeleton" style="height: 22px; width: 70%; margin-top: 14px" />
                    </div>
                </div>
                <div class="foot panel-flush">
                    <div class="skeleton grow" style="height: 13px; max-width: 360px" />
                    <div class="skeleton" style="height: 34px; width: 280px" />
                </div>
            </section>

            <section v-else-if="status" class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Swords /></span> Playing now</span>
                    <span v-if="status.rotationNow !== null" class="panel-aside">Rotation #{{ status.rotationNow + 1 }}</span>
                </header>
                <div class="now">
                    <MapArt :map="status.map" :lighting="status.lighting" variant="square" :fade="false" class="thumb" />
                    <div class="now-text">
                        <h3 class="title">{{ mapName(status.map) }}</h3>
                        <div class="pills">
                            <span class="pill pill-gold">{{ modeName(status.experiences) }}</span>
                            <span v-for="modifier in modifierNames(status.experiences)" :key="modifier" class="pill">{{ modifier }}</span>
                            <span v-if="status.lighting" class="pill">{{ gameName(status.lighting) }}</span>
                            <span v-if="status.zone" class="pill">{{ zoneName(status.zone) }}</span>
                        </div>
                    </div>
                </div>
                <div class="foot panel-flush">
                    <p class="hint">Restart reloads this map from zero. End match shows the end screen and moves to the next map in the rotation.</p>
                    <div class="foot-actions">
                        <button type="button" class="btn" :disabled="busy.restartMatch" @click="restartMatch"><LoaderCircle v-if="busy.restartMatch" class="spin" /><RotateCcw v-else /> Restart match</button>
                        <button type="button" class="btn" :disabled="busy.endMatch" @click="endMatch"><LoaderCircle v-if="busy.endMatch" class="spin" /><SkipForward v-else /> End match</button>
                    </div>
                </div>
            </section>

            <section v-else class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><Swords /></span> Playing now</span>
                    <span class="panel-aside">{{ live.locked ? 'Locked' : live.online ? 'Waiting' : 'Offline' }}</span>
                </header>
                <div class="empty">
                    <component :is="live.locked ? Lock : live.online ? LoaderCircle : WifiOff" :class="{ spin: live.online && !live.locked }" />
                    <strong>{{ live.locked ? 'This server is locked' : live.online ? 'No match reading yet' : 'The server is not answering' }}</strong>
                    <span v-if="live.error">{{ live.error }}</span>
                </div>
            </section>

            <section class="card panel">
                <header class="panel-head">
                    <span class="panel-title"><span class="panel-icon"><MapIcon /></span> Change map</span>
                    <span v-if="catalog && !catalog.error" class="panel-aside">{{ catalog.maps.length }} maps</span>
                </header>
                <p class="panel-intro">Pick a map and how it plays. The match ends now and everyone travels there, still connected.</p>

                <div v-if="catalog?.error" class="empty">
                    <WifiOff />
                    <span>{{ catalog.error }}</span>
                </div>
                <template v-else-if="catalog">
                    <MapPicker v-model="choice" :catalog="catalog" />
                    <div class="go panel-flush">
                        <span class="summary truncate">{{ summary }}</span>
                        <button type="button" class="btn btn-primary btn-lg" :disabled="!choice.map || busy.changeMap || !live?.online" @click="changeMap"><LoaderCircle v-if="busy.changeMap" class="spin" /><MapIcon v-else /> Change map</button>
                    </div>
                </template>
                <div v-else aria-busy="true" aria-label="Loading the maps">
                    <div class="skeleton" style="height: 105.5px" />
                    <div class="skeleton" style="height: 34px; margin-top: 20px" />
                    <div class="go panel-flush">
                        <div class="skeleton" style="height: 13px; width: 40%" />
                        <div class="skeleton" style="height: 40px; width: 150px" />
                    </div>
                </div>
            </section>
        </div>
    </div>
</template>

<style scoped>
.now {
    display: flex;
    align-items: center;
    gap: 20px;
}

.thumb {
    width: 112px;
    height: 112px;
    flex: none;
    border-radius: var(--radius);
}

.now-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
}

.grow {
    flex: 1;
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

/* The card's last row, edge to edge under a hairline: what the buttons do, and the buttons. */
.foot,
.go {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 17.5px;
    margin-top: 18px;
    padding: 14px 20px;
    border-top: 1px solid var(--line-soft);
}

.hint {
    flex: 1;
    min-width: 0;
    margin: 0;
    color: var(--muted);
    font-size: 13.5px;
    line-height: 1.5;
}

.foot-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 9px;
    flex: none;
}

.go {
    margin-top: 20px;
}

.summary {
    min-width: 0;
    color: var(--text-2);
}

.empty strong {
    color: var(--text);
    font-weight: 500;
}

/* A narrow page: the buttons wrap under what they do, and the summary above its button. */
@container page (max-width: 760px) {
    .foot,
    .go {
        flex-wrap: wrap;
    }

    .hint {
        flex-basis: 100%;
    }

    .go .btn {
        flex: 1 1 100%;
    }
}

/* A narrower page: the picture sits above the match. */
@container page (max-width: 640px) {
    .now {
        flex-direction: column;
        align-items: stretch;
    }

    .thumb {
        width: 100%;
        height: 120px;
    }
}
</style>
