<script setup lang="ts">
import { computed } from "vue";
import type { Flight, Hive } from "../../../shared/contracts";
import { weatherAt } from "../../clock";
import {
  VISITS_PER_DAY,
  FLIGHT_RADIUS,
  FLY_START,
  FLY_END,
  beesActive,
  flyingHour,
  visitsLeft,
} from "../lib/forage";
const props = defineProps<{
  hives: readonly Readonly<Hive>[];
  flights: readonly Readonly<Flight>[];
  pendingHives: number;
  placing: boolean;
  movingId: string | null;
  hour: number;
}>();
defineEmits<{
  place: [];
  cancel: [];
  move: [id: string];
  collect: [id: string];
}>();
const day = computed(() => Math.floor(props.hour / 24));
const weather = computed(() => weatherAt(props.hour));
const flyingNow = computed(
  () => beesActive(weather.value) && flyingHour(props.hour),
);
const flightsToday = computed(
  () => props.flights.filter((f) => Math.floor(f.hour / 24) === day.value).length,
);
const statusText = computed(() => {
  if (!flyingNow.value) {
    if (weather.value === "wind") return "大风暂停飞行，出勤进度保留";
    return "蜜蜂归巢中，仅白天出勤";
  }
  return "蜜蜂出勤中，正在寻访开花田";
});
</script>
<template>
  <section class="panel bees-panel">
    <div class="panel-heading">
      <h2>蜂箱与授粉</h2>
      <span>每箱每天 {{ VISITS_PER_DAY }} 次访问 · 半径 {{ FLIGHT_RADIUS }} 格</span>
    </div>
    <p class="bees-status" :class="{ active: flyingNow }">
      <b>{{ flyingNow ? "🐝" : "🛌" }}</b>
      {{ statusText }}
      <small
        >飞行时段 {{ FLY_START }}:00–{{ FLY_END }}:00 · 晴/小雨出勤，大风停飞
        · 今日已飞 {{ flightsToday }} 趟</small
      >
    </p>
    <div v-if="placing || movingId" class="placement-banner">
      {{ movingId ? "点击一块空地移动该蜂箱" : "点击农场里的一块空地放置蜂箱" }}
      <button @click="$emit('cancel')">取消</button>
    </div>
    <div v-if="pendingHives > 0" class="pending-row">
      <span>待放置蜂箱 ×{{ pendingHives }}</span>
      <button class="primary" @click="$emit('place')">去放置</button>
    </div>
    <article v-for="hive in hives" :key="hive.id" class="hive-row">
      <b>📦</b>
      <div class="hive-info">
        <strong>{{ hive.id }}</strong>
        <small
          >今日访问 {{ hive.day === day ? hive.visitsUsed : 0 }}/{{
            VISITS_PER_DAY
          }}
          · 剩余 {{ visitsLeft(hive, day) }} 次 · 存蜜 🍯{{ hive.honey }}</small
        >
      </div>
      <div class="hive-actions">
        <button @click="$emit('move', hive.id)">移动</button
        ><button
          class="primary"
          :disabled="hive.honey <= 0"
          @click="$emit('collect', hive.id)"
        >
          取蜜
        </button>
      </div>
    </article>
    <p v-if="!hives.length && pendingHives === 0" class="hint">
      在工坊制作蜂箱并放到空地上，让作物布局影响授粉产量。
    </p>
  </section>
</template>
