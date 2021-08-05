export function logGreen(message: string) {
  return `\x1b[32m${message}\x1b[0m`
}

export function logRed(message: string) {
  return `\x1b[31m${message}\x1b[0m`
}
