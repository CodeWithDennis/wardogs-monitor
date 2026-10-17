<script setup lang="ts">
import { SCORE_TARGET } from '@/lib/format';
import type { Faction } from '@/types';

/** Each faction's race to 100 points, in its own colour. */
withDefaults(defineProps<{ factions: Faction[]; compact?: boolean }>(), { compact: false });
</script>

<template>
    <div class="scores" :class="{ compact }">
        <div v-for="faction in factions" :key="faction.name" class="faction" :style="{ '--faction': faction.color }">
            <div class="top">
                <span class="name"><span class="swatch" />{{ faction.name }}</span>
                <span class="score num"
                    >{{ faction.score }}<span class="of">/{{ SCORE_TARGET }}</span></span
                >
            </div>
            <div class="bar"><span :style="{ '--fill': Math.min(1, faction.score / SCORE_TARGET) }" /></div>
            <div v-if="!compact" class="meta muted">
                <span class="num">{{ faction.players }} players</span>
                <span class="num">${{ faction.cash.toLocaleString('en-GB') }} cash</span>
            </div>
        </div>
    </div>
</template>

<style scoped>
.scores {
    display: grid;
    gap: 20px;
}

.compact {
    gap: 10px;
}

.top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    margin-bottom: 7.5px;
}

.name {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-size: 15.5px;
}

.compact .name {
    font-size: 14px;
}

.swatch {
    width: 10px;
    height: 10px;
    border-radius: 2px;
    background: var(--faction);
    box-shadow: 0 0 11px color-mix(in srgb, var(--faction) 60%, transparent);
}

.score {
    font-family: var(--font-title);
    font-size: 24px;
    font-weight: 600;
    line-height: 1;
    color: color-mix(in srgb, var(--faction) 55%, white);
}

.compact .score {
    font-size: 16.5px;
}

.of {
    margin-left: 2px;
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 400;
    color: var(--muted);
}

.bar {
    position: relative;
    height: 6.5px;
    border-radius: 3.5px;
    background: var(--track);
    overflow: hidden;
}

.compact .bar {
    height: 4.5px;
}

/* The fill grows by scaling, which the GPU animates without repainting the page every frame. */
.bar span {
    position: absolute;
    inset: 0 auto 0 0;
    width: 100%;
    border-radius: 3.5px;
    background: linear-gradient(90deg, color-mix(in srgb, var(--faction) 55%, transparent), var(--faction));
    transform: scaleX(var(--fill, 0));
    transform-origin: left center;
    transition: transform 0.8s ease;
}

.meta {
    display: flex;
    justify-content: space-between;
    margin-top: 7.5px;
    font-size: 13px;
}
</style>
