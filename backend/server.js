const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 8080;

// ─── Load .env manually ──────────────────────────────────────────
const envPath = path.join(__dirname, ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const eq = trimmed.indexOf("=");
    if (eq === -1) return;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

// ─── Admin Auth Config ──────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

if (!ADMIN_PASSWORD) {
  console.warn(
    "ADMIN_PASSWORD nao definida. Autenticacao DESATIVADA."
  );
}

function sessionSecret() {
  if (ADMIN_PASSWORD) {
    return crypto.createHash("sha256").update("session:" + ADMIN_PASSWORD).digest("hex");
  }
  return "dev-insecure-session-secret";
}

// ─── Photo Upload Period ────────────────────────────────────────
const PHOTO_UPLOAD_START = new Date("2026-12-20T00:00:00");
const PHOTO_UPLOAD_END = new Date("2026-12-21T23:59:59");

function getUploadStatus() {
  const now = new Date();
  if (now < PHOTO_UPLOAD_START) return "not_started";
  if (now > PHOTO_UPLOAD_END) return "finished";
  return "open";
}

// ─── Paths ──────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, "uploads");
const dbPath = path.join(__dirname, "cecilia.db");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// ─── Database ───────────────────────────────────────────────────
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error("Erro ao abrir banco de dados:", err.message);
  } else {
    console.log("Banco de dados conectado.");
  }
});

// Create tables
db.run(`
  CREATE TABLE IF NOT EXISTS fotos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT,
    mensagem TEXT,
    arquivo TEXT NOT NULL,
    url TEXT NOT NULL,
    status TEXT DEFAULT 'aprovado',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.run(`
  CREATE TABLE IF NOT EXISTS convidados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    email TEXT,
    telefone TEXT,
    vai TEXT DEFAULT 'sim',
    num_acompanhantes INTEGER DEFAULT 0,
    mensagem TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// Migrate: add status column if missing (for existing databases)
db.run("PRAGMA table_info(fotos)", [], (err, rows) => {
  if (!err && rows) {
    const hasStatus = rows.some((r) => r.name === "status");
    if (!hasStatus) {
      db.run("ALTER TABLE fotos ADD COLUMN status TEXT DEFAULT 'aprovado'", [], (e) => {
        if (e) console.warn("Aviso ao adicionar coluna status:", e.message);
        else console.log("Coluna 'status' adicionada a tabela fotos.");
      });
    }
  }
});

// ─── Middleware ──────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "https://cecilia15anos.netlify.app",
  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:5173",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Allow all origins during dev
    }
  },
  credentials: true,
}));

app.use(express.json());
app.use(
  session({
    name: "cecilia.sid",
    secret: sessionSecret(),
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);
app.use("/uploads", express.static(uploadsDir));

// ─── Auth helpers ───────────────────────────────────────────────
function isAuthenticated(req) {
  if (!ADMIN_PASSWORD) return true;
  return req.session && req.session.isAdmin === true;
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({
      success: false,
      code: "AUTH_REQUIRED",
      message: "Voce precisa estar autenticado.",
    });
  }
  next();
}

// ─── Multer config ──────────────────────────────────────────────
const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(new Error("Tipo de arquivo nao permitido."), false);
    }
    cb(null, true);
  },
});

// ─── Helpers ────────────────────────────────────────────────────
function sanitizeText(text) {
  if (!text || typeof text !== "string") return "";
  return text.replace(/[<>]/g, "").trim().slice(0, 500);
}

// ═══════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ═══════════════════════════════════════════════════════════════════

app.post("/api/admin/login", (req, res) => {
  if (!ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: "Sessao de admin iniciada.", auth: true });
  }

  const password = (req.body && req.body.password) || "";

  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ success: true, message: "Login realizado com sucesso.", auth: true });
  }

  return res.status(403).json({
    success: false,
    code: "INVALID_CREDENTIALS",
    message: "Senha incorreta.",
  });
});

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("cecilia.sid");
    res.json({ success: true, message: "Logout realizado." });
  });
});

app.get("/api/admin/me", (req, res) => {
  res.json({ authenticated: isAuthenticated(req), passwordConfigured: !!ADMIN_PASSWORD });
});

// ═══════════════════════════════════════════════════════════════════
//  FOTOS - PUBLIC
// ═══════════════════════════════════════════════════════════════════

