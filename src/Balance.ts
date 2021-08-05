import { OrderSide } from "coinbase-pro-node"
import { Eve } from "."
import { Base } from "./Base"
import { client } from "./client"

export class Balance extends Base<'balance'> {
  private eth?: number
  private usd?: number

  public setEth(eth: number) {
    this.eth = eth
  }

  public setUsd(usd: number) {
    this.usd = usd
  }

  public getEth() {
    if (typeof this.eth === 'undefined') {
      throw new Error('balances are not yet available')
    }
    return this.eth
  }

  public getUsd() {
    if (typeof this.usd === 'undefined') {
      throw new Error('balances are not yet available')
    }
    return this.usd
  }

  constructor(eve: Eve) {
    super(eve, 'balance')

    this.eve.feed.on('orderMatch', (e) => {
      switch (e.side) {
        case OrderSide.BUY:
          this.eth = this.eth && this.eth + e.size
          // cost of ETH
          this.usd = this.usd && this.usd - e.totalPrice
          // remove the fees
          this.usd = this.usd && this.usd - e.fee
          break;

        case OrderSide.SELL:
          this.eth = this.eth && this.eth - e.size
          // value of ETH
          this.usd = this.usd && this.usd + e.totalPrice
          // remove the fees
          this.usd = this.usd && this.usd - e.fee
          break;
      }
      this.trigger('updated')
    })

    this.update()
  }

  public isReady() {
    return typeof this.usd !== 'undefined' && typeof this.eth !== 'undefined'
  }

  public update() {
    client.rest.account.listAccounts().then(accounts => {
      // find and update the ETH balance
      const ethBalance = accounts.find(a => a.currency === 'ETH')?.balance
      const usdBalance = accounts.find(a => a.currency === 'USD')?.balance

      if (ethBalance && usdBalance) {
        let changes = false
        const eth = parseFloat(ethBalance)
        const usd = parseFloat(usdBalance)

        if (eth !== this.eth) {
          changes = true
          this.setEth(eth)
        }
        if (usd !== this.usd) {
          changes = true
          this.setUsd(usd)
        }
        // if changes are available, then notify about the update
        if (changes) {
          this.trigger('updated', {
            eth,
            usd,
          })
        }
      }
    }).catch((error) => {
      this.log('error', error)
    })
  }

  public getSummaryData() {
    return {
      eth: this.eth,
      usd: this.usd,
    }
  }

}
