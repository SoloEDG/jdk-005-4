<script setup lang="ts">
import { computed } from "vue";
import type { Flight, Hive, Plot } from "../../../shared/contracts";
import { items } from "../../../shared/catalog";
import { growthStage, sceneTrees } from "../lib/scene";
import { ready, blooming } from "../lib/crops";
import { plotPos, rankTargets } from "../../bees";
const props = defineProps<{
  plots: readonly Readonly<Plot>[];
  weather: string;
  hives: readonly Readonly<Hive>[];
  flights: readonly Readonly<Flight>[];
  placing: boolean;
  movingId: string | null;
}>();
defineEmits<{ plot: [id: number] }>();

const CELL_W = 25;
const CELL_H = 15.33;
const center = (id: number) => {
  const p = plotPos(id);
  return { x: p.x * CELL_W + CELL_W / 2, y: p.y * CELL_H + CELL_H / 2 };
};

/** 每个蜂箱当前仍待授粉的候选田块（场景里高亮显示） */
const pendingIds = computed(() => {
  const ids = new Set<number>();
  for (const hive of props.hives)
    for (const target of rankTargets(hive, props.plots)) ids.add(target.plotId);
  return ids;
});

const hivePlotIds = computed(() => new Set(props.hives.map((h) => h.plotId)));

/** 当天实际发生过的往返飞行路径（蜂箱 → 田块 → 蜂箱） */
const flightPaths = computed(() =>
  props.flights
    .map((f) => {
      const hive = props.hives.find((h) => h.id === f.hiveId);
      if (!hive) return null;
      const a = center(hive.plotId),
        b = center(f.plotId);
      return { id: f.id, d: `M ${a.x} ${a.y} L ${b.x} ${b.y} L ${a.x} ${a.y}` };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null),
);
</script>
<template>
  <div class="farm-scene" :class="[weather, { placing }]">
    <div class="cloud cloud-one"></div>
    <div class="cloud cloud-two"></div>
    <div class="mountain"></div>
    <div class="forest">
      <div
        v-for="(tree, i) in sceneTrees"
        :key="i"
        class="pixel-tree"
        :style="{
          left: tree.left,
          top: tree.top,
          transform: `scale(${tree.scale})`,
        }"
      ></div>
    </div>
    <div class="barn">
      <div class="roof"></div>
      <div class="barn-window">✚</div>
      <div class="barn-door"></div>
      <span>MEADOW</span>
    </div>
    <div class="windmill">✣<i></i></div>
    <div class="pond"><i></i></div>
    <div class="fence">╬ ╬ ╬ ╬ ╬ ╬ ╬ ╬ ╬ ╬ ╬ ╬</div>
    <div class="field-grid">
      <button
        v-for="plot in plots"
        :key="plot.id"
        class="plot"
        :class="{
          'is-ready': plot.crop && ready(plot.crop),
          'is-hive': hivePlotIds.has(plot.id),
          'is-pending': plot.crop && pendingIds.has(plot.id),
          'is-bloomed': plot.crop && plot.crop.pollinated,
        }"
        :data-plot="plot.id"
        @click="$emit('plot', plot.id)"
      >
        <span
          v-if="plot.crop"
          class="crop"
          :style="{ fontSize: `${14 + growthStage(plot) * 8}px` }"
          >{{
            growthStage(plot) === 1 ? "🌱" : items[plot.crop.item].icon
          }}</span><span v-else class="empty-plot">+</span
        ><b v-if="plot.crop && ready(plot.crop)" class="ready-mark">!</b
        ><i
          v-if="plot.crop"
          class="water-meter"
          :style="{ width: `${plot.crop.water}%` }"
        ></i>
        <span
          v-if="plot.crop && plot.crop.pollinated"
          class="pollination-mark"
          title="本轮已由蜜蜂授粉"
          >🌸</span
        >
        <span
          v-if="plot.crop && !plot.crop.pollinated && blooming(plot.crop)"
          class="bloom-mark"
          title="正在开花，等待蜜蜂"
          >✿</span
        >
      </button>
      <!-- 蜂箱覆盖在所属地块之上 -->
      <div
        v-for="hive in hives"
        :key="hive.id"
        class="hive-marker"
        :class="{ moving: movingId === hive.id }"
        :style="{
          left: `${plotPos(hive.plotId).x * CELL_W}%`,
          top: `${plotPos(hive.plotId).y * CELL_H}%`,
          width: `${CELL_W}%`,
          height: `${CELL_H}%`,
        }"
      >
        <span>📦</span><small>🐝</small>
      </div>
      <!-- 当天实际往返路径 -->
      <svg class="flight-layer" viewBox="0 0 100 46" preserveAspectRatio="none">
        <path
          v-for="path in flightPaths"
          :key="path.id"
          :d="path.d"
          class="flight-path"
        ></path>
      </svg>
    </div>
    <div v-if="placing || movingId" class="placement-tip">
      {{ movingId ? "点击空地移动蜂箱" : "点击一块空地放置蜂箱" }}
    </div>
    <div class="scene-sign">青禾农场<br /><small>EST. 2026</small></div>
    <span class="scene-flower">✿</span>
  </div>
</template>
