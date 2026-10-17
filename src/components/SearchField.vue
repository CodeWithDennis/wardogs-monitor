<script setup lang="ts">
import { Search, X } from 'lucide-vue-next';
import { state } from '@/lib/store';

/**
 * The search box at the top of a list page (players, bans, servers,
 * activity). Ctrl+F jumps into it, Esc clears it. It filters the page it
 * sits on; Ctrl+K searches everything.
 */
defineProps<{ placeholder: string; count?: number | null }>();
</script>

<template>
    <label class="search-field">
        <Search class="icon" />
        <input id="search" v-model="state.search" type="search" :placeholder="placeholder" spellcheck="false" autocomplete="off" @keydown.esc="state.search = ''" />
        <span v-if="state.search && count !== undefined && count !== null" class="count num">{{ count }} found</span>
        <button v-if="state.search" type="button" class="clear" title="Clear (Esc)" @click="state.search = ''"><X /></button>
        <span v-else class="kbd">Ctrl F</span>
    </label>
</template>

<style scoped>
.search-field {
    display: flex;
    align-items: center;
    gap: 11px;
    width: 100%;
    max-width: 462px;
    height: 39.5px;
    padding: 0 9px 0 13px;
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--input);
    transition:
        border-color 0.12s,
        box-shadow 0.12s;
}

.search-field:hover {
    border-color: var(--line-strong);
}

/* The same focus ring as .input. */
.search-field:focus-within {
    border-color: var(--accent-line);
    box-shadow: 0 0 0 3px var(--accent-soft);
}

.icon {
    width: 16.5px;
    height: 16.5px;
    flex: none;
    color: var(--muted);
}

input {
    flex: 1;
    min-width: 0;
    border: 0;
    background: transparent;
    font-size: 15px;
    outline: none;
    user-select: text;
}

input::placeholder {
    color: var(--faint);
}

input::-webkit-search-cancel-button {
    display: none;
}

.count {
    color: var(--muted);
    font-size: 13px;
    white-space: nowrap;
}

.clear {
    display: grid;
    place-items: center;
    width: 26.5px;
    height: 26.5px;
    border: 0;
    border-radius: var(--radius);
    background: transparent;
    color: var(--muted);
}

.clear:hover {
    background: var(--hover);
    color: var(--text);
}

.clear svg {
    width: 15.5px;
    height: 15.5px;
}

.kbd {
    font-size: 11px;
    white-space: nowrap;
}
</style>
