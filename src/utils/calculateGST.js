const GST_RATE = 0.18;

function calculateTotals(services = [], parts = []) {
  const servicesTotal = services.reduce((sum, s) => sum + (s.labour_charge || 0), 0);

  const partsTotal = parts.reduce((sum, p) => {
    if (p.source_type === 'customer_supplied') return sum;
    return sum + (p.total_price || 0);
  }, 0);

  const subtotal     = servicesTotal + partsTotal;
  const gst_amount   = Math.round(subtotal * GST_RATE);
  const total_amount = subtotal + gst_amount;

  return { subtotal, gst_amount, total_amount };
}

module.exports = calculateTotals;
