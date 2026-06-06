const express = require('express');
const path = require('path');
const app = express();

// color/public 서빙 (index.html, app.js, css/buttons, css/components 등)
app.use(express.static(path.join(__dirname, 'public')));

// 2nd_page/public 서빙 (save.html, css/save.css 등)
app.use(express.static(path.join(__dirname, '..', '2nd_page', 'public')));

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});