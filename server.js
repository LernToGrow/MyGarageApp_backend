require('dotenv').config();
// Fix: local DNS resolver (127.0.0.1) blocks SRV lookups — use Google/Cloudflare instead
require('dns').setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
});
