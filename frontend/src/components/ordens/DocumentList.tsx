/**
 * DocumentList — US-015.
 *
 * Lista os documentos anexados a uma ordem:
 *   - Cada linha exibe nome, tipo, tamanho, data e badge "Assinado GovBR"
 *   - Botão de download gera URL assinada e abre em nova aba
 *   - Botão de remoção visível apenas para uploader e admin
 *   - Skeleton loader durante carregamento
 *   - Empty state quando não há documentos
 *
 * US-015 RN: storage_path nunca exposto — download via URL assinada.
 */

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Download,
  FileImage,
  FileText,
  Loader2,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { deleteDocumento, getDownloadUrl, listDocumentos } from '@/services/documentosService'
import type { Documento } from '@/types/documento'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentListProps {
  ordemId: string
  /**
   * ID do usuário logado.
   * Usado para exibir botão de remoção apenas para o uploader original.
   */
  currentUserId?: string
  /**
   * Role do usuário logado.
   * Admin pode remover qualquer documento.
   */
  currentUserRole?: string
  /** Remove botão de remoção — para páginas somente-leitura. */
  readOnly?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso))
}

function getMimeIcon(mime: string) {
  if (mime === 'application/pdf') return <FileText className="h-4 w-4 text-red-500" />
  return <FileImage className="h-4 w-4 text-blue-500" />
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function DocumentList({
  ordemId,
  currentUserId,
  currentUserRole,
  readOnly = false,
}: DocumentListProps) {
  const queryClient = useQueryClient()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  // -------------------------------------------------------------------------
  // Listagem
  // -------------------------------------------------------------------------

  const { data, isLoading, isError } = useQuery({
    queryKey: ['documentos', ordemId],
    queryFn: () => listDocumentos(ordemId),
    staleTime: 30_000,
  })

  // -------------------------------------------------------------------------
  // Download
  // -------------------------------------------------------------------------

  async function handleDownload(doc: Documento) {
    setDownloadingId(doc.id)
    try {
      const { signed_url } = await getDownloadUrl(doc.id)
      // Abre em nova aba — navegador trata download ou visualização
      window.open(signed_url, '_blank', 'noopener,noreferrer')
    } catch {
      toast.error('Falha ao gerar link de download. Tente novamente.')
    } finally {
      setDownloadingId(null)
    }
  }

  // -------------------------------------------------------------------------
  // Remoção
  // -------------------------------------------------------------------------

  const { mutate: remove, isPending: isDeleting } = useMutation({
    mutationFn: (docId: string) => deleteDocumento(docId),
    onSuccess: () => {
      toast.success('Documento removido com sucesso.')
      queryClient.invalidateQueries({ queryKey: ['documentos', ordemId] })
      setConfirmDeleteId(null)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const msg =
        err?.response?.data?.detail ?? 'Falha ao remover o documento. Tente novamente.'
      toast.error(msg)
      setConfirmDeleteId(null)
    },
  })

  function canDelete(doc: Documento): boolean {
    if (readOnly) return false
    if (currentUserRole === 'admin') return true
    return doc.uploaded_by === currentUserId
  }

  // -------------------------------------------------------------------------
  // Render states
  // -------------------------------------------------------------------------

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-md" />
        ))}
      </div>
    )
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Não foi possível carregar os documentos.
      </p>
    )
  }

  const documentos = data?.documentos ?? []

  if (documentos.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Nenhum documento anexado a esta ordem.
      </p>
    )
  }

  // -------------------------------------------------------------------------
  // Lista
  // -------------------------------------------------------------------------

  return (
    <>
      <ul className="divide-y">
        {documentos.map((doc) => (
          <li key={doc.id} className="flex items-center gap-3 py-3">
            {/* Ícone de tipo */}
            <div className="shrink-0">{getMimeIcon(doc.tipo_mime)}</div>

            {/* Informações */}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="truncate text-sm font-medium">{doc.nome_arquivo}</span>
                {doc.assinado_govbr && (
                  <Badge
                    variant="outline"
                    className="shrink-0 border-green-500 text-green-700 dark:text-green-400"
                  >
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Assinado GovBR
                  </Badge>
                )}
                {doc.descricao && (
                  <span className="truncate text-xs text-muted-foreground">
                    — {doc.descricao}
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {formatBytes(doc.tamanho_bytes)} · {formatDate(doc.created_at)}
              </p>
            </div>

            {/* Ações */}
            <div className="flex shrink-0 items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                title="Baixar documento"
                aria-label={`Baixar ${doc.nome_arquivo}`}
                onClick={() => handleDownload(doc)}
                disabled={downloadingId === doc.id}
              >
                {downloadingId === doc.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
              </Button>

              {canDelete(doc) && (
                <Button
                  variant="ghost"
                  size="icon"
                  title="Remover documento"
                  aria-label={`Remover ${doc.nome_arquivo}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setConfirmDeleteId(doc.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>

      {/* Modal de confirmação de remoção */}
      <Dialog
        open={confirmDeleteId !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteId(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar remoção</DialogTitle>
            <DialogDescription>
              Tem certeza que deseja remover este documento? Esta ação não pode ser
              desfeita.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              disabled={isDeleting}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => confirmDeleteId && remove(confirmDeleteId)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Removendo…
                </>
              ) : (
                'Remover'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default DocumentList
