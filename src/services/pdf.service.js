const PDFDocument = require('pdfkit');

const L = 50;   // left margin
const R = 550;  // right edge
const W = 500;  // total content width

function fmt(n) { return `Rs.${(n ?? 0).toFixed(2)}`; }

function hline(doc, color = '#dddddd') {
  doc.save().strokeColor(color).moveTo(L, doc.y).lineTo(R, doc.y).stroke().restore();
  doc.moveDown(0.4);
}

// Two fixed columns: left label (x=L, width=360) and right value (x=410, width=140, right-aligned)
function twoCol(doc, left, right, opts = {}) {
  const y    = doc.y;
  const font = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
  const size = opts.size || 10;

  doc.font(font).fontSize(size).fillColor(opts.color || '#111')
    .text(left, L, y, { width: 360, lineBreak: false });

  doc.font(font).fontSize(size).fillColor(opts.color || '#111')
    .text(right, 410, y, { width: 140, align: 'right', lineBreak: false });

  doc.moveDown(0.35);
}

function sectionTitle(doc, title) {
  doc.moveDown(0.2);
  doc.font('Helvetica-Bold').fontSize(9).fillColor('#E85D04').text(title, L);
  doc.moveDown(0.2);
}

async function generateInvoicePDF({ job, invoice_number, garage }) {
  return new Promise((resolve, reject) => {
    const doc    = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end',  () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const customer = job.customer_id || {};
    const bike     = job.bike_id     || {};

    // ── Garage header ──────────────────────────────────────────────────────
    if (garage?.name) {
      doc.font('Helvetica-Bold').fontSize(16).fillColor('#E85D04')
        .text(garage.name, L, doc.y, { align: 'center', width: W });
    }

    const garageSubLines = [garage?.address, garage?.city, garage?.phone, garage?.gstin ? `GSTIN: ${garage.gstin}` : null]
      .filter(Boolean).join('  |  ');
    if (garageSubLines) {
      doc.font('Helvetica').fontSize(8).fillColor('#666')
        .text(garageSubLines, L, doc.y, { align: 'center', width: W });
    }

    doc.moveDown(0.6);
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111')
      .text('INVOICE', L, doc.y, { align: 'center', width: W });
    doc.moveDown(0.3);

    // Invoice # and date — right aligned
    const invY = doc.y;
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`Invoice #: ${invoice_number}`, L, invY, { width: W, align: 'right' });
    doc.font('Helvetica').fontSize(9).fillColor('#555')
      .text(`Date: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`,
        L, doc.y, { width: W, align: 'right' });

    doc.moveDown(0.6);
    hline(doc, '#aaaaaa');

    // ── Customer & Vehicle two-column block ───────────────────────────────
    const blockY = doc.y;

    // Left column: customer
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#E85D04').text('CUSTOMER', L, blockY);
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(customer.name || '—', L);
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    if (customer.phone)   doc.text(`Phone: ${customer.phone}`, L);
    if (customer.address) doc.text(customer.address, L);

    const leftBottomY = doc.y;

    // Right column: vehicle (restart from blockY)
    const rX = 310;
    const rW = 240;
    doc.font('Helvetica-Bold').fontSize(8).fillColor('#E85D04').text('VEHICLE', rX, blockY, { width: rW });
    doc.font('Helvetica-Bold').fontSize(11).fillColor('#111')
      .text(`${bike.make || '—'} ${bike.model || ''}`.trim(), rX, doc.y, { width: rW });
    doc.font('Helvetica').fontSize(9).fillColor('#444');
    if (bike.plate_number) doc.text(`Plate: ${bike.plate_number}`,                        rX, doc.y, { width: rW });
    if (bike.year)         doc.text(`Year: ${bike.year}`,                                 rX, doc.y, { width: rW });
    if (bike.fuel_type)    doc.text(`Fuel: ${bike.fuel_type.charAt(0).toUpperCase() + bike.fuel_type.slice(1)}`, rX, doc.y, { width: rW });
    if (job.odometer_in)   doc.text(`Odometer in: ${job.odometer_in} km`,                 rX, doc.y, { width: rW });

    const rightBottomY = doc.y;

    // Advance past whichever column was taller
    doc.y = Math.max(leftBottomY, rightBottomY) + 8;

    hline(doc, '#aaaaaa');

    // Job meta row
    doc.font('Helvetica').fontSize(9).fillColor('#555');
    const metaParts = [`Job #: ${job.job_number}`];
    if (job.assigned_to?.name) metaParts.push(`Mechanic: ${job.assigned_to.name}`);
    if (job.created_at)        metaParts.push(`Created: ${new Date(job.created_at).toLocaleDateString('en-IN')}`);
    doc.text(metaParts.join('   •   '), L, doc.y, { width: W });

    doc.moveDown(0.6);

    // ── Inspection notes ───────────────────────────────────────────────────
    if (job.inspection_notes) {
      sectionTitle(doc, 'INSPECTION NOTES');
      doc.font('Helvetica').fontSize(9).fillColor('#333')
        .text(job.inspection_notes, L + 8, doc.y, { width: W - 8 });
      doc.moveDown(0.4);
    }

    // ── Mechanic notes ─────────────────────────────────────────────────────
    if (job.mechanic_notes) {
      sectionTitle(doc, 'MECHANIC NOTES');
      doc.font('Helvetica').fontSize(9).fillColor('#333')
        .text(job.mechanic_notes, L + 8, doc.y, { width: W - 8 });
      doc.moveDown(0.4);
    }

    hline(doc, '#aaaaaa');

    // ── Services ──────────────────────────────────────────────────────────
    if (job.services?.length > 0) {
      sectionTitle(doc, 'SERVICES');
      job.services.forEach((s) => {
        const label = s.name + (s.is_done ? '' : ' (pending)');
        twoCol(doc, `  ${label}`, fmt(s.labour_charge));
      });
      doc.moveDown(0.3);
    }

    // ── Parts ─────────────────────────────────────────────────────────────
    if (job.parts_used?.length > 0) {
      sectionTitle(doc, 'PARTS USED');
      job.parts_used.forEach((p) => {
        const suffix = p.source_type === 'customer_supplied' ? ' (customer supplied)' : '';
        twoCol(doc, `  ${p.name} × ${p.quantity}${suffix}`, fmt(p.total_price));
      });
      doc.moveDown(0.3);
    }

    // ── Totals ────────────────────────────────────────────────────────────
    hline(doc, '#aaaaaa');
    twoCol(doc, 'Subtotal',                          fmt(job.subtotal),      { size: 9, color: '#555' });
    twoCol(doc, `GST (${job.gst_rate ?? 18}%)`,      fmt(job.gst_amount),    { size: 9, color: '#555' });
    hline(doc, '#cccccc');
    twoCol(doc, 'Total',                             fmt(job.total_amount),  { bold: true, size: 12 });
    doc.moveDown(0.3);
    twoCol(doc, `Payment: ${(job.payment_mode || '—').toUpperCase()}`,
                `Paid: ${fmt(job.amount_paid)}`,                             { size: 9, color: '#444' });

    if (job.balance_due > 0) {
      doc.moveDown(0.2);
      twoCol(doc, 'Balance Due', fmt(job.balance_due), { bold: true, size: 10, color: '#c62828' });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    doc.moveDown(1.5);
    hline(doc, '#dddddd');
    doc.font('Helvetica').fontSize(8).fillColor('#999')
      .text('Thank you for your business!', L, doc.y, { align: 'center', width: W });
    if (garage?.name) {
      doc.text(garage.name, L, doc.y, { align: 'center', width: W });
    }

    doc.end();
  });
}

module.exports = { generateInvoicePDF };
