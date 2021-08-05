import { EventTopics } from "./EventTopics"

export class EventBus {

  // Stores event topics
  private eventTopics: {
    [key: string]: Function[]
  } = {}

  on<N extends keyof EventTopics, T extends keyof EventTopics[N]>(namespace: N, topic: T, callback: (e: EventTopics[N][T]) => void): (e: EventTopics[N][T]) => void {
    const key = `${namespace}:${topic}`

    if (typeof this.eventTopics[key] === 'undefined') {
      this.eventTopics[key] = []
    }

    // Add the callback to queue, create index
    this.eventTopics[key].push(callback)
    // return the callback, to make it easier to unsubscribe
    return callback
  }

  trigger<N extends keyof EventTopics, T extends keyof EventTopics[N]>(namespace: N, topic: T, data?: EventTopics[N][T]): void {
    const key = `${namespace}:${topic}`
    if (typeof this.eventTopics[key] !== 'undefined') {
      this.eventTopics[key].forEach(fn => fn(data))
    }
  }

  // remove all of topic
  off<N extends keyof EventTopics, T extends keyof EventTopics[N]>(namespace: N, topic: T, callback?: Function): void {
    const key = `${namespace}:${topic}`
    // remove all callbacks
    if (typeof callback === 'undefined') {
      delete this.eventTopics[key]
    }
    // look for, and remove a specific callback
    else {
      let found = false
      for (let i = 0; i < this.eventTopics[key].length; i++) {
        if (callback === this.eventTopics[key][i]) {
          this.eventTopics[key].splice(i)
          found = true
        }
      }
      if (found === false) {
        throw new Error(`could not find subscription with key ${key} to remove`)
      }
    }
  }
}
