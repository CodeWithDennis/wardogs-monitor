<script setup lang="ts">
import { Clock, Lock } from 'lucide-vue-next';
import { computed } from 'vue';
import { openOptions, state } from '@/lib/store';

/**
 * A strip above the page when the trial has ended (servers are locked) or
 * is about to.
 */
const hasRealServers = computed(() => state.servers.some((server) => !server.demo));
const show = computed(() => hasRealServers.value && state.view !== 'options' && (state.licence?.state === 'expired' || (state.licence?.state === 'trial' && state.licence.trialDaysLeft <= 3)));
</script>

<template>
    <div v-if="show && state.licence" class="banner" :class="state.licence.state">
        <component :is="state.licence.state === 'expired' ? Lock : Clock" class="icon" />
        <span v-if="state.licence.state === 'expired' && state.licence.reason === 'offline'">Your licence could not be confirmed online for too long. Your servers are locked until this PC can reach the website.</span>
        <span v-else-if="state.licence.state === 'expired'">{{ state.licence.reason === 'licence' ? 'Your licence has ended.' : state.licence.reason === 'revoked' ? 'Your licence was revoked.' : 'Your free trial has ended.' }} Your servers are locked until you activate a licence.</span>
        <span v-else>Your free trial ends in {{ state.licence.trialDaysLeft }} {{ state.licence.trialDaysLeft === 1 ? 'day' : 'days' }}.</span>
        <button type="button" class="btn btn-primary btn-sm" @click="openOptions('licence')">{{ state.licence.reason === 'offline' || state.licence.reason === 'licence' ? 'Open licence' : 'Activate licence' }}</button>
    </div>
</template>

<style scoped>
/*
 * When it runs to the window's right edge, Windows draws its own minimise,
 * maximise and close buttons over its end, so it keeps that corner clear
 * (--caption-clear, set on .content in Shell.vue).
 */
.banner {
    display: flex;
    flex: none;
    align-items: center;
    gap: 12px;
    min-height: 50px;
    padding: 8px max(24px, var(--caption-clear, var(--caption-w))) 8px 35px;
    border-bottom: 1px solid var(--accent-line);
    background: var(--accent-soft);
    font-size: 14px;
    line-height: 1.4;
}

.banner.expired {
    border-bottom-color: color-mix(in srgb, var(--bad) 45%, transparent);
    background: var(--bad-soft);
}

.banner span {
    flex: 1;
}

.icon {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--accent);
}

.expired .icon {
    color: var(--bad);
}
</style>
