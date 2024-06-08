const connectDB = require('../config/Connection');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const RegisterUser = async (req, res) => {
  let { name, email, password, confirmPassword } = req.body;
  try {
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Please enter all fields' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Passwords must match' });
    }
    const connection = await connectDB();
    connection.query(
      'SELECT * FROM users WHERE email = ?',
      [email],
      async (error, results) => {
        if (error) {
          console.error('Error checking email in database:', error.message);
          connection.end();
          return res
            .status(500)
            .json({ error: 'Error checking email in database' });
        }
        if (results.length > 0) {
          connection.end();
          return res.status(400).json({ error: 'Email already exists' });
        }
        const hashedPassword = await bcrypt.hash(password, 10);
        connection.query(
          'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
          [name, email, hashedPassword],
          (error, results) => {
            connection.end();
            if (error) {
              console.error('Error saving user to database:', error.message);
              return res
                .status(500)
                .json({ error: 'Error saving user to database' });
            }

            res.json({
              message: 'User registered successfully',
              user: { name, email },
            });
          }
        );
      }
    );
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
};
const LoginUser = async (req, res) => {
  let email, password;
  try {
    ({ email, password } = req.body);
    if (!email || !password) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }
    const connection = await connectDB();
    connection.query(
      'SELECT * FROM users WHERE email = ?',
      [email],
      async (error, results) => {
        if (error) {
          console.error('Error querying database:', error.message);
          return res.status(500).json({ error: 'Error querying database' });
        }
        if (results.length === 0) {
          return res.status(404).json({ error: 'Email not found' });
        }
        const user = results[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).json({ error: 'Incorrect password' });
        }
        req.user = user;
        const token = jwt.sign(
          { id: user.id, name: user.name },
          process.env.JWT_SECRET,
          {
            expiresIn: '5h',
          }
        );
        console.log('Login successfully');
        res.json({
          message: 'Login successful',
          user: {
            name: user.name,
            email: user.email,
            token: token,
          },
        });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ error: err.message });
  }
};
const GetAllProduct = async (req, res) => {
  try {
    const connection = await connectDB();
    connection.query(
      'SELECT products.*, images.image_title, users.id AS userId FROM products LEFT JOIN images ON products.id = images.product_id LEFT JOIN users ON products.user_id = users.id',
      (error, results) => {
        if (error) {
          console.error('Error querying database:', error.message);
          return res.status(500).json({ error: 'Error querying database' });
        }
        const productsWithImages = results.reduce((acc, curr) => {
          if (!acc[curr.id]) {
            acc[curr.id] = {
              id: curr.id,
              userId: curr.userId,
              name: curr.name,
              category: curr.category,
              price: curr.price,
              condition: curr.condition,
              images: [],
            };
          }
          if (curr.image_title) {
            acc[curr.id].images.push(curr.image_title);
          }
          return acc;
        }, {});
        const productsArray = Object.values(productsWithImages);
        res.json({ data: productsArray });
      }
    );
  } catch (err) {
    console.error(err.message);
    res.status(400).json({ error: err.message });
  }
};
const CreateProduct = async (req, res) => {
  const { name, category, price, condition } = req.body;
  const userId = req.user.id;
  const images = req.files ? req.files.map((file) => file.filename) : [];

  try {
    if (!name || !category || !price || !condition || images.length === 0) {
      return res.status(400).json({ error: 'Please fill in all fields' });
    }
    const connection = await connectDB();
    connection.beginTransaction((err) => {
      if (err) {
        connection.end();
        throw err;
      }
      connection.query(
        'INSERT INTO products (user_id, name, category, price, `condition`) VALUES (?, ?, ?, ?, ?)',
        [userId, name, category, price, condition],
        (error, result) => {
          if (error) {
            return connection.rollback(() => {
              connection.end();
              console.log('Error saving product to database:', error.message);
              res
                .status(500)
                .json({ error: 'Error saving product to database' });
            });
          }
          const productId = result.insertId;
          const imageQueries = images.map((image) => {
            return new Promise((resolve, reject) => {
              connection.query(
                'INSERT INTO images (product_id, image_title) VALUES (?, ?)',
                [productId, image],
                (error, result) => {
                  if (error) {
                    return reject(error);
                  }
                  resolve(result);
                }
              );
            });
          });
          Promise.all(imageQueries)
            .then(() => {
              connection.commit((err) => {
                if (err) {
                  return connection.rollback(() => {
                    connection.end();
                    throw err;
                  });
                }
                connection.end();
                res.json({
                  message: 'Product created successfully',
                  product: {
                    id: productId,
                    userId,
                    name,
                    category,
                    price,
                    condition,
                    images,
                  },
                });
              });
            })
            .catch((error) => {
              return connection.rollback(() => {
                connection.end();
                console.error(
                  'Error saving images to database:',
                  error.message
                );
                res
                  .status(500)
                  .json({ error: 'Error saving images to database' });
              });
            });
        }
      );
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
};
const UpdateProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, category, price, condition } = req.body;
    const images = req.files.map((file) => file.filename);
    const connection = await connectDB();

    // Mulailah transaksi basis data
    connection.beginTransaction(async (transactionErr) => {
      if (transactionErr) {
        console.error('Error starting transaction:', transactionErr.message);
        return res.status(500).json({ error: 'Transaction error' });
      }

      try {
        // Ambil gambar lama untuk menghapusnya
        const selectResults = await new Promise((resolve, reject) => {
          connection.query(
            'SELECT image_title FROM images WHERE product_id = ?',
            [productId],
            (selectError, results) => {
              if (selectError) {
                console.error(
                  'Error fetching photo filename from database:',
                  selectError.message
                );
                reject(selectError);
              } else {
                resolve(results);
              }
            }
          );
        });

        // Ulangi gambar-gambar lama dan hapus dari database dan secara lokal
        for (const result of selectResults) {
          const oldPhotoFilename = result.image_title;
          const oldPhotoPath = `app/uploads/${oldPhotoFilename}`;

          // Hapus file dari penyimpanan lokal
          fs.unlink(oldPhotoPath, (err) => {
            if (err) {
              console.error(
                'Error deleting old photo file locally:',
                err.message
              );
            } else {
              console.log('Old photo file deleted locally:', oldPhotoPath);
            }
          });

          // Hapus entri file dari database
          await new Promise((resolve, reject) => {
            connection.query(
              'DELETE FROM images WHERE image_title = ?',
              [oldPhotoFilename],
              (deleteError, deleteResults) => {
                if (deleteError) {
                  console.error(
                    'Error deleting old photo file from database:',
                    deleteError.message
                  );
                  reject(deleteError);
                } else {
                  console.log(
                    'Old photo file deleted from database:',
                    oldPhotoFilename
                  );
                  resolve();
                }
              }
            );
          });
        }

        // Perbarui detail produk di database
        await new Promise((resolve, reject) => {
          connection.query(
            'UPDATE products SET name = ?, category = ?, price = ?, `condition` = ? WHERE id = ?',
            [name, category, price, condition, productId],
            (updateError, updateResults) => {
              if (updateError) {
                console.error('Error updating product:', updateError.message);
                reject(updateError);
              } else {
                console.log('Product updated successfully');
                resolve();
              }
            }
          );
        });

        // Masukkan gambar baru ke dalam database
        for (const image of images) {
          await new Promise((resolve, reject) => {
            connection.query(
              'INSERT INTO images (product_id, image_title) VALUES (?, ?)',
              [productId, image],
              (insertError, insertResults) => {
                if (insertError) {
                  console.error('Error inserting image:', insertError.message);
                  reject(insertError);
                } else {
                  console.log('Image inserted successfully');
                  resolve();
                }
              }
            );
          });
        }

        // Lakukan transaksi
        connection.commit((commitErr) => {
          if (commitErr) {
            console.error('Error committing transaction:', commitErr.message);
            return res.status(500).json({ error: 'Transaction commit error' });
          }
          connection.query(
            'SELECT * FROM products WHERE id = ?',
            [productId],
            (fetchError, fetchResults) => {
              if (fetchError) {
                console.error(
                  'Error fetching updated product data:',
                  fetchError.message
                );
                return res
                  .status(500)
                  .json({ error: 'Error fetching updated product data' });
              } else {
                console.log('Updated product data:', fetchResults[0]);
                return res.status(200).json({
                  message: 'Product updated successfully',
                  updatedProduct: fetchResults[0],
                });
              }
            }
          );
        });
      } catch (error) {
        // Kembalikan transaksi jika terjadi kesalahan
        connection.rollback(() => {
          console.error('Transaction rolled back due to error:', error.message);
          return res.status(500).json({ error: 'Transaction rollback error' });
        });
      }
    });
  } catch (err) {
    console.error('Error in try-catch block:', err.message);
    res.status(400).json({ error: err.message });
  }
};
const DeleteProduct = async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const connection = await connectDB();

    // Ambil nama file gambar yang terkait dengan produk
    const fetchImagesQuery =
      'SELECT image_title FROM images WHERE product_id=?';
    connection.query(fetchImagesQuery, [id], async (fetchError, imagesRows) => {
      if (fetchError) {
        console.error('Error fetching images:', fetchError.message);
        connection.end();
        return res.status(500).json({ error: 'Error fetching images' });
      }

      // Pastikan imagesRows adalah sebuah array
      if (!Array.isArray(imagesRows)) {
        console.error('Images rows is not an array');
        connection.end();
        return res.status(500).json({ error: 'Error fetching images' });
      }

      // Hapus gambar dari penyimpanan lokal
      imagesRows.forEach((row) => {
        const imagePath = path.join(
          __dirname,
          '..',
          'uploads',
          row.image_title
        );
        if (fs.existsSync(imagePath)) {
          fs.unlinkSync(imagePath);
        }
      });

      // Hapus gambar dari database
      const deleteImagesQuery = 'DELETE FROM images WHERE product_id=?';
      connection.query(deleteImagesQuery, [id], async (deleteError, result) => {
        if (deleteError) {
          console.error('Error deleting images:', deleteError.message);
          connection.end();
          return res.status(500).json({ error: 'Error deleting images' });
        }

        // Hapus produk
        const deleteProductQuery =
          'DELETE FROM products WHERE id=? AND user_id=?';
        connection.query(deleteProductQuery, [id, userId], (error, result) => {
          if (error) {
            console.error('Error deleting product:', error.message);
            connection.end();
            return res.status(500).json({ error: 'Error deleting product' });
          }
          if (result.affectedRows === 0) {
            connection.end();
            return res.status(404).json({ error: 'Product not found' });
          }

          connection.end();
          res.json({ message: 'Product deleted successfully' });
        });
      });
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: error.message });
  }
};

