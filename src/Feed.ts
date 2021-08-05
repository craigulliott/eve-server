import { Eve } from "."
import { Base } from "./Base"
import { OrderSide, WebSocketChannelName, WebSocketEvent } from 'coinbase-pro-node'
import { client } from './client'
import { PRODUCT_ID } from "./Product"

const TICKER_CHANNEL = {
  name: WebSocketChannelName.TICKER,
  product_ids: [PRODUCT_ID],
}
const USER_CHANNEL = {
  name: WebSocketChannelName.USER,
  product_ids: [PRODUCT_ID],
}

export class Feed extends Base<'feed'> {

  constructor(eve: Eve) {
    super(eve, 'feed')

    // Wait for open WebSocket to send messages
    client.ws.on(WebSocketEvent.ON_OPEN, () => {
      // Subscribe to WebSocket channel
      client.ws.subscribe([TICKER_CHANNEL, USER_CHANNEL])
    })

    // Listen to WebSocket subscription updates
    client.ws.on(WebSocketEvent.ON_SUBSCRIPTION_UPDATE, subscriptions => {
      // When there are no more subscriptions...
      if (subscriptions.channels.length === 0) {
        this.log('subscriptions.channels.length is 0')
        // Disconnect WebSocket (and end program)
        client.ws.disconnect()
      }
    })

    // Listen to WebSocket channel updates
    client.ws.on(WebSocketEvent.ON_MESSAGE, message => {
      switch (message.type) {

        case 'subscriptions':
          // ignore this, it's just confirmation of which channels we have subscribed to
          break

        // {
        //   "type": "ticker",
        //   "trade_id": 20153558,
        //   "sequence": 3262786978,
        //   "time": "2017-09-02T17:05:49.250000Z",
        //   "product_id": "BTC-USD",
        //   "price": "4388.01000000",
        //   "side": "buy", // Taker side
        //   "last_size": "0.03000000",
        //   "best_bid": "4388",
        //   "best_ask": "4388.01"
        // }
        case 'ticker':{
          const price = parseFloat(message.price as string)
          const size = parseFloat(message.last_size as string)
          const time = Math.floor(Date.parse(message.time as string) / 1000)
          const side = message.side === 'buy' ? OrderSide.BUY : OrderSide.SELL
          this.eve.product.addTick(price, size, time, side)
          break
        }

        case 'match': {
          this.log('match', message);
          const price = parseFloat(message.price as string)
          const size = parseFloat(message.size as string)
          const createdAt = Math.floor(Date.parse(message.time as string) / 1000)
          // @ts-ignore
          const feeRate = parseFloat(message.maker_fee_rate as string)
          this.trigger('orderMatch', {
            orderId: message.maker_order_id as string,
            side: message.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
            totalPrice: (price * size),
            fee: (feeRate * price * size),
            createdAt,
            price,
            size,
          })
          break
        }

        case 'done': {
          this.log('done', message);
          this.trigger('orderDone', {
            orderId: message.order_id as string,
            reason: message.reason as string,
            side: message.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
            price: parseFloat(message.price as string),
            size: parseFloat(message.size as string),
          })
          break
        }

        case 'received': {
          this.log('received', message);
          const createdAt = Math.floor(Date.parse(message.time as string) / 1000)
          this.trigger('orderReceived', {
            createdAt: createdAt,
            orderId: message.order_id as string,
            clientOrderId: message.client_oid as string,
            side: message.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
            price: parseFloat(message.price as string),
            size: parseFloat(message.size as string),
          })
          break
        }

        // opened comes after received, we don't use this for anything yet
        // note: this message does not have a client_oid
        case 'open': {
          this.log('open', message);
          const createdAt = Math.floor(Date.parse(message.time as string) / 1000)
          this.trigger('orderOpened', {
            createdAt: createdAt,
            orderId: message.order_id as string,
            side: message.side === 'buy' ? OrderSide.BUY : OrderSide.SELL,
            price: parseFloat(message.price as string),
            remainingSize: parseFloat(message.remaining_size as string),
          })
          break
        }

        default:
          this.log('unhandled message', message)
          break
        }
    })

    // Connect to WebSocket
    client.ws.connect({ debug: false })

  }

  public destroy() {
    // Unsubscribe from WebSocket channel
    client.ws.unsubscribe([TICKER_CHANNEL, USER_CHANNEL])
  }

}
