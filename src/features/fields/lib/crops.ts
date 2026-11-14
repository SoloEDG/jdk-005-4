import type { Item, Weather, Crop } from "../../../shared/contracts";
export const crops: Partial<
  Record<
    Item,
    { cost: number; duration: number; yield: number; repeat: number }
  >
> = {
  carrot: { cost: 5, duration: 12, yield: 3, repeat: 0 },
  corn: { cost: 9, duration: 18, yield: 4, repeat: 1 },
  berry: { cost: 12, duration: 24, yield: 3, repeat: 2 },
};
export function grow(crop: Crop, weather: Weather, hours: number) {
  const water = Math.max(
    0,
    Math.min(100, crop.water + (weather === "rain" ? 15 : -8) * hours),
  );
  const rate = water > 0 ? (weather === "wind" ? 0.6 : 1) : 0.15;
  return {
    ...crop,
    water,
    stress: crop.stress + (water === 0 ? hours : 0),
    growth: crop.growth + hours * rate,
  };
}
export function ready(crop: Crop) {
  return crop.growth >= (crops[crop.item]?.duration ?? Infinity);
}
/** 开花：进入生长周期后三分之一即开花，直到成熟收获前都可授粉 */
export function blooming(crop: Crop) {
  const duration = crops[crop.item]?.duration ?? Infinity;
  return crop.growth >= duration / 3 && crop.growth < duration;
}
/** 授粉记录写到本轮作物上，后续重复收获不会抹掉它，直到作物被移除 */
export function markPollinated(
  crop: Crop,
  hiveId: string,
  hour: number,
): Crop {
  if (crop.pollinated) return crop;
  return {
    ...crop,
    pollinated: true,
    pollinatedBy: hiveId,
    pollinatedHour: hour,
  };
}
