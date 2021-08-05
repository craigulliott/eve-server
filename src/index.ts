
import { Order } from './Order'
import { Balance } from './Balance'
import { Messages } from './messages'
import { Product, PRODUCT_ID } from './Product'
import { Webserver } from './Webserver'
import { Feed } from './Feed'
import { StrategyName } from './types/StrategyName'
import { FollowNextPrice } from './Strategies/FollowNextPrice'
import { client } from './client'
import { FillSource } from './types/FillSource'
import { OrderSource } from './types/OrderSource'
import { Strategy } from './Strategies/Strategy'
import { TrailingStop } from './Strategies/TrailingStop'
import { Lots } from './Lots'
import { OrderSide } from 'coinbase-pro-node'

// when we start backfilling lots from
// Sat May 29 2021 07:17:39 GMT-0400 (Eastern Daylight Time)
const FIRST_LOT_AT = 1622287059
export const TEST_MODE = false

export class Eve {
  public feed = new Feed(this)
  public webserver = new Webserver(this)
  public messages = new Messages(this)
  public product = new Product(this)
  public lots = new Lots(this)
  public balance = new Balance(this)
  public orders: {
    [key: string]: Order
  } = {}
  public strategies: {
    [key: string]: Strategy<StrategyName>
  } = {}

  constructor() {
    let backfilledOrderCount = 0
    // load current orders from the coinbase API (coinbase only returns open or unsettled orders)
    client.rest.order.getOrders().then(orders => {
      // iterate through the orders, building orders for orders
      for (let i = 0; i < orders.data.length; i++) {
        const order = orders.data[i]
        const size = parseFloat(order.size)
        const price = parseFloat(order.price)
        const createdAt = Math.floor(Date.parse(order.created_at) / 1000)
        // create the order
        this.addOrder(new Order(this, order.side, price, size, OrderSource.Api, undefined, order.id, createdAt))
        //
        backfilledOrderCount += 1
      }
      console.log(`Loaded ${backfilledOrderCount} orders from Order API`)
    })

    // queue the fills, so we can replay them in reverse to create the lots
    const fillQueue: Array<{
      createdAt: number
      side: OrderSide
      price: number
      size: number
      fee: number
    }> = []

    const getFills = (after?: string) => {
      console.log('Fetching fills from Coinbase API');
      // load previous fills from the coinbase API and back fill the Order/Fills objects
      const pagination = after ? { after: after } : undefined
      client.rest.fill.getFillsByProductId(PRODUCT_ID, pagination).then(fills => {
        // iterate through the fills, building orders for fills
        for (let i = 0; i < fills.data.length; i++) {
          const fill = fills.data[i]
          const size = parseFloat(fill.size)
          const price = parseFloat(fill.price)
          const totalPrice = parseFloat(fill.usd_volume)
          const fee = parseFloat(fill.fee)
          const createdAt = Math.floor(Date.parse(fill.created_at) / 1000)
          // we take the first price as the order price, and set the size to 0, because the size will be calculated automatically as we add fills
          const order = this.getOrderByOrderNumber(fill.order_id) || this.addOrder(new Order(this, fill.side, parseFloat(fill.price), 0, OrderSource.Backfill, undefined, fill.order_id, createdAt))
          order.addFill(size, price, totalPrice, fee, createdAt, FillSource.Api)
          // queue the fills, so we can replay them in reverse to create the lots
          fillQueue.push({
            side: fill.side,
            createdAt,
            size,
            price,
            fee
          })
        }
        // is there a page after this one
        if (fills.pagination.after) {
          // get the next page
          getFills(fills.pagination.after)
        }
        // no new results
        else {
          // no more fills to fetch
          console.log(`Backfilled ${Object.values(this.orders).length - backfilledOrderCount} orders from ${fillQueue.length} fills`)

          // play the fillQueue in reverse, to create the lots
          fillQueue.reverse()
          for (let i = 0; i < fillQueue.length; i++) {
            const fill = fillQueue[i]
            // was this lot created in 2021
            if (fill.createdAt >= FIRST_LOT_AT) {
              //console.log(`Adding lot createdAt: ${fill.createdAt}, side:${fill.side}, size:${fill.size}, price:${fill.price}, fee:${fill.fee}`)
              this.lots.addFill(fill.side, fill.size, fill.price, fill.fee, fill.createdAt)
            }
            // we skip lots from before 2021
            else {
              //console.log(`Skipping lot createdAt: ${fill.createdAt}, side:${fill.side}, size:${fill.size}, price:${fill.price}, fee:${fill.fee}`)

            }
          }
        }
      }).catch((e) => {
        console.log('error fetching fills', e);

      })

    }
    // get the first page of fills
    getFills()

    this.balance.on('updated', () => {
      this.balance.sendToClient()
    })

    this.product.on('priceUpdated', () => {
      this.product.sendToClient()
    })

    this.feed.on('orderReceived', (e) => {
      const order = e.clientOrderId && this.orders[e.clientOrderId] ? this.orders[e.clientOrderId] : this.addOrder(new Order(this, e.side, e.price, e.size, OrderSource.Feed))
      order.setCreated(e.orderId)
    })

    this.feed.on('orderMatch', (e) => {
      const order = this.getOrderByOrderNumber(e.orderId)
      if (order) {
        order.addFill(e.size, e.price, e.totalPrice, e.fee, e.createdAt, FillSource.Feed)
      } else {
        throw new Error(`Order with coinbase id ${e.orderId} not found`)
      }
    })

    this.feed.on('orderDone', (e) => {
      const order = this.getOrderByOrderNumber(e.orderId)
      if (order) {
        switch (e.reason) {
          case 'canceled':
            // if this order is already cancelled then do nothing, the order was already marked as cancelled from the api request made to coinbase
            if (!order.isState('canceled')) {
              order.setState('canceled')
            }
            break

          case 'filled':
            order.setState('filled')
            break

          default:
            throw new Error(`unexpected reason ${e.reason}`)

        }
      }
    })

  }

