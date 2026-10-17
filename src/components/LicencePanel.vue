<script setup lang="ts">
import { BadgeCheck, Clock, KeyRound, Lock, ShoppingCart } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { BRAND } from '@/lib/brand';
import { confirm, state, toast } from '@/lib/store';

/**
 * Options → Licence: where the app stands (trial, licensed, ended), and
 * where a key is pasted in. Keys are checked on this PC, offline.
 */
const key = ref('');
const error = ref<string | null>(null);
const busy = ref(false);

const status = computed(() => state.licence);

async function activate(): Promise<void> {
    busy.value = true;
    error.value = null;

    try {
        const result = await window.panel.license.activate(key.value);

        if (result.ok) {
            state.licence = result.status;
            key.value = '';
            toast('ok', 'Licence activated', `Thank you${result.status.licensee ? `, ${result.status.licensee}` : ''}!`);
        } else {
            error.value = result.error;
        }
    } finally {
        busy.value = false;
    }
}

async function remove(): Promise<void> {
    const yes = await confirm({
        title: 'Remove the licence from this PC?',
        body: 'Use this to move your licence to another PC. You can activate it again here with the same key.',
        confirmLabel: 'Remove licence',
        danger: true,
    });

    if (yes) {
        state.licence = await window.panel.license.remove();
        toast('info', 'Licence removed from this PC');
    }
}

const buy = () => BRAND.website && window.panel.openExternal(BRAND.website);
</script>

<template>
    <div class="licence">
        <div class="status card" :class="status?.state">
            <component :is="status?.state === 'licensed' ? BadgeCheck : status?.state === 'trial' ? Clock : Lock" class="status-icon" />
            <div class="status-text">
                <template v-if="status?.state === 'licensed'">
                    <h3>Licensed to {{ status.licensee }}</h3>
                    <p class="muted">
                        {{ status.plan ? `${status.plan[0].toUpperCase()}${status.plan.slice(1)} plan` : 'Licence' }} · {{ status.email }} ·
                        {{ status.expires ? `renews by ${status.expires}` : 'never expires' }}
                    </p>
                </template>
                <template v-else-if="status?.state === 'trial'">
                    <h3>Free trial · {{ status.trialDaysLeft }} {{ status.trialDaysLeft === 1 ? 'day' : 'days' }} left</h3>
                    <p class="muted">Everything works during the {{ status.trialDays }}-day trial. After it, your servers need a licence; the demo server stays free.</p>
                </template>
                <template v-else-if="status">
                    <h3>{{ status.reason === 'licence' ? `Your licence ended on ${status.expires}` : 'Your free trial has ended' }}</h3>
                    <p class="muted">Your servers are locked until a licence is activated. The demo server still works.</p>
                </template>
            </div>
            <button v-if="status?.state === 'licensed'" type="button" class="btn btn-ghost" @click="remove">Remove from this PC</button>
            <button v-else-if="BRAND.website" type="button" class="btn btn-primary" @click="buy"><ShoppingCart /> Buy a licence</button>
        </div>

        <form v-if="status?.state !== 'licensed'" class="activate" @submit.prevent="activate">
            <label class="field">
                <span class="field-label">Licence key</span>
                <textarea v-model="key" class="textarea mono" rows="3" :placeholder="`${BRAND.licenseKeyPrefix}-…`" spellcheck="false" @keydown.enter.prevent="activate" />
                <span class="field-hint">Paste the key from your purchase email. It is checked on this PC; nothing is sent anywhere.</span>
            </label>
            <p v-if="error" class="field-error" role="alert">{{ error }}</p>
            <div>
                <button type="submit" class="btn btn-primary" :disabled="busy || key.trim() === ''"><KeyRound /> Activate licence</button>
            </div>
        </form>
    </div>
</template>

<style scoped>
.licence {
    display: grid;
    gap: 22px;
}

.status {
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 20px 22px;
    background: var(--panel);
}

.status.licensed {
    border-color: color-mix(in srgb, var(--ok) 40%, transparent);
}

.status.expired {
    border-color: color-mix(in srgb, var(--bad) 45%, transparent);
}

.status-icon {
    width: 30px;
    height: 30px;
    flex: none;
    color: var(--accent);
}

.licensed .status-icon {
    color: var(--ok);
}

.expired .status-icon {
    color: var(--bad);
}

.status-text {
    flex: 1;
    min-width: 0;
}

.status-text h3 {
    margin: 0;
    font-family: var(--font-title);
    font-size: 16.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.status-text p {
    margin: 5px 0 0;
    font-size: 13.5px;
    line-height: 1.55;
}

.activate {
    display: grid;
    gap: 14px;
    max-width: 720px;
}
</style>
