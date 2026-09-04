const express = require("express");
const cors = require("cors");
const multer = require("multer");
const sqlite3 = require("sqlite3").verbose();
const session = require("express-session");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const app = express();

/*
|--------------------------------------------------------------------------
| CONFIGURAÇÃO
|--------------------------------------------------------------------------
*/

const PORT = process.env.PORT || 8080;

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";

const FRONTEND_URL =
  process.env.FRONTEND_URL || "https://cecilia15anos.netlify.app";

/*
|--------------------------------------------------------------------------
| CARREGAMENTO DO .ENV
|--------------------------------------------------------------------------
|
| Em produção, o Render deve fornecer as variáveis de ambiente.
| O carregamento manual abaixo serve para desenvolvimento local.
|
*/

const envPath = path.join(__dirname, ".env");

if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");

  envContent.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const eq = trimmed.indexOf("=");

    if (eq === -1) {
      return;
    }

    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

if (!ADMIN_PASSWORD) {
  console.warn(
    "AVISO: ADMIN_PASSWORD não definida. A autenticação administrativa está desativada."
  );
}

/*
|--------------------------------------------------------------------------
| SESSION
|--------------------------------------------------------------------------
*/

function sessionSecret() {
  if (ADMIN_PASSWORD) {
    return crypto
      .createHash("sha256")
      .update("session:" + ADMIN_PASSWORD)
      .digest("hex");
  }

  return "dev-insecure-session-secret";
}

/*
|--------------------------------------------------------------------------
| PERÍODO DE ENVIO DE FOTOS
|--------------------------------------------------------------------------
|
| Fotos públicas:
|
| Início: 20/12/2026 às 00:00
| Fim:    21/12/2026 às 23:59:59
|
*/

const PHOTO_UPLOAD_START = new Date("2026-12-20T00:00:00-03:00");
const PHOTO_UPLOAD_END = new Date("2026-12-21T23:59:59-03:00");

function getUploadStatus() {
  const now = new Date();

  if (now < PHOTO_UPLOAD_START) {
    return "not_started";
  }

  if (now > PHOTO_UPLOAD_END) {
    return "finished";
  }

  return "open";
}

/*
|--------------------------------------------------------------------------
| DIRETÓRIOS
|--------------------------------------------------------------------------
*/

const uploadsDir = path.join(__dirname, "uploads");

const dbPath = path.join(__dirname, "cecilia.db");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, {
    recursive: true,
  });
}

/*
|--------------------------------------------------------------------------
| BANCO DE DADOS
|--------------------------------------------------------------------------
*/

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error(
      "Erro ao abrir banco de dados:",
      err.message
    );
  } else {
    console.log("Banco de dados conectado.");
  }
});

/*
|--------------------------------------------------------------------------
| CRIAÇÃO DAS TABELAS
|--------------------------------------------------------------------------
*/

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

/*
|--------------------------------------------------------------------------
| MIGRAÇÃO DA TABELA FOTOS
|--------------------------------------------------------------------------
*/

db.all("PRAGMA table_info(fotos)", [], (err, rows) => {
  if (err) {
    console.warn(
      "Não foi possível verificar a estrutura da tabela fotos:",
      err.message
    );

    return;
  }

  const hasStatus = rows.some(
    (column) => column.name === "status"
  );

  if (!hasStatus) {
    db.run(
      "ALTER TABLE fotos ADD COLUMN status TEXT DEFAULT 'aprovado'",
      [],
      (alterError) => {
        if (alterError) {
          console.warn(
            "Aviso ao adicionar coluna status:",
            alterError.message
          );
        } else {
          console.log(
            "Coluna status adicionada à tabela fotos."
          );
        }
      }
    );
  }
});

/*
|--------------------------------------------------------------------------
| MIDDLEWARE
|--------------------------------------------------------------------------
*/

const allowedOrigins = [
  FRONTEND_URL,

  "https://cecilia15anos.netlify.app",
  "https://cecilia15.netlify.app",

  "http://localhost:8080",
  "http://localhost:3000",
  "http://localhost:5173",
];

