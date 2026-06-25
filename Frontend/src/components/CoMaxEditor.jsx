import { Input } from "@/components/ui/input"
import { COS } from "@/utils/calculations"

export default function CoMaxEditor({ coMax, setCoMax, totalMax, setTotalMax, thresholdPercent, setThresholdPercent, levelCriteria, setLevelCriteria }) {

  const isValidFloat = (val) => {
    return val === "" || /^\d*\.?\d*$/.test(val);
  }

  /* =========================
     HANDLE TOTAL MAX CHANGE
  ========================= */
  const handleTotalChange = (value) => {
    if (!isValidFloat(value)) return
    setTotalMax(value)
  }

  const handleTotalBlur = () => {
    if (totalMax === "" || isNaN(parseFloat(totalMax)) || parseFloat(totalMax) <= 0) {
      setTotalMax(60)
    } else {
      setTotalMax(parseFloat(totalMax))
    }
  }

  /* =========================
     HANDLE CO MAX CHANGE
  ========================= */
  const handleCoChange = (co, value) => {
    if (!isValidFloat(value)) return
    const newCoMax = { ...coMax, [co]: value }
    setCoMax(newCoMax)

    // Auto-increase totalMax if the new sum exceeds current totalMax
    if (value !== "") {
      const sum = Object.values(newCoMax).reduce((a, b) => a + Number(b || 0), 0)
      if (sum > Number(totalMax || 0)) {
        setTotalMax(sum)
      }
    }
  }

  const handleCoBlur = (co) => {
    const val = coMax[co]
    let defaultVal = 10
    if (co === "co4" || co === "co5") {
      defaultVal = 15
    }
    let parsedVal = parseFloat(val)
    if (val === "" || isNaN(parsedVal) || parsedVal <= 0) {
      parsedVal = defaultVal
    }
    const newCoMax = { ...coMax, [co]: parsedVal }
    setCoMax(newCoMax)

    // Also adjust totalMax if sum exceeds totalMax
    const sum = Object.values(newCoMax).reduce((a, b) => a + Number(b || 0), 0)
    if (sum > Number(totalMax || 0)) {
      setTotalMax(sum)
    }
  }

  const handleThresholdChange = (value) => {
    if (!isValidFloat(value)) return
    setThresholdPercent(value)
  }

  const handleThresholdBlur = () => {
    const val = thresholdPercent
    if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) < 0 || parseFloat(val) > 100) {
      setThresholdPercent(40)
    } else {
      setThresholdPercent(parseFloat(val))
    }
  }

  const handleLevelChange = (level, value) => {
    if (!isValidFloat(value)) return
    setLevelCriteria({ ...levelCriteria, [level]: value })
  }

  const handleLevelBlur = (level) => {
    const val = levelCriteria[level]
    let defaultVal = 50
    if (level === "level3") defaultVal = 70
    if (level === "level2") defaultVal = 60
    
    if (val === "" || isNaN(parseFloat(val)) || parseFloat(val) < 0 || parseFloat(val) > 100) {
      setLevelCriteria(prev => ({ ...prev, [level]: defaultVal }))
    } else {
      setLevelCriteria(prev => ({ ...prev, [level]: parseFloat(val) }))
    }
  }

  return (
    <div className="space-y-6 mb-6">

      {/* TOTAL MAX FIRST */}
      <div className="flex items-center gap-3">
        <span className="uppercase font-semibold">Total Max</span>
        <Input
          type="text"
          className="w-28 font-bold"
          value={totalMax !== undefined && totalMax !== null ? totalMax : ""}
          onChange={(e) => handleTotalChange(e.target.value)}
          onBlur={handleTotalBlur}
        />
      </div>

      {/* CO MAXS */}
      <div className="flex gap-4 flex-wrap">
        {COS.map((co) => (
          <div key={co} className="flex items-center gap-2">
            <span className="uppercase font-medium">{co} Max</span>
            <Input
              type="text"
              className="w-20 font-bold"
              value={coMax[co] !== undefined && coMax[co] !== null ? coMax[co] : ""}
              onChange={(e) =>
                handleCoChange(co, e.target.value)
              }
              onBlur={() => handleCoBlur(co)}
            />
          </div>
        ))}
      </div>

      {/* THRESHOLD + LEVEL */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border">
        <div className="flex flex-col justify-center items-center" >
          <label className="block text-sm font-medium mb-2">Threshold %</label>
          <Input 
            type="text" 
            value={thresholdPercent !== undefined && thresholdPercent !== null ? thresholdPercent : ""}
            onChange={(e) => handleThresholdChange(e.target.value)}
            onBlur={handleThresholdBlur}
            className="w-32 font-bold text-center" placeholder="40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Level Criteria</label>
          <div className="flex gap-2 text-xs items-center">
            <Input 
              type="text" 
              value={levelCriteria?.level3 !== undefined && levelCriteria?.level3 !== null ? levelCriteria.level3 : ""} 
              onChange={(e) => handleLevelChange('level3', e.target.value)}
              onBlur={() => handleLevelBlur('level3')}
              className="w-20 font-bold text-center" 
              placeholder="70"
            />≥L3
            <Input 
              type="text" 
              value={levelCriteria?.level2 !== undefined && levelCriteria?.level2 !== null ? levelCriteria.level2 : ""} 
              onChange={(e) => handleLevelChange('level2', e.target.value)}
              onBlur={() => handleLevelBlur('level2')}
              className="w-20 font-bold text-center" 
              placeholder="60"
            />≥L2
            <Input 
              type="text" 
              value={levelCriteria?.level1 !== undefined && levelCriteria?.level1 !== null ? levelCriteria.level1 : ""} 
              onChange={(e) => handleLevelChange('level1', e.target.value)}
              onBlur={() => handleLevelBlur('level1')}
              className="w-20 font-bold text-center" 
              placeholder="50"
            />≥L1
          </div>
        </div>
      </div>
    </div>
  )
}
