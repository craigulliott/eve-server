import { Base } from "./Base"
import { Order } from "./Order"
import { FillSource } from "./types/FillSource"

export class Fill extends Base<'fill'>{
  public readonly order: Order
  public readonly size: number
  public readonly price: number
  public readonly totalPrice: number
  public readonly fee: number
  public readonly createdAt: number
  public readonly source: FillSource

  constructor(order: Order, size: number, price: number, totalPrice: number, fee: number, createdAt: number, source: FillSource) {
    super(order.eve, 'fill')
    this.order = order
    this.size = size
    this.price = price
    this.totalPrice = totalPrice
    this.fee = fee
    this.createdAt = createdAt
    this.source = source
  }

  public getSummaryData() {
    return {
      orderId: this.order.id,
      size: this.size,
      price: this.price,
      totalPrice: this.totalPrice,
      fee: this.fee,
      createdAt: this.createdAt,
      source: this.source,
    }
  }
}
