import { ref } from "vue";
import { createClock, createEngine } from "../features/clock";
import { createFields } from "../features/fields";
import { createBees } from "../features/bees";
import { createWarehouse } from "../features/warehouse";
import { createWorkshop } from "../features/workshop";
import { createOrders, salePrice } from "../features/orders";
import { items } from "../shared/catalog";
import { saveFarm, loadFarm } from "./persistence";
export function createWorkspace() {
  const notices = ref<string[]>(["欢迎回到青禾农场。先备一份胡萝卜订单吧。"]);
  const notice = (message: string) => {
    notices.value = [message, ...notices.value].slice(0, 12);
  };
  const clock = createClock();
  const warehouse = createWarehouse(() => clock.state.hour, notice);
  const orders = createOrders(warehouse, notice, clock.state.hour);
  // 先建 fields，再建 bees；bees 对 fields 的调用都发生在 tick/操作时，不存在初始化死区
  const fields = createFields(
    orders.spend,
    warehouse.add,
    notice,
    (id) => bees.occupied(id),
  );
  const bees = createBees(
    {
      pollinate: (plotId, hiveId, hour) =>
        fields.pollinate(plotId, hiveId, hour),
      addHoney: (n, hour) =>
        warehouse.add("honey", n, 1, hour, "蜂箱采收 · 田间花蜜"),
    },
    notice,
  );
  const workshop = createWorkshop(
    {
      ...warehouse,
      spend: orders.spend,
      buildFacility: (facility) => {
        if (facility === "hive") bees.stockHive();
      },
    },
    notice,
  );
  const engine = createEngine(
    () => clock.state.hour,
    clock.setHour,
    (t) => {
      warehouse.tick(t.to);
      // 先长作物（本小时末状态），蜜蜂再按开花状态出勤，顺序固定保证推进等价
      fields.tick(t);
      bees.tick(t, fields.state.plots);
      workshop.tick(t.to);
      orders.tick(t.to);
    },
  );
  const snapshot = () => ({
    clock: clock.snapshot(),
    warehouse: warehouse.snapshot(),
    fields: fields.snapshot(),
    bees: bees.snapshot(),
    workshop: workshop.snapshot(),
    orders: orders.snapshot(),
  });
  return {
    clock,
    warehouse,
    fields,
    bees,
    workshop,
    orders,
    engine,
    notices,
    sell(id: string) {
      const item = warehouse.sell(id, 1);
      if (item) {
        orders.earn(salePrice(items[item].value));
        notice(`出售${items[item].name} 1 份`);
      }
    },
    save() {
      try {
        saveFarm(snapshot());
        notice("已保存到本机");
      } catch {
        notice("保存失败，本机空间不足");
      }
    },
    load() {
      try {
        const data = loadFarm<ReturnType<typeof snapshot>>();
        if (!data) {
          notice("还没有本机存档");
          return;
        }
        clock.restore(data.clock);
        warehouse.restore(data.warehouse);
        fields.restore(data.fields);
        // 兼容养蜂功能上线前的旧存档
        if (data.bees) bees.restore(data.bees);
        workshop.restore(data.workshop);
        orders.restore(data.orders);
        notice("已恢复保存时刻");
      } catch {
        notice("存档损坏，无法恢复");
      }
    },
  };
}
