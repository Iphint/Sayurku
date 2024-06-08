const multer = require('multer');
const path = require('path');

const fileFilter = (req, file, cb) => {
    const allowedExtensions = ['.jpg', '.jpeg', '.png'];
    const fileExt = path.extname(file.originalname).toLowerCase();
    if (allowedExtensions.includes(fileExt)) {
      cb(null, true);
    } else {
      cb(new Error('Only .jpg, .jpeg, and .png files are allowed!'), false);
    }
  };

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'app/uploads/');
  },
  filename: function (req, file, cb) {
    cb(
      null,
      file.fieldname + '-' + Date.now() + path.extname(file.originalname)
    );
  },
});

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
});

module.exports = upload;
