/**
 * Run once to seed default service catalog for a garage.
 * Usage: node seed-services.js <garage_id>
 *
 * Example: node seed-services.js 664f1a2b3c4d5e6f7a8b9c0d
 */

require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const Service = require('./src/models/Service.model');

const SERVICES = [
  // General Bike Services
  { name: 'General Service',          category: 'General',    default_charge: 500  },
  { name: 'Periodic Maintenance',     category: 'General',    default_charge: 600  },
  { name: 'Full Service',             category: 'General',    default_charge: 1200 },
  { name: 'Water Wash',               category: 'Cleaning',   default_charge: 150  },
  { name: 'Foam Wash',                category: 'Cleaning',   default_charge: 250  },
  { name: 'Detailing',                category: 'Cleaning',   default_charge: 800  },
  { name: 'Engine Check',             category: 'Engine',     default_charge: 300  },
  { name: 'Oil Change',               category: 'Engine',     default_charge: 200  },
  { name: 'Brake Service',            category: 'Brakes',     default_charge: 350  },
  { name: 'Chain Cleaning',           category: 'General',    default_charge: 150  },
  { name: 'Clutch Service',           category: 'General',    default_charge: 400  },
  { name: 'Suspension Check',         category: 'Suspension', default_charge: 300  },
  { name: 'Battery Check',            category: 'Electrical', default_charge: 150  },
  { name: 'Tyre Replacement',         category: 'Tyres',      default_charge: 200  },
  { name: 'Wheel Alignment',          category: 'Tyres',      default_charge: 250  },
  { name: 'Puncture Repair',          category: 'Tyres',      default_charge: 100  },
  { name: 'Electrical Repair',        category: 'Electrical', default_charge: 400  },
  { name: 'Headlight Repair',         category: 'Electrical', default_charge: 300  },
  { name: 'Horn Repair',              category: 'Electrical', default_charge: 150  },
  { name: 'Self Start Repair',        category: 'Electrical', default_charge: 500  },
  { name: 'Silencer Repair',          category: 'Engine',     default_charge: 400  },
  { name: 'Engine Overhaul',          category: 'Engine',     default_charge: 5000 },
  { name: 'Accident Repair',          category: 'Body',       default_charge: 2000 },
  { name: 'Insurance Claim Repair',   category: 'Body',       default_charge: 0    },
  { name: 'Pickup & Drop',            category: 'Service',    default_charge: 300  },
  { name: 'Emergency Breakdown',      category: 'Service',    default_charge: 500  },
  // Premium Services
  { name: 'Ceramic Coating',          category: 'Premium',    default_charge: 3500 },
  { name: 'Teflon Coating',           category: 'Premium',    default_charge: 2500 },
  { name: 'Bike Spa',                 category: 'Premium',    default_charge: 1500 },
  { name: 'Custom Modification',      category: 'Premium',    default_charge: 0    },
  { name: 'Performance Tuning',       category: 'Premium',    default_charge: 1000 },
  // Electric Bike Services
  { name: 'Battery Diagnostics',      category: 'Electric',   default_charge: 500  },
  { name: 'Motor Repair',             category: 'Electric',   default_charge: 2000 },
  { name: 'Controller Repair',        category: 'Electric',   default_charge: 1500 },
  { name: 'Charging Port Repair',     category: 'Electric',   default_charge: 600  },
];

async function seed() {
  const garage_id = process.argv[2];
  if (!garage_id || !mongoose.isValidObjectId(garage_id)) {
    console.error('Usage: node seed-services.js <garage_id>');
    process.exit(1);
  }

  await connectDB();

  let created = 0;
  let skipped = 0;

  for (const svc of SERVICES) {
    const exists = await Service.findOne({ garage_id, name: svc.name });
    if (exists) { skipped++; continue; }
    await Service.create({ garage_id, ...svc });
    created++;
  }

  console.log(`Done. Created: ${created}, Skipped (already exist): ${skipped}`);
  process.exit(0);
}

seed().catch((err) => { console.error(err); process.exit(1); });
