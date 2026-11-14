import type { Item, Order } from "../../../shared/contracts";
export function initialOrders(hour: number): Order[] {
  return [
    {
      id: "o1",
      item: "carrot",
      quantity: 5,
      reward: 70,
      minQuality: 1,
      deadline: hour + 36,
      status: "open",
    },
    {
      id: "o2",
      item: "jam",
      quantity: 2,
      reward: 120,
      minQuality: 2,
      deadline: hour + 48,
      status: "open",
    },
    {
      id: "o3",
      item: "flour",
      quantity: 3,
      reward: 100,
      minQuality: 1,
      deadline: hour + 60,
      status: "open",
    },
    {
      id: "o4",
      item: "gift",
      quantity: 1,
      reward: 150,
      minQuality: 1,
      deadline: hour + 72,
      status: "open",
    },
  ];
}
const orderPool: ReadonlyArray<{
  item: Item;
  quantity: number;
  minQuality: number;
}> = [
  { item: "corn", quantity: 4, minQuality: 1 },
  { item: "berry", quantity: 3, minQuality: 2 },
  { item: "gift", quantity: 1, minQuality: 1 },
  { item: "honey", quantity: 2, minQuality: 1 },
  { item: "carrot", quantity: 6, minQuality: 3 },
];
export function nextOrder(serial: number, hour: number): Order {
  const pick = orderPool[serial % orderPool.length]!;
  return {
    id: `o${serial}`,
    item: pick.item,
    quantity: pick.quantity,
    reward: 90 + serial * 3,
    minQuality: pick.minQuality,
    deadline: hour + 48,
    status: "open",
  };
}
