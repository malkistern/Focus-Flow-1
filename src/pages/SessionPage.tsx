import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { contentService } from '../services/contentService';
import { sessionService } from '../services/sessionService';
import { ContentItem, Session } from '../types';
import { AttentionPipeline, Landmark3D, PipelineInferenceResult } from '../services/attentionPipeline';
import { WebcamLandmarkDetector } from '../components/WebcamLandmarkDetector';
import { AttentionGauge } from '../components/AttentionGauge';
import { AttentionTimelineChart } from '../components/AttentionTimelineChart';
import { getYouTubeEmbedUrl } from '../utils/youtube';
import {
  Camera,
  Play,
  Square,
  AlertTriangle,
  Clock,
  BookOpen,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  Video,
  FileText,
  Sliders,
  Info
} from 'lucide-react';

export const SessionPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const preselectedContentId = searchParams.get('contentId');

  const [contentList, setContentList] = useState<ContentItem[]>([]);
  const [selectedContent, setSelectedContent] = useState<ContentItem | null>(null);
  const [isLoadingContent, setIsLoadingContent] = useState(true);

  // Session state
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [durationSeconds, setDurationSeconds] = useState(0);

  // Attention & Pipeline state
  const pipelineRef = useRef<AttentionPipeline>(new AttentionPipeline());
  const lastSavedReadingTime = useRef<number>(0);
  const [currentScore, setCurrentScore] = useState<number | null>(null);
  const [faceDetected, setFaceDetected] = useState<boolean>(true);
  const [isBuffering, setIsBuffering] = useState<boolean>(true);
  const [bufferCount, setBufferCount] = useState<number>(0);
  const [lowAttentionAlert, setLowAttentionAlert] = useState<boolean>(false);
  const [threshold] = useState<number>(0.45); // 45% threshold
  const [diagnostics, setDiagnostics] = useState<any>(null);
  const [liveReadings, setLiveReadings] = useState<{ timestamp: string; score: number | null; faceDetected: boolean }[]>([]);

  // Summary modal upon ending session
  const [completedSession, setCompletedSession] = useState<Session | null>(null);
  const [isEndingSession, setIsEndingSession] = useState(false);

  // Load user's content materials
  useEffect(() => {
    async function loadContent() {
      setIsLoadingContent(true);
      try {
        const items = await contentService.list();
        setContentList(items);

        if (preselectedContentId) {
          const match = items.find((i) => i.id === preselectedContentId);
          if (match) setSelectedContent(match);
        } else if (items.length > 0) {
          setSelectedContent(items[0]);
        }
      } catch (err) {
        console.error('Failed to load content for session', err);
      } finally {
        setIsLoadingContent(false);
      }
    }
    loadContent();
  }, [preselectedContentId]);

  // Session timer ticker
  useEffect(() => {
    let timer: any = null;
    if (isSessionActive) {
      timer = setInterval(() => {
        setDurationSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setDurationSeconds(0);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isSessionActive]);

  const [isSimulatedSession, setIsSimulatedSession] = useState<boolean>(false);

  // Callback from Webcam detector
  const handleFrameProcessed = (
    hasFace: boolean,
    landmarks: Landmark3D[] | null,
    isSimulation = false
  ) => {
    setIsSimulatedSession(isSimulation);
    if (!isSessionActive || !activeSession) return;

    const result: PipelineInferenceResult = pipelineRef.current.addFrame(
      hasFace,
      landmarks,
      isSimulation
    );

    setFaceDetected(result.faceDetected);
    setBufferCount(result.frameCount);
    setIsBuffering(!result.isReady);
    setDiagnostics(result.diagnostics);

    if (result.faceDetected && result.attentionScore !== null) {
      setCurrentScore(result.attentionScore);

      // Check threshold alert
      if (result.attentionScore < threshold) {
        setLowAttentionAlert(true);
      } else {
        setLowAttentionAlert(false);
      }
    } else if (!result.faceDetected) {
      setCurrentScore(null);
      setLowAttentionAlert(false);
    }

    // Stream reading to live chart and backend (throttled to every 1000ms)
    const now = Date.now();
    if (now - lastSavedReadingTime.current >= 950) {
      lastSavedReadingTime.current = now;
      const readingObj = {
        timestamp: new Date().toISOString(),
        score: result.faceDetected ? result.attentionScore : null,
        faceDetected: result.faceDetected,
        prediction_source: result.predictionSource,
      };

      setLiveReadings((prev) => [...prev.slice(-60), readingObj]); // keep last 60 seconds

      sessionService.addReading(activeSession.id, {
        timestamp: readingObj.timestamp,
        attention_score: readingObj.score,
        face_detected: result.faceDetected,
        prediction_source: result.predictionSource,
      }).catch((e) => console.error('Error adding reading', e));
    }
  };

  const handleStartSession = async () => {
    if (!selectedContent) return;

    try {
      const newSession = await sessionService.create(selectedContent.id);
      setActiveSession(newSession);
      pipelineRef.current.reset();
      lastSavedReadingTime.current = 0;
      setLiveReadings([]);
      setIsBuffering(true);
      setBufferCount(0);
      setCurrentScore(null);
      setLowAttentionAlert(false);
      setIsSessionActive(true);
    } catch (err: any) {
      alert(err.message || 'שגיאה בפתיחת סשן למידה.');
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;

    setIsEndingSession(true);
    try {
      const finished = await sessionService.end(activeSession.id);
      setCompletedSession(finished);
      setIsSessionActive(false);
      setActiveSession(null);
      pipelineRef.current.reset();
    } catch (err: any) {
      alert(err.message || 'שגיאה בסיום הסשן.');
    } finally {
      setIsEndingSession(false);
    }
  };

  const formatTimer = (totalSeconds: number) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      
      {/* Session Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-indigo-600 mb-1">
            <Camera className="w-5 h-5" />
            <span className="text-xs font-semibold uppercase tracking-wider">סשן למידה ומעקב קשב</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">
            {isSessionActive && selectedContent ? (
              <span>סשן פעיל: {selectedContent.title}</span>
            ) : (
              <span>הפעלת סשן למידה חדש</span>
            )}
          </h1>
        </div>

        {/* Content selector / Controls */}
        <div className="flex items-center gap-3">
          {!isSessionActive ? (
            <div className="flex items-center gap-2">
              <label htmlFor="content-select" className="text-xs font-semibold text-slate-600">בחר תוכן:</label>
              <select
                id="content-select"
                aria-label="בחר חומר למידה לסשן"
                value={selectedContent?.id || ''}
                onChange={(e) => {
                  const match = contentList.find((c) => c.id === e.target.value);
                  if (match) setSelectedContent(match);
                }}
                disabled={isLoadingContent || contentList.length === 0}
                className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-medium text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/20"
              >
                {contentList.length === 0 && <option value="">אין תכנים בספרייה</option>}
                {contentList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.content_type === 'youtube' ? '🎥 ' : '📄 '} {c.title}
                  </option>
                ))}
              </select>

              <button
                onClick={handleStartSession}
                disabled={!selectedContent}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>התחל סשן למידה</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-900 text-white px-3.5 py-1.5 rounded-xl font-mono text-sm font-bold shadow-xs">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>{formatTimer(durationSeconds)}</span>
              </div>

              <button
                onClick={handleEndSession}
                disabled={isEndingSession}
                className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-semibold rounded-xl text-sm shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>{isEndingSession ? 'מסיים סשן...' : 'סיים סשן למידה'}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Low Attention Warning Alert Banner */}
      {isSessionActive && lowAttentionAlert && faceDetected && (
        <div className="mb-6 p-4 bg-rose-50 border-2 border-rose-300 rounded-2xl flex items-center justify-between text-rose-800 text-sm shadow-sm animate-pulse">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-rose-200 rounded-xl text-rose-700">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h4 className="font-bold text-rose-900">התראת ירידה ברמת הריכוז</h4>
              <p className="text-xs text-rose-700 mt-0.5">
                ציון הקשב שלך ירד מתחת לסף ה-45%. קח נשימה עמוקה והתמקד בחומר הלמידה שלפניך!
              </p>
            </div>
          </div>
          <span className="text-xs font-bold bg-rose-200 text-rose-800 px-3 py-1.5 rounded-lg">
            מתחת לסף המוגדר
          </span>
        </div>
      )}

      {/* Main Learning Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols): Learning Material Display */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs min-h-[500px] flex flex-col">
            {selectedContent ? (
              <>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {selectedContent.content_type === 'youtube' ? (
                      <span className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-semibold rounded-md flex items-center gap-1">
                        <Video className="w-3.5 h-3.5" />
                        <span>סרטון וידאו YouTube</span>
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-md flex items-center gap-1">
                        <FileText className="w-3.5 h-3.5" />
                        <span>טקסט לקריאה</span>
                      </span>
                    )}
                    <h2 className="text-lg font-bold text-slate-900">{selectedContent.title}</h2>
                  </div>
                </div>

                {/* Content View */}
                <div className="flex-1">
                  {selectedContent.content_type === 'youtube' && selectedContent.url ? (
                    <div className="relative aspect-video rounded-xl overflow-hidden bg-black shadow-md">
                      <iframe
                        src={getYouTubeEmbedUrl(selectedContent.url) || ''}
                        title={selectedContent.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    </div>
                  ) : (
                    <div className="prose prose-slate max-w-none text-slate-800 leading-relaxed font-sans whitespace-pre-wrap text-base p-2">
                      {selectedContent.text}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-slate-400 p-8">
                <BookOpen className="w-12 h-12 mb-3 text-slate-300" />
                <h3 className="text-base font-bold text-slate-700">לא נבחר חומר למידה</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm">
                  אנא בחרו חומר למידה מהספרייה או הוסיפו תוכן חדש בספרייה כדי להתחיל.
                </p>
                <Link
                  to="/library"
                  className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-indigo-600 hover:underline"
                >
                  <span>מעבר לספריית התכנים</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            )}
          </div>

          {/* Real-time Attention Timeline Graph */}
          <AttentionTimelineChart
            readings={liveReadings}
            title={isSessionActive ? 'ציר זמן קשב וריכוז בזמן אמת (חי)' : 'ציר זמן קשב וריכוז בסשן'}
            height={220}
            showThreshold={true}
            threshold={threshold}
            sourceBadge={isSimulatedSession ? 'סימולציית תרחיש AI' : 'מצלמה חיה'}
          />
        </div>

        {/* Right Column (1 Col): Webcam & Attention Gauge */}
        <div className="space-y-6">
          
          {/* Webcam / AI Simulation Component */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-700">זיהוי פנים ומצלמה (MediaPipe 3D)</span>
              {isSessionActive && (
                <span className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                  <span>מעקב פעיל</span>
                </span>
              )}
            </div>
            <WebcamLandmarkDetector
              isActive={isSessionActive}
              onFrameProcessed={handleFrameProcessed}
            />
          </div>

          {/* Attention Gauge */}
          <AttentionGauge
            score={currentScore}
            faceDetected={faceDetected}
            isBuffering={isBuffering}
            bufferCount={bufferCount}
            bufferRequired={30}
            threshold={threshold}
            isSimulated={isSimulatedSession}
            diagnostics={diagnostics}
          />
        </div>
      </div>

      {/* --- SESSION COMPLETED SUMMARY MODAL --- */}
      {completedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 text-center animate-scale-up">
            <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-4 border border-emerald-100">
              <CheckCircle2 className="w-8 h-8" />
            </div>

            <h2 className="text-2xl font-bold text-slate-900 mb-1">סשן הלמידה הסתיים בהצלחה!</h2>
            <p className="text-xs text-slate-500 mb-6">
              נתוני הקשב שלך נשמרו בהצלחה במסד הנתונים וזמינים בדף ההיסטוריה.
            </p>

            {/* Session Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">משך זמן הסשן</span>
                <span className="text-lg font-bold text-slate-900 font-mono">
                  {formatTimer(completedSession.duration_seconds)}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">ממוצע קשב תקף</span>
                <span className="text-lg font-bold text-indigo-600">
                  {completedSession.average_attention !== null
                    ? `${Math.round(completedSession.average_attention * 100)}%`
                    : 'אין דגימות'}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">דגימות פנים תקינות</span>
                <span className="text-base font-bold text-slate-800">
                  {completedSession.valid_readings_count}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center">
                <span className="text-xs text-slate-500 block mb-1">סה״כ דגימות</span>
                <span className="text-base font-bold text-slate-800">
                  {completedSession.total_readings_count}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setCompletedSession(null)}
                className="flex-1 py-2.5 px-3 border border-slate-300 rounded-xl text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                סגור
              </button>
              <button
                onClick={() => navigate('/history')}
                className="flex-1 py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold shadow-xs"
              >
                צפה בגרפים ובהיסטוריה
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
