const express = require('express');
const cors = require('cors');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Garage API running' });
});

// Routes
app.use('/api/auth',      require('./routes/auth.routes'));
app.use('/api/jobs',       require('./routes/job.routes'));
app.use('/api/customers',  require('./routes/customer.routes'));
app.use('/api/parts',      require('./routes/part.routes'));
app.use('/api/employees',  require('./routes/employee.routes'));
app.use('/api/dashboard',  require('./routes/dashboard.routes'));
app.use('/api/services',   require('./routes/service.routes'));
app.use('/api/admin',      require('./routes/admin.routes'));

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

module.exports = app;