// transaction
const CreateTransaction = async (req, res) => {
  const { user_id, product_id } = req.body;
  try {
    const connection = await connectDB();

    // Insert into the transaction table
    const insertTransactionQuery =
      'INSERT INTO transaction (user_id, product_id) VALUES (?, ?)';
    connection.query(
      insertTransactionQuery,
      [user_id, product_id],
      (err, result) => {
        if (err) {
          console.error('Error inserting transaction:', err.message);
          connection.end();
          return res.status(500).json({ error: 'Error inserting transaction' });
        }
        const insertValidasiQuery =
          'INSERT INTO validasi_payment (status, transaction_id) VALUES (?, ?)';
        connection.query(
          insertValidasiQuery,
          ['on process', result.insertId],
          (err, result) => {
            if (err) {
              console.error('Error inserting validation payment:', err.message);
              connection.end();
              return res
                .status(500)
                .json({ error: 'Error inserting validation payment' });
            }

            console.log('Transaction inserted successfully');
            connection.end();
            res.json({ message: 'Transaction inserted successfully' });
          }
        );
      }
    );
  } catch (error) {
    console.log('Error try catch block', error.message);
    res.status(500).json({ error: error.message });
  }
};
const ShowTransaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const connection = await connectDB();
    const TransactionQuery = `
        SELECT 
          transaction.id AS transaction_id, 
          transaction.user_id, 
          transaction.product_id, 
          products.name AS product_name, 
          products.category, 
          products.price, 
          products.condition, 
          users.name AS user_name, 
          users.email,
          validasi_payment.status AS status
        FROM transaction 
        LEFT JOIN products ON transaction.product_id = products.id 
        LEFT JOIN users ON transaction.user_id = users.id
        LEFT JOIN validasi_payment ON transaction.id = validasi_payment.transaction_id
        WHERE transaction.user_id = ?`;
    connection.query(TransactionQuery, [userId], (error, results) => {
      if (error) {
        console.error('Error fetching transactions:', error.message);
        connection.end();
        return res.status(500).json({ error: 'Error fetching transactions' });
      }
      console.log('Transactions fetched successfully');
      connection.end();
      res.json({ transactions: results });
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json('Error fetching transactions:', error.message);
  }
};
const DeleteTransaction = async (req, res) => {
  const { id } = req.params;
  try {
    const connection = await connectDB();
    const deleteValidasiQuery =
      'DELETE FROM validasi_payment WHERE transaction_id = ?';
    connection.query(deleteValidasiQuery, [id]);
    const deleteTransactionQuery = 'DELETE FROM transaction WHERE id = ?';
    connection.query(deleteTransactionQuery, [id], (err, result) => {
      if (err) {
        console.error('Error deleting transaction:', err.message);
        connection.end();
        return res.status(500).json({ error: 'Error deleting transaction' });
      }
      console.log('Transaction deleted successfully');
      connection.end();
      res.json({ message: 'Transaction deleted successfully' });
    });
  } catch (error) {
    console.log('Error try catch block', error.message);
    res.status(500).json({ error: error.message });
  }
};

