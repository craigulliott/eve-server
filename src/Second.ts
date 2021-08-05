import { OrderSide } from "coinbase-pro-node";
import { Base } from "./Base";
import { Product } from "./Product";
import { Tick } from "./types/Tick";



export class Second extends Base<'second'> {
  public readonly second: number
  private ticks: Tick[] = []
  private finalized = false

  // when finalized
  public highPrice: number = 0
  public lowPrice: number = 0
  public openPrice: number
  public closePrice: number = 0
  public averageBuyPrice: number = 0
  public averageSellPrice: number = 0
  public averagePrice: number = 0

  public size: number = 0
  public buySize: number = 0
  public buyTotalPrice: number = 0
  public sellSize: number = 0
  public sellTotalPrice: number = 0

  constructor(product: Product, second: number, openPrice: number) {
    super(product.eve, 'second')
    this.second = second
    this.openPrice = openPrice
  }

  public addTick(price: number, size: number, side: OrderSide) {
    if (this.finalized) {
      throw new Error('second has already been finalized, can not add tick data')
    }
    this.ticks.push({
      price,
      size,
      side
    })
  }

  public finalize() {
    if (this.ticks.length === 0) {
      throw new Error('can not finalize an empty second')
    }
    for (let i = 0; i < this.ticks.length; i++) {
      const tick = this.ticks[0]
      // track the high price
      if (i === 0 || tick.price > this.highPrice) {
        this.highPrice = tick.price
      }
      // track the low price
      if (i === 0 || tick.price < this.lowPrice) {
        this.lowPrice = tick.price
      }
      // total up the size
      this.size += tick.size
      // the total size bought vs sold and the total spent on each
      switch (tick.side) {
        case OrderSide.SELL:
          this.sellSize += tick.size
          this.sellTotalPrice += (tick.size * tick.price)
          break;

        case OrderSide.BUY:
          this.buySize += tick.size
          this.buyTotalPrice += (tick.size * tick.price)
          break;
      }
    }

    // calculate the averages
    this.averageBuyPrice = this.buyTotalPrice / this.buySize
    this.averageSellPrice = this.sellTotalPrice / this.sellSize
    this.averagePrice = (this.buyTotalPrice + this.sellTotalPrice) / (this.buySize + this.sellSize)

    // the last price is the close price
    this.closePrice = this.ticks[this.ticks.length - 1].price

    // lock and clear this second
    this.finalized = true
    this.ticks = []
    this.trigger('finalized')

  }

  public getSummaryData() {
    if (!this.finalized) {
      throw new Error('can not return an unfinalized second')
    }

    return {
      // prices
      highPrice: this.highPrice,
      lowPrice: this.lowPrice,
      averageBuyPrice: this.averageBuyPrice,
      averageSellPrice: this.averageSellPrice,
      averagePrice: this.averagePrice,
      openPrice: this.openPrice,
      closePrice: this.closePrice,
      // sizes
      size: this.size,
      buySize: this.buySize,
      buyTotalPrice: this.buyTotalPrice,
      sellSize: this.sellSize,
      sellTotalPrice: this.sellTotalPrice,

    }
  }
}
