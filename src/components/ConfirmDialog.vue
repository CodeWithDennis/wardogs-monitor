<script setup lang="ts">
import Modal from '@/components/Modal.vue';
import { answerConfirm, confirmation } from '@/lib/store';
</script>

<template>
    <Modal :open="confirmation !== null" :title="confirmation?.title ?? ''" :width="confirmation?.alternativeLabel ? 506 : 420" @close="answerConfirm(false)">
        <p class="text">{{ confirmation?.body }}</p>
        <template #footer>
            <button type="button" class="btn btn-ghost" @click="answerConfirm(false)">Cancel</button>
            <button v-if="confirmation?.alternativeLabel" type="button" class="btn" @click="answerConfirm('alternative')">{{ confirmation.alternativeLabel }}</button>
            <button type="button" class="btn" :class="confirmation?.danger ? 'btn-danger' : 'btn-primary'" autofocus @click="answerConfirm(true)">
                {{ confirmation?.confirmLabel }}
            </button>
        </template>
    </Modal>
</template>

<style scoped>
.text {
    margin: 0;
    color: var(--text-2);
    line-height: 1.6;
    user-select: text;
}
</style>
