const express = require('express');
const admin = require('firebase-admin');

const app = express();
app.use(express.json());

// Inisialisasi Firebase Admin dari Environment Variable Vercel
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const db = admin.firestore();

// 1. GET: Ambil daftar menu cafe
app.get('/api/menu', async (req, res) => {
  try {
    const snapshot = await db.collection('menu').get();
    const menu = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(menu);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. POST: Tambah menu baru
app.post('/api/menu', async (req, res) => {
  try {
    const { name, price, category } = req.body;
    if (!name || !price) {
      return res.status(400).json({ error: 'Nama dan harga menu wajib diisi' });
    }
    const newItem = { name, price: parseFloat(price), category: category || 'Umum', createdAt: new Date() };
    const docRef = await db.collection('menu').add(newItem);
    res.status(201).json({ id: docRef.id, ...newItem });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. POST: Simpan transaksi pesanan baru (Checkout)
app.post('/api/orders', async (req, res) => {
  try {
    const { items, totalAmount, customerName } = req.body;
    if (!items || items.length === 0) {
      return res.status(400).json({ error: 'Keranjang pesanan kosong' });
    }
    const newOrder = {
      customerName: customerName || 'Pelanggan Umum',
      items,
      totalAmount: parseFloat(totalAmount),
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
app.get('/api/orders', async (req, res) => {
  try {
    const snapshot = await db.collection('orders').orderBy('createdAt', 'desc').limit(20).get();
    const orders = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    res.status(200).json(orders);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = app;