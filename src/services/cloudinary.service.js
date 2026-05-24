const cloudinary = require('cloudinary').v2;
const { Readable } = require('stream');

cloudinary.config({
  cloud_name:  process.env.CLOUDINARY_CLOUD_NAME,
  api_key:     process.env.CLOUDINARY_API_KEY,
  api_secret:  process.env.CLOUDINARY_API_SECRET,
});

function bufferToStream(buffer) {
  const readable = new Readable();
  readable.push(buffer);
  readable.push(null);
  return readable;
}

async function uploadPhoto(fileBuffer, folder = 'garage/inspections') {
  if (!process.env.CLOUDINARY_API_KEY) {
    console.log('[Cloudinary SKIP] No API key configured.');
    return null;
  }
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    bufferToStream(fileBuffer).pipe(uploadStream);
  });
}

async function uploadPDF(pdfBuffer, invoiceNumber) {
  if (!process.env.CLOUDINARY_API_KEY) {
    console.log('[Cloudinary SKIP] No API key configured.');
    return null;
  }
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'garage/invoices', public_id: invoiceNumber, resource_type: 'raw', format: 'pdf' },
      (err, result) => (err ? reject(err) : resolve(result.secure_url))
    );
    bufferToStream(pdfBuffer).pipe(uploadStream);
  });
}

module.exports = { uploadPhoto, uploadPDF };
