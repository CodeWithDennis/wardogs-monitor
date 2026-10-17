<script setup lang="ts">
import { FlaskConical, Plus } from 'lucide-vue-next';
import BrandMark from '@/components/BrandMark.vue';
import { BRAND, WORDMARK } from '@/lib/brand';
import { loadServers, selectServer, state, toast } from '@/lib/store';

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
        <div class="inner">
            <BrandMark class="mark" />
            <h1 class="wordmark" :aria-label="BRAND.name">{{ WORDMARK.lead }} <span class="last">{{ WORDMARK.last }}</span></h1>
            <h2 class="label-caps gold">{{ BRAND.tagline }}</h2>
            <p class="muted">Run your Wardogs servers from one window: live scores and players, moderation, the match and its rotation, and every server setting.</p>
            <div class="actions">
                <button type="button" class="btn btn-primary btn-lg" @click="state.addingServer = true"><Plus /> Add your server</button>
                <button type="button" class="btn btn-lg" @click="addDemo"><FlaskConical /> Try the demo server</button>
            </div>
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
}

.drag-strip {
    position: absolute;
    inset: 0 0 auto 0;
    height: 44px;
}

.inner {
    display: grid;
    justify-items: center;
    gap: 15.5px;
    max-width: 506px;
    text-align: center;
}

.mark {
    width: 64px;
    height: 64px;
    margin-bottom: 10px;
    filter: drop-shadow(0 0 24px color-mix(in srgb, var(--accent) 30%, transparent));
}

.wordmark {
    margin: 0;
    font-family: var(--font-title);
    font-size: 46px;
    font-weight: 800;
    letter-spacing: 0.08em;
    line-height: 1;
    text-transform: uppercase;
}

.wordmark .last {
    color: var(--accent);
}

.label-caps {
    margin: 0 0 6.5px;
    font-size: 13px;
    letter-spacing: 0.3em;
}

p {
    margin: 0;
    line-height: 1.65;
}

.actions {
    display: flex;
    gap: 11px;
    margin-top: 13px;
}
</style>
