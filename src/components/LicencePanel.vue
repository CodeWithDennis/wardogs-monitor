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

/** The short word in the card's corner: "Active", "12 days left", "Ended". */
const stateLabel = computed(() => {
    const licence = status.value;

    if (!licence) {
        return '';
    }

    if (licence.state === 'licensed') {
        return paymentFailed.value ? 'Payment failed' : 'Active';
    }

    if (licence.state === 'trial') {
        return `${licence.trialDaysLeft} ${licence.trialDaysLeft === 1 ? 'day' : 'days'} left`;
    }

    return licence.reason === 'offline' || licence.reason === 'unconfirmed' || licence.reason === 'trial-unconfirmed' || licence.reason === 'clock' ? 'Needs a check' : licence.reason === 'revoked' ? 'Revoked' : 'Ended';
});

/** The title and line for a locked app, by why it is locked. */
const locked = computed(() => {
    const licence = status.value;
    const servers = 'Your servers are locked until then; the demo server still works.';

    switch (licence?.reason) {
        case 'licence':
            return { title: `Your licence ended on ${licence.expires ? date(licence.expires) : 'its last day'}`, text: 'Your servers are locked until the licence is renewed. Renewals are picked up by themselves; the demo server still works.' };
        case 'revoked':
            return { title: 'Your licence was revoked', text: 'Your servers are locked until a licence is activated. The demo server still works.' };
        case 'offline':
            return { title: 'Your licence needs an online check', text: `Connect this PC to the internet so the app can confirm your licence with ${websiteHost}. ${servers}` };
        case 'unconfirmed':
            return { title: 'Your licence is not confirmed for this PC', text: `A licence is activated online once per PC. Connect to the internet and check again. ${servers}` };
        case 'trial-unconfirmed':
            return { title: 'Start your free trial', text: `The trial starts the first time this PC reaches ${websiteHost}. Connect to the internet and check again; the demo server works without it.` };
        case 'clock':
            return { title: "This PC's clock is behind", text: `The date and time are set earlier than when the app last ran. Set them right, or connect to the internet so the app can check with ${websiteHost}. ${servers}` };
        default:
            return { title: 'Your free trial has ended', text: 'Your servers are locked until a licence is activated. The demo server still works.' };
    }
});

/** The licence's details as label and value pairs, shown as tiles under the status. */
const facts = computed(() => {
    const licence = status.value;

    if (licence?.state === 'trial') {
        return [
            { label: 'Trial', value: `${licence.trialDaysLeft} of ${licence.trialDays} days left`, warn: false },
            { label: 'Servers', value: `Up to ${serverCount(licence.maxServers)}`, warn: false },
        ];
    }

    if (licence?.state !== 'licensed') {
        return [];
    }

    const list = [
        { label: 'Licensee', value: licence.licensee ?? '—', warn: false },
        { label: 'Email', value: licence.email ?? '—', warn: false },
        { label: 'Plan', value: licence.plan ? planName(licence.plan) : 'Licence', warn: false },
        { label: 'Servers', value: licence.maxServers === null ? 'Unlimited' : `Up to ${serverCount(licence.maxServers)}`, warn: false },
    ];

    if (licence.seats) {
        list.push({ label: 'PCs', value: `${licence.seats.used} of ${licence.seats.max} in use`, warn: false });
    }

    list.push({ label: licence.subscription ? 'Subscription' : 'Expires', value: renewalLine.value, warn: paymentFailed.value });

    return list;
});

/** Licensed, or ended with a renewal the website may already know about: worth asking it again. */
const canCheck = computed(() => status.value?.state === 'licensed' || ['licence', 'offline', 'unconfirmed', 'trial-unconfirmed', 'clock'].includes(status.value?.reason ?? ''));

