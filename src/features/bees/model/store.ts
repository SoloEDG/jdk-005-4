import { reactive, readonly } from "vue";
import type {
  Flight,
  Hive,
  Notice,
  Plot,
  Tick,
} from "../../../shared/contracts";
import {
  beesActive,
  flyingHour,
  rankTargets,
  visitsLeft,
  VISITS_PER_DAY,
} from "../lib/forage";

interface Ports {
  pollinate: (plotId: number, hiveId: string, hour: number) => boolean;
  addHoney: (n: number, hour: number) => void;
}

export function createBees(ports: Ports, notice: Notice) {
  const state = reactive({
    hives: [] as Hive[],
    flights: [] as Flight[],
    /** 工坊已造出、等待放置到空地的蜂箱数量 */
    pendingHives: 0,
    placing: false,
    movingId: null as string | null,
    serial: 0,
  });

  const occupied = (plotId: number) =>
    state.hives.some((h) => h.plotId === plotId);

  return {
    state: readonly(state),
    occupied,
    /** 工坊交付蜂箱成品时调用：先入库为“待放置”，再由玩家选空地 */
    stockHive() {
      state.pendingHives++;
      state.placing = true;
      notice("蜂箱已造好，请选一块空地放置");
    },
    beginPlace() {
      if (state.pendingHives <= 0) {
        notice("先在工坊制作蜂箱");
        return;
      }
      state.placing = true;
      state.movingId = null;
    },
    beginMove(id: string) {
      if (!state.hives.some((h) => h.id === id)) return;
      state.movingId = id;
      state.placing = false;
      notice("选择新的空地，移动只改变之后的飞行范围");
    },
    cancelPlacement() {
      state.placing = false;
      state.movingId = null;
    },
    /** 在地块上放置或移动蜂箱；已有作物或已有蜂箱的格子不可用 */
    placeOn(plotId: number, plots: readonly Readonly<Plot>[], hour = 0) {
      const plot = plots[plotId];
      if (!plot || plot.crop || occupied(plotId)) {
        notice("蜂箱只能放在没有作物的空地");
        return;
      }
      if (state.movingId) {
        const hive = state.hives.find((h) => h.id === state.movingId);
        if (hive) hive.plotId = plotId;
        notice("蜂箱已移动，已完成的授粉记录保持不变");
        state.movingId = null;
        return;
      }
      if (!state.placing || state.pendingHives <= 0) return;
      state.hives.push({
        id: `hive${++state.serial}`,
        plotId,
        // 记录放置时刻所属的天，避免当天首个 tick 误判为跨天而重置计数
        day: Math.floor(hour / 24),
        visitsUsed: 0,
        honey: 0,
      });
      state.pendingHives--;
      if (state.pendingHives <= 0) state.placing = false;
      notice("蜂箱安家完成，蜜蜂会在晴雨日的白天出勤");
    },
    collectHoney(id: string, hour: number) {
      const hive = state.hives.find((h) => h.id === id);
      if (!hive || hive.honey <= 0) return;
      const n = hive.honey;
      ports.addHoney(n, hour);
      hive.honey = 0;
      notice(`收取蜂蜜 ${n} 份，已入仓`);
    },
    /**
     * 每个整点小时结算一次：
     * 大风天 / 非飞行时段 / 当日次数用尽都跳过，但不回退任何进度；
     * 纯函数式决策，因此逐小时推进与一次跨天推进得到相同结果。
     */
    tick(t: Tick, plots: readonly Readonly<Plot>[]) {
      const day = Math.floor(t.to / 24);
      // 场景只展示当天的实际飞行路径，跨天清掉旧轨迹（授粉记录在作物上，不受影响）
      state.flights = state.flights.filter(
        (f) => Math.floor(f.hour / 24) === day,
      );
      for (const hive of state.hives) {
        if (hive.day !== day) {
          hive.day = day;
          hive.visitsUsed = 0;
        }
        if (!flyingHour(t.to) || !beesActive(t.weather)) continue;
        if (visitsLeft(hive, day) <= 0) continue;
        // 同一时刻多个蜂箱可能看中同一块田，被抢先就顺延到下一个候选
        let visited = false;
        for (const target of rankTargets(hive, plots)) {
          if (!ports.pollinate(target.plotId, hive.id, t.to)) continue;
          hive.visitsUsed++;
          hive.honey++;
          state.flights.push({
            id: `f${++state.serial}`,
            hiveId: hive.id,
            plotId: target.plotId,
            hour: t.to,
          });
          visited = true;
          break;
        }
        if (!visited) continue;
      }
    },
    visitsLeft,
    VISITS_PER_DAY,
    snapshot: () => JSON.parse(JSON.stringify(state)) as typeof state,
    restore: (data: typeof state) => {
      Object.assign(state, data);
    },
  };
}
