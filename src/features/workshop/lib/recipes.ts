import type { Item } from "../../../shared/contracts";
export interface Recipe {
  id: string;
  name: string;
  input: Item;
  amount: number;
  output: Item;
  quantity: number;
  duration: number;
  cost: number;
  /** 设施类配方领取时不进仓库，而是创建可放置的设施 */
  facility?: "hive";
}
export const recipes: Recipe[] = [
  {
    id: "jam",
    name: "莓果酱",
    input: "berry",
    amount: 3,
    output: "jam",
    quantity: 2,
    duration: 8,
    cost: 4,
  },
  {
    id: "flour",
    name: "玉米粉",
    input: "corn",
    amount: 4,
    output: "flour",
    quantity: 3,
    duration: 6,
    cost: 3,
  },
  {
    id: "hive",
    name: "蜂箱",
    input: "corn",
    amount: 6,
    output: "honey",
    quantity: 0,
    duration: 6,
    cost: 25,
    facility: "hive",
  },
  {
    id: "gift",
    name: "蜂蜜礼盒",
    input: "honey",
    amount: 2,
    output: "gift",
    quantity: 1,
    duration: 4,
    cost: 6,
  },
];
export const recipeById = (id: string) => recipes.find((r) => r.id === id);
