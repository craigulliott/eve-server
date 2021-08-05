import { OrderSide } from "coinbase-pro-node";

export type EventTopics = {
  product: {
    priceUpdated: {
      price: number
    }
  }
  order: {
    new: undefined
    creating: undefined
    created: undefined
    createFailed: undefined
    filled: undefined
    canceling: undefined
    canceled: undefined
    updated: undefined
  }
  second: {
    finalized: undefined
  }
  period: {

  }
  feed: {
    orderReceived: {
      createdAt: number
      price: number
      size: number
      orderId: string
      clientOrderId: string
      side: OrderSide
    }
    orderOpened: {
      createdAt: number
      price: number
      remainingSize: number
      orderId: string
      side: OrderSide
    }
    orderMatch: {
      side: OrderSide
      size: number
      price: number
      totalPrice: number
      orderId: string
      fee: number
      createdAt: number
    }
    orderDone: {
      side: OrderSide
      size: number
      price: number
      orderId: string
      reason: string
    }
  }
  webserver: {

  }
  fill: {

  }
  messages: {

  }
  lots: {

  }
  lot: {
    updated: undefined
  }
  balance: {
    updated: {
      eth: number
      usd: number
    }
  }

  // strategies
  followNextPrice: {
    updated: undefined
  }
  trailingStop: {
    updated: undefined
  }

}