app.use(
  cors({
    origin(origin, callback) {
      /*
       * Requisições sem origin normalmente são:
       * - ferramentas de teste
       * - curl
       * - algumas requisições do servidor
       */

      if (!origin) {
        return callback(null, true);
      }

      /*
       * Permite os domínios configurados.
       */

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      /*
       * Durante o desenvolvimento, podemos permitir outras origens.
       * Em produção, recomendamos configurar FRONTEND_URL corretamente.
       */

      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      return callback(
        new Error("Origem não autorizada pelo CORS.")
      );
    },

    credentials: true,
  })
);

app.use(express.json());

/*
|--------------------------------------------------------------------------
| SESSÃO
|--------------------------------------------------------------------------
*/

app.use(
  session({
    name: "cecilia.sid",

    secret: sessionSecret(),

    resave: false,

    saveUninitialized: false,

    cookie: {
      httpOnly: true,

      /*
       * Lax funciona bem para o cenário atual.
       */

      sameSite: "lax",

      /*
       * Em HTTPS, o Render/Netlify trabalham com conexão segura.
       */

      secure: process.env.NODE_ENV === "production",

      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);

/*
|--------------------------------------------------------------------------
| ARQUIVOS UPLOADS
|--------------------------------------------------------------------------
*/

app.use(
  "/uploads",
  express.static(uploadsDir)
);

/*
|--------------------------------------------------------------------------
| HELPERS DE AUTENTICAÇÃO
|--------------------------------------------------------------------------
*/

function isAuthenticated(req) {
  /*
   * Se não existe senha configurada,
   * consideramos o ambiente sem autenticação.
   */

  if (!ADMIN_PASSWORD) {
    return true;
  }

  return (
    req.session &&
    req.session.isAdmin === true
  );
}

function requireAdmin(req, res, next) {
  if (!isAuthenticated(req)) {
    return res.status(401).json({
      success: false,

      code: "AUTH_REQUIRED",

      message:
        "Você precisa estar autenticado como administrador.",
    });
  }

  next();
}

/*
|--------------------------------------------------------------------------
| VALIDAÇÃO DO UPLOAD PÚBLICO
|--------------------------------------------------------------------------
*/

function canPublicUpload() {
  return getUploadStatus() === "open";
}

/*
|--------------------------------------------------------------------------
| MULTER
|--------------------------------------------------------------------------
*/

const ALLOWED_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

const MAX_SIZE = 10 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },

  filename: (req, file, cb) => {
    const ext = path
      .extname(file.originalname)
      .toLowerCase();

    const uniqueName =
      `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: MAX_SIZE,
  },

  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIMES.includes(file.mimetype)) {
      return cb(
        new Error(
          "Tipo de arquivo não permitido. Use JPG, PNG ou WEBP."
        ),
        false
      );
    }

    cb(null, true);
  },
});

/*
|--------------------------------------------------------------------------
| SANITIZAÇÃO
|--------------------------------------------------------------------------
*/

function sanitizeText(text) {
  if (!text || typeof text !== "string") {
    return "";
  }

  return text
    .replace(/[<>]/g, "")
    .trim()
    .slice(0, 500);
}

/*
|--------------------------------------------------------------------------
| ROTA PRINCIPAL
|--------------------------------------------------------------------------
*/

app.get("/", (req, res) => {
  res.json({
    success: true,

    message:
      "API do projeto Cecilia 15 Anos está funcionando.",

    status: "online",

    time: new Date().toISOString(),
  });
});

/*
|--------------------------------------------------------------------------
| HEALTH CHECK
|--------------------------------------------------------------------------
*/

app.get("/health", (req, res) => {
  res.json({
    success: true,
    status: "online",
  });
});

/*
|--------------------------------------------------------------------------
| AUTH - LOGIN
|--------------------------------------------------------------------------
*/

app.post("/api/admin/login", (req, res) => {
  /*
   * Sem senha configurada:
   * ambiente de desenvolvimento.
   */

  if (!ADMIN_PASSWORD) {
    req.session.isAdmin = true;

    return res.json({
      success: true,

      message:
        "Sessão administrativa iniciada.",

      auth: true,
    });
  }

  const password =
    (req.body && req.body.password) || "";

  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;

    return res.json({
      success: true,

      message:
        "Login realizado com sucesso.",

      auth: true,
    });
  }

  return res.status(403).json({
    success: false,

    code: "INVALID_CREDENTIALS",

    message: "Senha incorreta.",
  });
});

/*
|--------------------------------------------------------------------------
| AUTH - LOGOUT
|--------------------------------------------------------------------------
*/

app.post("/api/admin/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error(
        "Erro ao destruir sessão:",
        err.message
      );

      return res.status(500).json({
        success: false,

        message:
          "Não foi possível encerrar a sessão.",
      });
    }

    res.clearCookie("cecilia.sid");

    return res.json({
      success: true,

      message: "Logout realizado.",
    });
  });
});

/*
|--------------------------------------------------------------------------
| AUTH - STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/admin/me", (req, res) => {
  res.json({
    authenticated: isAuthenticated(req),

    passwordConfigured: !!ADMIN_PASSWORD,
  });
});

/*
|--------------------------------------------------------------------------
| FOTOS - STATUS
|--------------------------------------------------------------------------
*/

app.get("/api/fotos/status", (req, res) => {
  const status = getUploadStatus();

  const authenticated =
    isAuthenticated(req);

  const canUpload =
    authenticated || status === "open";

  function formatDate(date) {
    return date.toISOString();
  }

  let message;

  if (status === "not_started") {
    message =
      "A galeria estará disponível a partir de 20 de dezembro de 2026.";
  } else if (status === "finished") {
    message =
      "O período para envio de fotos foi encerrado.";
  } else {
    message =
      "O envio de fotos está aberto.";
  }

  res.json({
    open: status === "open",

    status,

    authenticated,

    canUpload,

    message,

    start: formatDate(
      PHOTO_UPLOAD_START
    ),

    end: formatDate(
      PHOTO_UPLOAD_END
    ),
  });
});

/*
|--------------------------------------------------------------------------
| FOTOS - PÚBLICO
|--------------------------------------------------------------------------
|
| Somente fotos aprovadas são exibidas.
|
*/

app.get("/api/fotos", (req, res) => {
  db.all(
    `
      SELECT *
      FROM fotos
      WHERE status = 'aprovado'
      ORDER BY created_at DESC
    `,
    [],
    (err, rows) => {
      if (err) {
        console.error(
          "Erro ao buscar fotos:",
          err.message
        );

        return res.status(500).json({
          error: "Erro ao buscar fotos.",
        });
      }

      res.json(rows);
    }
  );
});

/*
|--------------------------------------------------------------------------
| FOTOS - UPLOAD
|--------------------------------------------------------------------------
|
| Administrador:
|   Pode enviar fotos a qualquer momento.
|
| Público:
|   Somente 20 e 21 de dezembro de 2026.
|
*/

app.post("/api/fotos", (req, res) => {
  const authenticated =
    isAuthenticated(req);

  /*
   * Se não for administrador,
   * verifica o período do evento.
   */

  if (!authenticated && !canPublicUpload()) {
    const status = getUploadStatus();

    if (status === "not_started") {
      return res.status(403).json({
        success: false,

        code: "PHOTO_UPLOAD_NOT_STARTED",

        message:
          "A galeria estará disponível a partir de 20 de dezembro de 2026.",
      });
    }

    return res.status(403).json({
      success: false,

      code: "PHOTO_UPLOAD_FINISHED",

      message:
        "O período para envio de fotos foi encerrado.",
    });
  }

  /*
   * Upload da imagem.
   */

  upload.single("foto")(
    req,
    res,
    (err) => {
      if (err) {
        if (
          err instanceof multer.MulterError &&
          err.code === "LIMIT_FILE_SIZE"
        ) {
          return res.status(400).json({
            error:
              "Arquivo excede o limite de 10 MB.",
          });
        }

        return res.status(400).json({
          error:
            err.message ||
            "Erro no upload.",
        });
      }

      if (!req.file) {
        return res.status(400).json({
          error:
            "Nenhuma imagem enviada.",
        });
      }

      const nome =
        sanitizeText(req.body.nome)
          .slice(0, 100) || null;

      const mensagem =
        sanitizeText(req.body.mensagem)
          .slice(0, 160) || null;

      const arquivo =
        req.file.filename;

      const url =
        `/uploads/${arquivo}`;

      /*
       * Admin:
       * aprovado imediatamente.
       *
       * Público:
       * pendente de aprovação.
       */

      const status =
        authenticated
          ? "aprovado"
          : "pendente";

      const sql = `
        INSERT INTO fotos
        (nome, mensagem, arquivo, url, status)
        VALUES (?, ?, ?, ?, ?)
      `;

      db.run(
        sql,

        [
          nome,
          mensagem,
          arquivo,
          url,
          status,
        ],

        function (dbError) {
          if (dbError) {
            const filePath =
              path.join(
                uploadsDir,
                arquivo
              );

            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
            }

            console.error(
              "Erro ao salvar registro:",
              dbError.message
            );

            return res.status(500).json({
              error:
                "Erro ao salvar no banco de dados.",
            });
          }

          return res.status(201).json({
            success: true,

            message: authenticated
              ? "Foto publicada com sucesso."
              : "Foto enviada com sucesso. Aguardando aprovação do administrador.",

            id: this.lastID,

            url,

            status,
          });
        }
      );
    }
  );
});

/*
|--------------------------------------------------------------------------
| ADMIN - LISTAR FOTOS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/admin/fotos",
  requireAdmin,
  (req, res) => {
    db.all(
      `
        SELECT *
        FROM fotos
        ORDER BY created_at DESC
      `,
      [],
      (err, rows) => {
        if (err) {
          console.error(
            "Erro ao buscar fotos administrativas:",
            err.message
          );

          return res.status(500).json({
            error:
              "Erro ao buscar fotos.",
          });
        }

        res.json(rows);
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - ALTERAR STATUS DA FOTO
|--------------------------------------------------------------------------
*/

app.patch(
  "/api/admin/fotos/:id",
  requireAdmin,
  (req, res) => {
    const { id } = req.params;

    const { status } =
      req.body || {};

    const allowedStatuses = [
      "pendente",
      "aprovado",
      "rejeitado",
    ];

    if (
      !allowedStatuses.includes(status)
    ) {
      return res.status(400).json({
        error:
          "Status inválido. Use: pendente, aprovado ou rejeitado.",
      });
    }

    db.run(
      `
        UPDATE fotos
        SET status = ?
        WHERE id = ?
      `,

      [
        status,
        id,
      ],

      function (err) {
        if (err) {
          console.error(
            "Erro ao atualizar foto:",
            err.message
          );

          return res.status(500).json({
            error:
              "Erro ao atualizar foto.",
          });
        }

        if (this.changes === 0) {
          return res.status(404).json({
            error:
              "Foto não encontrada.",
          });
        }

        res.json({
          success: true,

          message:
            `Foto ${status}.`,
        });
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - EXCLUIR FOTO
|--------------------------------------------------------------------------
*/

app.delete(
  "/api/admin/fotos/:id",
  requireAdmin,
  (req, res) => {
    const { id } = req.params;

    db.get(
      `
        SELECT arquivo
        FROM fotos
        WHERE id = ?
      `,
      [id],

      (err, row) => {
        if (err) {
          console.error(
            "Erro ao buscar foto:",
            err.message
          );

          return res.status(500).json({
            error:
              "Erro ao buscar foto.",
          });
        }

        if (!row) {
          return res.status(404).json({
            error:
              "Foto não encontrada.",
          });
        }

        /*
         * Excluir arquivo físico.
         */

        const filePath =
          path.join(
            uploadsDir,
            row.arquivo
          );

        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
        }

        /*
         * Excluir registro.
         */

        db.run(
          `
            DELETE FROM fotos
            WHERE id = ?
          `,
          [id],

          function (deleteError) {
            if (deleteError) {
              console.error(
                "Erro ao excluir foto:",
                deleteError.message
              );

              return res.status(500).json({
                error:
                  "Erro ao excluir foto.",
              });
            }

            res.json({
              success: true,

              message:
                "Foto excluída com sucesso.",
            });
          }
        );
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| CONVIDADOS - CADASTRO PÚBLICO
|--------------------------------------------------------------------------
*/

app.post(
  "/api/convidados",
  (req, res) => {
    const nome =
      sanitizeText(req.body.nome);

    if (!nome) {
      return res.status(400).json({
        error:
          "Nome é obrigatório.",
      });
    }

    const email =
      sanitizeText(req.body.email)
        .slice(0, 200) || null;

    const telefone =
      sanitizeText(req.body.telefone)
        .slice(0, 20) || null;

    const vaiValues = [
      "sim",
      "nao",
      "talvez",
    ];

    const vai =
      vaiValues.includes(
        req.body.vai
      )
        ? req.body.vai
        : "sim";

    const num_acompanhantes =
      Math.min(
        Math.max(
          parseInt(
            req.body.num_acompanhantes,
            10
          ) || 0,
          0
        ),
        10
      );

    const mensagem =
      sanitizeText(
        req.body.mensagem
      ).slice(0, 200) || null;

    const sql = `
      INSERT INTO convidados
      (
        nome,
        email,
        telefone,
        vai,
        num_acompanhantes,
        mensagem
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `;

    db.run(
      sql,

      [
        nome,
        email,
        telefone,
        vai,
        num_acompanhantes,
        mensagem,
      ],

      function (err) {
        if (err) {
          console.error(
            "Erro ao salvar convidado:",
            err.message
          );

          return res.status(500).json({
            error:
              "Erro ao salvar confirmação.",
          });
        }

        res.status(201).json({
          success: true,

          message:
            "Presença confirmada com sucesso!",

          id: this.lastID,
        });
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - LISTAR CONVIDADOS
|--------------------------------------------------------------------------
*/

app.get(
  "/api/convidados",
  requireAdmin,
  (req, res) => {
    db.all(
      `
        SELECT *
        FROM convidados
        ORDER BY created_at DESC
      `,
      [],
      (err, rows) => {
        if (err) {
          console.error(
            "Erro ao buscar convidados:",
            err.message
          );

          return res.status(500).json({
            error:
              "Erro ao buscar convidados.",
          });
        }

        res.json(rows);
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| ADMIN - EXCLUIR CONVIDADO
|--------------------------------------------------------------------------
*/

app.delete(
  "/api/convidados/:id",
  requireAdmin,
  (req, res) => {
    const { id } = req.params;

    db.run(
      `
        DELETE FROM convidados
        WHERE id = ?
      `,
      [id],

      function (err) {
        if (err) {
          console.error(
            "Erro ao excluir convidado:",
            err.message
          );

          return res.status(500).json({
            error:
              "Erro ao excluir convidado.",
          });
        }

        if (this.changes === 0) {
          return res.status(404).json({
            error:
              "Convidado não encontrado.",
          });
        }

        res.json({
          success: true,

          message:
            "Convidado excluído.",
        });
      }
    );
  }
);

/*
|--------------------------------------------------------------------------
| TRATAMENTO DE ERROS
|--------------------------------------------------------------------------
*/

app.use(
  (err, req, res, next) => {
    console.error(
      "Erro não tratado:",
      err
    );

    if (res.headersSent) {
      return next(err);
    }

    return res.status(500).json({
      success: false,

      error:
        "Erro interno do servidor.",
    });
  }
);

/*
|--------------------------------------------------------------------------
| INICIALIZAÇÃO
|--------------------------------------------------------------------------
*/

app.listen(
  PORT,
  "0.0.0.0",
  () => {
    console.log(
      `Servidor iniciado na porta ${PORT}`
    );

    console.log(
      `Ambiente: ${
        process.env.NODE_ENV || "development"
      }`
    );

    console.log(
      `API disponível em /api`
    );

    console.log(
      `Uploads disponíveis em /uploads`
    );

    console.log(
      `Período público de fotos: 20/12/2026 até 21/12/2026`
    );
  }
);

/*
|--------------------------------------------------------------------------
| ENCERRAMENTO
|--------------------------------------------------------------------------
*/

process.on(
  "SIGTERM",
  () => {
    console.log(
      "Recebido SIGTERM. Encerrando servidor..."
    );

    db.close(() => {
      console.log(
        "Banco de dados fechado."
      );

      process.exit(0);
    });
  }
);

process.on(
  "SIGINT",
  () => {
    console.log(
      "Recebido SIGINT. Encerrando servidor..."
    );

    db.close(() => {
      console.log(
        "Banco de dados fechado."
      );

      process.exit(0);
    });
  }
);
