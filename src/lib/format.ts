export function formatNumber(number: number, showDecimal=false) {
  const str = showDecimal ? number.toFixed(2).toString() : Math.round(number).toString()
  let x = str.split('.')
  let x1 = x[0]
  let x2 = x.length > 1 ? '.' + x[1] : ''
  var rgx = /(\d+)(\d{3})/
  while (rgx.test(x1)) {
    x1 = x1.replace(rgx, '$1' + ',' + '$2')
  }
  return x1 + x2
}

export function formatCurrency(number: number, showCents=false) {
  return '$' + formatNumber(number, showCents)
}
