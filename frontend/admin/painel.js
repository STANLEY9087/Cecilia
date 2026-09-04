(() => {
  "use strict";

  const API_BASE = "https://cecilia-api.onrender.com";
  const API_ADMIN_ME = `${API_BASE}/api/admin/me`;
  const API_ADMIN_LOGIN = `${API_BASE}/api/admin/login`;
  const API_ADMIN_LOGOUT = `${API_BASE}/api/admin/logout`;
  const API_ADMIN_FOTOS = `${API_BASE}/api/admin/fotos`;
  const API_ADMIN_CONVIDADOS = `${API_BASE}/api/convidados`;

  let allPhotos = [];
  let currentFilter = "todos";

  // ─── Check Auth ──────────────────────────────────────────────
  async function checkAuth() {
    try {
      const res = await fetch(API_ADMIN_ME, { credentials: "include" });
      const data = await res.json();
      if (!data.authenticated) {
        window.location.href = "login.html";
        return false;
      }
      document.getElementById("adminInfo").textContent = "Admin";
      return true;
    } catch (err) {
      window.location.href = "login.html";
      return false;
    }
  }

  // ─── Logout ──────────────────────────────────────────────────
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    try {
      await fetch(API_ADMIN_LOGOUT, { method: "POST", credentials: "include" });
    } catch (err) {}
    window.location.href = "login.html";
  });

  // ─── Tabs ────────────────────────────────────────────────────
  document.querySelectorAll(".tabs .tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tabs .tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab-content").forEach((tc) => tc.classList.remove("active"));
      document.getElementById("tab-" + tab).classList.add("active");
    });
  });

  // ─── Photo Filters ──────────────────────────────────────────
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("[data-filter]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentFilter = btn.dataset.filter;
      renderPhotos();
    });
  });

  // ─── Load Stats ──────────────────────────────────────────────
  async function loadStats() {
    try {
      const [fotosRes, convRes] = await Promise.all([
        fetch(API_ADMIN_FOTOS, { credentials: "include" }),
        fetch(API_ADMIN_CONVIDADOS, { credentials: "include" }),
      ]);

      if (fotosRes.ok) {
        const fotos = await fotosRes.json();
        allPhotos = Array.isArray(fotos) ? fotos : [];
        const pendentes = allPhotos.filter((f) => f.status === "pendente").length;
        const aprovadas = allPhotos.filter((f) => f.status === "aprovado").length;

        document.getElementById("statTotal").textContent = allPhotos.length;
        document.getElementById("statPendente").textContent = pendentes;
        document.getElementById("statAprovado").textContent = aprovadas;
        document.getElementById("tabBadgeFotos").textContent = pendentes;

        renderPhotos();
      }

      if (convRes.ok) {
        const convs = await convRes.json();
        const list = Array.isArray(convs) ? convs : [];
        document.getElementById("statConvidados").textContent = list.length;
        document.getElementById("tabBadgeConvidados").textContent = list.length;
        renderGuests(list);
      }
    } catch (err) {
      console.error("Erro ao carregar dados:", err);
    }
  }

  // ─── Render Photos ──────────────────────────────────────────
  function renderPhotos() {
    const grid = document.getElementById("photoGrid");
    const empty = document.getElementById("photoEmpty");
    grid.innerHTML = "";

    const filtered = currentFilter === "todos"
      ? allPhotos
      : allPhotos.filter((p) => p.status === currentFilter);

    if (filtered.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    filtered.forEach((photo) => {
      const card = document.createElement("div");
      card.className = "photo-mod-card";
      card.innerHTML = `
        <div class="photo-mod-img-wrapper">
          <img class="photo-mod-img" src="${escapeAttr(photo.url)}" alt="Foto" loading="lazy">
          <span class="photo-mod-status ${photo.status}">${photo.status}</span>
        </div>
        <div class="photo-mod-info">
          <p class="photo-mod-name">${escapeHtml(photo.nome) || "Anonimo"}</p>
          ${photo.mensagem ? `<p class="photo-mod-msg">${escapeHtml(photo.mensagem)}</p>` : ""}
          <p class="photo-mod-date">${formatDate(photo.created_at)}</p>
        </div>
        <div class="photo-mod-actions">
          ${photo.status !== "aprovado" ? `<button class="btn-approve" data-id="${photo.id}" data-action="aprovar">Aprovar</button>` : ""}
          ${photo.status !== "rejeitado" ? `<button class="btn-reject" data-id="${photo.id}" data-action="rejeitar">Rejeitar</button>` : ""}
          <button class="btn-delete" data-id="${photo.id}" data-action="excluir">Excluir</button>
        </div>
      `;
      grid.appendChild(card);
    });

    grid.querySelectorAll("button[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => handlePhotoAction(btn));
    });
  }

  // ─── Photo Actions ──────────────────────────────────────────
  async function handlePhotoAction(btn) {
    const id = btn.dataset.id;
    const action = btn.dataset.action;

    if (action === "excluir" && !confirm("Tem certeza que deseja excluir esta foto?")) return;

    let method = "PATCH";
    let body = {};

    if (action === "aprovar") body.status = "aprovado";
    else if (action === "rejeitar") body.status = "rejeitado";
    else if (action === "excluir") method = "DELETE";

    try {
      const res = await fetch(`${API_ADMIN_FOTOS}/${id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: method === "PATCH" ? JSON.stringify(body) : undefined,
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || "Erro ao processar acao.");
        return;
      }

      if (action === "excluir") {
        allPhotos = allPhotos.filter((p) => p.id != id);
      } else {
        const photo = allPhotos.find((p) => p.id == id);
        if (photo) photo.status = body.status;
      }

      updateStats();
      renderPhotos();
    } catch (err) {
      alert("Erro ao conectar ao servidor.");
    }
  }

  function updateStats() {
    const pendentes = allPhotos.filter((f) => f.status === "pendente").length;
    const aprovadas = allPhotos.filter((f) => f.status === "aprovado").length;
    document.getElementById("statTotal").textContent = allPhotos.length;
    document.getElementById("statPendente").textContent = pendentes;
    document.getElementById("statAprovado").textContent = aprovadas;
    document.getElementById("tabBadgeFotos").textContent = pendentes;
  }

  // ─── Render Guests ──────────────────────────────────────────
  function renderGuests(guests) {
    const tbody = document.getElementById("guestsBody");
    const empty = document.getElementById("guestsEmpty");
    tbody.innerHTML = "";

    if (!guests || guests.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    guests.forEach((g) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(g.nome)}</td>
        <td>${escapeHtml(g.email) || "-"}</td>
        <td>${escapeHtml(g.telefone) || "-"}</td>
        <td><span class="guest-status-badge ${g.vai}">${g.vai === "sim" ? "Vai" : g.vai === "nao" ? "Nao" : "Talvez"}</span></td>
        <td>${g.num_acompanhantes || 0}</td>
        <td>${escapeHtml(g.mensagem) || "-"}</td>
        <td>${formatDate(g.created_at)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return "";
    return str.replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function formatDate(dateStr) {
    if (!dateStr) return "-";
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
    } catch (e) {
      return dateStr;
    }
  }

  // ─── Init ────────────────────────────────────────────────────
  (async function init) {
    const ok = await checkAuth();
    if (ok) loadStats();
  })();
})();
