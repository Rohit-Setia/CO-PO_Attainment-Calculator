// require('dotenv').config();
const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

const calculate = require('./routes/calculate');
const excelRouter = require('./routes/excelExport');

app.use('/api', calculate);
app.use('/api', excelRouter);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log('Server running on', PORT)); 