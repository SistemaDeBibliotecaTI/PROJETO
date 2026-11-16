/* script.js — Interface compartilhada (menu, modais, catálogo, login e perfil) */
(function () {
  'use strict';
  DB.init();

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = ms => new Date(ms).toLocaleDateString('pt-BR');
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const homeFor = u => (u && u.role === 'admin' ? 'admin.html' : 'index.html');

  /* ---------- toast ---------- */
  function toast(message, type) {
    let box = $('#toast-box');
    if (!box) { box = document.createElement('div'); box.id = 'toast-box'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = message;
    box.appendChild(t);
    setTimeout(() => t.remove(), 4000);
  }

  /* ---------- modal ---------- */
  function openModal(opts) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = '<div class="modal' + (opts.wide ? ' modal-wide' : '') + '" role="dialog" aria-modal="true" aria-labelledby="modal-title">' +
      '<div class="modal-head"><h2 id="modal-title">' + esc(opts.title) + '</h2><button type="button" class="modal-close" aria-label="Fechar">×</button></div>' +
      '<div class="modal-body"></div></div>';
    const body = $('.modal-body', overlay);
    body.innerHTML = opts.content;
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    let closed = false;
    function close() {
      if (closed) return;
      closed = true;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      if (!$('.modal-overlay')) document.body.classList.remove('modal-open');
      if (opts.onClose) opts.onClose();
    }
    function onKey(e) {
      if (e.key !== 'Escape') return;
      const all = $$('.modal-overlay');
      if (all[all.length - 1] === overlay) close();
    }
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) close(); });
    $('.modal-close', overlay).addEventListener('click', close);
    const first = $('input, select, textarea, .button', body);
    if (first) first.focus();
    return { el: overlay, body, close };
  }

  function confirmDialog(opts) {
    return new Promise(resolve => {
      let done = false;
      const m = openModal({
        title: opts.title || 'Confirmar',
        content: '<p class="modal-text">' + esc(opts.message) + '</p><div class="modal-actions">' +
          '<button type="button" class="button button-outline" data-act="no">Cancelar</button>' +
          '<button type="button" class="button' + (opts.danger ? ' button-danger' : '') + '" data-act="yes">' + esc(opts.confirmLabel || 'Confirmar') + '</button></div>',
        onClose: () => { if (!done) { done = true; resolve(false); } }
      });
      m.body.addEventListener('click', e => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        done = true;
        resolve(b.dataset.act === 'yes');
        m.close();
      });
    });
  }

  function statusPill(loan) {
    const s = DB.loanStatus(loan);
    const cls = { late: 'late', due: 'due', returned: 'done', 'returned-late': 'done' }[s.key] || '';
    return '<span class="status ' + cls + '">' + esc(s.label) + (s.detail ? ' · ' + esc(s.detail) : '') + '</span>';
  }

  window.UI = { esc, fmtDate, toast, openModal, confirmDialog, statusPill, homeFor };

  /* ---------- menu ---------- */
  function renderNav() {
    const nav = $('#main-nav');
    if (!nav) return;
    const page = document.body.dataset.page || '';
    const user = DB.currentUser();
    const link = (href, label, active) => '<a href="' + href + '"' + (active ? ' class="active"' : '') + '>' + label + '</a>';
    let html = link('index.html', 'Início', page === 'home') + link('index.html#acervo', 'Acervo', false);
    if (user && user.role === 'leitor') html += link('perfil.html', 'Meu perfil', page === 'perfil');
    if (user && user.role === 'admin') html += link('admin.html', 'Administração', page === 'admin');
    html += user
      ? '<span class="nav-user">Olá, <b>' + esc(user.username) + '</b></span><button class="nav-button" id="logout-btn" type="button">Sair</button>'
      : '<a class="nav-button" href="login.html">Entrar</a>';
    nav.innerHTML = html;
    const out = $('#logout-btn');
    if (out) out.addEventListener('click', () => { DB.logout(); location.href = 'index.html'; });
  }

  /* ---------- início / catálogo ---------- */
  function initHome() {
    const grid = $('#book-grid');
    if (!grid) return;
    const search = $('#search'), category = $('#category');
    const cats = Array.from(new Set(DB.getBooks().map(b => b.category))).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    category.innerHTML = '<option value="todos">Todas as categorias</option>' + cats.map(c => '<option value="' + esc(c) + '">' + esc(c) + '</option>').join('');

    function card(b) {
      const av = DB.availability(b.id);
      return '<article class="book-card">' + (b.coverUrl ? '<img class="cover cover-image" src="' + esc(b.coverUrl) + '" alt="Capa de ' + esc(b.title) + '">' : '<div class="cover ' + esc(b.style) + '">' + esc(b.cover) + '</div>') +
        '<div class="book-meta"><h3>' + esc(b.title) + '</h3><p>' + esc(b.author) + '</p><span class="tag">' + esc(b.category) + '</span>' +
        '<span class="avail ' + (av > 0 ? 'ok' : 'none') + '">' + (av > 0 ? av + ' de ' + b.copies + ' disponível(is)' : 'Indisponível no momento') + '</span>' +
        '<button class="small-button" data-book="' + esc(b.id) + '">Ver detalhes</button></div></article>';
    }

    function render() {
      const term = norm(search.value.trim());
      const cat = category.value;
      const list = DB.getBooks().filter(b => (cat === 'todos' || b.category === cat) &&
        (norm(b.title).includes(term) || norm(b.author).includes(term) || norm(b.category).includes(term)));
      $('#book-count').textContent = list.length + ' livro(s)';
      grid.innerHTML = list.length ? list.map(card).join('') : '<p class="empty">Nenhum livro encontrado.</p>';
    }

    function openDetails(bookId) {
      const b = DB.getBook(bookId);
      if (!b) return;
      const user = DB.currentUser();
      const av = DB.availability(b.id);
      const already = user && user.role === 'leitor' && DB.getLoans({ userId: user.id }).some(l => l.bookId === b.id && !l.returnedAt);
      let action;
      if (!user) action = '<a class="button" href="login.html?next=index.html">Entrar para alugar</a>';
      else if (user.role !== 'leitor') action = '<p class="modal-text muted">Contas de administrador não realizam aluguéis.</p>';
      else if (already) action = '<p class="modal-text muted">Você já está com este livro alugado.</p>';
      else if (av < 1) action = '<p class="modal-text muted">Todos os exemplares estão alugados no momento.</p>';
      else action = '<button type="button" class="button" id="rent-btn">Alugar por 1 semana</button>';
      const meta = [b.publisher, b.year].filter(Boolean).map(esc).join(' · ');
      const m = openModal({
        title: 'Detalhes do livro',
        wide: true,
        content: '<div class="detail">' + (b.coverUrl ? '<img class="cover cover-image" src="' + esc(b.coverUrl) + '" alt="Capa de ' + esc(b.title) + '">' : '<div class="cover ' + esc(b.style) + '">' + esc(b.cover) + '</div>') + '<div class="detail-info">' +
          '<span class="tag">' + esc(b.category) + '</span><h3>' + esc(b.title) + '</h3><p class="detail-author">' + esc(b.author) + '</p>' +
          (meta ? '<p class="detail-meta">' + meta + '</p>' : '') +
          '<p>' + esc(b.description) + '</p>' +
          '<p class="avail ' + (av > 0 ? 'ok' : 'none') + '">' + (av > 0 ? av + ' de ' + b.copies + ' exemplar(es) disponível(is)' : 'Indisponível no momento') + '</p>' +
          '<div class="rule-box">⏱ Prazo de aluguel: ' + DB.LOAN_DAYS + ' dias (1 semana). Se alugar hoje, devolva até <b>' + fmtDate(DB.dueDateFrom(Date.now())) + '</b>.</div>' +
          '<div class="modal-actions">' + action + '</div></div></div>'
      });
      const rent = $('#rent-btn', m.body);
      if (rent) rent.addEventListener('click', () => confirmRent(b, m));
    }

    function confirmRent(b, detailModal) {
      const c = openModal({
        title: 'Confirmar aluguel',
        content: '<p class="modal-text"><b>' + esc(b.title) + '</b><br>' + esc(b.author) + '</p>' +
          '<div class="rule-box">Prazo: ' + DB.LOAN_DAYS + ' dias (1 semana)<br>Devolução prevista: <b>' + fmtDate(DB.dueDateFrom(Date.now())) + '</b><br>' +
          '<small>Devolva no prazo; atrasos ficam registrados no seu perfil.</small></div>' +
          '<div class="modal-actions"><button type="button" class="button button-outline" data-act="no">Cancelar</button><button type="button" class="button" data-act="yes">Confirmar aluguel</button></div>'
      });
      c.body.addEventListener('click', e => {
        const btn = e.target.closest('[data-act]');
        if (!btn) return;
        if (btn.dataset.act === 'no') { c.close(); return; }
        const r = DB.rentBook(b.id);
        c.close();
        if (!r.ok) { toast(r.error, 'error'); return; }
        detailModal.close();
        toast('Aluguel confirmado! Devolução até ' + fmtDate(r.loan.dueAt) + '.', 'success');
        render();
      });
    }

    search.addEventListener('input', render);
    category.addEventListener('change', render);
    grid.addEventListener('click', e => {
      const btn = e.target.closest('[data-book]');
      if (btn) openDetails(btn.dataset.book);
    });
    render();
  }

  /* ---------- login / cadastro ---------- */
  function initAuth() {
    const adminForm = $('#admin-login-form');
    if (adminForm) {
      const currentAdmin = DB.currentUser();
      if (currentAdmin && currentAdmin.role === 'admin') { location.replace('admin.html'); return; }
      adminForm.addEventListener('submit', e => {
        e.preventDefault();
        const result = DB.login($('#admin-user').value, $('#admin-password').value, $('#admin-remember').checked, 'admin');
        if (!result.ok) { $('#admin-login-error').textContent = result.error; return; }
        location.href = 'admin.html';
      });
      return;
    }
    const loginForm = $('#login-form');
    if (!loginForm) return;
    const next = new URLSearchParams(location.search).get('next');
    const SAFE = ['index.html', 'perfil.html', 'admin.html'];
    function target(user) {
      if (next === 'admin.html' && user.role !== 'admin') return homeFor(user);
      if (next === 'perfil.html' && user.role !== 'leitor') return homeFor(user);
      return SAFE.indexOf(next) >= 0 ? next : homeFor(user);
    }
    const current = DB.currentUser();
    if (current) { location.replace(target(current)); return; }

    const showError = (sel, msg) => { $(sel).textContent = msg || ''; };
    const tabs = $$('.tab');
    tabs.forEach(tab => tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.toggle('active', t === tab));
      $('#login-form').classList.toggle('hidden', tab.dataset.tab !== 'login');
      $('#register-form').classList.toggle('hidden', tab.dataset.tab !== 'register');
      showError('#login-error'); showError('#register-error');
    }));

    loginForm.addEventListener('submit', e => {
      e.preventDefault();
      const r = DB.login($('#login-user').value, $('#login-password').value, $('#remember').checked, 'leitor');
      if (!r.ok) { showError('#login-error', r.error); return; }
      location.href = 'index.html';
    });

    $('#register-form').addEventListener('submit', e => {
      e.preventDefault();
      if ($('#new-password').value !== $('#new-password2').value) { showError('#register-error', 'As senhas não coincidem.'); return; }
      const r = DB.register($('#new-name').value, $('#new-email').value, $('#new-password').value);
      if (!r.ok) { showError('#register-error', r.error); return; }
      DB.login(r.user.username, $('#new-password').value, false);
      location.href = target(r.user);
    });

    $('#forgot').addEventListener('click', e => {
      e.preventDefault();
      const m = openModal({
        title: 'Recuperar senha',
        content: '<form id="reset-form"><p class="modal-text muted">Informe seu e-mail cadastrado e escolha uma nova senha. Em uma implantação pública, configure também a verificação de identidade por e-mail.</p>' +
          '<label for="reset-email">E-mail cadastrado</label><input id="reset-email" type="email" required>' +
          '<label for="reset-pass">Nova senha</label><input id="reset-pass" type="password" minlength="6" required placeholder="Mínimo de 6 caracteres">' +
          '<p class="form-error" id="reset-error" role="alert"></p>' +
          '<div class="modal-actions"><button type="button" class="button button-outline" data-act="cancel">Cancelar</button><button class="button" type="submit">Redefinir senha</button></div></form>'
      });
      $('[data-act=cancel]', m.body).addEventListener('click', m.close);
      $('#reset-form', m.body).addEventListener('submit', ev => {
        ev.preventDefault();
        const r = DB.resetPassword($('#reset-email', m.body).value, $('#reset-pass', m.body).value);
        if (!r.ok) { $('#reset-error', m.body).textContent = r.error; return; }
        m.close();
        toast('Senha redefinida. Faça login com a nova senha.', 'success');
      });
    });
  }

  /* ---------- perfil do leitor ---------- */
  function initProfile() {
    const borrowed = $('#borrowed-list');
    if (!borrowed) return;
    const user = DB.currentUser();
    if (!user) { location.replace('login.html?next=perfil.html'); return; }
    if (user.role === 'admin') { location.replace('admin.html'); return; }

    function loanCard(l, history) {
      const dateLine = history
        ? 'Devolvido em: ' + fmtDate(l.returnedAt)
        : '▣ Devolução: ' + fmtDate(l.dueAt);
      return '<article class="loan"><div class="mini-cover ' + esc(l.style) + '">' + esc(l.cover) + '</div>' +
        '<div class="loan-details"><b>' + esc(l.bookTitle) + '</b><small>' + esc(l.bookAuthor) + '</small><small>Alugado em: ' + fmtDate(l.rentedAt) + ' · ' + dateLine + '</small></div>' +
        (history ? '' : '<a class="button button-sm" href="leitor-pdf.html?book=' + encodeURIComponent(l.bookId) + '">Ler PDF</a>') + statusPill(l) + '</article>';
    }

    function render() {
      const u = DB.currentUser();
      const st = DB.readerStats(u.id);
      const loans = DB.getLoans({ userId: u.id });
      const active = loans.filter(l => !l.returnedAt).sort((a, b) => a.dueAt - b.dueAt);
      const history = loans.filter(l => l.returnedAt).sort((a, b) => b.returnedAt - a.returnedAt);

      if (u.avatar) { $('#avatar').innerHTML = '<img src="' + esc(u.avatar) + '" alt="Foto de perfil">'; } else { $('#avatar').textContent = u.username[0].toUpperCase(); }
      $('#profile-name').textContent = u.username;
      $('#profile-description').textContent = u.description;
      $('#level-name').textContent = st.levelName;
      $('#level-stat').textContent = st.levelShort;
      $('#progress-bar').style.width = st.progress + '%';
      $('#level-note').textContent = st.nextAt ? st.points + ' / ' + st.nextAt + ' pontos para o próximo nível' : st.points + ' pontos · nível máximo alcançado';
      $('#stat-read').textContent = st.returned;
      $('#stat-active').textContent = st.active;

      borrowed.innerHTML = active.length ? active.map(l => loanCard(l, false)).join('')
        : '<p class="empty">Você não tem livros em empréstimo. <a href="index.html#acervo">Explorar acervo</a></p>';
      $('#history-list').innerHTML = history.length ? history.map(l => loanCard(l, true)).join('')
        : '<p class="empty">Seu histórico aparecerá aqui depois da primeira devolução.</p>';
    }

    const ptabs = $$('.profile-tab');
    ptabs.forEach(tab => tab.addEventListener('click', () => {
      ptabs.forEach(t => t.classList.toggle('active', t === tab));
      $('#borrowed-panel').classList.toggle('hidden', tab.dataset.panel !== 'borrowed');
      $('#history-panel').classList.toggle('hidden', tab.dataset.panel !== 'history');
    }));

    $('#edit-profile').addEventListener('click', () => {
      const u = DB.currentUser();
      const m = openModal({
        title: 'Editar perfil',
        content: '<form id="profile-form"><label for="pf-name">Nome de usuário</label><input id="pf-name" required maxlength="20" value="' + esc(u.username) + '">' +
          '<label for="pf-desc">Descrição do leitor</label><textarea id="pf-desc" rows="3" maxlength="200">' + esc(u.description) + '</textarea>' +
          '<label for="pf-avatar">Foto de perfil (opcional)</label><input id="pf-avatar" type="file" accept="image/png,image/jpeg,image/webp">' +
          '<p class="form-error" id="pf-error" role="alert"></p>' +
          '<div class="modal-actions"><button type="button" class="button button-outline" data-act="cancel">Cancelar</button><button class="button" type="submit">Salvar</button></div></form>'
      });
      $('[data-act=cancel]', m.body).addEventListener('click', m.close);
      $('#profile-form', m.body).addEventListener('submit', e => {
        e.preventDefault();
        const file = $('#pf-avatar', m.body).files[0];
        const saveProfile = avatar => {
        const r = DB.updateProfile({ username: $('#pf-name', m.body).value, description: $('#pf-desc', m.body).value, avatar: avatar || u.avatar });
        if (!r.ok) { $('#pf-error', m.body).textContent = r.error; return; }
        m.close();
        renderNav();
        render();
        toast('Perfil atualizado.', 'success');
        };
        if (file) { if (file.size > 500000) { $('#pf-error', m.body).textContent = 'A imagem deve ter no máximo 500 KB.'; return; } const reader = new FileReader(); reader.onload = () => saveProfile(reader.result); reader.readAsDataURL(file); } else saveProfile(u.avatar);
      });
    });

    render();
  }

  // limpa a mensagem de erro do formulário assim que o usuário volta a digitar
  document.addEventListener('input', e => {
    const f = e.target.closest && e.target.closest('form');
    if (f) $$('.form-error', f).forEach(p => { p.textContent = ''; });
  });


  /* ---------- leitor de PDF ---------- */
  async function initPdfReader() {
    const frame = $('#pdf-viewer');
    if (!frame) return;
    const user = DB.currentUser();
    if (!user || user.role !== 'leitor') { location.replace('login.html'); return; }
    const bookId = new URLSearchParams(location.search).get('book');
    const book = DB.getBook(bookId);
    const title = $('#pdf-title');
    if (!book) { title.textContent = 'Livro não encontrado'; return; }
    title.textContent = book.title;
    const result = await DB.getBookPdf(bookId);
    if (!result.ok) { $('#pdf-message').textContent = result.error; return; }
    const url = URL.createObjectURL(result.file);
    frame.src = url;
    frame.title = 'Leitura de ' + book.title;
    window.addEventListener('beforeunload', () => URL.revokeObjectURL(url), { once: true });
  }

  renderNav();
  initPdfReader();
  initHome();
  initAuth();
  initProfile();
})();
