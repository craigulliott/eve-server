import { Base } from "./Base";
import { Product } from "./Product";
import { Second } from "./Second";

export class Period extends Base<'period'> {
  public readonly periodStartSeconds: number
  public readonly periodLengthInSeconds: number

  private seconds: Second[]
  // candlestick values
  public readonly open: number
  public readonly high: number
  public readonly low: number
  public readonly close: number
  // size values
  public readonly size: number

  constructor(product: Product, periodStartSeconds: number, periodLengthInSeconds: number, openPrice: number, seconds: Second[]) {
    super(product.eve, 'period')
    // the time and duration of this period
    this.periodStartSeconds = periodStartSeconds
    this.periodLengthInSeconds = periodLengthInSeconds
    // the second objects
    this.seconds = seconds
    // candlestick values
    this.open = openPrice
    this.high = this.getHigh()
    this.low = this.getLow()
    this.close = this.getClose()
    // size values
    this.size = this.getSize()
  }

  protected getFirstSecond(): Second {
    return this.seconds[0]
  }

  protected getLastSecond(): Second {
    return this.seconds[this.seconds.length - 1]
  }

  private getHigh(): number {
    let high = this.open
    for (let i = 0; i < this.seconds.length; i++) {
      if (high < this.seconds[i].highPrice) {
        high = this.seconds[i].highPrice
      }

    }
    return high
  }

  private getLow(): number {
    let low = this.open
    for (let i = 0; i < this.seconds.length; i++) {
      if (low > this.seconds[i].lowPrice) {
        low = this.seconds[i].lowPrice
      }

    }
    return low
  }

  private getClose(): number {
    return this.getLastSecond() ? this.getLastSecond().closePrice : this.open
  }

  private getSize() {
    return this.seconds.reduce((accumulator, second) => accumulator + second.size, 0)
  }

  public getSummaryData() {
    return {
      // time
      startTime: this.periodStartSeconds,
      periodLengthInSeconds: this.periodLengthInSeconds,
      endTime: this.periodStartSeconds + this.periodLengthInSeconds,
      // candle values
      open: this.open,
      high: this.high,
      low: this.low,
      close: this.close,
      // size values
      size: this.size,
    }
  }
}
