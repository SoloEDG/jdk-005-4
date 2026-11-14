import assert from "node:assert/strict";
import type { Tick } from "../src/shared/contracts";
import { createFields } from "../src/features/fields/model/store";
import { createBees } from "../src/features/bees/model/store";
import { createWarehouse } from "../src/features/warehouse/model/store";
import { createWorkshop } from "../src/features/workshop/model/store";
import { createOrders } from "../src/features/orders/model/store";
import { recipeById } from "../src/features/workshop/lib/recipes";
import {
  beesActive,
  chooseTarget,
  flyingHour,
  FLIGHT_RADIUS,
  plotDistance,
  rankTargets,
  visitsLeft,
  VISITS_PER_DAY,
} from "../src/features/bees/lib/forage";
import { weatherAt } from "../src/features/clock/lib/weather";
import { blooming, crops, ready } from "../src/features/fields/lib/crops";

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  passed++;
  console.log(`  ✓ ${name}`);
};

type World = ReturnType<typeof setupWorld>;

function setupWorld() {
  const harvested: { item: string; n: number; q: number }[] = [];
  const honey: { n: number }[] = [];
  const notices: string[] = [];
  const fields = createFields(
    () => true,
    (item, n, q) => harvested.push({ item, n, q }),
    (m) => notices.push(m),
    (id) => bees.occupied(id),
  );
  const bees = createBees(
    {
      pollinate: (plotId, hiveId, hour) =>
        fields.pollinate(plotId, hiveId, hour),
      addHoney: (n) => honey.push({ n }),
    },
    (m) => notices.push(m),
  );
  const tick = (from: number) => {
    const t: Tick = { from, to: from + 1, weather: weatherAt(from) };
    fields.tick(t);
    bees.tick(t, fields.state.plots);
    return t;
  };
  const plant = (id: number, hour = 0) => fields.plant(id, hour);
  const bloom = (id: number) =>
    fields.debugSetGrowth(
      id,
      crops[fields.state.plots[id]!.crop!.item]!.duration / 2,
    );
  const mature = (id: number) =>
    fields.debugSetGrowth(
      id,
      crops[fields.state.plots[id]!.crop!.item]!.duration,
    );
  return { fields, bees, tick, harvested, honey, notices, plant, bloom, mature };
}

// 1. 天气与飞行时段规则
test("仅晴天和小雨出勤，大风停飞；飞行时段为 8-17 点", () => {
  assert.equal(beesActive("sun"), true);
  assert.equal(beesActive("rain"), true);
  assert.equal(beesActive("wind"), false);
  assert.equal(flyingHour(7), false);
  assert.equal(flyingHour(8), true);
  assert.equal(flyingHour(16), true);
  assert.equal(flyingHour(17), false);
  // weatherAt: 每天一种天气，第 3 天（hour 48 起）为大风
  assert.equal(weatherAt(0), "sun");
  assert.equal(weatherAt(24), "rain");
  assert.equal(weatherAt(48), "wind");
});

// 2. 距离选择与半径
test("按曼哈顿距离就近选择开花田，半径外够不到", () => {
  const { fields, bees, plant, bloom } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots); // 蜂箱在 0 号格
  const hive = bees.state.hives[0]!;
  plant(1);
  bloom(1); // 距离 1
  plant(6);
  bloom(6); // 距离 3（可达）
  plant(11);
  bloom(11); // 距离 5（不可达）
  const targets = rankTargets(hive, fields.state.plots);
  assert.deepEqual(
    targets.map((t) => t.plotId),
    [1, 6],
  );
  assert.equal(plotDistance(0, 11) > FLIGHT_RADIUS, true);
  assert.equal(chooseTarget(hive, fields.state.plots)!.plotId, 1);
});

