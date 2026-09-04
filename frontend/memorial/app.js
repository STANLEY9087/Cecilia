(() => {
  "use strict";

  const API_BASE = "https://cecilia-backend-xcwz.onrender.com";
  const API_FOTOS = `${API_BASE}/api/fotos`;
  const API_STATUS = `${API_BASE}/api/fotos/status`;
  const API_ADMIN_ME = `${API_BASE}/api/admin/me`;
  const MAX_SIZE = 10 * 1024 * 1024;
  const ALLOWED_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];
  const ALLOWED_MIMES = ["image/jpeg", "image/png", "image/webp"];

  // ─── DOM ─────────────────────────────────────────────────────
  const $form = document.getElementById("uploadForm");
  const $fotoInput = document.getElementById("fotoInput");
  const $fileWrapper = document.getElementById("fileInputWrapper");
  const $fileInputText = document.getElementById("fileInputText");
  const $fileName = document.getElementById("fileName");
  const $nomeInput = document.getElementById("nomeInput");
  const $msgInput = document.getElementById("msgInput");
  const $charCount = document.getElementById("charCount");
  const $submitBtn = document.getElementById("submitBtn");
  const $btnText = $submitBtn.querySelector(".btn-text");
  const $btnLoading = $submitBtn.querySelector(".btn-loading");
  const $uploadStatus = document.getElementById("uploadStatus");
  const $galleryGrid = document.getElementById("galleryGrid");
  const $galleryEmpty = document.getElementById("galleryEmpty");
  const $refreshBtn = document.getElementById("refreshBtn");
  const $modalOverlay = document.getElementById("modalOverlay");
  const $modalClose = document.getElementById("modalClose");
  const $modalImg = document.getElementById("modalImg");
  const $modalName = document.getElementById("modalName");
  const $modalMessage = document.getElementById("modalMessage");
  const $starsBg = document.getElementById("starsBg");
  const $periodBanner = document.getElementById("periodBanner");
  const $periodBannerText = document.getElementById("periodBannerText");
  const $authBanner = document.getElementById("authBanner");
  const $authBannerText = document.getElementById("authBannerText");

  // ─── Stars ───────────────────────────────────────────────────
  function createStars() {
    for (let i = 0; i < 60; i++) {
      const star = document.createElement("div");
      star.className = "star";
      star.style.left = Math.random() * 100 + "%";
      star.style.top = Math.random() * 100 + "%";
      star.style.setProperty("--duration", 2 + Math.random() * 4 + "s");
      star.style.setProperty("--delay", Math.random() * 4 + "s");
      const size = 1 + Math.random() * 2;
      star.style.width = size + "px";
      star.style.height = size + "px";
      $starsBg.appendChild(star);
    }
  }
  createStars();

  // ─── Helpers ─────────────────────────────────────────────────
  function escapeHtml(str) {
    if (!str) return "";
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function sanitizeText(str) {
    if (!str || typeof str !== "string") return "";
    return str.replace(/[<>]/g, "").trim();
  }

  function getExtension(filename) {
    const idx = filename.lastIndexOf(".");
    return idx >= 0 ? filename.slice(idx).toLowerCase() : "";
  }

  function resolvePhotoUrl(url) {
    if (!url) return "";
    if (url.startsWith("/")) return API_BASE + url;
    return url;
  }

  function showStatus(el, message, type) {
    el.textContent = message;
    el.className = `upload-status ${type}`;
    el.hidden = false;
  }

  function hideStatus(el) {
    el.hidden = true;
    el.textContent = "";
  }

  // ─── Upload: File Selection ──────────────────────────────────
  $fileWrapper.addEventListener("click", () => $fotoInput.click());
  $fileWrapper.addEventListener("dragover", (e) => {
    e.preventDefault();
    $fileWrapper.style.borderColor = "var(--color-primary)";
  });
  $fileWrapper.addEventListener("dragleave", () => { $fileWrapper.style.borderColor = ""; });
  $fileWrapper.addEventListener("drop", (e) => {
    e.preventDefault();
    $fileWrapper.style.borderColor = "";
    if (e.dataTransfer.files.length > 0) {
      $fotoInput.files = e.dataTransfer.files;
      handleFileSelect(e.dataTransfer.files[0]);
    }
  });
  $fotoInput.addEventListener("change", () => {
    if ($fotoInput.files.length > 0) handleFileSelect($fotoInput.files[0]);
  });

  function handleFileSelect(file) {
    hideStatus($uploadStatus);
    if (!file) return;
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      showStatus($uploadStatus, "Formato nao permitido. Use .jpg, .jpeg, .png ou .webp.", "error");
      $fotoInput.value = "";
      return;
    }
    if (!ALLOWED_MIMES.includes(file.type)) {
      showStatus($uploadStatus, "Tipo de arquivo nao permitido.", "error");
      $fotoInput.value = "";
      return;
    }
    if (file.size > MAX_SIZE) {
      showStatus($uploadStatus, "Arquivo excede o limite de 10 MB.", "error");
      $fotoInput.value = "";
      return;
    }
    $fileInputText.textContent = "Imagem selecionada:";
    $fileName.textContent = file.name;
  }

  $msgInput.addEventListener("input", () => { $charCount.textContent = $msgInput.value.length; });

  // ─── Upload: Submit ──────────────────────────────────────────
  $form.addEventListener("submit", async (e) => {
    e.preventDefault();
    hideStatus($uploadStatus);

    if (!$fotoInput.files || $fotoInput.files.length === 0) {
      showStatus($uploadStatus, "Selecione uma imagem primeiro.", "error");
      return;
    }

    const file = $fotoInput.files[0];
    const ext = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext) || !ALLOWED_MIMES.includes(file.type)) {
      showStatus($uploadStatus, "Formato de arquivo invalido.", "error");
      return;
    }
    if (file.size > MAX_SIZE) {
      showStatus($uploadStatus, "Arquivo excede o limite de 10 MB.", "error");
      return;
    }

    const nome = sanitizeText($nomeInput.value).slice(0, 100);
    const mensagem = sanitizeText($msgInput.value).slice(0, 160);

    const formData = new FormData();
    formData.append("foto", file);
    if (nome) formData.append("nome", nome);
    if (mensagem) formData.append("mensagem", mensagem);

    $submitBtn.disabled = true;
    $btnText.hidden = true;
    $btnLoading.hidden = false;

    try {
      const response = await fetch(API_FOTOS, { method: "POST", body: formData });
      const data = await response.json();

      if (!response.ok) {
        if (data.code === "PHOTO_UPLOAD_NOT_STARTED" || data.code === "PHOTO_UPLOAD_FINISHED") {
          showStatus($uploadStatus, data.message, "error");
          checkUploadStatus();
          return;
        }
        if (data.code === "AUTH_REQUIRED") {
          showStatus($uploadStatus, data.message, "error");
          setAuthenticatedBanner(false);
          return;
        }
        throw new Error(data.error || "Erro ao enviar a foto.");
      }

      showStatus($uploadStatus, "Foto enviada com sucesso! Ela aparecera apos a aprovacao do admin.", "success");
      $form.reset();
      $fileName.textContent = "";
      $fileInputText.textContent = "Selecionar imagem...";
      $charCount.textContent = "0";
    } catch (err) {
      if (err.name === "TypeError" && err.message.includes("fetch")) {
        showStatus($uploadStatus, "Nao foi possivel conectar ao servidor. Tente novamente.", "error");
      } else {
        showStatus($uploadStatus, err.message || "Nao foi possivel enviar a foto. Tente novamente.", "error");
      }
    } finally {
      $submitBtn.disabled = false;
      $btnText.hidden = false;
      $btnLoading.hidden = true;
    }
  });

  // ─── Gallery ─────────────────────────────────────────────────
  async function loadGallery() {
    try {
      const response = await fetch(API_FOTOS);
      if (!response.ok) throw new Error("Erro ao buscar fotos.");
      const photos = await response.json();

      $galleryGrid.innerHTML = "";

      const approved = photos.filter((p) => p.status === "aprovado");

      if (!approved || approved.length === 0) {
        $galleryEmpty.hidden = false;
        return;
      }

      $galleryEmpty.hidden = true;

      approved.forEach((photo) => {
        const card = document.createElement("div");
        card.className = "photo-card";
        card.setAttribute("role", "button");
        card.setAttribute("tabindex", "0");
        card.setAttribute("aria-label", `Foto de ${escapeHtml(photo.nome) || "convidado"}`);

        const imgWrapper = document.createElement("div");
        imgWrapper.className = "photo-card-img-wrapper";

        const img = document.createElement("img");
        img.className = "photo-card-img";
        img.src = resolvePhotoUrl(photo.url);
        img.alt = `Foto de ${escapeHtml(photo.nome) || "convidado"}`;
        img.loading = "lazy";
        imgWrapper.appendChild(img);

        const info = document.createElement("div");
        info.className = "photo-card-info";

        if (photo.nome) {
          const nameEl = document.createElement("p");
          nameEl.className = "photo-card-name";
          nameEl.textContent = photo.nome;
          info.appendChild(nameEl);
        }
        if (photo.mensagem) {
          const msgEl = document.createElement("p");
          msgEl.className = "photo-card-msg";
          msgEl.textContent = photo.mensagem;
          info.appendChild(msgEl);
        }

        card.appendChild(imgWrapper);
        card.appendChild(info);

        card.addEventListener("click", () => openModal(photo));
        card.addEventListener("keydown", (e) => {
          if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openModal(photo); }
        });

        $galleryGrid.appendChild(card);
      });
    } catch (err) {
      $galleryGrid.innerHTML = "";
      $galleryEmpty.hidden = false;
      console.error("Erro ao carregar galeria:", err);
    }
  }

  $refreshBtn.addEventListener("click", loadGallery);

  // ─── Modal ───────────────────────────────────────────────────
  function openModal(photo) {
    $modalImg.src = resolvePhotoUrl(photo.url);
    $modalImg.alt = `Foto de ${escapeHtml(photo.nome) || "convidado"}`;
    $modalName.textContent = photo.nome || "";
    $modalName.hidden = !photo.nome;
    $modalMessage.textContent = photo.mensagem || "";
    $modalMessage.hidden = !photo.mensagem;
    $modalOverlay.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $modalOverlay.hidden = true;
    $modalImg.src = "";
    document.body.style.overflow = "";
  }

  $modalClose.addEventListener("click", closeModal);
  $modalOverlay.addEventListener("click", (e) => { if (e.target === $modalOverlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$modalOverlay.hidden) closeModal(); });

  // ─── Upload Period Control ──────────────────────────────────
  function setUploadEnabled(enabled) {
    $form.classList.toggle("is-disabled", !enabled);
    $submitBtn.disabled = !enabled;
    $fileWrapper.style.pointerEvents = enabled ? "" : "none";
    $nomeInput.disabled = !enabled;
    $msgInput.disabled = !enabled;
  }

  function setAuthenticatedBanner(authEnabled) {
    if (!authEnabled) {
      $authBanner.hidden = false;
      $authBannerText.innerHTML =
        'Apenas a equipe da festa pode enviar fotos. <a href="../admin/login.html" style="color:var(--color-primary-light)">Sou o admin</a>.';
      setUploadEnabled(false);
    } else {
      $authBanner.hidden = true;
    }
  }

  async function checkUploadStatus() {
    try {
      const response = await fetch(API_STATUS);
      if (!response.ok) return;
      const data = await response.json();
      const authEnabled = !!data.authenticated;

      if (authEnabled) {
        $periodBanner.hidden = true;
        $authBanner.hidden = true;
        setUploadEnabled(true);
        return;
      }

      if (data.status === "not_started") {
        $periodBanner.hidden = false;
        $periodBannerText.textContent =
          "A galeria ainda nao esta disponivel! As fotos poderao ser compartilhadas a partir do dia 20 de dezembro de 2026.";
        setAuthenticatedBanner(false);
      } else if (data.status === "finished") {
        $periodBanner.hidden = false;
        $periodBannerText.textContent =
          "O periodo de envio foi encerrado. Obrigado por fazer parte dos 15 anos da Cecilia!";
        setAuthenticatedBanner(false);
      } else if (data.status === "open") {
        $periodBanner.hidden = true;
        setAuthenticatedBanner(authEnabled);
      }
    } catch (err) {
      console.warn("Nao foi possivel verificar status de envio:", err);
    }
  }

  // ─── Init ────────────────────────────────────────────────────
  checkUploadStatus();
  loadGallery();
})();
