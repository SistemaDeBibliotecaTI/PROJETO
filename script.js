const books = [
  {title:"Clean Code",author:"Robert C. Martin",category:"Programação",cover:"CLEAN CODE",style:"cover-blue",description:"Código limpo e boas práticas."},
  {title:"Redes de Computadores",author:"Andrew S. Tanenbaum",category:"Redes",cover:"REDES",style:"cover-network",description:"Fundamentos de redes e comunicação."},
  {title:"Banco de Dados SQL",author:"Ramez Elmasri e Shamkant Navathe",category:"Banco de Dados",cover:"BANCO DE DADOS SQL",style:"cover-sql",description:"Modelagem e sistemas de banco de dados."},
  {title:"Segurança em Redes",author:"William Stallings",category:"Segurança",cover:"SEGURANÇA",style:"cover-sec",description:"Conceitos de proteção e segurança."},
  {title:"Python — Do Básico ao Avançado",author:"Guido van Rossum",category:"Programação",cover:"PYTHON",style:"cover-python",description:"Aprenda a programar com Python."},
  {title:"Linux — Guia do Administrador",author:"Michael J. Lucas",category:"Sistemas",cover:"LINUX",style:"cover-linux",description:"Administração e ferramentas Linux."}
];

const grid = document.querySelector("#book-grid");
if (grid) {
  const search = document.querySelector("#search");
  const category = document.querySelector("#category");
  function renderBooks() {
    const term = search.value.toLowerCase().trim();
    const cat = category.value;
    const filtered = books.filter(book =>
      (cat === "todos" || book.category === cat) &&
      (book.title.toLowerCase().includes(term) || book.author.toLowerCase().includes(term) || book.category.toLowerCase().includes(term))
    );
    document.querySelector("#book-count").textContent = `${filtered.length} livro(s)`;
    grid.innerHTML = filtered.length ? filtered.map(book => `
      <article class="book-card">
        <div class="cover ${book.style}">${book.cover}</div>
        <div class="book-meta"><h3>${book.title}</h3><p>${book.author}</p><span class="tag">${book.category}</span><button class="small-button" data-book="${book.title}">Ver detalhes</button></div>
      </article>`).join("") : "<p>Nenhum livro encontrado.</p>";
  }
  search.addEventListener("input", renderBooks);
  category.addEventListener("change", renderBooks);
  grid.addEventListener("click", e => {
    const btn = e.target.closest("[data-book]");
    if (btn) alert(`Livro selecionado: ${btn.dataset.book}\nA solicitação de empréstimo será conectada ao sistema depois do backend.`);
  });
  renderBooks();
}

const tabs = document.querySelectorAll(".tab");
tabs.forEach(tab => tab.addEventListener("click", () => {
  tabs.forEach(t => t.classList.toggle("active", t === tab));
  document.querySelector("#login-form").classList.toggle("hidden", tab.dataset.tab !== "login");
  document.querySelector("#register-form").classList.toggle("hidden", tab.dataset.tab !== "register");
}));
const loginForm = document.querySelector("#login-form");
if (loginForm) loginForm.addEventListener("submit", e => {
  e.preventDefault();
  alert("Tela demonstrativa: o login será validado quando conectarmos o backend.");
});
const registerForm = document.querySelector("#register-form");
if (registerForm) registerForm.addEventListener("submit", e => {
  e.preventDefault();
  alert("Cadastro demonstrativo: os dados ainda não são salvos. Vamos conectar ao banco depois.");
});
const admin = document.querySelector("#admin-access");
if (admin) admin.addEventListener("click", () => alert("A área administrativa será criada/conectada depois, com autenticação própria."));
const forgot = document.querySelector("#forgot");
if (forgot) forgot.addEventListener("click", e => { e.preventDefault(); alert("A recuperação de senha será implementada com o backend."); });

const profileTabs = document.querySelectorAll(".profile-tab");
profileTabs.forEach(tab => tab.addEventListener("click", () => {
  profileTabs.forEach(t => t.classList.toggle("active", t === tab));
  document.querySelector("#borrowed-panel").classList.toggle("hidden", tab.dataset.panel !== "borrowed");
  document.querySelector("#history-panel").classList.toggle("hidden", tab.dataset.panel !== "history");
}));
const edit = document.querySelector("#edit-profile");
if (edit) edit.addEventListener("click", () => {
  const nameEl = document.querySelector("#profile-name");
  const descEl = document.querySelector("#profile-description");
  const newName = prompt("Nome de usuário:", nameEl.textContent);
  if (newName && newName.trim()) {
    nameEl.textContent = newName.trim();
    document.querySelector("#avatar").textContent = newName.trim()[0].toUpperCase();
  }
  const newDesc = prompt("Descrição do leitor:", descEl.textContent);
  if (newDesc !== null && newDesc.trim()) descEl.textContent = newDesc.trim();
});
