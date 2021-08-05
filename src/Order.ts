import { OrderSide, OrderType, PostOnlyLimitOrder, TimeInForce } from "coinbase-pro-node"
import { client } from "./client"
import { Base } from "./Base"
import { Eve } from "."
import { OrderState } from "./types/OrderState"
import { Strategy } from "./Strategies/Strategy"
import { StrategyName } from "./types/StrategyName"
import { Fill } from "./Fill"
import { FillSource } from "./types/FillSource"
import { OrderSource } from "./types/OrderSource"
import { PRODUCT_ID } from "./Product"

export class Order extends Base<'order'> {
  private readonly side: OrderSide
  private price: number
  private size: number
  private createdAt: number
  private createFailedMessage?: string
  // which strategy created this order (optional, as some orders are just placed by hand)
  private readonly strategy?: Strategy<StrategyName>
  // is set once coinbase receives the order
  private coinbaseOrderId?: string
  private state: OrderState
  private fills: Fill[] = []
  public readonly source: OrderSource

  constructor(eve: Eve, side: OrderSide, price: number, size: number, source: OrderSource, strategy?: Strategy<StrategyName>, coinbaseOrderId?: string, createdAt: number = Math.floor(new Date().getTime() / 1000)) {
    super(eve, 'order')
    this.side = side
    this.price = price
    this.size = size
    this.source = source
    this.state = 'new'
    this.createdAt = createdAt
    this.strategy = strategy
    // only set when backfilling
    this.coinbaseOrderId = coinbaseOrderId
    switch (source) {

      // if we are back filling orders, then mark it as filled
      case OrderSource.Backfill:
        this.state = 'filled'
        break;

      // otherwise if the source was eve, then place the order
      case OrderSource.Eve:
        this.placeOrder()
        break;

      case OrderSource.Api:
        this.state = 'created'
        break;

      case OrderSource.Feed:
        break;

      default:
    }
  }

  public setCreated(coinbaseOrderId:string) {
    this.coinbaseOrderId = coinbaseOrderId
    this.setState('created')
    this.log(`created with source ${this.source} and coinbase_id: ${this.coinbaseOrderId}`)
  }

  public getPrice() {
    return this.price
  }

  public getSize() {
    return this.size
  }

  public getSide() {
    return this.side
  }

  public getOrderNumber() {
    return this.coinbaseOrderId
  }

  public selling() {
    return this.side === OrderSide.SELL
  }

  public buying() {
    return this.side === OrderSide.BUY
  }

  public isState(state: OrderState) {
    return this.state === state
  }

  public setState(state: OrderState) {
    switch (`${this.state}-${state}`) {
      case 'new-creating':
      case 'new-created':
      // when recreating because of failure to create due to price movement
      case 'creating-new':
      case 'creating-created':
      case 'creating-createFailed':
      case 'created-filled':
      case 'created-canceling':
      case 'canceling-canceled':
      // when it gets filled before we're able to cancel it
      case 'canceling-filled':
      // when the cancel comes through the message bus (when the cancel was not called on this specific order, from within this class)
      case 'created-canceled':
        this.log(`is now in state ${state} (from state ${this.state})`)
        this.state = state
        this.trigger(state)
        this.trigger('updated')
        break;

      default:
        throw new Error(`can not move order from ${this.state} to ${state}`)
    }
  }

  public cancel() {
    if (this.state !== 'created') {
      throw new Error(`can not cancel an order which is in state ${this.state}`)
    }

    this.setState('canceling')

    if (typeof this.coinbaseOrderId === 'undefined') {
      throw new Error('no order number, this should be impossible here')
    }

    client.rest.order.cancelOrder(this.coinbaseOrderId).then(() => {
      // do nothing here, the cancel will be picked up by the Feed
    }).catch((e) => {
      if (this.state === 'filled') {
        console.error(`was filled before it could be cancelled`)
      } else {
        console.error(`could not be cancelled`, e)
      }
    })

  }

  public placeOrder() {
    if (this.state !== 'new') {
      throw new Error(`can not cancel an order which is in state ${this.state}`)
    }
    if (this.size < 0.001) {
      throw new Error('size is too small. Minimum size is 0.00100000')
    }

    this.setState('creating')

    const priceStr = this.side === OrderSide.BUY ? (Math.floor(this.price * 10) / 10).toString() : (Math.ceil(this.price * 10) / 10).toString()
    const orderPayload: PostOnlyLimitOrder = {
      client_oid: this.id,
      type: OrderType.LIMIT,
      side: this.side,
      product_id: PRODUCT_ID,
      price: priceStr,
      size: (Math.floor(this.size * 10) / 10).toString(),
      post_only: true,
      time_in_force: TimeInForce.GOOD_TILL_CANCELED
    }

    this.log(`creating`, orderPayload)

    client.rest.order.placeOrder(orderPayload).then((o) =>{
      // do nothing here, the cancel will be picked up by the Feed
    }).catch((e) => {
      // if error due to post only mode, then retry (assuming the price has been updated)
      if (e.response.data.message === 'Post only mode') {
        this.setState('new')
        this.price = this.eve.product.nextPrice(this.side)
        this.log(`blocked by Post only mode, trying again at ${this.price}`)
        this.placeOrder()
      }
      else {
        console.error(`could not be placed`, e.response.data)
        this.createFailedMessage = e.response.data.message
        this.setState('createFailed')
      }
    })
  }

  public addFill(size: number, price: number, totalPrice: number, fee: number, createdAt: number, source: FillSource) {
    this.fills.push(new Fill(this, size, price, totalPrice, fee, createdAt, source))
    if (this.source === OrderSource.Backfill) {
      this.size += size
    }
    this.trigger('updated')
  }

  public getFilledSize() {
    return this.fills.reduce((accumulator, currentValue) => accumulator + currentValue.size, 0)
  }

  public getFilledPercent() {
    return (this.getFilledSize() / this.size) * 100
  }

  public getSummaryData() {
    return {
      side: this.side,
      price: this.price,
      size: this.size,
      source: this.source,
      filledSize: this.getFilledSize(),
      coinbaseOrderId: this.coinbaseOrderId,
      filledPercent: this.getFilledPercent(),
      state: this.state,
      createdAt: this.createdAt,
      createFailedMessage: this.createFailedMessage,
      strategyName: (this.strategy && this.strategy.name),
      strategyId: (this.strategy && this.strategy.id),
      fills: this.fills.map(f => f.getSummary()),
    }
  }
}
