const mysql = require('mysql');
require('dotenv').config()

const connectDB = async () => {
    const connection = mysql.createConnection({
     host: process.env.DB_HOST,
     user: process.env.DB_USER,
     password: process.env.DB_PASSWORD,
     database: process.env.DB_DATABASE
    });
  
    connection.connect((err) => {
      if (err) {
        console.error('Error connecting to MySQL database:', err.message);
        return;
      }
      console.log('MySQL database connected');
    });
 
    return connection;
  };
 
 module.exports = connectDB;