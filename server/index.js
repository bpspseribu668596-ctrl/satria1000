const express = require("express");
const mysql = require("mysql2/promise");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.join(__dirname, ".env") });

const app = express();
const port = process.env.PORT || 5000;

app.use(cors());
// Set limits high to allow for base64 encoded signatures and files
app.use(express.json({ limit: "50mb" })); 
app.use(express.urlencoded({ extended: true, limit: "50mb" }));

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

// --- DATABASE INITIALIZATION ---
async function initializeDatabase() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      nip VARCHAR(255) NOT NULL,
      username VARCHAR(255) NOT NULL,
      name VARCHAR(255) NOT NULL,
      password_hash VARCHAR(255),
      role TEXT,
      work_unit VARCHAR(255),
      signature LONGTEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS atk_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_code VARCHAR(255),
      name VARCHAR(255) NOT NULL,
      unit VARCHAR(50),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_number VARCHAR(255),
      requester_id INT,
      items LONGTEXT,
      status VARCHAR(50),
      submission_date VARCHAR(50),
      document_date VARCHAR(50),
      book_date VARCHAR(50),
      submission_location VARCHAR(255),
      fungsi_bagian VARCHAR(255),
      requester_signature LONGTEXT,
      requester_notes TEXT,
      verifier_id INT,
      verification_date VARCHAR(50),
      verifier_signature LONGTEXT,
      verification_notes TEXT,
      supervisor_id INT,
      approval_date VARCHAR(50),
      supervisor_signature LONGTEXT,
      approval_notes TEXT,
      rejection_reason TEXT,
      rejected_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_number VARCHAR(255),
      purchase_date VARCHAR(50),
      document_date VARCHAR(50),
      book_date VARCHAR(50),
      vendor_name VARCHAR(255),
      total_amount DECIMAL(15, 2),
      receipt_file LONGTEXT,
      receipt_filename VARCHAR(255),
      notes TEXT,
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS purchase_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      purchase_id INT,
      item_name VARCHAR(255),
      quantity DECIMAL(15, 2),
      unit VARCHAR(50),
      unit_price DECIMAL(15, 2),
      total DECIMAL(15, 2)
    )`,
    `CREATE TABLE IF NOT EXISTS atk_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_number VARCHAR(255),
      requester_id INT,
      reason TEXT,
      reference_link TEXT,
      fungsi_bagian VARCHAR(255),
      status VARCHAR(50),
      reviewed_by INT,
      reviewed_at VARCHAR(50),
      review_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS atk_request_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT,
      item_name VARCHAR(255),
      category VARCHAR(255),
      unit VARCHAR(50),
      quantity DECIMAL(15, 2),
      is_new_item BOOLEAN,
      final_item_name VARCHAR(255),
      atk_item_id INT
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      org_name VARCHAR(255),
      logo_url TEXT,
      budget_year VARCHAR(50),
      doc_format VARCHAR(255),
      whatsapp_number VARCHAR(50),
      official_name VARCHAR(255),
      official_nip VARCHAR(255),
      official_job VARCHAR(255),
      address TEXT,
      city VARCHAR(255)
    )`,
    `CREATE TABLE IF NOT EXISTS initial_balances (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_name VARCHAR(255),
      unit VARCHAR(50),
      quantity DECIMAL(15, 2),
      unit_price DECIMAL(15, 2),
      year INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS stock_opnames (
      id INT AUTO_INCREMENT PRIMARY KEY,
      item_name VARCHAR(255),
      unit VARCHAR(50),
      system_quantity DECIMAL(15, 2),
      actual_quantity DECIMAL(15, 2),
      difference DECIMAL(15, 2),
      month INT,
      year INT,
      notes TEXT,
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_masuk (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_number VARCHAR(255),
      transfer_date VARCHAR(50),
      document_date VARCHAR(50),
      book_date VARCHAR(50),
      source_satker VARCHAR(255),
      total_amount DECIMAL(15, 2),
      bast_file LONGTEXT,
      bast_filename VARCHAR(255),
      notes TEXT,
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_masuk_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transfer_id INT,
      item_name VARCHAR(255),
      quantity DECIMAL(15, 2),
      unit VARCHAR(50),
      unit_price DECIMAL(15, 2),
      total DECIMAL(15, 2)
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_keluar (
      id INT AUTO_INCREMENT PRIMARY KEY,
      document_number VARCHAR(255),
      transfer_date VARCHAR(50),
      document_date VARCHAR(50),
      book_date VARCHAR(50),
      destination_satker VARCHAR(255),
      total_amount DECIMAL(15, 2),
      bast_file LONGTEXT,
      bast_filename VARCHAR(255),
      notes TEXT,
      created_by INT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS transfer_keluar_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      transfer_id INT,
      item_name VARCHAR(255),
      quantity DECIMAL(15, 2),
      unit VARCHAR(50),
      unit_price DECIMAL(15, 2),
      total DECIMAL(15, 2)
    )`
  ];

  // Helper function for adding columns if missing
  async function addColumnIfNotExists(table, column, type) {
    try {
      const [cols] = await pool.query(`SHOW COLUMNS FROM \`${table}\` LIKE ?`, [column]);
      if (cols.length === 0) {
        await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${type}`);
        console.log(`Added column ${column} to ${table}`);
      }
    } catch (err) {
      console.error(`Error checking/adding column ${column} in ${table}:`, err.message);
    }
  }

  try {
    for (const sql of tables) {
      await pool.query(sql);
    }

    // Auto-migration for existing databases
    await addColumnIfNotExists("requests", "document_date", "VARCHAR(50)");
    await addColumnIfNotExists("requests", "book_date", "VARCHAR(50)");
    await addColumnIfNotExists("purchases", "document_date", "VARCHAR(50)");
    await addColumnIfNotExists("purchases", "book_date", "VARCHAR(50)");
    await addColumnIfNotExists("transfer_masuk", "document_date", "VARCHAR(50)");
    await addColumnIfNotExists("transfer_masuk", "book_date", "VARCHAR(50)");
    await addColumnIfNotExists("transfer_keluar", "document_date", "VARCHAR(50)");
    await addColumnIfNotExists("transfer_keluar", "book_date", "VARCHAR(50)");
    await addColumnIfNotExists("users", "signature", "LONGTEXT");

    // Backfill empty document_date and book_date from existing dates
    await pool.query(`UPDATE requests SET document_date = submission_date WHERE (document_date IS NULL OR document_date = '') AND submission_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE requests SET book_date = submission_date WHERE (book_date IS NULL OR book_date = '') AND submission_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE purchases SET document_date = purchase_date WHERE (document_date IS NULL OR document_date = '') AND purchase_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE purchases SET book_date = purchase_date WHERE (book_date IS NULL OR book_date = '') AND purchase_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE transfer_masuk SET document_date = transfer_date WHERE (document_date IS NULL OR document_date = '') AND transfer_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE transfer_masuk SET book_date = transfer_date WHERE (book_date IS NULL OR book_date = '') AND transfer_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE transfer_keluar SET document_date = transfer_date WHERE (document_date IS NULL OR document_date = '') AND transfer_date IS NOT NULL`).catch(() => {});
    await pool.query(`UPDATE transfer_keluar SET book_date = transfer_date WHERE (book_date IS NULL OR book_date = '') AND transfer_date IS NOT NULL`).catch(() => {});

    console.log("Database tables initialized successfully!");

    // Seed default admin if no users exist
    const [rows] = await pool.query("SELECT COUNT(*) as count FROM users");
    if (rows[0].count === 0) {
      await pool.query(
        "INSERT INTO users (nip, username, name, password_hash, role, work_unit) VALUES (?, ?, ?, ?, ?, ?)",
        ["123456", "admin", "Administrator", "admin123", '["admin", "operator", "verifikator"]', "BPS JAKARTA SELATAN"]
      );
      console.log("Default admin account seeded.");
    }
  } catch (error) {
    console.error("Database initialization error:", error);
  }
}

// Test connection and initialize
pool.getConnection()
  .then(conn => {
    console.log("Connected to MySQL database!");
    conn.release();
    initializeDatabase();
  })
  .catch(err => {
    console.error("Error connecting to database:", err);
  });

// --- AUTH ROUTE ---
app.post(["/api/login", "/login"], async (req, res) => {
  const { username, password } = req.body;
  try {
    const [users] = await pool.query("SELECT * FROM users WHERE username = ? OR nip = ?", [username, username]);
    if (users.length === 0) return res.status(401).json({ error: "Username tidak ditemukan" });

    const user = users[0];
    
    // Check password. If password_hash is NULL (like in our initial seed), allow fallback password 'admin123'
    let isValid = false;
    if (!user.password_hash) {
       // if no password in db yet, let's accept "admin123" for safety fallback
       if (password === 'admin123') isValid = true;
    } else if (password === user.password_hash) {
       // we are doing simple string match for this migration phase 
       isValid = true;
    }

    // TODO: In the future, we will use bcrypt here:
    // await bcrypt.compare(password, user.password_hash);

    if (!isValid) return res.status(401).json({ error: "Password salah. (Petunjuk: jika akun admin baru, coba 'admin123')" });

    // Parse role safely
    let role = user.role;
    try {
      if (typeof role === 'string') role = JSON.parse(role);
    } catch(e) {
      role = [role]; // fallback to array
    }

    const authUser = {
      id: user.id,
      nip: user.nip,
      username: String(user.username || user.nip),
      name: user.name,
      role: role,
      work_unit: user.work_unit,
      created_at: user.created_at,
    };

    res.json({ user: authUser });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// --- CHANGE PASSWORD ROUTE ---
app.post(["/api/auth/change-password", "/auth/change-password"], async (req, res) => {
  const { userId, oldPassword, newPassword } = req.body;
  try {
    const [users] = await pool.query("SELECT * FROM users WHERE id = ?", [userId]);
    if (users.length === 0) return res.status(404).json({ error: "User tidak ditemukan" });

    const user = users[0];
    
    // Check old password
    let isValid = false;
    if (!user.password_hash) {
      if (oldPassword === 'admin123') isValid = true;
    } else if (oldPassword === user.password_hash) {
      isValid = true;
    }

    if (!isValid) return res.status(401).json({ error: "Password lama salah" });

    // Update password
    await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [newPassword, userId]);
    
    res.json({ success: true, message: "Password berhasil diubah" });
  } catch (error) {
    console.error("Change Password Error:", error);
    res.status(500).json({ error: "Server error" });
  }
});


// --- GENERIC CRUD ROUTES ---

// GET All
app.get(["/api/:table", "/:table"], async (req, res) => {
  try {
    const table = req.params.table;
    if (!table.match(/^[a-zA-Z0-9_-]+$/)) return res.status(400).json({error: "Invalid table name"});
    
    const [rows] = await pool.query(`SELECT * FROM \`${table}\` ORDER BY id DESC`);
    
    // parse JSON fields
    rows.forEach(r => {
      if (r.items && typeof r.items === 'string' && r.items.startsWith('[')) {
        try { r.items = JSON.parse(r.items); } catch(e){}
      }
      if (r.role && typeof r.role === 'string' && r.role.startsWith('[')) {
        try { r.role = JSON.parse(r.role); } catch(e){}
      }
    });

    res.json(rows);
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE') return res.json([]);
    res.status(500).json({ error: error.message });
  }
});