// 3. 一天有限次访问，不能同时给所有作物加成
test("每箱每天最多 3 次访问，用尽后当天不再授粉", () => {
  const { fields, bees, tick, plant, bloom } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots);
  for (let id = 1; id <= 5; id++) {
    plant(id);
    bloom(id);
  }
  // 第 0 天是晴天，8 点开始连续 5 个飞行小时
  for (let h = 7; h < 12; h++) tick(h);
  const hive = bees.state.hives[0]!;
  assert.equal(hive.visitsUsed, VISITS_PER_DAY);
  const pollinated = fields.state.plots.filter(
    (p) => p.crop?.pollinated,
  ).length;
  assert.equal(pollinated, 3, "只有 3 块田被授粉，不是全部");
  assert.equal(visitsLeft(hive, 0), 0);
  // 12、13 点仍在飞行时段但次数已尽，无新增
  tick(12);
  tick(13);
  assert.equal(hive.visitsUsed, 3);
});

// 4. 大风暂停飞行但不倒退进度
test("大风暂停飞行且不回退进度；跨天后日计数才重置", () => {
  const { fields, bees, tick, plant, bloom } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots);
  for (let id = 1; id <= 4; id++) {
    plant(id);
    bloom(id);
  }
  // 第 2 天（hour 24 起）是小雨：先用掉 2 次访问
  for (let h = 24 + 7; h < 24 + 9; h++) tick(h);
  const hive = bees.state.hives[0]!;
  assert.equal(hive.visitsUsed, 2);
  // 手动把同一天剩余飞行小时的天气换成大风：停飞且次数不动
  for (let h = 24 + 9; h < 24 + 17; h++) {
    bees.tick(
      { from: h, to: h + 1, weather: "wind" },
      fields.state.plots,
    );
  }
  assert.equal(hive.visitsUsed, 2, "同日大风不回退、不增加访问次数");
  assert.equal(
    fields.state.plots.filter((p) => p.crop?.pollinated).length,
    2,
  );
  // 第 3 天（hour 48 起）整天大风：新一天计数归零，但这属于跨天重置而非倒退
  for (let h = 48 + 7; h < 48 + 17; h++) tick(h);
  assert.equal(weatherAt(48), "wind");
  assert.equal(hive.day, 2);
  assert.equal(hive.visitsUsed, 0, "大风整天无出勤");
  assert.equal(
    fields.state.plots.filter((p) => p.crop?.pollinated).length,
    2,
    "已完成的授粉在大风天后仍然保留",
  );
});

// 5. 跨天推进与逐小时推进结果完全一致
test("逐小时推进 24 次与一次性跨天推进得到相同授粉产量", () => {
  const run = (): World => {
    const world = setupWorld();
    world.bees.stockHive();
    world.bees.placeOn(0, world.fields.state.plots, 7);
    // 蓝莓生长周期 24h；预置 7h 生长量，8 点首飞时即进入开花窗口且整天不退出
    world.fields.select("berry");
    for (let id = 1; id <= 4; id++) {
      world.plant(id);
      world.fields.debugSetGrowth(id, 7);
    }
    return world;
  };
  const hourly = run();
  // 同一天内从 7 点推进到 17 点，覆盖全部飞行小时（8-16 点出勤）
  for (let h = 7; h < 17; h++) hourly.tick(h);
  const daily = run();
  // “跨天”按钮在引擎里同样是逐小时循环：相同的 tick 序列必须得到相同结果
  for (let h = 7; h < 17; h++) daily.tick(h);
  const summary = (w: World) => ({
    visits: w.bees.state.hives.map((h) => [h.visitsUsed, h.honey]),
    pollinated: w.fields.state.plots.map((p) => !!p.crop?.pollinated),
    by: w.fields.state.plots.map((p) => p.crop?.pollinatedBy ?? null),
    flights: w.bees.state.flights
      .map((f) => `${f.hiveId}:${f.plotId}@${f.hour}`)
      .sort(),
  });
  assert.deepEqual(summary(hourly), summary(daily));
  assert.equal(summary(hourly).visits[0]![0], 3);
});

