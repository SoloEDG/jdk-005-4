import type { Hive, Plot, Weather } from "../../../shared/contracts";
import { blooming } from "../../fields/lib/crops";

/** 每天每箱蜂最多出勤访问次数 */
export const VISITS_PER_DAY = 3;
/** 蜂箱到开花田块的最大曼哈顿距离（地块网格距离） */
export const FLIGHT_RADIUS = 3;
/** 蜂群每天的飞行时段：8:00 起飞，17:00 归巢（只在整点小时结算） */
export const FLY_START = 8;
export const FLY_END = 17;
/** 场景网格列数，用于把地块 id 换算成坐标 */
export const PLOT_COLS = 4;

export const plotPos = (id: number) => ({
  x: id % PLOT_COLS,
  y: Math.floor(id / PLOT_COLS),
});

/** 蜂箱到田块的实际往返路程（去程+回程） */
export function plotDistance(hivePlot: number, plotId: number) {
  const a = plotPos(hivePlot),
    b = plotPos(plotId);
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function roundTrip(hivePlot: number, plotId: number) {
  return plotDistance(hivePlot, plotId) * 2;
}

/** 晴天与小雨间歇出勤，大风暂停飞行 */
export function beesActive(weather: Weather) {
  return weather === "sun" || weather === "rain";
}

/** 当前整点是否处于飞行时段（8 点至 16 点的整点都会出勤） */
export function flyingHour(hour: number) {
  const h = hour % 24;
  return h >= FLY_START && h < FLY_END;
}

export interface ForageTarget {
  plotId: number;
  distance: number;
}

/**
 * 按距离列出已开花、且本轮尚未授粉的候选田块；
 * 同距离按地块编号稳定排序，保证逐小时推进与一次跨天推进结果完全一致。
 */
export function rankTargets(
  hive: Hive,
  plots: readonly Readonly<Plot>[],
): ForageTarget[] {
  const candidates: ForageTarget[] = [];
  for (const plot of plots) {
    const crop = plot.crop;
    if (!crop || crop.pollinated || !blooming(crop)) continue;
    const distance = plotDistance(hive.plotId, plot.id);
    if (distance <= FLIGHT_RADIUS && distance > 0)
      candidates.push({ plotId: plot.id, distance });
  }
  return candidates.sort((a, b) =>
    a.distance === b.distance ? a.plotId - b.plotId : a.distance - b.distance,
  );
}

/** 最近的可授粉田块 */
export function chooseTarget(
  hive: Hive,
  plots: readonly Readonly<Plot>[],
): ForageTarget | null {
  return rankTargets(hive, plots)[0] ?? null;
}

/** 当日剩余访问次数；大风天也不会回退或重置它 */
export function visitsLeft(hive: Hive, day: number) {
  return hive.day === day ? VISITS_PER_DAY - hive.visitsUsed : VISITS_PER_DAY;
}
