/* admin.js — Área administrativa (painel, livros, aluguéis e usuários) */
(function () {
  'use strict';
  const panel = document.getElementById('admin-panel');
  if (!panel) return;

  const { esc, fmtDate, toast, openModal, confirmDialog, statusPill } = window.UI;
  const user = DB.currentUser();
  if (!user) { location.replace('login.html?next=admin.html'); return; }
  if (user.role !== 'admin') { location.replace('index.html'); return; }

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const TABS = ['painel', 'livros', 'pdfs', 'alugueis', 'usuarios'];
  const state = { tab: TABS.indexOf(location.hash.slice(1)) >= 0 ? location.hash.slice(1) : 'painel', bookQ: '', loanFilter: 'todos', loanQ: '' };

  /* ---------- helpers de tabela ---------- */
  function loansTable(list, withAction) {
    if (!list.length) return '<p class="empty">Nenhum aluguel encontrado.</p>';
    return '<div class="table-wrap"><table class="data"><thead><tr><th>Livro</th><th>Leitor</th><th>Alugado em</th><th>Devolução prevista</th><th>Status</th>' + (withAction ? '<th></th>' : '') + '</tr></thead><tbody>' +
      list.map(l => '<tr><td><b>' + esc(l.bookTitle) + '</b></td><td>' + esc(l.userName) + '</td><td>' + fmtDate(l.rentedAt) + '</td><td>' + fmtDate(l.dueAt) +
        (l.returnedAt ? '<br><small class="muted">Devolvido em ' + fmtDate(l.returnedAt) + '</small>' : '') + '</td><td>' + statusPill(l) + '</td>' +
        (withAction ? '<td class="actions">' + (l.returnedAt ? '' : '<button class="button button-sm" data-return="' + esc(l.id) + '">Registrar devolução</button>') + '</td>' : '') + '</tr>').join('') +
      '</tbody></table></div>';
  }

  /* ---------- painel ---------- */
  function renderPainel() {
    const s = DB.stats();
    const top = DB.topBooks(5);
    const max = top.length ? top[0].count : 1;
    const bars = top.length ? top.map(t => '<div class="bar-row"><span title="' + esc(t.title) + '">' + esc(t.title) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + Math.round((t.count / max) * 100) + '%"></div></div><b>' + t.count + '</b></div>').join('')
      : '<p class="empty">Ainda não há aluguéis.</p>';
    panel.innerHTML =
      '<div class="stats-grid four">' +
      '<article class="stat"><span>📚</span><div><small>Títulos no acervo</small><b>' + s.titles + '</b></div></article>' +
      '<article class="stat"><span>◷</span><div><small>Aluguéis ativos</small><b>' + s.activeLoans + '</b></div></article>' +
      '<article class="stat"><span>⚠</span><div><small>Aluguéis atrasados</small><b>' + s.lateLoans + '</b></div></article>' +
      '<article class="stat"><span>☺</span><div><small>Leitores cadastrados</small><b>' + s.readers + '</b></div></article></div>' +
      '<div class="grid-2"><section class="card"><h3>Livros mais alugados</h3>' + bars + '</section>' +
      '<section class="card"><h3>Status do acervo</h3><ul class="kv"><li><span>Exemplares no total</span><b>' + s.copies + '</b></li><li><span>Disponíveis</span><b>' + s.available + '</b></li><li><span>Alugados</span><b>' + s.rented + '</b></li><li><span>Aluguéis já realizados</span><b>' + s.totalLoans + '</b></li></ul></section></div>' +
      '<section class="card"><h3>Aluguéis recentes</h3>' + loansTable(DB.getLoans().slice(0, 5), false) + '</section>' +
      '<p class="admin-foot muted">Os dados cadastrados são mantidos. Não há restauração automática de demonstração.</p>';
  }

  /* ---------- livros ---------- */
  function renderLivros() {
    panel.innerHTML = '<h2 class="panel-title">Acervo de livros</h2><div class="toolbar"><input id="book-q" type="search" placeholder="Buscar por título, autor ou categoria..." aria-label="Buscar livros" value="' + esc(state.bookQ) + '"><button class="button" id="new-book" type="button">+ Novo livro</button></div><div id="books-table"></div>';
    renderBooksTable();
  }
  function renderBooksTable() {
    const q = norm(state.bookQ.trim());
    const list = DB.getBooks().filter(b => !q || norm(b.title).includes(q) || norm(b.author).includes(q) || norm(b.category).includes(q));
    $('#books-table').innerHTML = list.length
      ? '<div class="table-wrap"><table class="data"><thead><tr><th>Capa</th><th>Livro</th><th>Categoria</th><th>Disponíveis</th><th></th></tr></thead><tbody>' +
        list.map(b => '<tr><td>' + (b.coverUrl ? '<img class="mini-cover-img" src="' + esc(b.coverUrl) + '" alt="Capa">' : '<div class="mini-cover ' + esc(b.style) + '">' + esc(b.cover) + '</div>') + '</td><td><b>' + esc(b.title) + '</b><br><small class="muted">' + esc(b.author) + '</small></td><td>' + esc(b.category) + '</td><td>' + DB.availability(b.id) + ' / ' + b.copies + '</td>' +
          '<td class="actions"><button class="link-btn" data-edit="' + esc(b.id) + '">Editar</button><button class="link-btn danger" data-del="' + esc(b.id) + '">Excluir</button></td></tr>').join('') + '</tbody></table></div>'
      : '<p class="empty">Nenhum livro encontrado.</p>';
  }

  function openBookForm(book) {
    const b = book || { title: '', author: '', category: DB.CATEGORIES[0], publisher: '', year: '', copies: 1, cover: '', style: 'cover-blue', description: '' };
    const style = b.style === 'cover-sql' ? 'cover-blue' : b.style;
    const cats = DB.CATEGORIES.indexOf(b.category) >= 0 ? DB.CATEGORIES : [b.category].concat(DB.CATEGORIES);
    const m = openModal({
      title: book ? 'Editar livro' : 'Novo livro',
      wide: true,
      content: '<form id="book-form">' +
        '<label for="bf-title">Título</label><input id="bf-title" required maxlength="100" value="' + esc(b.title) + '">' +
        '<div class="form-row"><div><label for="bf-author">Autor</label><input id="bf-author" required maxlength="100" value="' + esc(b.author) + '"></div>' +
        '<div><label for="bf-category">Categoria</label><select id="bf-category">' + cats.map(c => '<option' + (c === b.category ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></div></div>' +
        '<div class="form-row"><div><label for="bf-publisher">Editora (opcional)</label><input id="bf-publisher" maxlength="60" value="' + esc(b.publisher) + '"></div>' +
        '<div><label for="bf-year">Ano (opcional)</label><input id="bf-year" inputmode="numeric" maxlength="4" value="' + esc(b.year) + '"></div></div>' +
        '<div class="form-row"><div><label for="bf-copies">Quantidade de exemplares</label><input id="bf-copies" type="number" min="1" max="99" required value="' + esc(b.copies) + '"></div>' +
        '<div><label for="bf-style">Cor da capa</label><select id="bf-style">' + DB.COVER_STYLES.map(s => '<option value="' + s.value + '"' + (s.value === style ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') + '</select></div></div>' +
        '<label for="bf-cover">Texto da capa (opcional)</label><input id="bf-cover" maxlength="30" value="' + esc(b.cover) + '" placeholder="Se vazio, usa o título">' +
        '<label>Personalização da capa</label><div class="toolbar"><button type="button" class="button button-outline" id="find-cover">Achar capa online</button><button type="button" class="button button-outline" id="clear-cover">Usar capa padrão</button></div><div id="cover-results" class="cover-results"></div>' +
        '<label for="bf-desc">Descrição</label><textarea id="bf-desc" rows="3" maxlength="300">' + esc(b.description === 'Sem descrição.' ? '' : b.description) + '</textarea>' +
        '<p class="form-error" id="bf-error" role="alert"></p>' +
        '<div class="modal-actions"><button type="button" class="button button-outline" data-act="cancel">Cancelar</button><button class="button" type="submit">' + (book ? 'Salvar alterações' : 'Cadastrar livro') + '</button></div></form>'
    });
    $('[data-act=cancel]', m.body).addEventListener('click', m.close);
    $('#find-cover', m.body).addEventListener('click', async () => {
      const q = [$('#bf-title', m.body).value, $('#bf-author', m.body).value].filter(Boolean).join(' ');
      if (!q.trim()) { $('#bf-error', m.body).textContent = 'Informe título e/ou autor antes de buscar.'; return; }
      const results = $('#cover-results', m.body); results.textContent = 'Buscando capas...';
      try {
        const response = await fetch('https://www.googleapis.com/books/v1/volumes?q=' + encodeURIComponent(q) + '&maxResults=8');
        if (!response.ok) throw new Error('Busca online indisponível no momento.');
        const data = await response.json();
        const items = (data.items || []).map(x => ({ title: x.volumeInfo?.title || '', image: (x.volumeInfo?.imageLinks?.thumbnail || x.volumeInfo?.imageLinks?.smallThumbnail || '').replace(/^http:/, 'https:') })).filter(x => x.image);
        if (!items.length) { results.textContent = 'Nenhuma capa encontrada. Você pode continuar com a capa padrão.'; return; }
        results.innerHTML = items.map((x, i) => '<button type="button" class="cover-choice" data-cover-index="' + i + '"><img src="' + esc(x.image) + '" alt=""><span>' + esc(x.title) + '</span></button>').join('');
        results._items = items;
      } catch (error) { results.textContent = error.message || 'Erro ao buscar capas.'; }
    });
    $('#cover-results', m.body).addEventListener('click', e => {
      const choice = e.target.closest('[data-cover-index]'); if (!choice) return;
      const selected = $('#cover-results', m.body)._items[Number(choice.dataset.coverIndex)];
      m.body.dataset.coverUrl = selected.image;
      $('#cover-results', m.body).innerHTML = '<p class="muted">Capa selecionada: ' + esc(selected.title) + '</p><img class="cover-preview" src="' + esc(selected.image) + '" alt="Prévia da capa">';
      toast('Capa selecionada.', 'success');
    });
    $('#clear-cover', m.body).addEventListener('click', () => { m.body.dataset.coverUrl = ''; $('#cover-results', m.body).textContent = 'Será utilizada a capa padrão.'; });
    $('#book-form', m.body).addEventListener('submit', e => {
      e.preventDefault();
      const v = id => $('#' + id, m.body).value;
      const r = DB.saveBook({
        title: v('bf-title'), author: v('bf-author'), category: v('bf-category'), publisher: v('bf-publisher'),
        year: v('bf-year'), copies: v('bf-copies'), style: v('bf-style'), cover: v('bf-cover'), coverUrl: m.body.dataset.coverUrl !== undefined ? m.body.dataset.coverUrl : ((book && book.coverUrl) || ''), description: v('bf-desc')
      }, book ? book.id : null);
      if (!r.ok) { $('#bf-error', m.body).textContent = r.error; return; }
      m.close();
      toast(book ? 'Livro atualizado.' : 'Livro cadastrado.', 'success');
      render();
    });
  }


  /* ---------- PDFs dos livros ---------- */
  async function renderPdfs() {
    const books = DB.getBooks();
    panel.innerHTML = '<h2 class="panel-title">Arquivos PDF do acervo</h2><p class="muted">Envie o PDF correspondente a cada livro. O leitor poderá abri-lo em “Meus livros” enquanto o empréstimo estiver ativo.</p><div class="card pdf-upload-card"><label for="pdf-book">Livro</label><select id="pdf-book"><option value="">Selecione um livro</option>' + books.map(b => '<option value="' + esc(b.id) + '">' + esc(b.title) + ' — ' + esc(b.author) + '</option>').join('') + '</select><label for="pdf-file">Arquivo PDF (máximo 30 MB)</label><input id="pdf-file" type="file" accept="application/pdf,.pdf"><p id="pdf-status" class="muted" role="status"></p><button class="button" id="upload-pdf" type="button">Enviar PDF</button></div><div class="table-wrap"><table class="data"><thead><tr><th>Livro</th><th>Arquivo</th><th>Ação</th></tr></thead><tbody id="pdf-book-rows"><tr><td colspan="3">Carregando arquivos...</td></tr></tbody></table></div>';
    const rows = $('#pdf-book-rows');
    const flags = await Promise.all(books.map(async b => ({ book: b, has: await DB.hasBookPdf(b.id) })));
    rows.innerHTML = flags.length ? flags.map(x => '<tr><td><b>' + esc(x.book.title) + '</b><br><small class="muted">' + esc(x.book.author) + '</small></td><td>' + (x.has ? '<span class="status">PDF enviado</span>' : '<span class="status done">Sem PDF</span>') + '</td><td class="actions">' + (x.has ? '<button class="link-btn danger" data-remove-pdf="' + esc(x.book.id) + '">Remover PDF</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="3">Cadastre um livro primeiro.</td></tr>';
  }

  /* ---------- aluguéis ---------- */
  function renderAlugueis() {
    panel.innerHTML = '<h2 class="panel-title">Aluguéis e devoluções</h2><div class="toolbar"><input id="loan-q" type="search" placeholder="Buscar por livro ou leitor..." aria-label="Buscar aluguéis" value="' + esc(state.loanQ) + '">' +
      '<select id="loan-filter" aria-label="Filtrar por status">' + [['todos', 'Todos'], ['ativos', 'Em andamento'], ['atrasados', 'Atrasados'], ['devolvidos', 'Devolvidos']].map(o => '<option value="' + o[0] + '"' + (state.loanFilter === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select></div><div id="loans-table"></div>';
    renderLoansTable();
  }
  function renderLoansTable() {
    const q = norm(state.loanQ.trim());
    const now = Date.now();
    const list = DB.getLoans().filter(l => {
      if (state.loanFilter === 'ativos' && l.returnedAt) return false;
      if (state.loanFilter === 'atrasados' && (l.returnedAt || now <= l.dueAt)) return false;
      if (state.loanFilter === 'devolvidos' && !l.returnedAt) return false;
      return !q || norm(l.bookTitle).includes(q) || norm(l.userName).includes(q);
    });
    $('#loans-table').innerHTML = loansTable(list, true);
  }

  /* ---------- usuários ---------- */
  function renderUsuarios() {
    const loans = DB.getLoans();
    const rows = DB.getUsers().map(u => {
      const active = loans.filter(l => l.userId === u.id && !l.returnedAt).length;
      const canDelete = u.role === 'leitor';
      return '<tr><td><b>' + esc(u.username) + '</b></td><td>' + esc(u.email) + '</td><td>' + (u.role === 'admin' ? 'Administrador' : 'Leitor') + '</td><td>' + active + '</td><td>' + fmtDate(u.createdAt) + '</td>' +
        '<td class="actions">' + (canDelete ? '<button class="link-btn danger" data-deluser="' + esc(u.id) + '">Excluir</button>' : '') + '</td></tr>';
    }).join('');
    panel.innerHTML = '<h2 class="panel-title">Usuários cadastrados</h2><div class="table-wrap"><table class="data"><thead><tr><th>Usuário</th><th>E-mail</th><th>Perfil</th><th>Aluguéis ativos</th><th>Cadastro</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  /* ---------- controle geral ---------- */
  function render() {
    $$('.profile-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === state.tab));
    ({ painel: renderPainel, livros: renderLivros, pdfs: renderPdfs, alugueis: renderAlugueis, usuarios: renderUsuarios })[state.tab]();
  }

  $$('.profile-tab').forEach(t => t.addEventListener('click', () => { state.tab = t.dataset.tab; location.hash = state.tab; render(); }));
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1);
    if (TABS.indexOf(h) >= 0 && h !== state.tab) { state.tab = h; render(); }
  });

  panel.addEventListener('input', e => {
    if (e.target.id === 'book-q') { state.bookQ = e.target.value; renderBooksTable(); }
    if (e.target.id === 'loan-q') { state.loanQ = e.target.value; renderLoansTable(); }
  });
  panel.addEventListener('change', e => {
    if (e.target.id === 'loan-filter') { state.loanFilter = e.target.value; renderLoansTable(); }
  });

  panel.addEventListener('click', async e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'new-book') { openBookForm(null); return; }
    if (btn.id === 'upload-pdf') {
      const bookId = $('#pdf-book')?.value, file = $('#pdf-file')?.files?.[0];
      const status = $('#pdf-status');
      if (!bookId || !file) { if (status) status.textContent = 'Selecione um livro e um arquivo PDF.'; return; }
      btn.disabled = true; if (status) status.textContent = 'Enviando PDF...';
      const result = await DB.saveBookPdf(bookId, file);
      if (status) status.textContent = result.ok ? 'PDF enviado com sucesso.' : result.error;
      toast(result.ok ? 'PDF associado ao livro.' : result.error, result.ok ? 'success' : 'error');
      renderPdfs(); return;
    }
    if (btn.dataset.removePdf) {
      const result = await DB.deleteBookPdf(btn.dataset.removePdf);
      toast(result.ok ? 'PDF removido.' : result.error, result.ok ? 'success' : 'error'); renderPdfs(); return;
    }
    if (btn.dataset.edit) { openBookForm(DB.getBook(btn.dataset.edit)); return; }
    if (btn.dataset.del) {
      const b = DB.getBook(btn.dataset.del);
      if (!b) return;
      if (await confirmDialog({ title: 'Excluir livro', message: 'Excluir "' + b.title + '" do acervo? Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', danger: true })) {
        const r = DB.deleteBook(b.id);
        toast(r.ok ? 'Livro excluído.' : r.error, r.ok ? 'success' : 'error');
        render();
      }
      return;
    }
    if (btn.dataset.return) {
      const loan = DB.getLoans().find(l => l.id === btn.dataset.return);
      if (!loan) return;
      if (await confirmDialog({ title: 'Registrar devolução', message: 'Confirmar a devolução de "' + loan.bookTitle + '" por ' + loan.userName + '?', confirmLabel: 'Confirmar devolução' })) {
        const r = DB.returnLoan(loan.id);
        toast(r.ok ? 'Devolução registrada.' : r.error, r.ok ? 'success' : 'error');
        render();
      }
      return;
    }
    if (btn.dataset.deluser) {
      const u = DB.getUser(btn.dataset.deluser);
      if (!u) return;
      if (await confirmDialog({ title: 'Excluir usuário', message: 'Excluir a conta de "' + u.username + '"? O histórico de aluguéis é mantido.', confirmLabel: 'Excluir', danger: true })) {
        const r = DB.deleteUser(u.id);
        toast(r.ok ? 'Usuário excluído.' : r.error, r.ok ? 'success' : 'error');
        render();
      }
      return;
    }
    if (btn.id === 'reset-demo') {
      if (await confirmDialog({ title: 'Restaurar demonstração', message: 'Isso apaga todos os dados atuais (livros, usuários e aluguéis) e recria os dados de demonstração. Continuar?', confirmLabel: 'Restaurar', danger: true })) {
        DB.resetDemo();
        toast('Dados de demonstração restaurados.', 'success');
        render();
      }
    }
  });

  render();
})();
