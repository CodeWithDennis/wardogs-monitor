<script setup lang="ts">
import { MapPin, Users } from 'lucide-vue-next';
import { computed } from 'vue';
import FactionScores from '@/components/FactionScores.vue';
import { formatUptime, gameName, modeName, percent, zoneName } from '@/lib/format';
import { mapName } from '@/lib/maps';
import type { WidgetProps } from '@/types';

/** One server at a glance: its map, score race, player count and what plays next. */
const props = defineProps<WidgetProps>();

const fill = computed(() => percent(props.status.players, props.status.maxPlayers));
</script>

<template>
    <div class="status-widget">
        <div class="where">
            <MapPin class="pin" />
            <div class="min">
                <div class="map">{{ mapName(status.map) }}</div>
                <div class="sub truncate">{{ modeName(status.experiences) }}<template v-if="status.zone"> · {{ zoneName(status.zone) }}</template><template v-if="status.lighting"> · {{ gameName(status.lighting) }}</template></div>
            </div>
        </div>

        <FactionScores :factions="status.factions" compact class="scores" />

        <div class="facts">
            <span><Users class="tiny" /> <span class="num">{{ status.players }}</span><span class="faint">/{{ status.maxPlayers }}</span></span>
            <span class="faint">up {{ formatUptime(live.uptimeSeconds ?? 0) }}</span>
        </div>

        <div v-if="next" class="next">Then: <span class="gold">{{ next }}</span></div>

        <div class="foot">
            <div class="progress"><span :style="{ width: `${fill}%` }" /></div>
            <span class="num">{{ fill }}%</span>
        </div>
    </div>
</template>

<style scoped>
.where {
    display: flex;
    gap: 11px;
}

.pin {
    width: 16.5px;
    height: 16.5px;
    margin-top: 3.5px;
    color: var(--text-2);
    flex: none;
}

.min {
    min-width: 0;
}

.map {
    font-family: var(--font-title);
    font-size: 17.5px;
    line-height: 1.2;
}

.sub {
    color: var(--text-2);
    font-size: 12.5px;
}

.scores {
    margin-top: 13px;
}

.facts {
    display: flex;
    justify-content: space-between;
    margin-top: 13px;
    font-size: 14px;
}

.facts > span {
    display: inline-flex;
    align-items: center;
    gap: 5.5px;
}

.tiny {
    width: 14.5px;
    height: 14.5px;
    color: var(--muted);
}

.next {
    margin-top: 6.5px;
    color: var(--text-2);
    font-size: 13px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.foot {
    display: flex;
    align-items: center;
    gap: 13px;
    margin-top: auto;
    padding-top: 11px;
    font-size: 12.5px;
    color: var(--text-2);
}

.foot .progress {
    flex: 1;
}
</style>
