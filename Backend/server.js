require('dotenv').config();
const express = require('express');
const cors = require('cors');
const calculate = require('./routes/calculate');
const excelRouter = require('./routes/excelExport');
const authRouter = require('./routes/authRoutes');
const errorHandler = require('./middlewares/errorMiddleware');
const { createUsersTable } = require('./models/userModel');

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
  }),
);
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api', calculate);
app.use('/api', excelRouter);
app.use('/api', authRouter);

app.use(errorHandler);

const PORT = process.env.PORT || 5000;

createUsersTable()
  .then(() => {
    app.listen(PORT, () => console.log('Server running on', PORT));
  })
  .catch((error) => {
    console.error('Failed to initialize database tables:', error.message);
    process.exit(1);
  });
