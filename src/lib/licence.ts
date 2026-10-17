import { computed } from 'vue';
import { BRAND } from '@/lib/brand';
import { state } from '@/lib/store';
import type { LicenceStatus } from '@/types';

/**
 * The plan's server limit as the window shows it. The main process decides
 * what is locked (electron/license-core.mjs); this only words it the same
 * way and opens the website's billing page.
 */

export const BILLING_URL = BRAND.website ? `${BRAND.website.replace(/\/+$/, '')}/billing` : null;

/** The website's billing page: upgrade, renew or manage the subscription. */
export function openBilling(): void {
    if (BILLING_URL) {
        window.panel.openExternal(BILLING_URL);
    }
}

/** "basic" → "Basic". */
export const planName = (plan: string | null): string => (plan ? `${plan[0].toUpperCase()}${plan.slice(1)}` : '');

/** "3 servers", "1 server", "unlimited servers". */
export const serverCount = (count: number | null): string => (count === null ? 'unlimited servers' : `${count} ${count === 1 ? 'server' : 'servers'}`);

/** Real servers saved; the demo server never counts. */
export const realServerCount = computed(() => state.servers.filter((server) => !server.demo).length);

/** Whether a limit applies right now (licensed or in the trial, with a number). */
export const planLimit = computed(() => (state.licence && state.licence.state !== 'expired' && state.licence.maxServers !== null ? state.licence.maxServers : null));

/** Whether one more real server fits the plan. */
export const canAddServer = computed(() => planLimit.value === null || realServerCount.value < planLimit.value);

/** Same wording as planLimitMessage in electron/license-core.mjs. */
export function planLimitMessage(status: LicenceStatus, action: 'use' | 'add' = 'use'): string {
    const count = serverCount(status.maxServers);
    const covers = status.state === 'trial' ? `The free trial covers ${count}.` : status.plan ? `Your ${planName(status.plan)} plan covers ${count}.` : `Your plan covers ${count}.`;

    return action === 'add' ? `${covers} Upgrade to add another, or remove a server first.` : `${covers} Upgrade to use this one, or remove another server.`;
}
