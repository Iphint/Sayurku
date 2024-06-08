const express = require('express');
const {
  RegisterUser,
  LoginUser,
  CreateProduct,
  UpdateProduct,
  GetAllProduct,
  DeleteProduct,
  CreateTransaction,
  ShowTransaction,
  DeleteTransaction,
  ValidatePaymentTransaction,
} = require('../controller/UserController');
const AuthMiddleware = require('../auth/AuthMiddleware');
const upload = require('../config/MulterConfig');
const app = express.Router();

// user products
app.post('/register', RegisterUser);
app.post('/login', LoginUser);
app.get('/products', GetAllProduct);
app.post(
  '/products',
  AuthMiddleware,
  upload.array('images', 10),
  CreateProduct
);
app.put(
  '/products/:id',
  upload.array('images', 10),
  AuthMiddleware,
  UpdateProduct
);
app.delete('/products/:id', AuthMiddleware, DeleteProduct);

// user transactions
app.post('/transactions', AuthMiddleware, CreateTransaction);
app.get('/transactions', AuthMiddleware, ShowTransaction);
app.delete('/transactions/:id', AuthMiddleware, DeleteTransaction);
app.post('/validate-payment', AuthMiddleware, ValidatePaymentTransaction);

app.get('/dashboard', AuthMiddleware, (req, res) => {
  res.json({
    message: 'dashboard',
  });
});

module.exports = app;
