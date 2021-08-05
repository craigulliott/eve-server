import { OrderSide } from "coinbase-pro-node"
import { Eve, TEST_MODE } from ".."
import { formatCurrency } from "../lib/format"
import { Order } from "../Order"
import { Strategy } from "./Strategy"

// if the price drifts beyond this, then don't recreate the order
const MAX_PRICE_DRIFT = 1.00
// if the price drifts this much, then recreate the order
const REPLACE_ORDER_DRIFT = 0.04

export class FollowNextPrice extends Strategy<'followNextPrice'> {
  public firstOrder: Order
  private side: OrderSide
  private priceDrift: number = 0
  private totalPriceDrift: number = 0
  // so we can unsubscribe from the priceUpdated
  private priceUpdatedFn: (e: any) => void

  constructor(eve: Eve, side: OrderSide) {
    super(eve, 'followNextPrice')
    this.side = side

    switch (side) {
      case OrderSide.BUY: {
        const price = this.eve.product.nextBuyPrice()
        const size = TEST_MODE ? 0.1 : (Math.floor((this.eve.balance.getUsd() / this.eve.product.nextBuyPrice()) * 1000) / 1000) * .5
        this.firstOrder = this.buy(price, size)
        break;

      }

      case OrderSide.SELL: {
        const price = this.eve.product.nextSellPrice()
        const size = TEST_MODE ? 0.1 : (Math.floor(this.eve.balance.getEth() * 1000) / 1000) * .5
        this.firstOrder = this.sell(price, size)
        break;

      }
    }

    this.firstOrder.on('filled', this.stop.bind(this))

    this.priceUpdatedFn = this.eve.product.on('priceUpdated', this.trackOpenOrder.bind(this))

  }

  private trackOpenOrder() {
    const firstOrder = this.firstOrder
    const originalPrice = firstOrder.getPrice()
    // current order (which may be the same as the first order)
    const currentOpenOrder = this.getOpenOrder()

    if (currentOpenOrder) {

      // how far has the current market price drifted from the original order and the current order
      this.priceDrift = Math.abs(currentOpenOrder.getPrice() - this.eve.product.nextPrice(currentOpenOrder.getSide()))
      this.totalPriceDrift = Math.abs(originalPrice - this.eve.product.nextPrice(currentOpenOrder.getSide()))
      this.trigger('updated')

      // if the price has drifted more than REPLACE_ORDER_DRIFT from the order, but less than MAX_PRICE_DRIFT from the original order, then cancel it and make a new one
      if (this.priceDrift > REPLACE_ORDER_DRIFT) {
        this.log(`Order ${currentOpenOrder.id} has drifted ${formatCurrency(this.priceDrift, true)} from the current order and ${formatCurrency(this.totalPriceDrift, true)} from the original currentOpenOrder.`);
        if (this.totalPriceDrift < MAX_PRICE_DRIFT) {
          // cancel the current order
          currentOpenOrder.cancel()
          // once it has cancelled, create a new one
          currentOpenOrder.on('canceled', () => {
            switch (this.side) {
              case OrderSide.BUY: {
                const price = this.eve.product.nextBuyPrice()
                const size = TEST_MODE ? 0.1 : (Math.floor((this.eve.balance.getUsd() / this.eve.product.nextBuyPrice()) * 1000) / 1000) * .5
                const order = this.buy(price, size)
                order.on('filled', this.stop.bind(this))
                break;
              }
              case OrderSide.SELL: {
                const price = this.eve.product.nextSellPrice()
                const size = TEST_MODE ? 0.1 : (Math.floor(this.eve.lots.getTotalUnsoldSize() * 1000) / 1000) * .5
                const order = this.sell(price, size)
                order.on('filled', this.stop.bind(this))
                break;
              }
            }
          })
        }
      }

    }
  }

  protected cleanup() {
    this.eve.product.off('priceUpdated', this.priceUpdatedFn)
  }

  public getDescription() {
    if (this.state === 'ended') {
      return 'Done'
    } else if (this.getOpenOrder()) {
      return 'Order placed and watching price'
    } else {
      const originalPrice = this.firstOrder.getPrice()
      return `Waiting for price to be be within ${formatCurrency(MAX_PRICE_DRIFT)} of ${formatCurrency(originalPrice)}`
    }
  }

  public getSummaryData() {
    const originalPrice = this.firstOrder.getPrice()
    const currentOpenOrder = this.getOpenOrder()
    const currentPrice = currentOpenOrder && currentOpenOrder.getPrice()

    return {
      name: this.name,
      state: this.state,
      side: this.side,
      createdAt: this.createdAt,
      description: this.getDescription(),
      originalPrice,
      currentPrice,
      // how far has the current market price drifted from the original order and the current order
      priceDrift: this.priceDrift,
      totalPriceDrift: this.totalPriceDrift,
    }
  }

}
