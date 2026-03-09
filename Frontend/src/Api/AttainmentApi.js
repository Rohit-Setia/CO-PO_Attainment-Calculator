import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api'

export const calculateAttainment = async (students, coMax, thresholdPercent,levelCriteria,) => {
  const data = {
    students: students.map(s => ({
      regNo: s.roll,
      name: s.name,
      co1: s.co1, co2: s.co2, co3: s.co3, co4: s.co4, co5: s.co5
    })),
    coMaxMarks: {
      CO1: coMax.co1, CO2: coMax.co2, CO3: coMax.co3, 
      CO4: coMax.co4, CO5: coMax.co5
    },
    thresholdPercent,
    levelCriteria 
  }
  
  return axios.post(`${API_BASE}/calculate`, data)
}

export const downloadExcel = async (students, coMax, results,levelCriteria, thresholdPercent, courseInfo = {}) => {
    const res = await axios.post(`${API_BASE}/export-excel`, {
      students: students.map(s => ({
        regNo: s.roll, name: s.name,
        CO1: s.co1, CO2: s.co2, CO3: s.co3, CO4: s.co4, CO5: s.co5
      })),
      coMaxMarks: {
        CO1: coMax.co1, CO2: coMax.co2, CO3: coMax.co3, 
        CO4: coMax.co4, CO5: coMax.co5
      },
      results,levelCriteria, thresholdPercent,
      courseInfo
    }, { responseType: 'blob' });
    
    return res.data
  }