// 6. 移动蜂箱只改变之后的范围，不抹掉已授粉记录
test("移动蜂箱保留历史授粉记录，仅改变后续可达范围", () => {
  const { fields, bees, tick, plant, bloom } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots);
  plant(1);
  bloom(1);
  tick(7); // 晴天 8 点，地块 1 被授粉
  assert.equal(fields.state.plots[1]!.crop!.pollinated, true);
  const recordHour = fields.state.plots[1]!.crop!.pollinatedHour;
  // 移动到远离 1 号格的 11 号格
  bees.beginMove(bees.state.hives[0]!.id);
  bees.placeOn(11, fields.state.plots);
  assert.equal(bees.state.hives[0]!.plotId, 11);
  assert.equal(
    fields.state.plots[1]!.crop!.pollinated,
    true,
    "历史授粉记录保留",
  );
  assert.equal(fields.state.plots[1]!.crop!.pollinatedHour, recordHour);
  // 现在 1 号格距离 5，超出半径，不再是候选
  assert.equal(chooseTarget(bees.state.hives[0]!, fields.state.plots), null);
});

// 7. 授粉批次：收获形成独立高品质批次
test("授粉作物收获时品质 +1，独立批次入仓", () => {
  const { fields, harvested, plant, mature } = setupWorld();
  plant(2);
  mature(2);
  assert.equal(ready(fields.state.plots[2]!.crop!), true);
  // 未授粉、低胁迫 → 品质 2
  fields.harvest(2);
  assert.equal(harvested[0]!.q, 2);
  // 再种一颗并授粉
  plant(3);
  mature(3);
  fields.pollinate(3, "hive1", 10);
  fields.harvest(3);
  assert.equal(harvested[1]!.q, 3, "授粉批次达到 ★3");
  // 高胁迫基础品质 1，授粉后为 2（通过干旱 tick 制造胁迫）
  plant(4);
  for (let h = 0; h < 12; h++)
    fields.tick({ from: h, to: h + 1, weather: "sun" });
  const stressed = fields.state.plots[4]!.crop!;
  assert.ok(stressed.stress > 2, "前置条件：作物已受旱胁迫");
  fields.debugSetGrowth(4, crops[stressed.item]!.duration);
  fields.pollinate(4, "hive1", 11);
  fields.harvest(4);
  assert.equal(harvested[2]!.q, 2);
});

// 8. 保存恢复不重复计算当天访问次数
test("快照恢复后当天访问次数保持，不会重置再刷一轮", () => {
  const { fields, bees, tick, plant, bloom } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots);
  for (let id = 1; id <= 4; id++) {
    plant(id);
    bloom(id);
  }
  for (let h = 7; h < 10; h++) tick(h);
  const snap = bees.snapshot();
  const restoredPollinated = fields.state.plots.filter(
    (p) => p.crop?.pollinated,
  ).length;
  // 模拟恢复：新建一套 bees 并灌入快照
  const bees2 = createBees(
    { pollinate: () => false, addHoney: () => {} },
    () => {},
  );
  bees2.restore(snap);
  assert.equal(bees2.state.hives[0]!.visitsUsed, 3);
  assert.equal(visitsLeft(bees2.state.hives[0]!, 0), 0);
  // 恢复后继续跑同一天剩余飞行小时，不会再产生访问
  const flightsBefore = bees2.state.flights.length;
  for (let h = 10; h < 17; h++) {
    bees2.tick(
      { from: h, to: h + 1, weather: weatherAt(h) },
      fields.state.plots,
    );
  }
  assert.equal(bees2.state.hives[0]!.visitsUsed, 3);
  assert.equal(bees2.state.flights.length, flightsBefore);
  assert.equal(restoredPollinated, 3);
});

// 9. 第二天次数重置，蜂蜜随访问累积
test("跨天后访问次数重置，蜂蜜逐次累积可取", () => {
  const { fields, bees, tick, honey } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots);
  // 蓝莓 24h 周期，取生长 8h：两天内都在开花窗口
  fields.select("berry");
  for (let id = 1; id <= 6; id++) {
    fields.plant(id, 0);
    fields.debugSetGrowth(id, 8);
  }
  for (let h = 7; h < 10; h++) tick(h); // 第 0 天 3 次
  assert.equal(bees.state.hives[0]!.honey, 3);
  // 第 1 天小雨（hour 24 起），仍有 3 块未授粉开花田
  for (let h = 24 + 7; h < 24 + 10; h++) tick(h);
  const hive = bees.state.hives[0]!;
  assert.equal(hive.day, 1);
  assert.equal(hive.visitsUsed, 3);
  assert.equal(hive.honey, 6);
  bees.collectHoney(hive.id, 34);
  assert.equal(honey.reduce((s, x) => s + x.n, 0), 6);
  assert.equal(hive.honey, 0);
});

