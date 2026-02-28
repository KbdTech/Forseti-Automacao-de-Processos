/**
 * Testes do RoleGuard — US-002.
 *
 * Cobre:
 *   - Perfil autorizado → renderiza os filhos normalmente
 *   - Perfil não autorizado → redireciona para /acesso-negado
 *   - Usuário não autenticado → redireciona para /login
 *
 * US-002 RN-12: back-end valida role em cada requisição;
 * o RoleGuard apenas melhora a UX protegendo rotas no front-end.
 */

import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { vi, beforeEach, describe, it, expect, type Mock } from 'vitest'

import RoleGuard from '@/components/layout/RoleGuard'
import { useAuth } from '@/hooks/useAuth'
import type { RoleEnum } from '@/types/auth.types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuth')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria um UserProfile mínimo com o role especificado. */
function makeUser(role: RoleEnum) {
  return {
    id: 'uuid-teste',
    nome: 'Servidor Teste',
    email: 'teste@prefeitura.gov.br',
    role,
    secretaria_id: null,
    is_active: true,
    must_change_password: false,
    created_at: new Date().toISOString(),
  }
}

/** Estado padrão do useAuth: usuário não autenticado. */
const defaultAuthMock = {
  login: vi.fn(),
  logout: vi.fn(),
  isRole: vi.fn().mockReturnValue(false),
  isLoading: false,
  isAuthenticated: false,
  user: null,
  accessToken: null,
  redirectPath: '/login',
}

/**
 * Renderiza o RoleGuard dentro de um MemoryRouter com rotas stub,
 * permitindo verificar para qual rota o guard redireciona.
 */
function renderGuard(roles: RoleEnum[]) {
  return render(
    <MemoryRouter initialEntries={['/protegida']}>
      <Routes>
        <Route
          path="/protegida"
          element={
            <RoleGuard roles={roles}>
              <div>Conteúdo protegido</div>
            </RoleGuard>
          }
        />
        {/* Destinos dos redirecionamentos */}
        <Route path="/login" element={<div>Página de login</div>} />
        <Route path="/acesso-negado" element={<div>Acesso negado</div>} />
      </Routes>
    </MemoryRouter>
  )
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  ;(useAuth as Mock).mockReturnValue({ ...defaultAuthMock })
})

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe('RoleGuard — US-002 RN-12', () => {
  it('renderiza os filhos quando o usuário possui o perfil necessário', () => {
    ;(useAuth as Mock).mockReturnValue({
      ...defaultAuthMock,
      isAuthenticated: true,
      user: makeUser('admin'),
    })

    renderGuard(['admin'])

    expect(screen.getByText('Conteúdo protegido')).toBeInTheDocument()
    expect(screen.queryByText('Acesso negado')).not.toBeInTheDocument()
    expect(screen.queryByText('Página de login')).not.toBeInTheDocument()
  })

  it('redireciona para /acesso-negado quando o perfil não é autorizado', () => {
    ;(useAuth as Mock).mockReturnValue({
      ...defaultAuthMock,
      isAuthenticated: true,
      user: makeUser('secretaria'),   // secretaria tentando acessar rota de admin
    })

    renderGuard(['admin'])           // rota requer admin

    expect(screen.getByText('Acesso negado')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument()
  })

  it('redireciona para /login quando o usuário não está autenticado', () => {
    // defaultAuthMock já tem isAuthenticated: false
    renderGuard(['admin'])

    expect(screen.getByText('Página de login')).toBeInTheDocument()
    expect(screen.queryByText('Conteúdo protegido')).not.toBeInTheDocument()
  })
})
