import { Base } from "./Base";
import { Lots, ROUNDING_ERROR } from "./Lots";
import { LotState } from "./types/LotState";

export class Lot extends Base<'lot'> {
  private size: number
  private price: number
  private fee: number
  private createdAt: number
  // once closed
  private closedAt?: number
  private duration?: number

  // cached values (for performance)
  private totalPriceExcludingFees: number
  private totalPriceIncludingFees: number
  // these values are cached once this lot is closed
  private soldSize?: number
  private totalSellFees?: number
  private totalEarningsExcludingFees?: number
  private totalEarningsIncludingFees?: number
  private profit?: number
  private cumulativeProfitBeforeThisLot?: number
  private cumulativeProfit?: number
  private averageSellPrice?: number

  private state: LotState = 'new'
  private sells: Array<{
    createdAt: number
    price: number
    size: number
    fee: number
  }> = []

  constructor(lots: Lots, size: number, price: number, fee: number, createdAt: number) {
    super(lots.eve, 'lot')
    this.size = size
    this.price = price
    this.fee = fee
    this.createdAt = createdAt
    this.totalPriceExcludingFees = this.size * this.price
    this.totalPriceIncludingFees = this.totalPriceExcludingFees + this.fee
  }

  public setState(state: LotState) {
    switch (`${this.state}-${state}`) {
      case 'new-open':
      case 'open-closed':
        this.state = state
        this.trigger('updated')
        break;

      default:
        throw new Error(`can not move lot from ${this.state} to ${state}`)
    }
  }

  public open(cumulativeProfitBeforeThisLot: number) {
    if (this.state !== 'new') {
      throw new Error('can only open new lots')
    }
    this.setState('open')
    this.cumulativeProfitBeforeThisLot = cumulativeProfitBeforeThisLot
  }

  private getCumulativeProfitBeforeThisLot() {
    if (typeof this.cumulativeProfitBeforeThisLot === 'undefined') {
      throw new Error('can only get cumulativeProfitBeforeThisLot for opened or closed lots')
    }
    return this.cumulativeProfitBeforeThisLot
  }

  public addSell(size: number, price: number, fee: number, createdAt: number) {
    if (this.state !== 'open') {
      throw new Error('can only add sells to open lots')
    }
    if (size > this.getUnsoldSize()) {
      throw new Error('can not oversell this lot')
    }
    this.sells.push({
      createdAt,
      price,
      size,
      fee
    })
    if (this.getUnsoldSize() <= ROUNDING_ERROR) {
      this.profit = this.getProfit()
      this.soldSize = this.getSoldSize()
      this.averageSellPrice = this.getAverageSellPrice(),
      this.totalSellFees = this.getTotalSellFees()
      this.totalEarningsExcludingFees = this.getTotalEarningsExcludingFees()
      this.totalEarningsIncludingFees = this.getTotalEarningsIncludingFees()
      this.closedAt = createdAt
      this.duration = this.closedAt - this.createdAt
      this.cumulativeProfit = this.getCumulativeProfitBeforeThisLot() + this.profit
      // now that all the values are set, close the lot (this will trigger sending it to the client)
      this.setState('closed')
    }
    // trigger manually (setState in the previous block will cause an updated trigger)
    else {
      this.trigger('updated')
    }
  }

  public getTotalPriceIncludingFees() {
    return this.totalPriceIncludingFees
  }

  public getTotalPriceOfUnsoldPortionIncludingFees() {
    return this.totalPriceIncludingFees - (this.totalPriceIncludingFees / this.size * this.getSoldSize())
  }

  public getAverageSellPrice() {
    if (typeof this.averageSellPrice !== 'undefined') {
      return this.averageSellPrice
    }
    return this.getTotalEarningsExcludingFees() / this.getSoldSize()
  }

  // sum the size of all the sells and return the total
  public getSoldSize(): number {
    if (typeof this.soldSize !== 'undefined') {
      return this.soldSize
    }
    return this.sells.reduce((accumulator, sell) => accumulator + sell.size, 0)
  }

  // the bought, minus the total sold (how many remaining in this lot)
  public getUnsoldSize(): number {
    return this.size - this.getSoldSize()
  }

  // the sum of all sell fees in this lot
  public getTotalSellFees(): number {
    if (typeof this.totalSellFees !== 'undefined') {
      return this.totalSellFees
    }
    return this.sells.reduce((accumulator, sell) => accumulator + sell.fee, 0)
  }

  // the sum of all earnings from sells (excluding fees)
  public getTotalEarningsExcludingFees(): number {
    if (typeof this.totalEarningsExcludingFees !== 'undefined') {
      return this.totalEarningsExcludingFees
    }
    return this.sells.reduce((accumulator, sell) => accumulator + (sell.size * sell.price), 0)
  }

  // the sum of all earnings from sells (excluding fees)
  public getTotalEarningsIncludingFees(): number {
    if (typeof this.totalEarningsIncludingFees !== 'undefined') {
      return this.totalEarningsIncludingFees
    }
    return this.sells.reduce((accumulator, sell) => accumulator + (sell.size * sell.price) - sell.fee, 0)
  }

  public getProfit() {
    if (typeof this.profit !== 'undefined') {
      return this.profit
    }
    return this.getTotalEarningsIncludingFees() - this.totalPriceIncludingFees
  }

  public getCumulativeProfit() {
    if (typeof this.cumulativeProfit === 'undefined') {
      throw new Error('can only get cumulativeProfit for closed lots')
    }
    return this.cumulativeProfit
  }

  public isOpened(): boolean {
    return this.state === 'open'
  }

  public isClosed(): boolean {
    return this.state === 'closed'
  }

  public isNew(): boolean {
    return this.state === 'new'
  }

  public getPrice() {
    return this.price
  }

  public addSize(size: number, price: number, fee: number) {
    if (this.state !== 'new') {
      throw new Error('can only add size to new lots')
    }
    if (this.price !== price) {
      throw new Error('can only add size to lots which are the same price')
    }
    this.size += size
    this.fee += fee
    this.totalPriceExcludingFees += (size * price)
    this.totalPriceIncludingFees = this.totalPriceExcludingFees + this.fee
  }

  public getSummaryData() {
    return {
      state: this.state,
      createdAt: this.createdAt,
      closedAt: this.closedAt,
      duration: this.duration,
      size: this.size,
      price: this.price,
      fee: this.fee,
      totalPriceExcludingFees: this.totalPriceExcludingFees,
      totalPriceIncludingFees: this.totalPriceIncludingFees,
      soldSize: this.getSoldSize(),
      totalSellFees: this.getTotalSellFees(),
      totalEarningsExcludingFees: this.getTotalEarningsExcludingFees(),
      totalEarningsIncludingFees: this.getTotalEarningsIncludingFees(),
      profit: this.getProfit(),
      cumulativeProfit: this.cumulativeProfit,
      totalFees: this.fee + this.getTotalSellFees(),
      averageSellPrice: this.getAverageSellPrice(),
    }
  }
}
