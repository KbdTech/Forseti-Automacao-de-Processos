# Epic 1 — Autenticação e Controle de Acesso

## Stories
- US-001: Login com Credenciais Institucionais (S1 — Alta)
- US-002: Controle de Acesso por Perfil/RBAC (S1 — Alta)

## Critérios de Aceitação Globais
- JWT com expiração 8h + refresh token 24h
- Bloqueio após 5 tentativas por 15 min
- RoleGuard em todas as rotas protegidas
- must_change_password no primeiro acesso