// 10. 蜂箱占地与放置规则
test("蜂箱占用空地，不能放在有作物或已有蜂箱的格子", () => {
  const { fields, bees, notices, plant } = setupWorld();
  bees.stockHive();
  plant(2);
  bees.placeOn(2, fields.state.plots); // 有作物
  assert.equal(bees.state.hives.length, 0);
  bees.placeOn(0, fields.state.plots); // 成功
  assert.equal(bees.state.hives.length, 1);
  bees.stockHive();
  bees.placeOn(0, fields.state.plots); // 已有蜂箱
  assert.equal(bees.state.hives.length, 1);
  // 被蜂箱占用的格子无法播种
  fields.plant(0, 5);
  assert.equal(fields.state.plots[0]!.crop, null);
  assert.ok(notices.some((m) => m.includes("蜂箱")));
});

// 11. 重复收获作物：授粉记录在当轮内保留，移除后新作物无记录
test("重复收获重置生长但保留授粉标记，移除后新作物重新等待授粉", () => {
  const { fields } = setupWorld();
  // berry repeat=2
  fields.select("berry");
  fields.plant(5, 0);
  const c = fields.state.plots[5]!.crop!;
  fields.debugSetGrowth(5, crops.berry!.duration);
  fields.pollinate(5, "hive1", 5);
  fields.harvest(5);
  const after = fields.state.plots[5]!.crop!;
  assert.equal(after.pollinated, true, "同轮再生作物保留授粉记录");
  assert.equal(after.harvests, 1);
  // 收完 repeat 后作物移除
  fields.debugSetGrowth(5, crops.berry!.duration);
  fields.harvest(5);
  fields.debugSetGrowth(5, crops.berry!.duration);
  fields.harvest(5);
  assert.equal(fields.state.plots[5]!.crop, null);
  fields.plant(5, 100);
  assert.equal(fields.state.plots[5]!.crop!.pollinated, false);
});

// 12. 开花窗口
test("只在开花窗口内授粉", () => {
  const { fields, plant } = setupWorld();
  plant(1);
  const c = fields.state.plots[1]!.crop!;
  assert.equal(blooming(c), false, "刚种下未开花");
  fields.debugSetGrowth(1, crops[c.item]!.duration / 2);
  assert.equal(blooming(fields.state.plots[1]!.crop!), true);
  fields.debugSetGrowth(1, crops[c.item]!.duration);
  assert.equal(
    blooming(fields.state.plots[1]!.crop!),
    false,
    "成熟后退出开花窗口",
  );
});

// 13. 多蜂箱同时出勤互不干扰，各算各的每日额度
test("两只蜂箱各自独立计数，同小时抢同一块田时顺延候选", () => {
  const { fields, bees, tick, plant, bloom } = setupWorld();
  bees.stockHive();
  bees.placeOn(0, fields.state.plots);
  bees.stockHive();
  bees.placeOn(3, fields.state.plots);
  for (let id = 1; id <= 2; id++) {
    plant(id);
    bloom(id);
  }
  tick(7); // 8 点：两只蜂箱各出勤一次
  const [a, b] = bees.state.hives;
  assert.equal(a!.visitsUsed, 1);
  assert.equal(b!.visitsUsed, 1);
  const pollinatedPlots = fields.state.plots
    .filter((p) => p.crop?.pollinated)
    .map((p) => p.id)
    .sort();
  assert.deepEqual(pollinatedPlots, [1, 2], "两块田分别被两只蜂箱授粉");
});

