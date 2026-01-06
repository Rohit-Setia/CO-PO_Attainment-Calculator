import { Input } from "@/components/ui/input"
import { COS } from "@/utils/calculations"

export default function CoMaxEditor({ coMax, setCoMax, totalMax, setTotalMax, thresholdPercent, setThresholdPercent, levelCriteria, setLevelCriteria }) {

  const safeNumber = (value) => {
    const num = Number(value)
    setTotalMax(isNaN(num) ? 0 : Math.max(0, num))
  }

  /* =========================
  HANDLE TOTAL MAX CHANGE
========================= */
const handleTotalChange = (value) => {
 const newTotal = safeNumber(value)

 // Adjust COs if sum exceeds new total
 let sum = Object.values(coMax).reduce((a, b) => a + b, 0)

 const newCoMax = { ...coMax }

 if (sum > newTotal && sum > 0) {
   const ratio = newTotal / sum
   Object.keys(newCoMax).forEach((co) => {
     newCoMax[co] = Math.floor(newCoMax[co] * ratio)
   })
 }

 setTotalMax(newTotal)
 setCoMax(newCoMax)
}

/* =========================
  HANDLE CO MAX CHANGE
========================= */
const handleCoChange = (co, value) => {
 const newVal = safeNumber(value)
 const newCoMax = { ...coMax, [co]: newVal }

 const sum = Object.values(newCoMax).reduce((a, b) => a + b, 0)

 if (sum <= totalMax) {
   setCoMax(newCoMax)
 }
 // ❌ silently ignore if exceeds total
}

return (
 <div className="space-y-6 mb-6">

   {/* TOTAL MAX FIRST */}
   <div className="flex items-center gap-3">
     <span className="uppercase font-semibold">Total Max</span>
     <Input
       type="number"
       min={0}
       className="w-28"
       value={totalMax}
       onChange={(e) => handleTotalChange(e.target.value)}


     />
   </div>

   {/* CO MAXS */}
   <div className="flex gap-4 flex-wrap">
     {COS.map((co) => (
       <div key={co} className="flex items-center gap-2">
         <span className="uppercase font-medium">{co} Max</span>
         <Input
           type="number"
           min={0}
           className="w-20"
           value={coMax[co]}
           onChange={(e) =>
             handleCoChange(co, e.target.value)
           }
         />
       </div>
     ))}
   </div>

   {/* THRESHOLD + LEVEL */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg border">
        <div className="flex flex-col justify-center items-center" >
          <label className="block text-sm font-medium mb-2">Threshold %</label>
          <Input 
            type="number" 
            value={thresholdPercent || 40}
            onChange={(e) => setThresholdPercent(Number(e.target.value))}
            className="w-32" min={0} max={100} placeholder="40"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-2">Level Criteria</label>
          <div className="flex gap-2 text-xs items-center">
            <Input type="number" value={levelCriteria?.level3||70} onChange={(e)=>setLevelCriteria({...levelCriteria,level3:Number(e.target.value)})} className="w-20" placeholder="70"/>≥L3
            <Input type="number" value={levelCriteria?.level2||60} onChange={(e)=>setLevelCriteria({...levelCriteria,level2:Number(e.target.value)})} className="w-20" placeholder="60"/>≥L2
            <Input type="number" value={levelCriteria?.level1||50} onChange={(e)=>setLevelCriteria({...levelCriteria,level1:Number(e.target.value)})} className="w-20" placeholder="50"/>≥L1
          </div>
        </div>
        </div>
    </div>
  )
}
