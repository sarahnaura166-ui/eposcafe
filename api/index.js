const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// ---------------------------------------------------------------------------
// Inisialisasi Firebase Admin (tidak boleh melempar error saat modul dimuat,
// karena akan membuat seluruh serverless function gagal dijalankan).
// ---------------------------------------------------------------------------
let db = null;
let initError = null;

function bacaServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw || !raw.trim()) return null;

  const teks = raw.trim();
  // Dukung dua format: JSON mentah, atau JSON yang di-encode base64.
  const json = teks.startsWith('{')
    ? teks
    : Buffer.from(teks, 'base64').toString('utf8');

  const serviceAccount = JSON.parse(json);

  // Vercel sering menyimpan newline pada private_key sebagai "\n" literal.
  if (typeof serviceAccount.private_key === 'string') {
    serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
  }

  return serviceAccount;
}

try {
  if (!admin.apps.length) {
    const serviceAccount = bacaServiceAccount();
    if (!serviceAccount) {
      throw new Error(
        'Environment variable FIREBASE_SERVICE_ACCOUNT belum diset di Vercel.'
      );
    }
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  }
  db = admin.firestore();
} catch (error) {
  initError = error.message;
  console.error('[firebase] Inisialisasi gagal:', error.message);
}

// ---------------------------------------------------------------------------
// Router API. Dipasang di "/" dan "/api" agar tetap jalan baik saat Vercel
// meneruskan path asli maupun path yang sudah di-rewrite.
// ---------------------------------------------------------------------------
const api = express.Router();

// Semua route butuh database. Jika Firebase belum siap, kembalikan pesan yang
// jelas (503) alih-alih crash tanpa respons.
api.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({
      error: 'Database belum siap. Periksa konfigurasi FIREBASE_SERVICE_ACCOUNT.',
      detail: initError
    });
  }
  next();
});

// 1. GET: Ambil daftar menu cafe
api.get('/menu', async (req, res) => {
  try {
    const snapshot = await db.collection('menu').get();
    const menu = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. POST: Tambah menu baru
api.post('/menu', async (req, res) => {
  try {
    const { name, price, category } = req.body || {};
    const harga = parseFloat(price);
    if (!name || !Number.isFinite(harga)) {
      return res.status(400).json({ error: 'Nama dan harga menu wajib diisi' });
    }
    const newItem = {
      name: String(name).trim(),
      price: harga,
      category: category || 'Umum',
      createdAt: new Date()
    };
    const docRef = await db.collection('menu').add(newItem);
    res.status(201).json({ id: docRef.id, ...newItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. POST: Simpan transaksi pesanan baru (Checkout)
api.post('/orders', async (req, res) => {
  try {
    const { items, totalAmount, customerName } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang pesanan kosong' });
    }
    const total = parseFloat(totalAmount);
    if (!Number.isFinite(total)) {
      return res.status(400).json({ error: 'Total pesanan tidak valid' });
    }
    const newOrder = {
      customerName: customerName || 'Pelanggan Umum',
      items,
      totalAmount: total,
      status: 'Completed',
      createdAt: new Date()
    };
    const docRef = await db.collection('orders').add(newOrder);
    res.status(201).json({ id: docRef.id, message: 'Pesanan berhasil diproses', ...newOrder });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. GET: Ambil riwayat transaksi pesanan
api.get('/orders', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(20).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.use('/api', api);
app.use('/', api);

module.exports = app;