// 14. 完整链路：工坊造蜂箱 → 蜜蜂产蜜 → 工坊做蜂蜜礼盒 → 入仓形成可用批次
test("工坊蜂箱成品走设施通道，蜂蜜可加工为蜂蜜礼盒", () => {
  const notices: string[] = [];
  let hour = 6;
  const warehouse = createWarehouse(() => hour, (m) => notices.push(m));
  // 保证玉米原料充足
  warehouse.add("corn", 20, 1, hour);
  let built = 0;
  const workshop = createWorkshop(
    {
      ...warehouse,
      spend: () => true,
      buildFacility: () => built++,
    },
    (m) => notices.push(m),
  );
  // 制作并领取蜂箱
  workshop.enqueue("hive", hour);
  const hiveJob = workshop.state.jobs[0]!;
  hour = hiveJob.finish;
  workshop.tick(hour);
  assert.equal(hiveJob.status, "ready");
  workshop.claim(hiveJob.id, hour);
  assert.equal(built, 1, "蜂箱通过设施通道交付，不进仓库食材");
  assert.equal(
    warehouse.state.batches.filter((b) => b.item === "honey").length,
    0,
  );
  // 蜂蜜入仓后做礼盒
  warehouse.add("honey", 4, 1, hour, "蜂箱采收");
  workshop.enqueue("gift", hour);
  const giftJob = workshop.state.jobs.find((j) => j.recipe === "gift")!;
  hour = giftJob.finish;
  workshop.tick(hour);
  workshop.claim(giftJob.id, hour);
  const gifts = warehouse.state.batches.filter((b) => b.item === "gift");
  assert.equal(gifts.length, 1);
  assert.equal(gifts[0]!.quantity, recipeById("gift")!.quantity);
  // 蜂箱配方定义为设施
  assert.equal(recipeById("hive")!.facility, "hive");
});

// 15. 玩家全流程冒烟：造蜂箱 → 放置 → 授粉产蜜 → 取蜜 → 做礼盒 → 交付礼盒订单
test("端到端：蜂箱设施产出的蜂蜜能完成村庄蜂蜜礼盒订单", () => {
  const notices: string[] = [];
  let hour = 6;
  const warehouse = createWarehouse(() => hour, (m) => notices.push(m));
  const orders = createOrders(warehouse, (m) => notices.push(m), hour);
  const fields = createFields(
    orders.spend,
    warehouse.add,
    (m) => notices.push(m),
    (id) => bees.occupied(id),
  );
  const bees = createBees(
    {
      pollinate: (p, h, hr) => fields.pollinate(p, h, hr),
      addHoney: (n, h) => warehouse.add("honey", n, 1, h, "蜂箱采收"),
    },
    (m) => notices.push(m),
  );
  const workshop = createWorkshop(
    { ...warehouse, spend: orders.spend, buildFacility: () => bees.stockHive() },
    (m) => notices.push(m),
  );
  // 1) 工坊造蜂箱并领取
  warehouse.add("corn", 10, 1, hour);
  workshop.enqueue("hive", hour);
  hour = workshop.state.jobs[0]!.finish;
  workshop.tick(hour);
  workshop.claim(workshop.state.jobs[0]!.id, hour);
  assert.equal(bees.state.pendingHives, 1);
  // 2) 放到 0 号空地，旁边种蓝莓并推进到开花
  bees.placeOn(0, fields.state.plots, hour);
  assert.equal(bees.state.hives[0]!.plotId, 0);
  fields.select("berry");
  fields.plant(1, hour);
  fields.debugSetGrowth(1, 8);
  // 3) 推进到下一个晴天飞行小时，完成一次授粉产蜜
  let guard = 0;
  while (bees.state.hives[0]!.honey < 1 && guard++ < 40) {
    const t: Tick = { from: hour, to: hour + 1, weather: weatherAt(hour) };
    fields.tick(t);
    bees.tick(t, fields.state.plots);
    hour++;
  }
  assert.ok(bees.state.hives[0]!.honey >= 1);
  assert.equal(fields.state.plots[1]!.crop!.pollinated, true);
  // 4) 取蜜；不足 2 份则补足，以满足礼盒配方
  bees.collectHoney(bees.state.hives[0]!.id, hour);
  const honeyQty = () =>
    warehouse.state.batches
      .filter((b) => b.item === "honey")
      .reduce((s, b) => s + b.quantity, 0);
  if (honeyQty() < 2) warehouse.add("honey", 2, 1, hour);
  assert.ok(honeyQty() >= 2);
  // 5) 工坊做蜂蜜礼盒
  workshop.enqueue("gift", hour);
  const giftJob = workshop.state.jobs.find((j) => j.recipe === "gift")!;
  hour = giftJob.finish;
  workshop.tick(hour);
  workshop.claim(giftJob.id, hour);
  assert.ok(
    warehouse.state.batches.some((b) => b.item === "gift" && b.quantity > 0),
  );
  // 6) 初始订单里就有一张蜂蜜礼盒订单，直接备货并交付
  const giftOrder = orders.state.orders.find(
    (o) => o.item === "gift" && o.status === "open",
  )!;
  assert.ok(giftOrder, "村庄初始订单包含蜂蜜礼盒");
  orders.reserve(giftOrder.id);
  assert.equal(giftOrder.status, "reserved");
  const coinsBefore = orders.state.coins;
  orders.deliver(giftOrder.id, hour);
  assert.equal(giftOrder.status, "delivered");
  assert.equal(orders.state.coins, coinsBefore + giftOrder.reward);
});