app.get("/api/fotos/status", (req, res) => {
  const status = getUploadStatus();
  const authEnabled = isAuthenticated(req);
  const canUpload = authEnabled || status === "open";

  function formatLocal(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const h = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}-${m}-${day}T${h}:${min}`;
  }

  res.json({
    open: status === "open",
    status,
    authenticated: authEnabled,
    canUpload,
    message: status === "not_started"
      ? "A galeria estara disponivel a partir de 20 de dezembro de 2026."
      : status === "finished"
        ? "O periodo para envio de fotos foi encerrado."
        : "O envio de fotos esta aberto.",
    start: formatLocal(PHOTO_UPLOAD_START),
    end: formatLocal(PHOTO_UPLOAD_END),
  });
});

// Public: only approved photos
app.get("/api/fotos", (req, res) => {
  db.all(
    "SELECT * FROM fotos WHERE status = 'aprovado' ORDER BY created_at DESC",
    [],
    (err, rows) => {
      if (err) {
        console.error("Erro ao buscar fotos:", err.message);
        return res.status(500).json({ error: "Erro ao buscar fotos." });
      }
      res.json(rows);
    }
  );
});

// Upload photo (requires auth)
app.post("/api/fotos", requireAdmin, (req, res) => {
  const isAdmin = isAuthenticated(req);

  if (!isAdmin) {
    const status = getUploadStatus();
    if (status === "not_started") {
      return res.status(403).json({
        success: false, code: "PHOTO_UPLOAD_NOT_STARTED",
        message: "A galeria estara disponivel a partir de 20 de dezembro de 2026.",
      });
    }
    if (status === "finished") {
      return res.status(403).json({
        success: false, code: "PHOTO_UPLOAD_FINISHED",
        message: "O periodo para envio de fotos foi encerrado.",
      });
    }
  }

  upload.single("foto")(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "Arquivo excede o limite de 10 MB." });
      }
      return res.status(400).json({ error: err.message || "Erro no upload." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Nenhuma imagem enviada." });
    }

    const nome = sanitizeText(req.body.nome).slice(0, 100) || null;
    const mensagem = sanitizeText(req.body.mensagem).slice(0, 160) || null;
    const arquivo = req.file.filename;
    const url = `/uploads/${arquivo}`;
    // Admin uploads go directly to "aprovado"; public uploads go to "pendente"
    const status = isAdmin ? "aprovado" : "pendente";

    const sql = `INSERT INTO fotos (nome, mensagem, arquivo, url, status) VALUES (?, ?, ?, ?, ?)`;

    db.run(sql, [nome, mensagem, arquivo, url, status], function (err) {
      if (err) {
        const filePath = path.join(uploadsDir, arquivo);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        console.error("Erro ao salvar registro:", err.message);
        return res.status(500).json({ error: "Erro ao salvar no banco de dados." });
      }

      res.status(201).json({
        message: isAdmin ? "Foto publicada com sucesso." : "Foto enviada com sucesso. Aguardando aprovacao do admin.",
        id: this.lastID,
        url,
        status,
      });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  FOTOS - ADMIN (moderation)
// ═══════════════════════════════════════════════════════════════════

// Get all photos (admin)
app.get("/api/admin/fotos", requireAdmin, (req, res) => {
  db.all("SELECT * FROM fotos ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar fotos (admin):", err.message);
      return res.status(500).json({ error: "Erro ao buscar fotos." });
    }
    res.json(rows);
  });
});

// Update photo status (approve/reject)
app.patch("/api/admin/fotos/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!["aprovado", "rejeitado", "pendente"].includes(status)) {
    return res.status(400).json({ error: "Status invalido. Use: pendente, aprovado, rejeitado." });
  }

  db.run("UPDATE fotos SET status = ? WHERE id = ?", [status, id], function (err) {
    if (err) {
      console.error("Erro ao atualizar foto:", err.message);
      return res.status(500).json({ error: "Erro ao atualizar foto." });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Foto nao encontrada." });
    }
    res.json({ success: true, message: `Foto ${status}.` });
  });
});

// Delete photo
app.delete("/api/admin/fotos/:id", requireAdmin, (req, res) => {
  const { id } = req.params;

  db.get("SELECT arquivo FROM fotos WHERE id = ?", [id], (err, row) => {
    if (err) {
      console.error("Erro ao buscar foto:", err.message);
      return res.status(500).json({ error: "Erro ao buscar foto." });
    }
    if (!row) {
      return res.status(404).json({ error: "Foto nao encontrada." });
    }

    // Delete file from disk
    const filePath = path.join(uploadsDir, row.arquivo);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.run("DELETE FROM fotos WHERE id = ?", [id], function (err) {
      if (err) {
        console.error("Erro ao excluir foto:", err.message);
        return res.status(500).json({ error: "Erro ao excluir foto." });
      }
      res.json({ success: true, message: "Foto excluida com sucesso." });
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
//  CONVIDADOS (RSVP)
// ═══════════════════════════════════════════════════════════════════

// Public: register a guest
app.post("/api/convidados", (req, res) => {
  const nome = sanitizeText(req.body.nome);
  if (!nome) {
    return res.status(400).json({ error: "Nome e obrigatorio." });
  }

  const email = sanitizeText(req.body.email).slice(0, 200) || null;
  const telefone = sanitizeText(req.body.telefone).slice(0, 20) || null;
  const vai = ["sim", "nao", "talvez"].includes(req.body.vai) ? req.body.vai : "sim";
  const num_acompanhantes = Math.min(Math.max(parseInt(req.body.num_acompanhantes, 10) || 0, 0), 10);
  const mensagem = sanitizeText(req.body.mensagem).slice(0, 200) || null;

  const sql = `INSERT INTO convidados (nome, email, telefone, vai, num_acompanhantes, mensagem) VALUES (?, ?, ?, ?, ?, ?)`;

  db.run(sql, [nome, email, telefone, vai, num_acompanhantes, mensagem], function (err) {
    if (err) {
      console.error("Erro ao salvar convidado:", err.message);
      return res.status(500).json({ error: "Erro ao salvar confirmacao." });
    }
    res.status(201).json({
      success: true,
      message: "Presenca confirmada com sucesso!",
      id: this.lastID,
    });
  });
});

// Admin: list all guests
app.get("/api/convidados", requireAdmin, (req, res) => {
  db.all("SELECT * FROM convidados ORDER BY created_at DESC", [], (err, rows) => {
    if (err) {
      console.error("Erro ao buscar convidados:", err.message);
      return res.status(500).json({ error: "Erro ao buscar convidados." });
    }
    res.json(rows);
  });
});

// Admin: delete a guest
app.delete("/api/convidados/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  db.run("DELETE FROM convidados WHERE id = ?", [id], function (err) {
    if (err) {
      return res.status(500).json({ error: "Erro ao excluir convidado." });
    }
    if (this.changes === 0) {
      return res.status(404).json({ error: "Convidado nao encontrado." });
    }
    res.json({ success: true, message: "Convidado excluido." });
  });
});

// ─── Start ──────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
  console.log(`API fotos: http://localhost:${PORT}/api/fotos`);
  console.log(`API convidados: http://localhost:${PORT}/api/convidados`);
});
