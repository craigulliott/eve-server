import { connection, server as webSocketServer } from 'websocket'
import { Eve } from '.'
import { Base } from './Base'
import { v4 as uuidv4 } from 'uuid'

let MessageSequenceNumber = 0
export class Messages extends Base<'messages'> {
  private wsServer: webSocketServer

  // maintaining all active connections in this object
  private clients: {
    [key: string]: connection
  } = {}

  constructor(eve: Eve) {
    super(eve, 'messages')
    this.log('starting messages');

    this.wsServer = new webSocketServer({
      httpServer: eve.webserver.server
    })

    this.wsServer.on('request', (request) => {
      var userID = uuidv4()
      this.log((new Date()) + ' Received a new connection from origin ' + request.origin + '.')
      // You can rewrite this part of the code to accept only the requests from allowed origin
      const connection = request.accept(undefined, request.origin)
      this.clients[userID] = connection
      this.log('connected: ' + userID + ' in ' + Object.getOwnPropertyNames(this.clients))
    })

  }

  sendMessage(name: string, data: {} = {}): void {
    // We are sending the current data to all connected clients
    const sequence = MessageSequenceNumber += 1
    Object.keys(this.clients).map((client) => {
      this.clients[client].sendUTF(JSON.stringify({ name, data, sequence }))
    })
  }

}


