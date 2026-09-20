# 📦 Inventário Factual do Repositório CMIP

| # | Arquivo | Linhas | Bytes | Papel Arquitetural | Status |
|:---:|---|:---:|:---:|---|:---:|
| 1 | [`src/App.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/App.jsx) | 170 | 5.0 KB | Roteador e Guarda de Rotas (State-based Router) | 🟡 Em auditoria de Login Obrigatório |
| 2 | [`src/components/LoginModal.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/LoginModal.jsx) | 166 | 7.2 KB | Tela de Autenticação e Perfis Rápidos | 🟢 Funcional |
| 3 | [`src/components/ReceptionPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/ReceptionPanel.jsx) | 391 | 17.5 KB | Painel de Cadastro e Encaminhamento de Pacientes | 🟢 Funcional |
| 4 | [`src/components/DoctorPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/DoctorPanel.jsx) | 363 | 16.7 KB | Painel do Médico (Fila de espera & Chamada nominal) | 🟢 Funcional |
| 5 | [`src/components/AdminPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AdminPanel.jsx) | 1191 | 54.8 KB | Painel Administrativo Geral (CRUD Médicos, Salas, Usuários e Filas) | 🟢 Homologado (9/9 testes) |
| 6 | [`src/components/AttendantPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/AttendantPanel.jsx) | 532 | 23.8 KB | Painel de Chamada de Senhas Tradicional / Guichês | 🟡 Em auditoria de sincronização de guichês |
| 7 | [`src/components/TotemTablet.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/TotemTablet.jsx) | 683 | 29.9 KB | Totem Touch de Autoatendimento + Driver Knup KA-1445 | 🟢 Funcional |
| 8 | [`src/components/TvPanel.jsx`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/components/TvPanel.jsx) | 486 | 22.3 KB | Painel das 3 TVs (Áudio TTS PT-BR + Chime + Visual Glow) | 🟢 Homologado (3 TVs isoladas) |
| 9 | [`api/medical.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/api/medical.js) | 670 | 25.0 KB | Handler Serverless & Express de Rotas Médicas | 🟢 Funcional |
| 10 | [`api/ticket.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/api/ticket.js) | 525 | 16.9 KB | Handler Serverless & Express de Senhas e Totem | 🟡 Em auditoria de guichês |
| 11 | [`server.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/server.js) | 316 | 9.8 KB | Servidor Express Local + Socket.IO + Proxy | 🟢 Funcional |
| 12 | [`src/utils/audio.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/utils/audio.js) | 319 | 9.5 KB | Motor Web Audio + Síntese de Voz TTS PT-BR | 🟢 Funcional |
| 13 | [`src/utils/bluetoothPrinter.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/utils/bluetoothPrinter.js) | 358 | 14.7 KB | Driver Web Bluetooth ESC/POS da Knup KA-1445 | 🟢 Funcional |
| 14 | [`src/utils/socket.js`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/src/utils/socket.js) | 415 | 11.6 KB | Biblioteca de Comunicação Híbrida (Socket.IO + REST) | 🟢 Funcional |
| 15 | [`supabase_setup.sql`](file:///c:/Users/Hermani/Desktop/projetos/senha%20-%20Copia/supabase_setup.sql) | 260 | 9.0 KB | Script DDL Supabase PostgreSQL com RLS e Seeds | 🟢 Configurado |
