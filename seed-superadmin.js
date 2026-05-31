require('dotenv').config();
require('dns').setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./src/models/User.model');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);

  const phone = process.env.SUPER_ADMIN_PHONE;
  const password = process.env.SUPER_ADMIN_PASSWORD;

  if (!phone || !password) {
    console.error('Set SUPER_ADMIN_PHONE and SUPER_ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  const existing = await User.findOne({ phone });
  if (existing) {
    console.log(`User with phone ${phone} already exists (role: ${existing.role})`);
    await mongoose.disconnect();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await User.create({
    phone,
    name: 'Super Admin',
    role: 'super_admin',
    password_hash: hash,
    permissions: [],
  });

  console.log(`Super admin created: ${phone}`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