const showsBilling = computed(() => status.value?.state === 'licensed' || (status.value?.reason === 'licence' && !!status.value.subscription));

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
    <div class="stack">
        <section class="card panel status" :class="status?.state">
            <header class="panel-head">
                <span class="panel-title">
                    <span class="panel-icon"><component :is="status?.state === 'licensed' ? BadgeCheck : status?.state === 'trial' ? Clock : Lock" /></span>
                    Licence
                </span>
                <span v-if="status" class="pill" :class="status.state === 'licensed' && !paymentFailed ? 'pill-ok' : status.state === 'trial' ? 'pill-gold' : 'pill-bad'">{{ stateLabel }}</span>
            </header>

            <div class="summary">
                <template v-if="status?.state === 'licensed'">
                    <h3>Licensed to {{ status.licensee }}</h3>
                    <p class="muted">Every server on your plan works. Renewals and upgrades are picked up by themselves.</p>
                </template>
                <template v-else-if="status?.state === 'trial'">
                    <h3>Free trial · {{ status.trialDaysLeft }} {{ status.trialDaysLeft === 1 ? 'day' : 'days' }} left</h3>
                    <p class="muted">Everything works during the {{ status.trialDays }}-day trial, for up to {{ serverCount(status.maxServers) }}. After it, your servers need a licence; the demo server stays free.</p>
                </template>
                <template v-else-if="status">
                    <h3>{{ locked.title }}</h3>
                    <p class="muted">{{ locked.text }}</p>
                </template>
            </div>

            <dl v-if="facts.length" class="facts">
                <div v-for="fact in facts" :key="fact.label" class="fact">
                    <dt>{{ fact.label }}</dt>
                    <dd :class="{ warn: fact.warn }">{{ fact.value }}</dd>
                </div>
            </dl>

            <p v-if="status?.state === 'licensed' && status.onlineError" class="online-error warn">{{ status.onlineError }}</p>

            <footer v-if="canCheck || showsBilling || BRAND.website" class="status-foot panel-flush">
                <span v-if="canCheck" class="online">
                    <span v-if="status?.state === 'licensed'" class="muted">{{ status.onlineConfirmed ? `Checked online ${ago(status.lastCheckedAt, now)}` : 'Not yet confirmed online' }}</span>
                    <button type="button" class="btn btn-ghost btn-sm" :disabled="checking" @click="check"><RefreshCw /> {{ checking ? 'Checking…' : 'Check now' }}</button>
                </span>
                <span class="status-actions">
                    <template v-if="showsBilling">
                        <button v-if="status?.state === 'licensed'" type="button" class="btn btn-ghost" @click="remove">Remove from this PC</button>
                        <button v-if="BILLING_URL" type="button" class="btn btn-primary" @click="openBilling"><CreditCard /> Manage subscription</button>
                    </template>
                    <button v-else-if="BRAND.website" type="button" class="btn btn-primary" @click="buy"><ShoppingCart /> Buy a licence</button>
                </span>
            </footer>
        </section>

        <section v-if="status?.state !== 'licensed'" class="card panel">
            <header class="panel-head">
                <span class="panel-title"><span class="panel-icon"><KeyRound /></span> Activate a licence</span>
            </header>
            <p class="panel-intro">Paste the key from your purchase email. It is checked on this PC, then confirmed with {{ websiteHost }}: only the key, a random ID for this PC and the PC's name are sent.</p>
            <form class="activate" @submit.prevent="activate">
                <label class="field">
                    <span class="field-label">Licence key</span>
                    <textarea v-model="key" class="textarea mono" rows="3" :placeholder="`${BRAND.licenseKeyPrefix}-…`" spellcheck="false" @keydown.enter.prevent="activate" />
                </label>
                <p v-if="error" class="field-error" role="alert">{{ error }}</p>
                <div>
                    <button type="submit" class="btn btn-primary" :disabled="busy || key.trim() === ''"><KeyRound /> Activate licence</button>
                </div>
            </form>
        </section>
    </div>
</template>

<style scoped>
.status.licensed {
    border-color: color-mix(in srgb, var(--ok) 40%, transparent);
}

.status.expired {
    border-color: color-mix(in srgb, var(--bad) 45%, transparent);
}

/* The header's icon tile takes the state's colour: green when licensed, red when it ended. */
.licensed .panel-icon {
    background: color-mix(in srgb, var(--ok) 14%, transparent);
    color: var(--ok);
}

.expired .panel-icon {
    background: var(--bad-soft);
    color: var(--bad);
}

.summary h3 {
    margin: 0;
    font-family: var(--font-title);
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.summary p {
    margin: 6px 0 0;
    font-size: 13.5px;
    line-height: 1.55;
}

.facts {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(196px, 1fr));
    gap: 10px;
    margin: 18px 0 0;
}

.fact {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 11px 13px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--panel);
}

.fact dt {
    color: var(--muted);
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
}

.fact dd {
    margin: 0;
    font-size: 14px;
    overflow-wrap: anywhere;
    user-select: text;
}

.warn {
    color: var(--warn);
}

.online-error {
    margin: 14px 0 0;
    font-size: 13.5px;
}

/* Under a line at the card's foot: the online check on the left, what to do about the licence on the right. */
.status-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 18px;
    padding: 13px 20px;
    border-top: 1px solid var(--line-soft);
}

.online {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 13.5px;
}

.status-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-left: auto;
}

.activate {
    display: grid;
    gap: 14px;
}

@container page (max-width: 760px) {
    .status-actions {
        margin-left: 0;
    }
}
</style>
