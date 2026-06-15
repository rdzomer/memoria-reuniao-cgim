import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  FileText,
  Send,
  Download,
  Trash2,
  CheckCircle2,
  Loader2,
  Eye,
  Copy,
  Info,
  Upload,
  File,
  X,
  Paperclip,
  FileDown,
  History,
  Clock,
} from 'lucide-react';
import { generateMeetingMinutes, FilePart } from './services/geminiService';
import {
  initAuth,
  saveMemory,
  listMemories,
  deleteMemory,
  type User,
  type SavedMemory,
} from './services/firebaseService';
// @ts-ignore
import html2pdf from 'html2pdf.js';

interface AttachedFile {
  id: string;
  name: string;
  type: string;
  base64: string;
}

type AppTab = 'editor' | 'history';

function formatDate(date: Date): string {
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [generatedHtml, setGeneratedHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copySuccess, setCopySuccess] = useState(false);
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview');

  // Firebase / history state
  const [activeTab, setActiveTab] = useState<AppTab>('editor');
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [memories, setMemories] = useState<SavedMemory[]>([]);
  const [memoriesLoading, setMemoriesLoading] = useState(false);
  const [savedNotification, setSavedNotification] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const lastHtmlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const multiFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const cleanup = initAuth(setCurrentUser);
    return cleanup;
  }, []);

  const syncFromIframe = () => {
    if (iframeRef.current && viewMode === 'edit') {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        const newHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
        lastHtmlRef.current = newHtml;
        setGeneratedHtml(newHtml);
      }
    }
  };

  useEffect(() => {
    if (generatedHtml && iframeRef.current) {
      const doc = iframeRef.current.contentDocument;
      if (doc) {
        if (generatedHtml !== lastHtmlRef.current) {
          doc.open();
          doc.write(generatedHtml);
          doc.close();
          lastHtmlRef.current = generatedHtml;
        }

        const container = doc.querySelector('.container');
        if (container) {
          if (viewMode === 'edit') {
            (container as HTMLElement).contentEditable = 'true';
            (container as HTMLElement).style.outline = '2px dashed #6366f1';
            (container as HTMLElement).style.outlineOffset = '8px';
            (container as HTMLElement).style.borderRadius = '4px';

            const handleInput = () => {
              const currentHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
              lastHtmlRef.current = currentHtml;
            };

            container.addEventListener('input', handleInput);
            return () => container.removeEventListener('input', handleInput);
          } else {
            (container as HTMLElement).contentEditable = 'false';
            (container as HTMLElement).style.outline = 'none';
          }
        }
      }
    }
  }, [generatedHtml, viewMode]);

  const toggleViewMode = (mode: 'preview' | 'edit') => {
    if (viewMode === 'edit' && mode === 'preview') {
      if (lastHtmlRef.current) {
        setGeneratedHtml(lastHtmlRef.current);
      }
    }
    setViewMode(mode);
  };

  const handleGenerate = async () => {
    if (!input.trim() && attachedFiles.length === 0) return;

    setIsLoading(true);
    setError(null);
    try {
      const fileParts: FilePart[] = attachedFiles.map((f) => ({
        mimeType: f.type,
        data: f.base64.split(',')[1],
      }));

      const result = await generateMeetingMinutes(input, fileParts);
      setGeneratedHtml(result);
      setViewMode('preview');

      // Auto-save to Firestore
      if (currentUser) {
        try {
          await saveMemory(currentUser.uid, result, input);
          setSavedNotification(true);
          setTimeout(() => setSavedNotification(false), 3000);
        } catch (e) {
          console.warn('[Save] Failed to save memory:', e);
        }
      }
    } catch (err: any) {
      console.error(err);
      const errorMessage = err?.message || 'Erro deconhecido';
      setError(
        `Erro ao gerar a memória: ${errorMessage}. Verifique se sua chave da API está configurada nos segredos.`
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const supportedMimeTypes = [
      'application/pdf',
      'text/plain',
      'text/csv',
      'text/markdown',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/webp',
    ];

    const fileList = Array.from(files) as File[];

    for (const file of fileList) {
      if (!supportedMimeTypes.includes(file.type) && !file.type.startsWith('image/')) {
        setError(
          `O arquivo "${file.name}" tem um formato não suportado (${file.type}). Por favor, use PDF, Imagens, CSV, Markdown ou Texto Simples.`
        );
        continue;
      }

      if (
        file.type === 'text/plain' ||
        file.type === 'text/csv' ||
        file.type === 'text/markdown'
      ) {
        const text = await file.text();
        setInput(
          (prev) => prev + (prev ? '\n\n' : '') + `--- Arquivo: ${file.name} ---\n${text}`
        );
        continue;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        setAttachedFiles((prev) => [
          ...prev,
          {
            id: Math.random().toString(36).substr(2, 9),
            name: file.name,
            type: file.type,
            base64: base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setAttachedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleRemoveImage = () => {
    if (!generatedHtml) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(generatedHtml, 'text/html');
    const placeholders = doc.querySelectorAll('.image-placeholder, .image-container');
    placeholders.forEach((p) => p.remove());
    setGeneratedHtml('<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !generatedHtml) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;

      const parser = new DOMParser();
      const doc = parser.parseFromString(generatedHtml, 'text/html');

      const imgTag = doc.createElement('div');
      imgTag.className = 'image-container';
      imgTag.innerHTML = `<img src="${base64}" alt="Infográfico" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">`;

      const placeholder = doc.querySelector('.image-placeholder');
      if (placeholder) {
        placeholder.replaceWith(imgTag);
      } else {
        const attachments = doc.querySelector('.attachments-section');
        const container = doc.querySelector('.container');
        if (attachments) {
          attachments.before(imgTag);
        } else if (container) {
          container.appendChild(imgTag);
        }
      }

      setGeneratedHtml('<!DOCTYPE html>\n' + doc.documentElement.outerHTML);
    };
    reader.readAsDataURL(file);
  };

  const handleDownload = () => {
    if (!generatedHtml) return;
    const content = lastHtmlRef.current || generatedHtml;
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `memoria_reuniao_${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPdf = async () => {
    if (!iframeRef.current) return;

    const doc = iframeRef.current.contentDocument;
    if (!doc) return;

    const originalContainer = doc.querySelector('.container') as HTMLElement;
    if (!originalContainer) return;

    const originalOutline = originalContainer.style.outline;
    const originalEditable = originalContainer.contentEditable;

    originalContainer.style.outline = 'none';
    originalContainer.contentEditable = 'false';

    const accordionItems = doc.querySelectorAll('.accordion-item');
    accordionItems.forEach((item) => {
      item.classList.add('active');
      const content = item.querySelector('.accordion-content') as HTMLElement;
      if (content) {
        content.style.maxHeight = 'none';
        content.style.display = 'block';
        content.style.opacity = '1';
        content.style.visibility = 'visible';
      }
    });

    const opt = {
      margin: [10, 0] as [number, number],
      filename: `memoria_reuniao_${new Date().toISOString().split('T')[0]}.pdf`,
      image: { type: 'jpeg' as const, quality: 0.98 },
      html2canvas: {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#f1f5f9',
        windowWidth: 1200,
      },
      jsPDF: { unit: 'mm' as const, format: 'a4' as const, orientation: 'portrait' as const },
      pagebreak: { mode: ['css', 'legacy'] },
    };

    try {
      await html2pdf().set(opt).from(doc.documentElement).save();
    } catch (err) {
      console.error('PDF Error:', err);
      setError('Erro ao gerar o PDF. Tente baixar o HTML ou copiar o conteúdo.');
    } finally {
      if (viewMode === 'edit') {
        originalContainer.style.outline = '2px dashed #6366f1';
        originalContainer.contentEditable = 'true';
      }
    }
  };

  const handleCopyClipboard = () => {
    if (!generatedHtml) return;
    navigator.clipboard.writeText(generatedHtml);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const loadMemories = useCallback(async () => {
    if (!currentUser) return;
    setMemoriesLoading(true);
    try {
      const list = await listMemories(currentUser.uid);
      setMemories(list);
    } catch (e) {
      console.error('[History] Failed to load memories:', e);
    } finally {
      setMemoriesLoading(false);
    }
  }, [currentUser]);

  const handleOpenTab = (tab: AppTab) => {
    setActiveTab(tab);
    if (tab === 'history') {
      loadMemories();
    }
  };

  const handleOpenMemory = (memory: SavedMemory) => {
    setGeneratedHtml(memory.html);
    lastHtmlRef.current = memory.html;
    setViewMode('preview');
    setActiveTab('editor');
  };

  const handleDeleteMemory = async (memory: SavedMemory) => {
    if (!currentUser) return;
    try {
      await deleteMemory(currentUser.uid, memory.id);
      setMemories((prev) => prev.filter((m) => m.id !== memory.id));
    } catch (e) {
      console.error('[History] Failed to delete memory:', e);
    }
  };

  const handleExample = () => {
    setInput(`Data: 28/04/2026
Assunto: Alinhamento Estratégico - Novo Sistema de Gestão
Participantes: João Silva (Diretor), Maria Oliveira (TI), Carlos Souza (Financeiro)

Tópicos:
1. Contexto do Projeto: Estamos iniciando a migração para o novo ERP. O sistema atual está defasado e gerando custos extras de manutenção (aprox. R$ 50 mil/mês). Mencionar gráfico de custos aqui.
2. Riscos: A migração pode levar mais tempo que o previsto (estimativa atual de 6 meses). Há risco de perda de dados se o backup não for validado.
3. Decisões: Maria ficou responsável por validar o cronograma até sexta-feira. Carlos aprovou o orçamento de R$ 1.2 milhão para a primeira fase.
4. Conclusão: O projeto é vital para a escala da empresa no próximo semestre.`);
  };

  const hasImageOrPlaceholder =
    generatedHtml?.includes('image-placeholder') || generatedHtml?.includes('image-container');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <FileText className="text-white w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">Memória Express</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenTab('editor')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'editor'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <FileText className="w-4 h-4" />
              Nova Memória
            </button>
            <button
              onClick={() => handleOpenTab('history')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                activeTab === 'history'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
            >
              <History className="w-4 h-4" />
              Histórico
              {memories.length > 0 && activeTab !== 'history' && (
                <span className="ml-1 bg-indigo-100 text-indigo-700 text-xs px-1.5 py-0.5 rounded-full font-bold">
                  {memories.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <AnimatePresence mode="wait">
          {/* ── HISTORY TAB ── */}
          {activeTab === 'history' && (
            <motion.div
              key="history"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
                  <History className="w-5 h-5 text-indigo-600" />
                  Memórias Salvas
                </h2>
                <button
                  onClick={loadMemories}
                  disabled={memoriesLoading}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  {memoriesLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin inline" />
                  ) : (
                    'Atualizar'
                  )}
                </button>
              </div>

              {!currentUser && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 text-sm text-amber-700">
                  Autenticando… Aguarde um momento para carregar o histórico.
                </div>
              )}

              {memoriesLoading ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm font-medium">Carregando histórico...</p>
                </div>
              ) : memories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 gap-4 text-slate-400">
                  <History className="w-12 h-12 opacity-20" />
                  <p className="text-sm font-medium">Nenhuma memória salva ainda.</p>
                  <button
                    onClick={() => handleOpenTab('editor')}
                    className="text-sm text-indigo-600 font-semibold hover:underline"
                  >
                    Criar primeira memória →
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {memories.map((memory) => (
                    <motion.div
                      key={memory.id}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col gap-3 hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-slate-800 text-sm leading-snug line-clamp-2 flex-1">
                          {memory.title}
                        </h3>
                        <button
                          onClick={() => handleDeleteMemory(memory)}
                          className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors rounded"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-1 text-xs text-slate-400">
                        <Clock className="w-3.5 h-3.5" />
                        {formatDate(memory.createdAt)}
                      </div>

                      {memory.inputPreview && (
                        <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed border-l-2 border-slate-200 pl-3">
                          {memory.inputPreview}
                        </p>
                      )}

                      <button
                        onClick={() => handleOpenMemory(memory)}
                        className="mt-auto flex items-center justify-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold text-sm rounded-lg transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                        Abrir
                      </button>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ── EDITOR TAB ── */}
          {activeTab === 'editor' && (
            <motion.div
              key="editor"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2 }}
              className="grid grid-cols-1 lg:grid-cols-2 gap-8"
            >
              {/* Input Section */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2 text-slate-700">
                    <FileText className="w-5 h-5 text-indigo-600" />
                    Dados da Reunião
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={handleExample}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium px-3 py-1.5 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors shadow-sm"
                    >
                      Exemplo
                    </button>
                    <button
                      onClick={() => {
                        setInput('');
                        setAttachedFiles([]);
                      }}
                      className="p-1.5 text-slate-400 hover:text-red-500 transition-colors bg-white border border-slate-200 rounded-lg shadow-sm"
                      title="Limpar tudo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {/* File Drop/Upload Area */}
                  <div className="flex flex-col gap-2">
                    <input
                      type="file"
                      ref={multiFileInputRef}
                      onChange={handleFileUpload}
                      multiple
                      className="hidden"
                      accept=".pdf,.txt,.csv,.md,image/*"
                    />
                    <button
                      onClick={() => multiFileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-slate-200 rounded-xl bg-white hover:bg-slate-50 hover:border-indigo-300 transition-all group"
                    >
                      <Upload className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                      <div className="text-left">
                        <p className="text-sm font-semibold text-slate-600 group-hover:text-indigo-600 transition-colors">
                          Subir documentos ou imagens
                        </p>
                        <p className="text-xs text-slate-400">PDF, TXT, Imagens (PNG, JPG, WebP)</p>
                      </div>
                    </button>
                  </div>

                  {/* Attached Files List */}
                  <AnimatePresence>
                    {attachedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {attachedFiles.map((file) => (
                          <motion.div
                            key={file.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.9 }}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs shadow-sm"
                          >
                            <File className="w-3.5 h-3.5 text-indigo-500" />
                            <span className="max-w-[150px] truncate font-medium text-slate-600">
                              {file.name}
                            </span>
                            <button
                              onClick={() => removeFile(file.id)}
                              className="hover:text-red-500 transition-colors ml-1"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </AnimatePresence>

                  {/* Text Input */}
                  <div className="relative group">
                    <textarea
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ou cole aqui a transcrição e anotações adicionais..."
                      className="w-full h-[400px] p-4 rounded-xl border border-slate-200 bg-white shadow-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none text-slate-700 placeholder:text-slate-400 leading-relaxed"
                    />
                    <div className="absolute bottom-4 right-4 flex gap-2">
                      <button
                        disabled={isLoading || (!input.trim() && attachedFiles.length === 0)}
                        onClick={handleGenerate}
                        className={`
                          flex items-center gap-2 px-8 py-3 rounded-full font-bold shadow-xl transition-all
                          ${
                            isLoading || (!input.trim() && attachedFiles.length === 0)
                              ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                              : 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-700 hover:to-violet-700 hover:scale-105 active:scale-95'
                          }
                        `}
                      >
                        {isLoading ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Processando...
                          </>
                        ) : (
                          <>
                            <Send className="w-5 h-5" />
                            Gerar Memória
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl flex gap-3">
                  <Info className="w-5 h-5 text-indigo-500 shrink-0" />
                  <p className="text-xs text-indigo-700 leading-relaxed font-medium">
                    O assistente processará todos os documentos anexados e o texto fornecido para
                    criar um relatório executivo padronizado. A memória é salva automaticamente após
                    a geração.
                  </p>
                </div>
              </div>

              {/* Preview Section */}
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex bg-slate-100 p-1 rounded-lg">
                      <button
                        onClick={() => toggleViewMode('preview')}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          viewMode === 'preview'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Visualização
                      </button>
                      <button
                        onClick={() => toggleViewMode('edit')}
                        className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-all ${
                          viewMode === 'edit'
                            ? 'bg-white text-indigo-600 shadow-sm'
                            : 'text-slate-500 hover:text-slate-700'
                        }`}
                      >
                        Modo Edição
                      </button>
                    </div>

                    {/* Saved notification */}
                    <AnimatePresence>
                      {savedNotification && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          className="flex items-center gap-1.5 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 px-3 py-1.5 rounded-lg"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Salva no histórico
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <div className="flex gap-2">
                    {generatedHtml && (
                      <motion.div
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex gap-2 items-center"
                      >
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleImageUpload}
                          className="hidden"
                          accept="image/*"
                        />
                        <button
                          onClick={() => fileInputRef.current?.click()}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                          title="Subir imagem para o documento"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                          Anexar Imagem
                        </button>
                        {hasImageOrPlaceholder && (
                          <button
                            onClick={handleRemoveImage}
                            className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors shadow-sm"
                            title="Remover imagem"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={handleCopyClipboard}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                        >
                          {copySuccess ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                          {copySuccess ? 'Copiado!' : 'Copiar'}
                        </button>
                        <button
                          onClick={handleDownloadPdf}
                          className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors shadow-sm"
                          title="Baixar em PDF"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          PDF
                        </button>
                        <button
                          onClick={handleDownload}
                          className="flex items-center gap-2 px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-lg"
                          title="Baixar em HTML"
                        >
                          <Download className="w-3.5 h-3.5" />
                          HTML
                        </button>
                      </motion.div>
                    )}
                  </div>
                </div>

                <div className="w-full h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden relative">
                  <AnimatePresence mode="wait">
                    {!generatedHtml && !isLoading ? (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4"
                      >
                        <Eye className="w-12 h-12 opacity-20" />
                        <p className="text-sm font-medium">Aguardando geração do conteúdo...</p>
                      </motion.div>
                    ) : isLoading ? (
                      <motion.div
                        key="loading"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute inset-0 flex flex-col items-center justify-center bg-white/80 backdrop-blur-sm z-10 gap-4"
                      >
                        <Loader2 className="w-10 h-10 text-indigo-500 animate-spin" />
                        <p className="text-sm font-medium text-slate-600">
                          O assistente está redigindo o relatório técnico...
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>

                  <iframe
                    ref={iframeRef}
                    className="w-full h-full border-none"
                    title="Meeting Minutes Preview"
                  />
                </div>

                {error && (
                  <div className="p-3 rounded-lg bg-red-50 border border-red-100 text-red-600 text-xs font-medium">
                    {error}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
