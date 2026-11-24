<script setup lang="ts">
import { Ban, Copy, ExternalLink, MessageSquare, Shuffle, Skull, Star, StarOff, UserX } from 'lucide-vue-next';
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { steamProfileUrl } from '@/lib/format';
import { killPlayer, openPlayerAction, playerMenu } from '@/lib/playerActions';
import { toast } from '@/lib/store';
import { isWatched, toggleWatch } from '@/lib/watchlist';

/** The right-click menu for a player, kept inside the window. */
const box = ref<HTMLElement | null>(null);
const position = ref({ left: 0, top: 0 });

watch(playerMenu, async (menu) => {
    if (!menu) {
        return;
    }

    position.value = { left: menu.x, top: menu.y };
    await nextTick();
    const rect = box.value?.getBoundingClientRect();

    if (rect) {
        position.value = {
            left: Math.min(menu.x, window.innerWidth - rect.width - 8),
            top: Math.min(menu.y, window.innerHeight - rect.height - 8),
        };
    }
});

function run(action: () => void): void {
    action();
    playerMenu.value = null;
}

function openProfile(steamId: string): void {
    const url = steamProfileUrl(steamId);

    if (url) {
        window.panel.openExternal(url);
    }
}

async function copy(text: string, what: string): Promise<void> {
    try {
        await navigator.clipboard.writeText(text);
        toast('info', `Copied ${what}`);
    } catch {
        toast('error', `Could not copy ${what}`);
    }
}

function close(event: Event): void {
    if (playerMenu.value && !(event.target instanceof Node && box.value?.contains(event.target))) {
        playerMenu.value = null;
    }
}

function closeMenu(): void {
    playerMenu.value = null;
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        closeMenu();
    }
}

onMounted(() => {
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', closeMenu);
});

onUnmounted(() => {
    document.removeEventListener('mousedown', close);
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('blur', closeMenu);
});
</script>

<template>
    <Teleport to="body">
        <div v-if="playerMenu" ref="box" class="context" role="menu" :style="{ left: `${position.left}px`, top: `${position.top}px` }">
            <div class="who">
                <strong class="truncate">{{ playerMenu.player.name }}</strong>
                <small class="mono">{{ playerMenu.player.steamId }}</small>
            </div>

            <template v-if="playerMenu.online">
                <button type="button" role="menuitem" @click="run(() => openPlayerAction('message', playerMenu!.player))"><MessageSquare /> Message</button>
                <button type="button" role="menuitem" @click="run(() => openPlayerAction('faction', playerMenu!.player))"><Shuffle /> Move faction</button>
                <button type="button" role="menuitem" @click="run(() => killPlayer(playerMenu!.player))"><Skull /> Kill</button>
                <div class="divider" />
                <button type="button" role="menuitem" class="bad" @click="run(() => openPlayerAction('kick', playerMenu!.player))"><UserX /> Kick</button>
            </template>
            <button type="button" role="menuitem" class="bad" @click="run(() => openPlayerAction('ban', playerMenu!.player))"><Ban /> Ban</button>

            <div class="divider" />
            <button type="button" role="menuitem" @click="run(() => toggleWatch(playerMenu!.player))">
                <component :is="isWatched(playerMenu.player.steamId) ? StarOff : Star" />
                {{ isWatched(playerMenu.player.steamId) ? 'Stop watching' : 'Watch player' }}
            </button>
            <button type="button" role="menuitem" @click="run(() => copy(playerMenu!.player.name, 'the name'))"><Copy /> Copy name</button>
            <button type="button" role="menuitem" @click="run(() => copy(playerMenu!.player.steamId, 'the Steam ID'))"><Copy /> Copy Steam ID</button>
            <button type="button" role="menuitem" @click="run(() => openProfile(playerMenu!.player.steamId))"><ExternalLink /> Steam profile</button>
        </div>
    </Teleport>
</template>

<style scoped>
.context {
    position: fixed;
    z-index: 70;
    width: 231px;
    padding: 5px;
    border: 1px solid var(--pop-line);
    border-top-color: var(--accent-line);
    border-radius: var(--radius-pop);
    background: var(--panel);
    box-shadow: var(--shadow-pop);
    animation: rise 0.1s ease;
    -webkit-app-region: no-drag;
}

.who {
    display: grid;
    padding: 6px 10px 8px;
    border-bottom: 1px solid var(--line-soft);
    margin-bottom: 5px;
}

.who strong {
    font-weight: 600;
    font-size: 14px;
}

.who small {
    color: var(--muted);
    font-size: 12px;
}

button {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    height: 34px;
    padding: 0 10px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--text-2);
    font-size: 14px;
    text-align: left;
}

button:hover {
    background: var(--hover);
    color: var(--text);
}

button svg {
    width: 16px;
    height: 16px;
    flex: none;
    color: var(--muted);
}

button:hover svg {
    color: var(--text-2);
}

.bad,
.bad svg,
.bad:hover svg {
    color: var(--bad);
}

.bad:hover {
    background: var(--bad-soft);
    color: var(--bad);
}

.divider {
    height: 1px;
    margin: 5px 4px;
    background: var(--line-soft);
}
</style>
