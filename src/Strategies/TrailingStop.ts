import { OrderSide } from "coinbase-pro-node"
import { Eve } from ".."
import { formatCurrency } from "../lib/format"
import { Strategy } from "./Strategy"


export class TrailingStop extends Strategy<'trailingStop'> {
  private side: OrderSide
  private startPrice: number
  // the highest or lowest the price has reached (depending on if this is a buy or sell order)
  private extremePrice: number
  // if the price drops this distance below the high (buy order) or this distance above the low (sell order) then create the order
  private readonly triggerDelta: number
  // so we can unsubscribe from the priceUpdated
  private priceUpdatedFn: (e: any) => void

  constructor(eve: Eve, side: OrderSide, triggerDelta: number) {
    super(eve, 'trailingStop')
    this.side = side
    this.triggerDelta = triggerDelta

    this.startPrice = this.eve.product.getCurrentPrice()
    this.extremePrice = this.startPrice

    this.priceUpdatedFn = this.eve.product.on('priceUpdated', this.trackPrice.bind(this))

  }

  private trackPrice() {
    if (this.state === 'ended') {
      throw new Error('trackPrice should not be called when state is ended')
    }
    const currentPrice = this.eve.product.getCurrentPrice()
    switch (this.side) {
      case OrderSide.BUY:
        // track higher highs
        if (this.extremePrice > currentPrice) {
          this.extremePrice = currentPrice
        }
        // trigger the buy order when the current price rises above the extremePrice + the triggerDelta
        if (currentPrice > this.extremePrice + this.triggerDelta) {
          this.log('reached delta, triggering order')
          this.stop()
          this.eve.buy('followNextPrice')
        }
        break

      case OrderSide.SELL:
        // track lower lows
        if (this.extremePrice < currentPrice) {
          this.extremePrice = currentPrice
        }
        // trigger the sell order when the current price falls below the extremePrice - the triggerDelta
        if (currentPrice < this.extremePrice - this.triggerDelta) {
          this.log('reached delta, triggering order')
          this.stop()
          this.eve.sell('followNextPrice')
        }
        break
    }
    this.trigger('updated')
  }

  protected cleanup() {
    this.eve.product.off('priceUpdated', this.priceUpdatedFn)
  }

  public getDescription() {
    if (this.state === 'ended') {
      return "Ended"
    }
    switch (this.side) {
      case OrderSide.BUY:
        return `Will trigger buy order if price rises above ${formatCurrency(this.extremePrice + this.triggerDelta)}`

      case OrderSide.SELL:
        return `Will trigger sell order if price drops below ${formatCurrency(this.extremePrice - this.triggerDelta)}`
    }
  }

  public getSummaryData() {
    return {
      name: this.name,
      state: this.state,
      side: this.side,
      createdAt: this.createdAt,
      description: this.getDescription(),
      triggerDelta: this.triggerDelta,
      currentDelta: Math.abs(this.extremePrice - this.eve.product.getCurrentPrice()),
      extremePrice: this.extremePrice,
      startPrice: this.startPrice,
    }
  }

}
