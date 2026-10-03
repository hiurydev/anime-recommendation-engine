<script setup>
import { ref, onMounted } from 'vue';

const apiUrl = import.meta.env.VITE_API_URL;
const health = ref(null);
const error = ref(null);

onMounted(async () => {
  try {
    const res = await fetch(`${apiUrl}/health`);
    health.value = await res.json();
  } catch (err) {
    error.value = err.message;
  }
});
</script>

<template>
  <main>
    <h1>Anime Recommendation Engine</h1>
    <p>Ambiente configurado. Próximo passo: implementar catálogo, avaliações e recomendações.</p>
    <p v-if="health">
      Backend OK — mongo: <strong>{{ health.mongo }}</strong>,
      animes: <strong>{{ health.animeCount }}</strong>
    </p>
    <p v-else-if="error">Não foi possível falar com o backend ({{ apiUrl }}): {{ error }}</p>
    <p v-else>Verificando backend em {{ apiUrl }}...</p>
  </main>
</template>
