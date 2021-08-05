import { OrderSide } from 'coinbase-pro-node'
import { Eve } from '.'
import { Base } from './Base'
import { client } from './client'
import { Period } from './Period'
import { Second } from './Second'

//const MAX_AGE = 60 * 60 * 24 * 31 // 31 days
const MAX_AGE = 60 * 60 * 3
export const PRODUCT_ID = 'ETH-USD'

export class Product extends Base<'product'> {
  private currentPrice?: number

  private backfillComplete = false
  // queue the REST fetched trades, so we can add them all in the correct order
  private queuedTrades: Array<{
    size: number
    price: number
    side: OrderSide
    time: number
  }> = []

  // this is where the calculation of periods begins (to make sure periods overlap as expected)
  private firstSecond?: Second
  private seconds: {
    [key: string]: Second
  } = {}
  private currentSecond?: Second

  // cached periods
  private periods: {
    [key: string]: {
      [key:string]: Period
    }
  } = {}

  constructor(eve: Eve) {
    super(eve, 'product')

    let tradesLoaded = 0
    let fetchMore = true
    const currentSeconds = Math.round(Date.now() / 1000)
    const getTrades = (after?: string) => {
      // load previous trades from the coinbase API and back trade the Order/Trades objects
      const pagination = after ? { after: after } : undefined
      client.rest.product.getTrades(PRODUCT_ID, pagination).then(trades => {
        // iterate through the trades, building seconds and ticks
        for (let i = 0; i < trades.data.length; i++) {
          tradesLoaded += 1
          const trade = trades.data[i]
          const time = Math.floor(Date.parse(trade.time) / 1000)
          this.queuedTrades.unshift({
            size: parseFloat(trade.size),
            price: parseFloat(trade.price),
            side: trade.side,
            time,
          })
          // stop when we exceed the max age
          if (currentSeconds - time > MAX_AGE) {
            fetchMore = false
            break
          }
        }
        this.log(`Loaded trades from ${trades.data[0].time} to ${trades.data[trades.data.length - 1].time}`)
        // is there a page after this one
        if (fetchMore) {
          // get the next page
          getTrades(trades.pagination.after)
        }
        // no new results
        else {
          this.log(`Loaded product data from ${tradesLoaded} trades`)
          // in case some of the fetched trades overlap with the received feed messages
          this.queuedTrades.sort((a, b) => {return a.time - b.time})
          // TODO assert there are no duplicate trades
          // play the queue of trades forward, and create seconds
          for (let i = 0; i < this.queuedTrades.length; i++) {
            const trade = this.queuedTrades[i];
            this.updateSecond(trade.price, trade.size, trade.time, trade.side)
          }
          this.backfillComplete = true
        }
      }).catch((e) => {
        this.log('error fetching trades', e);
        throw new Error(e)
      })

    }
    // get the first page of trades
    getTrades()

  }

  public getFirstSecond() {
    // cache the result as it is fetched
    return this.firstSecond || (this.firstSecond = Object.values(this.seconds)[0])
  }

  public getPeriods(periodLengthInSeconds: number) {
    if (typeof this.periods[periodLengthInSeconds] === 'undefined') {
      this.periods[periodLengthInSeconds] = {}
    }
    let openPrice = this.getFirstSecond().openPrice

    let firstSecond = this.getFirstSecond().second
    // round up to the nearest start of a period (so 60 second periods start at the beginning of a minute and 3600 second periods start at the beginning of an hour)
    firstSecond = Math.ceil(firstSecond / periodLengthInSeconds) * periodLengthInSeconds

    const currentSecond = Math.round(Date.now() / 1000)

    const maxPeriod = Math.floor((currentSecond - this.getFirstSecond().second) / periodLengthInSeconds)

    const lastCachedPeriods = Object.keys(this.periods[periodLengthInSeconds])
    const lastCachedPeriod = lastCachedPeriods.length > 0 ? parseInt(lastCachedPeriods[lastCachedPeriods.length - 1]) : 0

    for (let p = lastCachedPeriod; p < maxPeriod; p++) {
      const seconds: Second[] = []
      const periodStartSecond = firstSecond + (periodLengthInSeconds * p)
      for (let s = periodStartSecond; s < firstSecond + (periodLengthInSeconds * (p + 1)); s++) {
        if (this.seconds[s]) {
          seconds.push(this.seconds[s])
        }
      }

      const period = new Period(this, periodStartSecond, periodLengthInSeconds, openPrice, seconds)
      this.periods[periodLengthInSeconds][p] = period
      openPrice = period.close
    }
    return Object.values(this.periods[periodLengthInSeconds])
  }

  public addTick(price: number, size: number, time: number, side: OrderSide) {
    if (this.backfillComplete === false) {
      this.queuedTrades.push({
        size: size,
        price: price,
        side: side,
        time,
      })
    } else {
      this.updateSecond(price, size, time, side)
    }
  }

  private updateSecond(price: number, size: number, time: number, side: OrderSide): Second {
    this.setPrice(price)
    if (typeof this.seconds[time] === 'undefined') {
      if (this.currentSecond) {
        this.currentSecond.finalize()
      }
      const openPrice = this.currentSecond ? this.currentSecond.closePrice : price
      this.currentSecond = new Second(this, time, openPrice)
      this.seconds[time] = this.currentSecond
    }
    this.seconds[time].addTick(price, size, side)
    return this.seconds[time]
  }

  public setPrice(price: number) {
    this.currentPrice = price
    this.trigger('priceUpdated')
  }

  public isReady() {
    return typeof this.currentPrice !== 'undefined'
  }

  public getSummaryData() {
    if (this.currentPrice) {
      return {
        currentPrice: this.currentPrice,
        averagePricePaidForOpenLots: this.eve.lots.getAveragePricePaidForOpenLots(),
        totalPaidForOpenLots: this.eve.lots.getTotalPaidForOpenLots(),
        totalUnsoldSize: this.eve.lots.getTotalUnsoldSize(),
      }
    }
    else {
      throw new Error('missing required currentPrice')
    }
  }

  public getCurrentPrice() {
    if (typeof this.currentPrice === 'undefined') {
      throw new Error('price not set')
    }
    return this.currentPrice
  }

  public nextPrice(side: OrderSide) {
    return side === OrderSide.BUY ? this.nextBuyPrice() : this.nextSellPrice()
  }

  public nextBuyPrice() {
    return this.getCurrentPrice() - 0.01
  }

  public nextSellPrice() {
    return this.getCurrentPrice() + 0.01
  }
}
