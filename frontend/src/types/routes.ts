/**
 * Constantes de roteamento — US-002.
 *
 * Centraliza:
 *   - DEFAULT_ROUTE: rota padrão após login por perfil
 *   - SIDEBAR_ITEMS: itens de menu filtrados por role
 *
 * Sincronizado com a Matriz de Permissões do CLAUDE.md seção 7.
 */

import type { RoleEnum } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Rota padrão por perfil
// ---------------------------------------------------------------------------

/** Rota para onde cada perfil é redirecionado após login bem-sucedido. */
export const DEFAULT_ROUTE: Record<RoleEnum, string> = {
  secretaria: '/secretaria/ordens',
  gabinete: '/gabinete',
  controladoria: '/controladoria',
  contabilidade: '/contabilidade/empenho',
  tesouraria: '/tesouraria/pagamento',
  compras: '/admin/fornecedores',  // S13.2: setor de compras acessa apenas fornecedores
  admin: '/admin/usuarios',
}

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

/** Chaves dos ícones Lucide usados na sidebar (evita import dinâmico não tipado). */
export type SidebarIconKey =
  | 'FileText'
  | 'FilePlus'
  | 'RotateCcw'
  | 'CheckSquare'
  | 'Building2'
  | 'ShieldCheck'
  | 'Receipt'
  | 'Banknote'
  | 'CreditCard'
  | 'Archive'
  | 'LayoutDashboard'
  | 'ScrollText'
  | 'Users'
  | 'Landmark'
  // US-019: item de assinatura de liquidação da secretaria
  | 'PenLine'
  // S11.2: gestão de fornecedores
  | 'Store'
  // S12.3: relatório de gastos por fornecedor
  | 'BarChart2'

/** Definição de um item de menu na sidebar. */
export interface SidebarItem {
  key: string
  label: string
  path: string
  iconKey: SidebarIconKey
  /** Perfis que visualizam e podem acessar este item. */
  roles: RoleEnum[]
}

/**
 * Todos os itens de menu do sistema.
 *
 * Cada componente Sidebar filtra esta lista com base no role do usuário
 * autenticado (US-002 RN-12: botões/itens ocultos, não apenas desabilitados).
 */
export const SIDEBAR_ITEMS: SidebarItem[] = [
  // --- Secretaria ---
  {
    key: 'minhas-ordens',
    label: 'Minhas Ordens',
    path: '/secretaria/ordens',
    iconKey: 'FileText',
    roles: ['secretaria', 'admin'],
  },
  {
    key: 'nova-ordem',
    label: 'Nova Ordem',
    path: '/secretaria/nova-ordem',
    iconKey: 'FilePlus',
    roles: ['secretaria'],
  },
  {
    key: 'devolvidas',
    label: 'Devolvidas para Alteração',
    path: '/secretaria/devolvidas',
    iconKey: 'RotateCcw',
    roles: ['secretaria', 'admin'],
  },
  {
    key: 'atesto',
    label: 'Atesto de NF',
    path: '/secretaria/atesto',
    iconKey: 'CheckSquare',
    roles: ['secretaria', 'admin'],
  },
  // US-019: pipeline de assinatura do documento de liquidação pela secretaria
  {
    key: 'assinaturas-liquidacao',
    label: 'Liquidações para Assinar',
    path: '/secretaria/assinaturas',
    iconKey: 'PenLine',
    roles: ['secretaria', 'admin'],
  },

  // --- Gabinete ---
  {
    key: 'gabinete',
    label: 'Pipeline Gabinete',
    path: '/gabinete',
    iconKey: 'Building2',
    roles: ['gabinete', 'admin'],
  },

  // --- Controladoria ---
  {
    key: 'controladoria',
    label: 'Pipeline Controladoria',
    path: '/controladoria',
    iconKey: 'ShieldCheck',
    roles: ['controladoria', 'admin'],
  },

  // --- Contabilidade ---
  {
    key: 'empenho',
    label: 'Pipeline Empenho',
    path: '/contabilidade/empenho',
    iconKey: 'Receipt',
    roles: ['contabilidade', 'admin'],
  },
  {
    key: 'liquidacao',
    label: 'Pipeline Liquidação',
    path: '/contabilidade/liquidacao',
    iconKey: 'Banknote',
    roles: ['contabilidade', 'admin'],
  },

  // --- Tesouraria ---
  {
    key: 'pagamento',
    label: 'Pipeline Pagamento',
    path: '/tesouraria/pagamento',
    iconKey: 'CreditCard',
    roles: ['tesouraria', 'admin'],
  },
  {
    key: 'ordens-pagas',
    label: 'Ordens Pagas',
    path: '/tesouraria/pagas',
    iconKey: 'Archive',
    roles: ['tesouraria', 'contabilidade', 'admin'],
  },

  // --- Dashboard / Gestão ---
  {
    key: 'dashboard',
    label: 'Dashboard Executivo',
    path: '/dashboard',
    iconKey: 'LayoutDashboard',
    roles: ['gabinete', 'admin'],
  },
  {
    key: 'audit',
    label: 'Log de Auditoria',
    path: '/audit',
    iconKey: 'ScrollText',
    roles: ['admin'],
  },
  {
    key: 'usuarios',
    label: 'Gestão de Usuários',
    path: '/admin/usuarios',
    iconKey: 'Users',
    roles: ['admin'],
  },
  {
    key: 'secretarias',
    label: 'Gestão de Secretarias',
    path: '/admin/secretarias',
    iconKey: 'Landmark',
    roles: ['admin'],
  },
  // S11.2: gestão de fornecedores vencedores de licitação (admin)
  // S13.2: perfil 'compras' também acessa esta tela com CRUD completo
  {
    key: 'fornecedores-admin',
    label: 'Gestão de Fornecedores',
    path: '/admin/fornecedores',
    iconKey: 'Store',
    roles: ['admin', 'compras'],
  },
  // S12.2: visibilidade de fornecedores para perfis operacionais (read-only)
  {
    key: 'fornecedores-readonly',
    label: 'Fornecedores',
    path: '/fornecedores',
    iconKey: 'Store',
    roles: ['secretaria', 'gabinete', 'controladoria', 'contabilidade', 'tesouraria'],
  },
  // S12.3: relatório de gastos por fornecedor (perfis financeiros + secretaria)
  {
    key: 'gastos-fornecedor',
    label: 'Gastos por Fornecedor',
    path: '/relatorio/gastos-fornecedor',
    iconKey: 'BarChart2',
    roles: ['controladoria', 'contabilidade', 'tesouraria', 'secretaria'],
  },
]

/** Rótulos legíveis dos perfis para exibição na UI. */
export const ROLE_LABEL: Record<RoleEnum, string> = {
  secretaria: 'Secretaria',
  gabinete: 'Gabinete do Prefeito',
  controladoria: 'Controladoria',
  contabilidade: 'Contabilidade',
  tesouraria: 'Tesouraria',
  compras: 'Setor de Compras',  // S13.2
  admin: 'Administrador',
}
