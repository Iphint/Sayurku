const express = require('express')
require('dotenv').config()
const cors = require('cors')
const bodyParser = require('body-parser');
const app = express()

// connect database
const connectDB = require('./app/config/Connection')
connectDB()

// test port number
const port = process.env.PORT || 3001

// use cors and body-parser
app.use(cors())

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/', require('./app/router/Navigation'))

// test server
app.listen(port, () => {
  console.log(`Example app listening at http://localhost:${port}`)
})