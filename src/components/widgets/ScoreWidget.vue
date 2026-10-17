<script setup lang="ts">
import { computed } from 'vue';
import { modeName, SCORE_TARGET } from '@/lib/format';
import { mapName } from '@/lib/maps';
import type { WidgetProps } from '@/types';

/** The faction race to 100, big enough to read at a glance over the game. */
const props = defineProps<WidgetProps>();

const ranked = computed(() => [...props.status.factions].sort((a, b) => b.score - a.score));
const lead = computed(() => (ranked.value.length > 1 ? ranked.value[0].score - ranked.value[1].score : 0));
const tick = computed(() => props.status.scoreTick?.current ?? null);
</script>

<template>
    <div class="score-widget">
        <div class="line">
            <span class="truncate">{{ mapName(status.map) }} · {{ modeName(status.experiences) }}</span>
            <span v-if="tick" class="faint num">+1 every {{ tick }}s</span>
        </div>

        <div class="race">
            <div v-for="faction in ranked" :key="faction.name" class="faction" :style="{ '--faction': faction.color }">
                <div class="top">
                    <span class="name"><span class="swatch" />{{ faction.name }}</span>
                    <span class="points num">{{ faction.score }}<span class="of">/{{ SCORE_TARGET }}</span></span>
                </div>
                <div class="bar"><span :style="{ '--fill': Math.min(1, faction.score / SCORE_TARGET) }" /></div>
            </div>
        </div>

        <div class="foot">
            <template v-if="ranked.length > 1 && lead > 0">
                <span class="leader" :style="{ '--faction': ranked[0].color }">{{ ranked[0].name }}</span> leads by <span class="num">{{ lead }}</span>
            </template>
            <template v-else>Level game</template>
        </div>
    </div>
</template>

<style scoped>
.line {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    color: var(--text-2);
    font-size: 12.5px;
}

.race {
    display: grid;
    gap: 14px;
    margin-top: 14px;
}

.top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 7px;
}

.name {
    display: inline-flex;
    align-items: center;
    gap: 9px;
    font-size: 14.5px;
    font-weight: 600;
}

.swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--faction);
    box-shadow: 0 0 11px color-mix(in srgb, var(--faction) 60%, transparent);
}

.points {
    font-family: var(--font-title);
    font-size: 26px;
    font-weight: 700;
    line-height: 1;
    color: color-mix(in srgb, var(--faction) 55%, white);
}

.of {
    margin-left: 2px;
    font-family: var(--font-body);
    font-size: 12.5px;
    font-weight: 400;
    color: var(--muted);
}

.bar {
    height: 6px;
    border-radius: 3px;
    background: var(--line-soft);
    overflow: hidden;
}

.bar span {
    display: block;
    height: 100%;
    background: var(--faction);
    transform: scaleX(var(--fill));
    transform-origin: left;
    transition: transform 0.4s ease;
}

.foot {
    margin-top: auto;
    padding-top: 12px;
    color: var(--text-2);
    font-size: 13px;
}

.leader {
    color: color-mix(in srgb, var(--faction) 55%, white);
    font-weight: 600;
}
</style>