  public getOrderByOrderNumber(orderNumber: string) {
    return Object.values(this.orders).find(o => o.getOrderNumber() === orderNumber)
  }

  public buy(strategy: string) {
    switch (strategy) {
      case 'followNextPrice':
        return this.addStrategy(new FollowNextPrice(this, OrderSide.BUY))

      case 'threeDollarTrailingStop':
        return this.addStrategy(new TrailingStop(this, OrderSide.BUY, 3))

      case 'fiveDollarTrailingStop':
        return this.addStrategy(new TrailingStop(this, OrderSide.BUY, 5))

      default:
        throw new Error(`Unexpected strategy name ${strategy}`)
    }
  }

  public sell(strategy: string) {
    switch (strategy) {
      case 'followNextPrice':
        return this.addStrategy(new FollowNextPrice(this, OrderSide.SELL))

      case 'threeDollarTrailingStop':
        return this.addStrategy(new TrailingStop(this, OrderSide.SELL, 3))

      case 'fiveDollarTrailingStop':
        return this.addStrategy(new TrailingStop(this, OrderSide.SELL, 5))

      default:
        throw new Error(`Unexpected strategy name ${strategy}`)
    }
  }

  public addOrder(order: Order) {
    if (typeof this.orders[order.id] !== 'undefined') {
      throw new Error('order already exists')
    }
    // add the order to the list
    this.orders[order.id] = order
    // send all updates to the client
    order.on('updated', () => {
      order.sendToClient()
    })
    return order
  }

  public addStrategy(strategy: Strategy<StrategyName>) {
    if (typeof this.strategies[strategy.id] !== 'undefined') {
      throw new Error('strategy already exists')
    }
    // add the strategy to the list
    this.strategies[strategy.id] = strategy
    strategy.sendToClient()
    // send all updates to the client
    strategy.on('updated', () => {
      strategy.sendToClient()
    })
    console.log(`Created new strategy (${strategy.name}) with id ${strategy.id}`);
    return strategy
  }

  public cancel(id: string) {
    if (typeof this.orders[id] === 'undefined') {
      throw new Error('order does not exist')
    }
    this.orders[id].cancel()
    return this.orders[id]
  }

  public destroy() {
    this.feed.destroy()
  }

}

console.log('Starting')
const eve = new Eve()

// clean up on exit
const exitHandler = (code: number) => {
  eve.destroy()
  console.log('exit')
  // process.exit()
}

// when app is closing
process.on('exit', (code) => exitHandler(code))