// validasi payment
const ValidatePaymentTransaction = async (req, res) => {
  const { user_id } = req.body;
  try {
    const connection = await connectDB();
    const selectQuery = `
            SELECT transaction.user_id 
            FROM transaction 
            INNER JOIN validasi_payment ON transaction.id = validasi_payment.transaction_id
            WHERE transaction.user_id = ? AND validasi_payment.status = 'on process'
            LIMIT 1
        `;
    const result = connection.query(selectQuery, [user_id]);
    if (result.length === 0) {
      connection.end();
      return res
        .status(404)
        .json({ error: 'No transaction in process for this user' });
    }
    const updateQuery = `
            UPDATE validasi_payment 
            SET status = 'paid' 
            WHERE transaction_id IN (
                SELECT id FROM transaction WHERE user_id = ?
            ) AND status = 'on process'
        `;
    const response = {
      user_id: user_id,
      status: 'paid',
    };
    connection.query(updateQuery, [user_id]);
    connection.end();
    res.json({ message: 'Payment validated successfully', response });
  } catch (error) {
    console.error('Error validating payment:', error.message);
    res.status(500).json({ error: 'Error validating payment' });
  }
};

module.exports = {
  RegisterUser,
  LoginUser,
  GetAllProduct,
  CreateProduct,
  UpdateProduct,
  DeleteProduct,
  CreateTransaction,
  ShowTransaction,
  DeleteTransaction,
  ValidatePaymentTransaction,
};
