import { OrderSide } from "coinbase-pro-node";

export type Tick = {
  price: number
  size: number
  side: OrderSide
}
