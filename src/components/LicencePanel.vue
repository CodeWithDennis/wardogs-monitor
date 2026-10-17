<script setup lang="ts">
import { BadgeCheck, Clock, CreditCard, KeyRound, Lock, RefreshCw, ShoppingCart } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { BRAND } from '@/lib/brand';
import { ago } from '@/lib/format';
import { BILLING_URL, openBilling, planName, serverCount } from '@/lib/licence';
import { confirm, now, state, toast } from '@/lib/store';

/**
 * Options → Licence: where the app stands (trial, licensed, ended), the
 * plan's server limit and subscription, and where a key is pasted in. Keys
 * are checked on this PC first, then confirmed with the website.
 */
const key = ref('');
const error = ref<string | null>(null);
const busy = ref(false);
const checking = ref(false);

const status = computed(() => state.licence);

const websiteHost = BRAND.website ? new URL(BRAND.website).hostname : 'the website';

const date = (iso: string): string => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** "Clan plan · up to 5 servers · 3 PCs". */
const planLine = computed(() => {
    const licence = status.value;

    if (!licence) {
        return '';
    }

    const parts = [licence.plan ? `${planName(licence.plan)} plan` : 'Licence', licence.maxServers === null ? 'unlimited servers' : `up to ${serverCount(licence.maxServers)}`];

    if (licence.seats) {
        parts.push(`${licence.seats.max} ${licence.seats.max === 1 ? 'PC' : 'PCs'}`);
    }

    return parts.join(' · ');
});

/** "Renews 17 Nov 2026", "Cancels on …", or what to do about a failed payment. */
const renewalLine = computed(() => {
    const licence = status.value;
    const subscription = licence?.subscription;

    if (!licence) {
        return '';
    }

    if (!subscription) {
        return licence.expires ? `Works until ${date(licence.expires)}` : 'Never expires';
    }

    if (subscription.status === 'past_due' || subscription.status === 'incomplete') {
        return 'Payment failed — update it in Manage subscription';
    }

    if (subscription.status === 'paused') {
        return 'Subscription paused';
    }

    if (subscription.status === 'cancelled') {
        return licence.expires ? `Subscription cancelled · works until ${date(licence.expires)}` : 'Subscription cancelled';
    }

    if (!subscription.renews_at) {
        return `${subscription.interval === 'yearly' ? 'Yearly' : 'Monthly'} subscription`;
    }

    return subscription.cancel_at_period_end ? `Cancels on ${date(subscription.renews_at)}` : `Renews ${date(subscription.renews_at)}`;
});

const paymentFailed = computed(() => status.value?.subscription?.status === 'past_due' || status.value?.subscription?.status === 'incomplete');

/** Check with the website now (picks up a renewal or an upgrade). */
async function check(): Promise<void> {
    checking.value = true;

    try {
        state.licence = await window.panel.license.check();
    } finally {
        checking.value = false;
    }
}

async function activate(): Promise<void> {
    busy.value = true;
    error.value = null;

    try {
        const result = await window.panel.license.activate(key.value);

        if (result.ok) {
            state.licence = result.status;
            key.value = '';
            toast(
                'ok',
                'Licence activated',
                result.status.onlineConfirmed
                    ? `Thank you${result.status.licensee ? `, ${result.status.licensee}` : ''}!`
                    : `${websiteHost} could not be reached, so it works offline for now and is confirmed online later.`,
            );
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
        body: 'Use this to move your licence to another PC: it frees this PC on your licence. You can activate it again here with the same key.',
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
                    <p class="muted">{{ planLine }} · {{ status.email }}</p>
                    <p :class="paymentFailed ? 'warn' : 'muted'">{{ renewalLine }}</p>
                    <p class="muted online">
                        {{ status.onlineConfirmed ? `Checked online ${ago(status.lastCheckedAt, now)}` : 'Not yet confirmed online' }}
                        <button type="button" class="btn btn-ghost btn-sm" :disabled="checking" @click="check"><RefreshCw /> {{ checking ? 'Checking…' : 'Check now' }}</button>
                    </p>
                    <p v-if="status.onlineError" class="warn">{{ status.onlineError }}</p>
                </template>
                <template v-else-if="status?.state === 'trial'">
                    <h3>Free trial · {{ status.trialDaysLeft }} {{ status.trialDaysLeft === 1 ? 'day' : 'days' }} left</h3>
                    <p class="muted">Everything works during the {{ status.trialDays }}-day trial, for up to {{ serverCount(status.maxServers) }}. After it, your servers need a licence; the demo server stays free.</p>
                </template>
                <template v-else-if="status">
                    <h3>
                        {{
                            status.reason === 'licence'
                                ? `Your licence ended on ${status.expires}`
                                : status.reason === 'revoked'
                                  ? 'Your licence was revoked'
                                  : status.reason === 'offline'
                                    ? 'Your licence needs an online check'
                                    : 'Your free trial has ended'
                        }}
                    </h3>
                    <p class="muted">
                        {{
                            status.reason === 'offline'
                                ? `Connect this PC to the internet so the app can confirm your licence with ${websiteHost}. Your servers are locked until then; the demo server still works.`
                                : status.reason === 'licence'
                                  ? 'Your servers are locked until the licence is renewed. Renewals are picked up by themselves; the demo server still works.'
                                  : 'Your servers are locked until a licence is activated. The demo server still works.'
                        }}
                    </p>
                    <p v-if="status.reason === 'licence' || status.reason === 'offline'" class="muted online">
                        <button type="button" class="btn btn-ghost btn-sm" :disabled="checking" @click="check"><RefreshCw /> {{ checking ? 'Checking…' : 'Check now' }}</button>
                    </p>
                </template>
            </div>
            <div v-if="status?.state === 'licensed' || (status?.reason === 'licence' && status.subscription)" class="status-actions">
                <button v-if="BILLING_URL" type="button" class="btn btn-primary" @click="openBilling"><CreditCard /> Manage subscription</button>
                <button v-if="status?.state === 'licensed'" type="button" class="btn btn-ghost" @click="remove">Remove from this PC</button>
            </div>
            <button v-else-if="BRAND.website" type="button" class="btn btn-primary" @click="buy"><ShoppingCart /> Buy a licence</button>
        </div>

        <form v-if="status?.state !== 'licensed'" class="activate" @submit.prevent="activate">
            <label class="field">
                <span class="field-label">Licence key</span>
                <textarea v-model="key" class="textarea mono" rows="3" :placeholder="`${BRAND.licenseKeyPrefix}-…`" spellcheck="false" @keydown.enter.prevent="activate" />
                <span class="field-hint">Paste the key from your purchase email. It is checked on this PC, then confirmed with {{ websiteHost }}: only the key, a random ID for this PC and the PC's name are sent.</span>
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

.status-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
}

.status-text .warn {
    color: var(--warn);
}

.status-text .online {
    display: flex;
    align-items: center;
    gap: 10px;
}
</style>
