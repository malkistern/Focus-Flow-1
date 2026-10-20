import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { contentService } from '../services/contentService';
import { ContentItem, ContentType } from '../types';
import { getYouTubeEmbedUrl, extractYouTubeId } from '../utils/youtube';
import {
  BookOpen,
  Plus,
  Video,
  FileText,
  Play,
  Eye,
  Trash2,
  X,
  AlertCircle,
  Loader2,
  Calendar,
  ExternalLink,
  Sparkles
} from 'lucide-react';

export const LibraryPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [items, setItems] = useState<ContentItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Add modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<ContentType>('text');
  const [newText, setNewText] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // View modal state
  const [viewingItem, setViewingItem] = useState<ContentItem | null>(null);

  // Delete modal state
  const [deletingItem, setDeletingItem] = useState<ContentItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const fetchContent = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data = await contentService.list();
      setItems(data);
    } catch (err: any) {
      setErrorMessage(err.message || 'שגיאה בטעינת חומרי הלמידה.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchContent();
  }, []);

  const handleOpenAddModal = () => {
    setNewTitle('');
    setNewType('text');
    setNewText('');
    setNewUrl('');
    setModalError(null);
    setIsAddModalOpen(true);
  };

  const handleCreateContent = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    const titleClean = newTitle.trim();
    if (!titleClean || titleClean.length < 2) {
      setModalError('נא להזין כותרת באורך של לפחות 2 תווים.');
      return;
    }

    if (newType === 'text') {
      if (!newText.trim()) {
        setModalError('נא להזין את תוכן הטקסט לקריאה.');
        return;
      }
    } else {
      if (!newUrl.trim()) {
        setModalError('נא להזין קישור לסרטון YouTube.');
        return;
      }
      const ytid = extractYouTubeId(newUrl);
      if (!ytid) {
        setModalError('כתובת ה-YouTube שהוזנה אינה תקינה. אנא הזינו קישור תקין מ-YouTube.');
        return;
      }
    }

    setIsSaving(true);
    try {
      const created = await contentService.create({
        title: titleClean,
        content_type: newType,
        text: newType === 'text' ? newText.trim() : undefined,
        url: newType === 'youtube' ? newUrl.trim() : undefined,
      });

      setItems([created, ...items]);
      setIsAddModalOpen(false);
    } catch (err: any) {
      setModalError(err.message || 'שגיאה בשמירת חומר הלמידה.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    try {
      await contentService.delete(deletingItem.id);
      setItems(items.filter((item) => item.id !== deletingItem.id));
      setDeletingItem(null);
      if (viewingItem?.id === deletingItem.id) {
        setViewingItem(null);
      }
    } catch (err: any) {
      alert(err.message || 'שגיאה במחיקת הפריט.');
    } finally {
      setIsDeleting(false);
    }
  };

  const startSessionWithContent = (contentId: string) => {
    navigate(`/session?contentId=${contentId}`);
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      return d.toLocaleDateString('he-IL', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
      });
    } catch {
      return '';
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Top Banner / Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <BookOpen className="w-5 h-5" />
            <span className="text-xs font-semibold tracking-wide uppercase">ספריית תכנים</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            חומרי הלמידה של {user?.display_name || 'הסטודנט'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            שמרו טקסטים לקריאה וסרטוני YouTube, והפעילו עליהם סשן מעקב קשב חי
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          type="button"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
        >
          <Plus className="w-4 h-4" />
          <span>הוסף חומר למידה חדש</span>
        </button>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-700 text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-500" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={fetchContent}
            className="text-xs font-semibold text-rose-700 underline hover:text-rose-900"
          >
            נסה שוב
          </button>
        </div>
      )}

      {/* Loading state */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center text-slate-500">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
          <p className="text-sm font-medium">טוען את חומרי הלמידה שלך...</p>
        </div>
      ) : items.length === 0 ? (
        /* Empty State */
        <div className="py-16 px-4 bg-white border border-slate-200 rounded-2xl text-center max-w-xl mx-auto shadow-xs">
          <div className="w-16 h-16 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-4">
            <BookOpen className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">אין עדיין חומרי למידה בספרייה</h2>
          <p className="text-sm text-slate-500 mb-6 leading-relaxed">
            כדי להתחיל לעקוב אחר רמת הקשב שלך, הוסף טקסט לימודי שברצונך לקרוא או קישור לסרטון הרצאה מ-YouTube.
          </p>
          <button
            onClick={handleOpenAddModal}
            type="button"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-xs transition-colors cursor-pointer text-sm"
          >
            <Plus className="w-4 h-4" />
            <span>הוסף את חומר הלמידה הראשון</span>
          </button>
        </div>
      ) : (
        /* Content Grid */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((item) => {
            const isVideo = item.content_type === 'youtube';
            const ytId = isVideo && item.url ? extractYouTubeId(item.url) : null;

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-200 hover:shadow-md transition-all duration-200 flex flex-col overflow-hidden group"
              >
                {/* Visual Header / Thumbnail */}
                <div className="relative aspect-video bg-slate-100 flex items-center justify-center overflow-hidden border-b border-slate-100">
                  {isVideo && ytId ? (
                    <>
                      <img
                        src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`}
                        alt={item.title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-slate-900/20 group-hover:bg-slate-900/10 transition-colors" />
                      <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 bg-red-600 text-white text-xs font-semibold rounded-md shadow-xs flex items-center gap-1.5">
                        <Video className="w-3.5 h-3.5" />
                        <span>וידאו YouTube</span>
                      </div>
                    </>
                  ) : (
                    <div className="w-full h-full p-4 flex flex-col justify-between bg-gradient-to-br from-indigo-50/50 to-slate-50">
                      <div className="flex items-center justify-between">
                        <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-md flex items-center gap-1">
                          <FileText className="w-3.5 h-3.5" />
                          <span>טקסט לקריאה</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed font-sans">
                        {item.text || 'תוכן טקסטואלי ללמידה וקריאה מרוכזת...'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-5 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base mb-2 line-clamp-2 leading-snug group-hover:text-indigo-600 transition-colors">
                      {item.title}
                    </h3>

                    <div className="flex items-center gap-2 text-xs text-slate-400 mb-4">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>נוצר ב-{formatDate(item.created_at)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                    <button
                      onClick={() => startSessionWithContent(item.id)}
                      type="button"
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>התחל סשן קשב</span>
                    </button>

                    <button
                      onClick={() => setViewingItem(item)}
                      type="button"
                      aria-label="צפה בתוכן"
                      className="p-2 text-slate-600 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="צפה בתוכן"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => setDeletingItem(item)}
                      type="button"
                      aria-label="מחק תוכן"
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="מחק תוכן"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- ADD CONTENT MODAL --- */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-xl border border-slate-200 animate-scale-up">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <div className="flex items-center gap-2 text-slate-900 font-bold text-lg">
                <Plus className="w-5 h-5 text-indigo-600" />
                <span>הוספת חומר למידה חדש</span>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateContent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  כותרת חומר הלמידה
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="לדוגמה: מבוא לבינה מלאכותית - שיעור 1"
                  className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              {/* Type selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  סוג חומר הלמידה
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setNewType('text')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                      newType === 'text'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-2xs font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <FileText className="w-4 h-4" />
                    <span>טקסט לקריאה</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewType('youtube')}
                    className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                      newType === 'youtube'
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-2xs font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <Video className="w-4 h-4" />
                    <span>סרטון YouTube</span>
                  </button>
                </div>
              </div>

              {/* Conditional input based on type */}
              {newType === 'text' ? (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-700">
                      תוכן הטקסט הלימודי
                    </label>
                    <span className="text-[11px] text-slate-400">
                      {newText.length} תווים
                    </span>
                  </div>
                  <textarea
                    rows={6}
                    required
                    value={newText}
                    onChange={(e) => setNewText(e.target.value)}
                    placeholder="הדביקו כאן את הטקסט, המאמר או הפרק לקריאה במהלך סשן הריכוז..."
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 resize-none font-sans leading-relaxed"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    קישור לסרטון ב-YouTube
                  </label>
                  <input
                    type="url"
                    required
                    value={newUrl}
                    onChange={(e) => setNewUrl(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    dir="ltr"
                    className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">
                    תומך בקישורי youtube.com/watch או youtu.be
                  </p>
                </div>
              )}

              {/* Form buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>שומר חומר למידה...</span>
                    </>
                  ) : (
                    <span>שמור חומר בספרייה</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CONTENT VIEWER MODAL --- */}
      {viewingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-slate-200">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-indigo-50 text-indigo-600">
                  {viewingItem.content_type === 'youtube' ? (
                    <Video className="w-5 h-5" />
                  ) : (
                    <FileText className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900">{viewingItem.title}</h2>
                  <span className="text-xs text-slate-500">
                    {viewingItem.content_type === 'youtube' ? 'סרטון YouTube' : 'טקסט לימודי'} • נוצר ב-{formatDate(viewingItem.created_at)}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setViewingItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 flex-1 overflow-y-auto">
              {viewingItem.content_type === 'youtube' && viewingItem.url ? (
                <div className="space-y-4">
                  <div className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-inner">
                    <iframe
                      src={getYouTubeEmbedUrl(viewingItem.url) || ''}
                      title={viewingItem.title}
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="w-full h-full border-0"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                    <span dir="ltr" className="truncate">{viewingItem.url}</span>
                    <a
                      href={viewingItem.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline shrink-0"
                    >
                      <span>פתח ישירות ב-YouTube</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              ) : (
                <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-sans whitespace-pre-wrap text-base">
                  {viewingItem.text}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex items-center justify-between">
              <button
                onClick={() => setViewingItem(null)}
                className="px-4 py-2 text-sm text-slate-600 hover:text-slate-800 font-medium"
              >
                סגור
              </button>
              <button
                onClick={() => {
                  const targetId = viewingItem.id;
                  setViewingItem(null);
                  startSessionWithContent(targetId);
                }}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>התחל סשן למידה עם תוכן זה</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- DELETE CONFIRMATION MODAL --- */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-xl border border-slate-200 text-center animate-scale-up">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <Trash2 className="w-6 h-6" />
            </div>
            <h3 className="text-lg font-bold text-slate-900 mb-1">מחיקת חומר למידה</h3>
            <p className="text-xs text-slate-500 mb-5 leading-relaxed">
              האם אתה בטוח שברצונך למחוק את <strong>&quot;{deletingItem.title}&quot;</strong>? פעולה זו הינה בלתי הפיכה.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setDeletingItem(null)}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                ביטול
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
                className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-sm font-medium shadow-xs disabled:opacity-50"
              >
                {isDeleting ? 'מוחק...' : 'מחק לצמיתות'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
