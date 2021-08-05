import { OrderSide } from "coinbase-pro-node"
import { Eve } from ".."
import { Base } from "../Base"
import { Order } from "../Order"
import { OrderSource } from "../types/OrderSource"
import { StrategyName } from "../types/StrategyName"

export abstract class Strategy<Name extends StrategyName> extends Base<Name>{
  protected createdAt: number
  protected state: 'active' | 'ended' = 'active'

  private orders: {
    [key: string]: Order
  } = {}

  constructor(eve: Eve, name: Name) {
    super(eve, name)
    this.createdAt = Math.floor(new Date().getTime() / 1000)
  }

  protected abstract cleanup(): void

  public stop() {
    if (this.state !== 'active') {
      throw new Error('can only stop active strategies')
    }
    this.state = 'ended'
    this.trigger('updated')
    this.cleanup()
  }

  protected getOpenOrders() {
    return Object.values(this.orders).filter(o => o.isState('created'))
  }

  protected getOpenOrder() {
    return this.getOpenOrders()[0]
  }

  private placeOrder(side: OrderSide, price: number, size: number): Order {
    const order = new Order(this.eve, side, price, size, OrderSource.Eve, this)

    // add the order locally
    this.addOrder(order)

    // add the order to the main Eve class
    this.eve.addOrder(order)

    return order
  }

  private addOrder(order: Order) {
    if (typeof this.orders[order.id] !== 'undefined') {
      throw new Error('order already exists')
    }
    // add the order to the list
    this.orders[order.id] = order

    this.trigger('updated')

    return order
  }

  protected buy(price: number, size: number) {
    return this.placeOrder(OrderSide.BUY, price, size)
  }

  protected sell(price: number, size: number) {
    return this.placeOrder(OrderSide.SELL, price, size)
  }

  public getSummaryData() {
    return {
      name: this.name,
      state: this.state,
      createdAt: this.createdAt,
    }
  }


}