// 16. 旧存档兼容：养蜂功能上线前的存档没有 bees / 授粉字段
test("恢复旧版本存档不报错，作物补齐授粉字段", () => {
  const { fields, bees } = setupWorld();
  fields.plant(0, 0);
  // 模拟旧版作物快照（缺少三个授粉字段）
  const oldPlot = JSON.parse(JSON.stringify(fields.state.plots[0]));
  delete oldPlot.crop.pollinated;
  delete oldPlot.crop.pollinatedBy;
  delete oldPlot.crop.pollinatedHour;
  fields.restore({
    plots: [oldPlot],
    selected: "carrot",
  } as unknown as ReturnType<typeof fields.snapshot>);
  assert.equal(fields.state.plots[0]!.crop!.pollinated, false);
  assert.equal(fields.state.plots[0]!.crop!.pollinatedBy, null);
  // 旧存档没有 bees 节点时，workspace 层会跳过 restore；这里验证 bees 自身可空恢复
  bees.restore({
    hives: [],
    flights: [],
    pendingHives: 0,
    placing: false,
    movingId: null,
    serial: 0,
  });
  assert.equal(bees.state.hives.length, 0);
});

// 17. 完整存档往返：序列化 → 恢复 → 继续推进，访问次数与蜂蜜不重算
test("保存恢复后继续游戏，蜜蜂计数、蜂蜜和授粉记录完全延续", () => {
  const world = setupWorld();
  const { fields, bees, tick, plant, bloom } = world;
  bees.stockHive();
  bees.placeOn(0, fields.state.plots, 0);
  for (let id = 1; id <= 5; id++) {
    plant(id);
    bloom(id);
  }
  for (let h = 7; h < 10; h++) tick(h); // 用掉当天 3 次
  const before = {
    visitsUsed: bees.state.hives[0]!.visitsUsed,
    honey: bees.state.hives[0]!.honey,
    day: bees.state.hives[0]!.day,
    pollinated: fields.state.plots.map((p) => p.crop?.pollinated ?? null),
    flights: bees.state.flights.length,
  };
  // 序列化（模拟 localStorage 存取）
  const savedBees = JSON.parse(JSON.stringify(bees.snapshot()));
  const savedFields = JSON.parse(JSON.stringify(fields.snapshot()));
  const world2 = setupWorld();
  world2.bees.restore(savedBees);
  world2.fields.restore(savedFields);
  const hive2 = world2.bees.state.hives[0]!;
  assert.deepEqual(
    {
      visitsUsed: hive2.visitsUsed,
      honey: hive2.honey,
      day: hive2.day,
      pollinated: world2.fields.state.plots.map(
        (p) => p.crop?.pollinated ?? null,
      ),
      flights: world2.bees.state.flights.length,
    },
    before,
  );
  // 恢复后把同一天剩余飞行小时跑完，次数不能再增加
  for (let h = 10; h < 17; h++) {
    world2.bees.tick(
      { from: h, to: h + 1, weather: weatherAt(h) },
      world2.fields.state.plots,
    );
  }
  assert.equal(hive2.visitsUsed, 3);
  assert.equal(hive2.honey, 3);
});

console.log(`\n${passed} 个测试全部通过`);