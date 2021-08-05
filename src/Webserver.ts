import express from 'express'
import { Server } from 'http'
import { Eve } from '.'
import { Base } from './Base'
import cors from 'cors'
import { client } from './client'

const port = 8000

export class Webserver extends Base<'webserver'> {
  private app = express()
  public readonly server: Server

  constructor(eva: Eve) {
    super(eva, 'webserver')
    this.log('starting webserver')

    this.app.use(cors())
    this.app.use(express.json())

    this.app.get('/balance', (req, res) => {
      if (this.eve.balance.isReady()) {
        res.json(
          this.eve.balance.getSummary()
        )
      } else {
        res.status(404).send('Not found')
      }
    })

    this.app.get('/product', (req, res) => {
      if (this.eve.product.isReady()) {
        res.json(
          this.eve.product.getSummary()
        )
      } else {
        res.status(404).send('Not found')
      }
    })

    this.app.get('/periods', (req, res) => {
      const periodLengthInSeconds = typeof req.query.periodLengthInSeconds === 'string' ? parseInt(req.query.periodLengthInSeconds) : null
      if (periodLengthInSeconds === null) {
        throw new Error('missing required numeric periodLengthInSeconds get parameter')
      }
      if (this.eve.product.isReady()) {
        res.json({
          data: this.eve.product.getPeriods(periodLengthInSeconds).map(p => p.getSummary())
        })
      } else {
        res.status(404).send('Not found')
      }
    })

    this.app.get('/orders', (req, res) => {
      res.json({
        data: Object.values(this.eve.orders).map(o => o.getSummary())
      })
    })

    this.app.get('/strategies', (req, res) => {
      res.json({
        data: Object.values(this.eve.strategies).map(s => s.getSummary())
      })
    })

    this.app.get('/lots', (req, res) => {
      res.json({
        data: Object.values(this.eve.lots.lots).map(l => l.getSummary())
      })
    })

    this.app.post('/buy', (req, res) => {
      const strategyName = req.body.strategy
      switch (strategyName) {
        case 'followNextPrice':
        case 'threeDollarTrailingStop':
        case 'fiveDollarTrailingStop':
          this.log(`Received buy order (${strategyName})`);

          this.eve.buy(strategyName)
          res.json({ status: 'ok' })
          break;

        default:
          res.status(404).send('Strategy not found')
          break;
      }
    })

    this.app.post('/sell', (req, res) => {
      const strategyName = req.body.strategy
      switch (strategyName) {
        case 'followNextPrice':
        case 'threeDollarTrailingStop':
        case 'fiveDollarTrailingStop':
          this.log(`Received sell order (${strategyName})`);

          this.eve.sell(strategyName)
          res.json({ status: 'ok' })
          break;

        default:
          res.status(404).send('Strategy not found')
          break;
      }
    })

    this.app.post('/cancel', (req, res) => {
      const order = this.eve.cancel(req.body.id)
      res.json(
        order.getSummary()
      )
    })

    this.app.post('/cancelAll', (req, res) => {
      client.rest.order.cancelOpenOrders()
      res.json({status: 'ok'})
    })

    this.server = this.app.listen(port, () => {
      this.log(`Webserver listening at http://localhost:${port}`)
    })

  }

}

