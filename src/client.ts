import { CoinbasePro } from 'coinbase-pro-node'

const PASSPHRASE = ''
const APIKEY = ''
const APISECRET = ''

const auth = {
  apiKey: APIKEY,
  apiSecret: APISECRET,
  passphrase: PASSPHRASE,
  // The Sandbox is for testing only and offers a subset of the products/assets:
  // https://docs.pro.coinbase.com/#sandbox
  useSandbox: false,
}

export var client = new CoinbasePro(auth)
