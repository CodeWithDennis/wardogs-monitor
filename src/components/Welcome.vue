<script setup lang="ts">
import { Activity, FlaskConical, Gavel, Plus, Swords } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { BRAND, WORDMARK } from '@/lib/brand';
import { loadServers, selectServer, state, toast } from '@/lib/store';

/** What the app does, one tile each, so the first screen says it at a glance. */
const FEATURES = [
    { icon: Activity, title: 'Live scores', text: 'Players, kills and ping as they happen' },
    { icon: Gavel, title: 'Moderation', text: 'Message, kick, ban and watch players' },
    { icon: Swords, title: 'The match', text: 'Maps, rotation and every server setting' },
];

async function addDemo(): Promise<void> {
    const server = await window.panel.servers.addDemo();
    await loadServers();
    selectServer(server.id);
    toast('info', 'Demo server added', 'It plays a pretend match on this PC, so you can try every control safely.');
}
</script>

<template>
    <section class="welcome sky">
        <div class="drag-strip drag" />
        <div class="card card-gold inner">
            <BrandMark class="mark" />
            <h1 class="wordmark" :aria-label="BRAND.name">{{ WORDMARK.lead }} <span class="last">{{ WORDMARK.last }}</span></h1>
            <h2 class="label-caps gold">{{ BRAND.tagline }}</h2>
            <p class="intro">Run your Wardogs servers from one window: live scores and players, moderation, the match and its rotation, and every server setting.</p>

            <ul class="features">
                <li v-for="feature in FEATURES" :key="feature.title">
                    <span class="panel-icon"><component :is="feature.icon" /></span>
                    <strong>{{ feature.title }}</strong>
                    <span class="muted">{{ feature.text }}</span>
                </li>
            </ul>

            <div class="actions">
                <button type="button" class="btn btn-primary btn-lg" @click="state.addingServer = true"><Plus /> Add your server</button>
                <button type="button" class="btn btn-lg" @click="addDemo"><FlaskConical /> Try the demo server</button>
            </div>
            <p class="hint">Adding a server takes its RCON address and password. The demo plays a pretend match on this PC.</p>
        </div>
    </section>
</template>

<style scoped>
.welcome {
    position: relative;
    flex: 1;
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 56px 24px;
    overflow: auto;
}

.drag-strip {
    position: absolute;
    inset: 0 0 auto 0;
    height: 44px;
}

/* One centred card, like the cards on every page, lifted a little off the sky. */
.inner {
    display: grid;
    justify-items: center;
    gap: 14px;
    width: 100%;
    max-width: 600px;
    padding: 40px 44px 32px;
    background: var(--panel);
    box-shadow: 0 24px 60px rgb(0 0 0 / 0.32);
    text-align: center;
    animation: rise 0.25s ease both;
}

.mark {
    width: 60px;
    height: 60px;
    margin-bottom: 8px;
    filter: drop-shadow(0 0 24px color-mix(in srgb, var(--accent) 30%, transparent));
}

.wordmark {
    margin: 0;
    font-family: var(--font-title);
    font-size: 40px;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
}

.wordmark .last {
    color: var(--accent);
}

.label-caps {
    margin: 0 0 4px;
    font-size: 13px;
    letter-spacing: 0.3em;
}

p {
    margin: 0;
}

.intro {
    max-width: 470px;
    color: var(--text-2);
    line-height: 1.65;
}

.features {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    width: 100%;
    margin: 10px 0 4px;
    padding: 0;
    list-style: none;
}

.features li {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 6px;
    padding: 16px 12px 14px;
    border: 1px solid var(--line-soft);
    border-radius: var(--radius);
    background: var(--card);
}

.features .panel-icon {
    margin-bottom: 4px;
}

.features strong {
    font-size: 14px;
    font-weight: 600;
}

.features .muted {
    font-size: 13px;
    line-height: 1.45;
}

.actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 11px;
    margin-top: 10px;
}

.hint {
    max-width: 420px;
    color: var(--faint);
    font-size: 13px;
    line-height: 1.5;
}

/* A narrow window: the tiles stack into rows and the card gives up some padding. */
@media (max-width: 760px) {
    .inner {
        padding: 32px 22px 26px;
    }

    .wordmark {
        font-size: 32px;
    }

    .features {
        grid-template-columns: 1fr;
    }

    .features li {
        grid-template-columns: auto 1fr;
        justify-items: start;
        align-items: center;
        gap: 2px 12px;
        padding: 12px 14px;
        text-align: left;
    }

    .features .panel-icon {
        grid-row: span 2;
        margin-bottom: 0;
    }
}
</style>
