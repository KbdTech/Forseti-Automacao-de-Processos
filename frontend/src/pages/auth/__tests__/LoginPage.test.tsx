/**
 * Testes da LoginPage — US-001.
 *
 * Cobre:
 *   - Renderização dos elementos do formulário
 *   - Toggle de visibilidade da senha
 *   - Validação Zod: campos vazios e e-mail inválido
 *   - Exibição de erro para credenciais inválidas (HTTP 401)
 *   - Exibição de alerta de conta bloqueada (HTTP 423)
 *   - Redirect por perfil após login bem-sucedido (Cenário 1)
 *   - Redirect para /primeiro-acesso quando first_login=true (Cenário 5)
 *
 * US-001 Cenários 1, 2, 3, 5.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { vi, beforeEach, describe, it, expect, type Mock } from 'vitest'

import LoginPage from '../LoginPage'
import { useAuth } from '@/hooks/useAuth'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// vi.hoisted garante que mockNavigate é criado antes do hoist de vi.mock.
const mockNavigate = vi.hoisted(() => vi.fn())

vi.mock('react-router-dom', async (importOriginal) => {
  const mod = await importOriginal<typeof import('react-router-dom')>()
  return { ...mod, useNavigate: () => mockNavigate }
})

// Auto-mock do hook — cada teste configura o retorno via vi.mocked.
vi.mock('@/hooks/useAuth')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Cria um objeto que imita um AxiosError com status e detail específicos. */
function makeAxiosError(status: number, detail: string): Error {
  return Object.assign(new Error(detail), {
    response: { status, data: { detail } },
  })
}

/** Valor padrão retornado por useAuth quando o usuário não está autenticado. */
const defaultAuthMock = {
  login: vi.fn(),
  logout: vi.fn(),
  isRole: vi.fn().mockReturnValue(false),
  isAuthenticated: false,
  user: null,
  accessToken: null,
  redirectPath: '/login',
}

/** Renderiza LoginPage dentro de MemoryRouter (necessário para hooks de roteamento). */
function renderLoginPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
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

