export const COS = ["co1", "co2", "co3", "co4", "co5", "co6"]

export const calcOverallPercent = (student, coMax) => {
  let obtained = 0
  let max = 0
  COS.forEach((co) => {
    obtained += student[co] || 0
    max += coMax[co]
  })
  return max === 0 ? 0 : Math.round((obtained / max) * 100)
}

export const calcCoPercent = (value, max) =>
  max === 0 ? "0.00" : ((value / max) * 100).toFixed(2)
