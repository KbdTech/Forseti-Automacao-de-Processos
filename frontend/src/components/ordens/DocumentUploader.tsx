/**
 * DocumentUploader — US-015.
 *
 * Componente de upload de documentos com:
 *   - Drag & drop + clique para selecionar
 *   - Validação de tipo (PDF, JPEG, PNG) e tamanho (máx 10 MB)
 *   - Campo de descrição e flag "assinado via GovBR"
 *   - Barra de progresso durante upload
 *   - Feedback toast em sucesso/erro
 *
 * US-015 RN: bloqueado quando a ordem está em status imutável
 * (controlado pela prop `disabled`).
 */

import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CloudUpload, FileText, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { uploadDocumento } from '@/services/documentosService'

// ---------------------------------------------------------------------------
// Constantes de validação (US-015)
// ---------------------------------------------------------------------------

const ALLOWED_MIMES = ['application/pdf', 'image/jpeg', 'image/png'] as const
const ALLOWED_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png']
const MAX_SIZE_BYTES = 10 * 1024 * 1024 // 10 MB
const MAX_SIZE_LABEL = '10 MB'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DocumentUploaderProps {
  ordemId: string
  /** Desabilita o uploader quando a ordem está em status imutável. */
  disabled?: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function getMimeError(file: File): string | null {
  if (!ALLOWED_MIMES.includes(file.type as (typeof ALLOWED_MIMES)[number])) {
    return `Tipo "${file.type || 'desconhecido'}" não permitido. Use PDF, JPEG ou PNG.`
  }
  if (file.size > MAX_SIZE_BYTES) {
    return `Arquivo muito grande (${formatBytes(file.size)}). Máximo: ${MAX_SIZE_LABEL}.`
  }
  if (file.size === 0) {
    return 'Arquivo vazio não é permitido.'
  }
  return null
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function DocumentUploader({ ordemId, disabled = false }: DocumentUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [descricao, setDescricao] = useState('')
  const [assinadoGovbr, setAssinadoGovbr] = useState(false)
  const [dragOver, setDragOver] = useState(false)

  const { mutate: upload, isPending } = useMutation({
    mutationFn: () =>
      uploadDocumento(ordemId, {
        file: selectedFile!,
        descricao: descricao.trim() || undefined,
        assinado_govbr: assinadoGovbr,
      }),
    onSuccess: (doc) => {
      toast.success(`Documento "${doc.nome_arquivo}" enviado com sucesso.`)
      queryClient.invalidateQueries({ queryKey: ['documentos', ordemId] })
      // Resetar campos
      setSelectedFile(null)
      setDescricao('')
      setAssinadoGovbr(false)
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      const msg =
        err?.response?.data?.detail ?? 'Falha ao enviar o documento. Tente novamente.'
      toast.error(msg)
    },
  })

  // -------------------------------------------------------------------------
  // Handlers de seleção de arquivo
  // -------------------------------------------------------------------------

  function handleFileSelect(file: File | null) {
    if (!file) return
    const error = getMimeError(file)
    if (error) {
      toast.error(error)
      return
    }
    setSelectedFile(file)
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    handleFileSelect(e.target.files?.[0] ?? null)
    // Reseta o input para permitir re-seleção do mesmo arquivo
    e.target.value = ''
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    if (disabled) return
    handleFileSelect(e.dataTransfer.files[0] ?? null)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    if (!disabled) setDragOver(true)
  }

  function handleDragLeave() {
    setDragOver(false)
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Zona de drop */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-label="Clique ou arraste um arquivo para fazer upload"
        onClick={() => !disabled && fileInputRef.current?.click()}
        onKeyDown={(e) => {
          if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
            fileInputRef.current?.click()
          }
        }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={[
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors',
          disabled
            ? 'cursor-not-allowed border-muted bg-muted/30 opacity-60'
            : dragOver
              ? 'cursor-pointer border-primary bg-primary/5'
              : 'cursor-pointer border-muted-foreground/30 hover:border-primary hover:bg-primary/5',
        ].join(' ')}
      >
        <CloudUpload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm font-medium">
          {disabled
            ? 'Upload desabilitado para ordens neste status'
            : 'Arraste o arquivo aqui ou clique para selecionar'}
        </p>
        <p className="text-xs text-muted-foreground">
          PDF, JPEG ou PNG — máx {MAX_SIZE_LABEL}
        </p>
      </div>

      {/* Input oculto */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_EXTENSIONS.join(',')}
        className="hidden"
        disabled={disabled}
        onChange={handleInputChange}
      />

      {/* Arquivo selecionado */}
      {selectedFile && (
        <div className="flex items-center justify-between rounded-md border bg-muted/40 px-3 py-2 text-sm">
          <div className="flex items-center gap-2 overflow-hidden">
            <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate font-medium">{selectedFile.name}</span>
            <span className="shrink-0 text-muted-foreground">
              ({formatBytes(selectedFile.size)})
            </span>
          </div>
          <button
            type="button"
            aria-label="Remover arquivo selecionado"
            onClick={() => setSelectedFile(null)}
            className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Campos extras (visíveis somente com arquivo selecionado) */}
      {selectedFile && (
        <div className="space-y-3">
          {/* Descrição */}
          <div className="space-y-1">
            <Label htmlFor="doc-descricao">Descrição (opcional)</Label>
            <Input
              id="doc-descricao"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: Contrato assinado, Nota fiscal nº 1234…"
              maxLength={255}
              disabled={isPending}
            />
          </div>

          {/* Assinado via GovBR */}
          <div className="flex items-center gap-3">
            <Switch
              id="doc-govbr"
              checked={assinadoGovbr}
              onCheckedChange={setAssinadoGovbr}
              disabled={isPending}
            />
            <Label htmlFor="doc-govbr" className="cursor-pointer">
              Documento assinado digitalmente via gov.br/assinatura
            </Label>
          </div>

          {/* Barra de progresso simulada + botão */}
          {isPending && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full animate-pulse rounded-full bg-primary" />
            </div>
          )}

          <Button
            type="button"
            onClick={() => upload()}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? 'Enviando…' : 'Enviar documento'}
          </Button>
        </div>
      )}
    </div>
  )
}

export default DocumentUploader