describe('LoginPage — US-001', () => {
  // -------------------------------------------------------------------------
  // Renderização
  // -------------------------------------------------------------------------

  describe('Renderização do formulário', () => {
    it('exibe título do sistema, campos e botão de submit', () => {
      renderLoginPage()

      expect(
        screen.getByText('Sistema OS Prefeitura')
      ).toBeInTheDocument()
      expect(
        screen.getByLabelText(/e-mail institucional/i)
      ).toBeInTheDocument()
      expect(screen.getByLabelText(/^senha$/i)).toBeInTheDocument()
      expect(
        screen.getByRole('button', { name: /entrar/i })
      ).toBeInTheDocument()
    })

    it('campo senha inicia como type="password" e toggle revela o texto', () => {
      renderLoginPage()

      const passwordInput = screen.getByLabelText(/^senha$/i)
      expect(passwordInput).toHaveAttribute('type', 'password')

      const toggleBtn = screen.getByRole('button', { name: /exibir senha/i })
      fireEvent.click(toggleBtn)
      expect(passwordInput).toHaveAttribute('type', 'text')
    })
  })

  // -------------------------------------------------------------------------
  // Validação de campos — US-001 Cenário 2
  // -------------------------------------------------------------------------

  describe('Validação Zod — US-001 Cenário 2', () => {
    it('exibe "E-mail obrigatório." ao submeter sem e-mail', async () => {
      renderLoginPage()

      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(
          screen.getByText('E-mail obrigatório.')
        ).toBeInTheDocument()
      })
    })

    it('exibe "Senha obrigatória." ao submeter sem senha', async () => {
      renderLoginPage()

      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(
          screen.getByText('Senha obrigatória.')
        ).toBeInTheDocument()
      })
    })

    it('exibe "Informe um e-mail válido." para formato inválido', async () => {
      renderLoginPage()

      fireEvent.change(screen.getByLabelText(/e-mail institucional/i), {
        target: { value: 'nao-e-um-email' },
      })
      fireEvent.change(screen.getByLabelText(/^senha$/i), {
        target: { value: 'qualquer123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(
          screen.getByText('Informe um e-mail válido.')
        ).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Tratamento de erros da API — US-001 Cenários 2 e 3
  // -------------------------------------------------------------------------

  describe('Erros retornados pela API', () => {
    it('exibe alerta "Falha no acesso" para credenciais inválidas (401)', async () => {
      const mockLogin = vi.fn().mockRejectedValue(
        makeAxiosError(
          401,
          'Credenciais inválidas. Verifique seu e-mail e senha.'
        )
      )
      ;(useAuth as Mock).mockReturnValue({
        ...defaultAuthMock,
        login: mockLogin,
      })

      renderLoginPage()

      fireEvent.change(screen.getByLabelText(/e-mail institucional/i), {
        target: { value: 'servidor@prefeitura.gov.br' },
      })
      fireEvent.change(screen.getByLabelText(/^senha$/i), {
        target: { value: 'Senha123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(screen.getByText('Falha no acesso')).toBeInTheDocument()
        expect(
          screen.getByText(
            'Credenciais inválidas. Verifique seu e-mail e senha.'
          )
        ).toBeInTheDocument()
      })
    })

    it('exibe alerta "Conta bloqueada" para resposta HTTP 423 — US-001 Cenário 3', async () => {
      const mockLogin = vi.fn().mockRejectedValue(
        makeAxiosError(
          423,
          'Conta bloqueada temporariamente. Tente novamente em 15 minutos.'
        )
      )
      ;(useAuth as Mock).mockReturnValue({
        ...defaultAuthMock,
        login: mockLogin,
      })

      renderLoginPage()

      fireEvent.change(screen.getByLabelText(/e-mail institucional/i), {
        target: { value: 'servidor@prefeitura.gov.br' },
      })
      fireEvent.change(screen.getByLabelText(/^senha$/i), {
        target: { value: 'Senha123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(screen.getByText('Conta bloqueada')).toBeInTheDocument()
      })
    })
  })

  // -------------------------------------------------------------------------
  // Redirect após login — US-001 Cenários 1 e 5
  // -------------------------------------------------------------------------

  describe('Redirect após login bem-sucedido', () => {
    it('navega para rota do perfil após login (Cenário 1) — admin → /admin', async () => {
      const mockLogin = vi.fn().mockResolvedValue({
        token: 'access.tok',
        refresh_token: 'refresh.tok',
        token_type: 'bearer',
        user: {
          id: 'uuid-admin',
          nome: 'Admin Municipal',
          email: 'admin@prefeitura.gov.br',
          role: 'admin',
          secretaria_id: null,
          must_change_password: false,
        },
      })
      ;(useAuth as Mock).mockReturnValue({
        ...defaultAuthMock,
        login: mockLogin,
      })

      renderLoginPage()

      fireEvent.change(screen.getByLabelText(/e-mail institucional/i), {
        target: { value: 'admin@prefeitura.gov.br' },
      })
      fireEvent.change(screen.getByLabelText(/^senha$/i), {
        target: { value: 'Admin123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/admin', { replace: true })
      })
    })

    it('navega para /primeiro-acesso quando first_login=true — US-001 Cenário 5', async () => {
      const mockLogin = vi.fn().mockResolvedValue({
        token: 'access.tok',
        refresh_token: 'refresh.tok',
        token_type: 'bearer',
        user: {
          id: 'uuid-novo',
          nome: 'Novo Servidor',
          email: 'novo@prefeitura.gov.br',
          role: 'secretaria',
          secretaria_id: 'sec-uuid',
          must_change_password: true,
        },
      })
      ;(useAuth as Mock).mockReturnValue({
        ...defaultAuthMock,
        login: mockLogin,
      })

      renderLoginPage()

      fireEvent.change(screen.getByLabelText(/e-mail institucional/i), {
        target: { value: 'novo@prefeitura.gov.br' },
      })
      fireEvent.change(screen.getByLabelText(/^senha$/i), {
        target: { value: 'Senha123' },
      })
      fireEvent.click(screen.getByRole('button', { name: /entrar/i }))

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/primeiro-acesso', {
          replace: true,
        })
      })
    })
  })
})
