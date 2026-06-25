export const COS = ["co1", "co2", "co3", "co4", "co5"]

export const calcOverallPercent = (student, coMax) => {
  let obtained = 0
  let max = 0
  COS.forEach((co) => {
    const val = parseFloat(student[co])
    obtained += isNaN(val) || val < 0 ? 0 : val
    max += Number(coMax[co]) || 0
  })
  if (max === 0) return "0.00"
  return ((obtained / max) * 100).toFixed(2)
}

export const calcCoPercent = (value, max) => {
  const numericMax = Number(max)
  if (!max || isNaN(numericMax) || numericMax === 0) {
    return "0.00"
  }
  const numericValue = parseFloat(value)
  if (isNaN(numericValue) || numericValue < 0) return "0.00"
  return ((numericValue / numericMax) * 100).toFixed(2)
}
