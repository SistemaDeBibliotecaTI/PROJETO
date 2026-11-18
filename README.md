# Bibliotech

Sistema acadêmico de biblioteca, com interface da versão colorida reservada e camada de persistência local em SQLite.

## Requisitos
- Node.js 20 ou superior (recomendado Node.js 22 LTS)
- VS Code

## Instalação e execução
1. Extraia o ZIP e abra a pasta `BiblioTech` no VS Code.
2. Abra **Terminal > Novo Terminal**.
3. Execute `npm install`.
4. Depois execute `npm start`.
5. Abra `http://localhost:3000` no navegador. **Não abra o HTML diretamente nem use Live Server**, pois o banco e os PDFs dependem do servidor Node.

## Conta administrativa inicial
- Usuário: `adm001`
- Senha: `00011`
- Acesso: `http://localhost:3000/admin-login.html`

Troque a senha administrativa antes de qualquer uso além da demonstração.

## O que esta versão entrega
- Catálogo, busca e filtros por categoria.
- Cadastro e login de estudantes.
- Área administrativa separada.
- Cadastro, edição e exclusão de livros.
- Upload, substituição e remoção de PDFs no servidor (limite de 30 MB).
- Empréstimo de sete dias e controle de devolução.
- Leitor de PDF disponível para o estudante somente durante empréstimo válido.
- Perfil, foto, descrição, favoritos, histórico e pontuação.
- Persistência dos usuários, livros e empréstimos em `data/biblioteca-dev.sqlite`.
- PDFs centralizados em `data/pdfs`, disponíveis a partir do mesmo servidor.

## Banco e backup
O SQLite é criado automaticamente na primeira execução. Para fazer backup, pare o servidor e copie a pasta `data`. Não apague `biblioteca-dev.sqlite` se quiser preservar os cadastros.

## Limitações importantes
Esta é uma versão acadêmica para execução local e demonstração em sala. A interface ainda mantém parte das regras de negócio no navegador; não publique na internet nem use com dados reais sem uma etapa adicional de segurança, com autenticação por sessão/token no servidor, hash de senha com bcrypt/Argon2 no backend, validação de todas as operações no servidor, proteção CSRF e política de backup. A senha é protegida por hash no armazenamento local do protótipo, mas isso não substitui autenticação profissional.

## Solução de problemas
- Se `npm install` falhar, confira `node -v` e `npm -v`; use Node.js 22 LTS e tente novamente.
- Se a porta 3000 estiver ocupada, feche o outro processo ou inicie com `set PORT=3001` no Prompt de Comando (Windows), depois abra `http://localhost:3001`.
- O banco é criado somente quando o servidor é iniciado. Não use Live Server.
\n\n## Atualização — versão ampliada\n\nForam adicionadas telas independentes para recuperação de senha, catálogo, detalhes, meus livros, histórico, edição de perfil, configurações e gestão administrativa. O leitor foi atualizado para renderizar páginas do PDF em duas folhas, com navegação, contador, progresso e tela cheia (PDF.js via CDN; requer internet para carregar a biblioteca).\n\nPara executar: instale Node.js 20 ou superior, abra esta pasta no terminal, execute `npm install` e depois `npm start`. Acesse `http://localhost:3000`.\n
