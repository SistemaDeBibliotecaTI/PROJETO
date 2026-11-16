/* db.js — Camada de dados da Biblioteca Dev
   Persistência simulada em localStorage (projeto acadêmico, sem backend).
   Em um sistema real, estas funções virariam chamadas a uma API + banco de dados. */
(function (global) {
  'use strict';

  const KEYS = { users: 'bd_users', books: 'bd_books', loans: 'bd_loans', session: 'bd_session' };
  const LOAN_DAYS = 7;
  const PDF_DB_NAME = 'biblioteca_dev_files';
  const PDF_STORE = 'book_pdfs';
  const DAY = 24 * 60 * 60 * 1000;
  const CATEGORIES = ['Programação', 'Banco de Dados', 'Redes', 'Sistemas', 'Segurança', 'Web', 'Engenharia de Software', 'Inteligência Artificial'];
  const COVER_STYLES = [
    { value: 'cover-blue', label: 'Azul petróleo' },
    { value: 'cover-network', label: 'Azul redes' },
    { value: 'cover-python', label: 'Azul claro' },
    { value: 'cover-sec', label: 'Verde segurança' },
    { value: 'cover-linux', label: 'Dourado' }
  ];
  const LEVELS = [
    { min: 0, name: 'Leitor iniciante', short: 'Iniciante' },
    { min: 300, name: 'Leitor dedicado', short: 'Dedicado' },
    { min: 700, name: 'Leitor avançado', short: 'Avançado' }
  ];

  /* ---------- armazenamento centralizado em SQLite via API local ---------- */
  const mem = {};
  function apiRequest(method, url, body) {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open(method, url, false);
      if (body !== undefined) xhr.setRequestHeader('Content-Type', 'application/json');
      xhr.send(body === undefined ? null : JSON.stringify(body));
      if (xhr.status < 200 || xhr.status >= 300) throw new Error('API HTTP ' + xhr.status);
      return xhr.responseText ? JSON.parse(xhr.responseText) : null;
    } catch (e) {
      console.error('Falha ao acessar o banco SQLite:', e);
      return null;
    }
  }
  function read(key, fallback) {
    const result = apiRequest('GET', '/api/state/' + encodeURIComponent(key));
    if (result && Object.prototype.hasOwnProperty.call(result, 'value')) return result.value;
    try { const raw = global.localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (_) { return fallback; }
  }
  function write(key, value) {
    const result = apiRequest('PUT', '/api/state/' + encodeURIComponent(key), { value });
    // Cópia local de contingência para evitar perda de trabalho se o servidor cair.
    try { global.localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* armazenamento opcional */ }
    if (!result || !result.ok) console.error('Não foi possível confirmar a gravação no SQLite.');
  }

  /* ---------- utilitários ---------- */
  function uid(prefix) { return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  function err(message) { return { ok: false, error: message }; }
  function endOfDay(ms) { const d = new Date(ms); d.setHours(23, 59, 59, 999); return d.getTime(); }
  function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function dueDateFrom(ms) { const d = new Date(ms); d.setDate(d.getDate() + LOAN_DAYS); d.setHours(23, 59, 59, 999); return d.getTime(); }

  // Hash simples (cyrb53) apenas para não guardar a senha em texto puro na demonstração.
  // Em produção: bcrypt/argon2 no servidor.
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16);
  }
  function passHash(pw) { return hash('bibdev::' + pw); }

  /* ---------- estado inicial limpo ---------- */
  function seed() {
    const now = Date.now();
    const users = [{
      id: 'u_admin_fixed',
      username: 'adm001',
      email: 'adm001@bibliotecadev.local',
      passHash: passHash('00011'),
      role: 'admin',
      description: 'Administrador da Biblioteca Dev.',
      createdAt: now
    }];
    // O catálogo começa vazio: o administrador cadastra os livros reais.
    write(KEYS.books, []);
    write(KEYS.users, users);
    write(KEYS.loans, []);
  }

  function init() {
    const migrationKey = 'bd_clean_start_v4_sqlite';
    let migrated = false;
    try { migrated = global.localStorage.getItem(migrationKey) === '1'; } catch (_) { /* armazenamento indisponível */ }

    // Migração única: remove contas, livros, empréstimos e PDFs de demonstração
    // existentes no navegador. Não apaga os dados novamente em visitas futuras.
    if (!migrated) {
      if (!read(KEYS.users, null)) seed();
      clearSession();
      try { global.localStorage.setItem(migrationKey, '1'); } catch (_) { /* ignore */ }
    } else {
      if (!read(KEYS.users, null) || !read(KEYS.books, null) || !read(KEYS.loans, null)) seed();
      // Garante que a conta administrativa fixa exista e tenha a senha definida.
      const users = _users();
      const admin = users.find(u => u.username === 'adm001' && u.role === 'admin');
      if (!admin) {
        users.push({ id: 'u_admin_fixed', username: 'adm001', email: 'adm001@bibliotecadev.local', passHash: passHash('00011'), role: 'admin', description: 'Administrador da Biblioteca Dev.', createdAt: Date.now() });
        write(KEYS.users, users);
      } else if (admin.passHash !== passHash('00011')) {
        admin.passHash = passHash('00011');
        write(KEYS.users, users);
      }
    }
  }

  /* ---------- sessão ---------- */
  function getSessionRaw() {
    try {
      const s = global.sessionStorage.getItem(KEYS.session) || (USE_LS ? global.localStorage.getItem(KEYS.session) : mem[KEYS.session]);
      return s ? JSON.parse(s) : null;
    } catch (e) { return mem[KEYS.session] ? JSON.parse(mem[KEYS.session]) : null; }
  }
  function clearSession() {
    try { global.sessionStorage.removeItem(KEYS.session); } catch (e) { /* ignore */ }
    if (USE_LS) global.localStorage.removeItem(KEYS.session); else delete mem[KEYS.session];
  }
  function setSession(userId, remember) {
    clearSession();
    const raw = JSON.stringify({ userId });
    try { (remember ? global.localStorage : global.sessionStorage).setItem(KEYS.session, raw); }
    catch (e) { mem[KEYS.session] = raw; }
  }

  /* ---------- usuários ---------- */
  const _users = () => read(KEYS.users, []);
  const publicUser = u => { if (!u) return null; const c = Object.assign({}, u); delete c.passHash; return c; };
  const getUsers = () => _users().map(publicUser);
  const getUser = id => publicUser(_users().find(u => u.id === id));
  function currentUser() {
    const s = getSessionRaw();
    return s ? getUser(s.userId) : null;
  }
  function requireAdmin() {
    const u = currentUser();
    return u && u.role === 'admin' ? null : err('Ação permitida apenas ao administrador.');
  }
  const USERNAME_RE = /^[A-Za-z0-9._-]{3,20}$/;
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const USERNAME_MSG = 'O nome de usuário deve ter de 3 a 20 caracteres (letras, números, ponto, hífen ou sublinhado).';

  function login(identifier, password, remember, requiredRole) {
    const id = String(identifier || '').trim().toLowerCase();
    if (!id || !password) return err('Informe usuário/e-mail e senha.');
    const user = _users().find(u => u.username.toLowerCase() === id || u.email.toLowerCase() === id);
    if (!user || user.passHash !== passHash(password) || (requiredRole && user.role !== requiredRole)) return err('Usuário ou senha incorretos.');
    setSession(user.id, remember);
    return { ok: true, user: publicUser(user) };
  }
  function logout() { clearSession(); }

  function register(username, email, password) {
    username = String(username || '').trim();
    email = String(email || '').trim().toLowerCase();
    if (!USERNAME_RE.test(username)) return err(USERNAME_MSG);
    if (!EMAIL_RE.test(email)) return err('Informe um e-mail válido.');
    if (String(password || '').length < 6) return err('A senha deve ter no mínimo 6 caracteres.');
    const users = _users();
    if (users.some(u => u.username.toLowerCase() === username.toLowerCase())) return err('Este nome de usuário já está em uso.');
    if (users.some(u => u.email.toLowerCase() === email)) return err('Este e-mail já está cadastrado.');
    const user = { id: uid('u'), username, email, passHash: passHash(password), role: 'leitor', description: 'Novo leitor da Biblioteca Dev.', avatar: '', favorites: [], createdAt: Date.now() };
    users.push(user);
    write(KEYS.users, users);
    return { ok: true, user: publicUser(user) };
  }

  function updateProfile(data) {
    const me = currentUser();
    if (!me) return err('Sessão expirada. Faça login novamente.');
    const username = String(data.username || '').trim();
    const description = String(data.description || '').trim();
    if (!USERNAME_RE.test(username)) return err(USERNAME_MSG);
    if (description.length > 200) return err('A descrição deve ter no máximo 200 caracteres.');
    const users = _users();
    if (users.some(u => u.id !== me.id && u.username.toLowerCase() === username.toLowerCase())) return err('Este nome de usuário já está em uso.');
    const u = users.find(x => x.id === me.id);
    u.username = username;
    u.description = description || 'Sem descrição.';
    if (typeof data.avatar === 'string' && data.avatar.length <= 700000) u.avatar = data.avatar;
    if (Array.isArray(data.favorites)) u.favorites = data.favorites.filter(id => _books().some(b => b.id === id));
    write(KEYS.users, users);
    // mantém o nome nos aluguéis antigos
    const loans = _loans();
    loans.forEach(l => { if (l.userId === me.id) l.userName = username; });
    write(KEYS.loans, loans);
    return { ok: true, user: publicUser(u) };
  }

  // Demonstração: sem envio de e-mail, a nova senha é definida diretamente.
  function resetPassword(email, newPassword) {
    email = String(email || '').trim().toLowerCase();
    if (String(newPassword || '').length < 6) return err('A nova senha deve ter no mínimo 6 caracteres.');
    const users = _users();
    const u = users.find(x => x.email.toLowerCase() === email);
    if (!u) return err('Não encontramos uma conta com este e-mail.');
    u.passHash = passHash(newPassword);
    write(KEYS.users, users);
    return { ok: true };
  }

  function deleteUser(id) {
    const denied = requireAdmin(); if (denied) return denied;
    const users = _users();
    const u = users.find(x => x.id === id);
    if (!u) return err('Usuário não encontrado.');
    if (u.role === 'admin') return err('Contas de administrador não podem ser excluídas.');
    if (_loans().some(l => l.userId === id && !l.returnedAt)) return err('Este leitor possui livros em empréstimo. Registre a devolução antes de excluir.');
    write(KEYS.users, users.filter(x => x.id !== id));
    return { ok: true };
  }

  /* ---------- livros ---------- */
  const _books = () => read(KEYS.books, []);
  const getBooks = () => _books().slice().sort((a, b) => a.title.localeCompare(b.title, 'pt-BR'));
  const getBook = id => _books().find(b => b.id === id) || null;
  function availability(bookId) {
    const b = getBook(bookId);
    if (!b) return 0;
    const active = _loans().filter(l => l.bookId === bookId && !l.returnedAt).length;
    return Math.max(0, b.copies - active);
  }

  function saveBook(data, id) {
    const denied = requireAdmin(); if (denied) return denied;
    const title = String(data.title || '').trim();
    const author = String(data.author || '').trim();
    const category = String(data.category || '').trim();
    const publisher = String(data.publisher || '').trim();
    const description = String(data.description || '').trim();
    const copies = Number(data.copies);
    const yearRaw = String(data.year == null ? '' : data.year).trim();
    let cover = String(data.cover || '').trim();
    let style = String(data.style || 'cover-blue');
    const maxYear = new Date().getFullYear() + 1;

    if (title.length < 2 || title.length > 100) return err('Informe o título (2 a 100 caracteres).');
    if (author.length < 2 || author.length > 100) return err('Informe o autor (2 a 100 caracteres).');
    if (!category || category.length > 40) return err('Selecione a categoria.');
    if (!Number.isInteger(copies) || copies < 1 || copies > 99) return err('A quantidade de exemplares deve ser um número inteiro de 1 a 99.');
    if (yearRaw && (!/^\d{4}$/.test(yearRaw) || Number(yearRaw) < 1950 || Number(yearRaw) > maxYear)) return err('Informe um ano válido (entre 1950 e ' + maxYear + ').');
    if (publisher.length > 60) return err('A editora deve ter no máximo 60 caracteres.');
    if (description.length > 300) return err('A descrição deve ter no máximo 300 caracteres.');
    if (cover.length > 30) return err('O texto da capa deve ter no máximo 30 caracteres.');
    if (!COVER_STYLES.some(s => s.value === style) && style !== 'cover-sql') style = 'cover-blue';
    if (!cover) cover = title.toUpperCase().slice(0, 28);

    const books = _books();
    const dup = books.find(b => b.id !== id && b.title.toLowerCase() === title.toLowerCase() && b.author.toLowerCase() === author.toLowerCase());
    if (dup) return err('Este livro (mesmo título e autor) já está cadastrado.');

    const coverUrl = typeof data.coverUrl === 'string' && /^https:\/\//i.test(data.coverUrl) ? data.coverUrl.slice(0, 1000) : '';
    const record = { title, author, category, cover, style, coverUrl, description: description || 'Sem descrição.', publisher, year: yearRaw, copies };
    if (id) {
      const book = books.find(b => b.id === id);
      if (!book) return err('Livro não encontrado.');
      const active = _loans().filter(l => l.bookId === id && !l.returnedAt).length;
      if (copies < active) return err('Há ' + active + ' exemplar(es) alugado(s). A quantidade não pode ser menor que isso.');
      Object.assign(book, record);
      write(KEYS.books, books);
      return { ok: true, book };
    }
    const book = Object.assign({ id: uid('b') }, record);
    books.push(book);
    write(KEYS.books, books);
    return { ok: true, book };
  }

  function deleteBook(id) {
    const denied = requireAdmin(); if (denied) return denied;
    if (_loans().some(l => l.bookId === id && !l.returnedAt)) return err('Este livro possui exemplares alugados. Registre as devoluções antes de excluir.');
    write(KEYS.books, _books().filter(b => b.id !== id));
    return { ok: true };
  }


  /* ---------- arquivos PDF armazenados no servidor ---------- */
  async function saveBookPdf(bookId, file) {
    const denied = requireAdmin(); if (denied) return denied;
    if (!getBook(bookId)) return err('Livro não encontrado.');
    if (!file || file.type !== 'application/pdf' || !/\.pdf$/i.test(file.name)) return err('Selecione um arquivo PDF válido.');
    if (file.size > 30 * 1024 * 1024) return err('O PDF deve ter no máximo 30 MB.');
    try {
      const form = new FormData(); form.append('pdf', file);
      const user = currentUser();
      const response = await fetch('/api/files/' + encodeURIComponent(bookId), { method: 'POST', headers: { 'X-User-Id': user.id }, body: form });
      const data = await response.json();
      return response.ok ? { ok: true } : err(data.error || 'Falha ao salvar o PDF.');
    } catch (e) { return err('Não foi possível enviar o PDF. Verifique se o servidor está ligado.'); }
  }
  async function getBookPdf(bookId) {
    const user = currentUser();
    if (!user || user.role !== 'leitor') return err('Entre como leitor para acessar o PDF.');
    try {
      const response = await fetch('/api/files/' + encodeURIComponent(bookId) + '?userId=' + encodeURIComponent(user.id));
      if (!response.ok) { const data = await response.json(); return err(data.error || 'Não foi possível abrir o PDF.'); }
      const blob = await response.blob();
      return { ok: true, file: blob, name: response.headers.get('X-File-Name') || 'livro.pdf' };
    } catch (_) { return err('Não foi possível acessar o PDF. Verifique se o servidor está ligado.'); }
  }
  async function hasBookPdf(bookId) {
    try { const r = await fetch('/api/files/' + encodeURIComponent(bookId) + '/info'); return r.ok; }
    catch (_) { return false; }
  }
  async function deleteBookPdf(bookId) {
    const denied = requireAdmin(); if (denied) return denied;
    try {
      const user = currentUser();
      const r = await fetch('/api/files/' + encodeURIComponent(bookId), { method: 'DELETE', headers: { 'X-User-Id': user.id } });
      const data = await r.json(); return r.ok ? { ok: true } : err(data.error || 'Não foi possível remover o PDF.');
    } catch (_) { return err('Não foi possível conectar ao servidor.'); }
  }

  /* ---------- aluguéis ---------- */
  const _loans = () => read(KEYS.loans, []);
  function getLoans(filter) {
    filter = filter || {};
    let list = _loans().slice().sort((a, b) => b.rentedAt - a.rentedAt);
    if (filter.userId) list = list.filter(l => l.userId === filter.userId);
    return list;
  }

  function loanStatus(loan, now) {
    now = now || Date.now();
    if (loan.returnedAt) {
      const late = loan.returnedAt > loan.dueAt;
      return { key: late ? 'returned-late' : 'returned', label: late ? 'Devolvido com atraso' : 'Devolvido', detail: '' };
    }
    if (now > loan.dueAt) {
      const d = Math.round((startOfDay(now) - startOfDay(loan.dueAt)) / DAY);
      return { key: 'late', label: 'Atrasado', detail: d + (d === 1 ? ' dia de atraso' : ' dias de atraso') };
    }
    const left = Math.round((startOfDay(loan.dueAt) - startOfDay(now)) / DAY);
    if (left === 0) return { key: 'due', label: 'Vence hoje', detail: '' };
    return { key: 'ok', label: 'Em dia', detail: left + (left === 1 ? ' dia restante' : ' dias restantes') };
  }

  function rentBook(bookId) {
    const u = currentUser();
    if (!u) return err('Faça login para alugar um livro.');
    if (u.role !== 'leitor') return err('Apenas contas de leitor podem alugar livros.');
    const b = getBook(bookId);
    if (!b) return err('Livro não encontrado.');
    if (availability(bookId) < 1) return err('Não há exemplares disponíveis no momento.');
    const loans = _loans();
    if (loans.some(l => l.userId === u.id && l.bookId === bookId && !l.returnedAt)) return err('Você já está com este livro alugado.');
    const now = Date.now();
    const loan = {
      id: uid('l'), bookId, userId: u.id, userName: u.username,
      bookTitle: b.title, bookAuthor: b.author, cover: b.cover, style: b.style,
      rentedAt: now, dueAt: dueDateFrom(now), returnedAt: null
    };
    loans.push(loan);
    write(KEYS.loans, loans);
    return { ok: true, loan };
  }

  function returnLoan(loanId) {
    const denied = requireAdmin(); if (denied) return denied;
    const loans = _loans();
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return err('Aluguel não encontrado.');
    if (loan.returnedAt) return err('Este aluguel já foi devolvido.');
    loan.returnedAt = Date.now();
    write(KEYS.loans, loans);
    return { ok: true, loan };
  }

  /* ---------- estatísticas e relatórios ---------- */
  function stats() {
    const books = _books(), loans = _loans(), now = Date.now();
    const active = loans.filter(l => !l.returnedAt);
    const copies = books.reduce((s, b) => s + b.copies, 0);
    return {
      titles: books.length,
      copies,
      rented: active.length,
      available: Math.max(0, copies - active.length),
      activeLoans: active.length,
      lateLoans: active.filter(l => now > l.dueAt).length,
      readers: _users().filter(u => u.role === 'leitor').length,
      totalLoans: loans.length
    };
  }

  function topBooks(n) {
    const map = {};
    _loans().forEach(l => {
      map[l.bookId] = map[l.bookId] || { bookId: l.bookId, title: l.bookTitle, count: 0 };
      map[l.bookId].count++;
    });
    return Object.keys(map).map(k => map[k]).sort((a, b) => b.count - a.count || a.title.localeCompare(b.title, 'pt-BR')).slice(0, n || 5);
  }

  // Pontuação: 50 pts por livro devolvido + 25 pts por livro em empréstimo.
  function readerStats(userId) {
    const loans = _loans().filter(l => l.userId === userId);
    const returned = loans.filter(l => l.returnedAt).length;
    const active = loans.length - returned;
    const points = returned * 50 + active * 25;
    let idx = 0;
    LEVELS.forEach((lv, i) => { if (points >= lv.min) idx = i; });
    const level = LEVELS[idx], next = LEVELS[idx + 1] || null;
    const progress = next ? Math.round(((points - level.min) / (next.min - level.min)) * 100) : 100;
    return { returned, active, points, levelName: level.name, levelShort: level.short, nextAt: next ? next.min : null, progress };
  }

  function resetDemo() { return err('A restauração de demonstração foi desativada para proteger os cadastros reais.'); }

  global.DB = {
    init, CATEGORIES, COVER_STYLES, LOAN_DAYS,
    login, logout, register, currentUser, updateProfile, resetPassword, getUsers, getUser, deleteUser,
    getBooks, getBook, availability, saveBook, deleteBook, saveBookPdf, getBookPdf, hasBookPdf, deleteBookPdf,
    getLoans, loanStatus, rentBook, returnLoan, dueDateFrom,
    stats, topBooks, readerStats, resetDemo
  };
})(window);