// GET One
app.get(["/api/:table/:id", "/:table/:id"], async (req, res) => {
  try {
    const table = req.params.table;
    if (!table.match(/^[a-zA-Z0-9_-]+$/)) return res.status(400).json({error: "Invalid table name"});

    const [rows] = await pool.query(`SELECT * FROM \`${table}\` WHERE id = ?`, [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: "Not found" });
    
    let row = rows[0];
    if (row.items && typeof row.items === 'string' && row.items.startsWith('[')) {
        try { row.items = JSON.parse(row.items); } catch(e){}
    }
    res.json(row);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST Bulk (Create Multiple)
app.post(["/api/:table/bulk", "/:table/bulk"], async (req, res) => {
  try {
    const table = req.params.table;
    if (!table.match(/^[a-zA-Z0-9_-]+$/)) return res.status(400).json({error: "Invalid table name"});

    const items = req.body;
    if (!Array.isArray(items)) return res.status(400).json({error: "Data must be an array"});

    if (items.length === 0) return res.json({success: true, count: 0});

    // Handle JSON stringify for each item
    const processedItems = items.map(item => {
      const data = { ...item };
      delete data.id;
      if (data.items && typeof data.items !== 'string') data.items = JSON.stringify(data.items);
      if (data.role && typeof data.role !== 'string') data.role = JSON.stringify(data.role);
      
      // Convert ISO dates to MySQL format
      for (const key in data) {
         if (typeof data[key] === 'string' && data[key].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
           data[key] = data[key].slice(0, 19).replace('T', ' ');
         }
      }
      return data;
    });

    const keys = Object.keys(processedItems[0]);
    const values = processedItems.map(item => keys.map(key => item[key]));

    const [result] = await pool.query(
      `INSERT INTO \`${table}\` (\`${keys.join('`,`')}\`) VALUES ?`,
      [values]
    );

    res.status(201).json({ success: true, count: result.affectedRows });
  } catch (error) {
    console.error(`POST Bulk /api/${req.params.table} Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// POST (Create)
app.post(["/api/:table", "/:table"], async (req, res) => {
  try {
    const table = req.params.table;
    if (!table.match(/^[a-zA-Z0-9_-]+$/)) return res.status(400).json({error: "Invalid table name"});

    const data = { ...req.body };
    delete data.id; // ensure we dont force insert an ID if it's auto increment
    
    // Handle JSON stringify for specific fields like items or role
    if (data.items && typeof data.items !== 'string') data.items = JSON.stringify(data.items);
    if (data.role && typeof data.role !== 'string') data.role = JSON.stringify(data.role);

    // Convert ISO dates to MySQL format
    for (const key in data) {
      if (typeof data[key] === 'string' && data[key].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        data[key] = data[key].slice(0, 19).replace('T', ' ');
      }
    }

    // Filter out undefined keys
    const filteredData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

    const [result] = await pool.query(`INSERT INTO \`${table}\` SET ?`, filteredData);
    res.status(201).json({ id: result.insertId, ...data });
  } catch (error) {
    console.error(`POST /api/${req.params.table} Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// PUT (Update)
app.put(["/api/:table/:id", "/:table/:id"], async (req, res) => {
  try {
    const table = req.params.table;
    if (!table.match(/^[a-zA-Z0-9_]+$/)) return res.status(400).json({error: "Invalid table name"});

    const data = { ...req.body };
    delete data.id; // Never update the ID

    if (data.items && typeof data.items !== 'string') data.items = JSON.stringify(data.items);
    if (data.role && typeof data.role !== 'string') data.role = JSON.stringify(data.role);

    // Convert ISO dates to MySQL format
    for (const key in data) {
      if (typeof data[key] === 'string' && data[key].match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)) {
        data[key] = data[key].slice(0, 19).replace('T', ' ');
      }
    }

    const filteredData = Object.fromEntries(Object.entries(data).filter(([_, v]) => v !== undefined));

    await pool.query(`UPDATE \`${table}\` SET ? WHERE id = ?`, [filteredData, req.params.id]);
    res.json({ id: parseInt(req.params.id), ...req.body });
  } catch (error) {
    console.error(`PUT /api/${req.params.table} Error:`, error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE
app.delete(["/api/:table/:id", "/:table/:id"], async (req, res) => {
  try {
    const table = req.params.table;
    if (!table.match(/^[a-zA-Z0-9_]+$/)) return res.status(400).json({error: "Invalid table name"});

    await pool.query(`DELETE FROM \`${table}\` WHERE id = ?`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
