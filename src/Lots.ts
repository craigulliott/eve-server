import { OrderSide } from "coinbase-pro-node";
import { Eve } from ".";
import { Base } from "./Base";
import { Lot } from "./Lot";

export const ROUNDING_ERROR = 0.00000002

export class Lots extends Base<'lots'>{
  public readonly lots: Lot[] = []
  private currentOpenLot?: Lot
  private cumulativeProfit: number = 0

  constructor(eve: Eve) {
    super(eve, 'lots')

    this.eve.feed.on('orderMatch', (e) => {
      this.addFill(e.side, e.size, e.price, e.fee, e.createdAt)
    })
  }

  public getAveragePricePaidForOpenLots() {
    return this.getTotalPaidForOpenLots() / this.getTotalUnsoldSize()
  }

  public getTotalPaidForOpenLots() {
    return this.lots.filter(l => !l.isClosed()).reduce((accumulator, lot) => accumulator + lot.getTotalPriceOfUnsoldPortionIncludingFees(), 0)
  }

  public getTotalUnsoldSize() {
    return this.lots.filter(l => !l.isClosed()).reduce((accumulator, lot) => accumulator + lot.getUnsoldSize(), 0)
  }

  public addFill(side: OrderSide, size: number, price: number, fee: number, createdAt: number): void {
    switch (side) {
      case OrderSide.BUY:
        // if the last lot new and is the same price, then we combine them
        // this is caused by fills fo the same order happening in quick succession
        // we combine them here to make everything easier to read and understand
        const lastLot = this.lots[this.lots.length - 1]
        if (lastLot && lastLot.isNew() && lastLot.getPrice() === price) {
          lastLot.addSize(size, price, fee)
        }
        // otherwise we create a new lot
        else {
          const lot = new Lot(this, size, price, fee, createdAt)
          lot.on('updated', () => {
            lot.sendToClient()
          })
          lot.sendToClient()
          this.lots.push(lot)
          if (typeof this.currentOpenLot === 'undefined') {
            this.currentOpenLot = lot
            this.currentOpenLot.open(this.cumulativeProfit)
          }
        }
        break

      case OrderSide.SELL:
        let unallocated = size
        while (unallocated > ROUNDING_ERROR) {
          // get the currentOpenLot
          if (typeof this.currentOpenLot === 'undefined') {
            throw new Error('there is no open lot, this sell should not be possible')
          }
          // allocate as much as possible to this lot
          const toAllocate = this.currentOpenLot.getUnsoldSize() < unallocated ? this.currentOpenLot.getUnsoldSize() : unallocated
          const proportionalFee = fee / size * toAllocate
          this.currentOpenLot.addSell(toAllocate, price, proportionalFee, createdAt)
          unallocated -= toAllocate
          // if the current lot is closed, then find the next one which is opened
          if (this.currentOpenLot.isClosed()) {
            // if this lot is closed, then get the new cumulative profit
            this.cumulativeProfit = this.currentOpenLot.getCumulativeProfit()

            // open the next lot
            this.currentOpenLot = this.lots.find(l => l.isNew())
            if (this.currentOpenLot) {
              this.currentOpenLot.open(this.cumulativeProfit)
            }
          }
        }
        break
    }
  }

}
