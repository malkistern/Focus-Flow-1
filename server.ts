import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { MongoClient, Db, ObjectId, Collection } from 'mongodb';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'focusflow_jwt_secret_dev_32_characters_long_key_12345';
const JWT_EXPIRES_IN = '7d';
const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017/focusflow';
const MONGODB_DB_NAME = process.env.MONGODB_DB_NAME || 'focusflow';

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ─── Database Layer ──────────────────────────────────────────────────────────
// Supports both MongoDB (persistent) and in-memory fallback

interface UserDoc {
  _id?: string | ObjectId;
  id?: string;
  email: string;
  password_hash: string;
  display_name: string;
  created_at: string;
}

interface ContentDoc {
  _id?: string | ObjectId;
  id?: string;
  user_id: string;
  title: string;
  content_type: 'text' | 'youtube';
  text?: string;
  url?: string;
  created_at: string;
}

interface ReadingDoc {
  _id?: string | ObjectId;
  id?: string;
  session_id: string;
  timestamp: string;
  attention_score: number | null;
  face_detected: boolean;
  prediction_source: string;
}

interface SessionDoc {
  _id?: string | ObjectId;
  id?: string;
  user_id: string;
  content_id: string;
  content_title?: string;
  started_at: string;
  ended_at: string | null;
  duration_seconds: number;
  status: 'active' | 'completed';
  average_attention: number | null;
  valid_readings_count: number;
  total_readings_count: number;
}

// In-memory fallback (used when MongoDB is unavailable)
const memUsers: Map<string, UserDoc> = new Map();
const memContent: Map<string, ContentDoc> = new Map();
const memSessions: Map<string, SessionDoc> = new Map();
const memReadings: Map<string, ReadingDoc> = new Map();

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let usingMongo = false;

function generateId(): string {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

async function connectToMongo(): Promise<void> {
  try {
    const client = new MongoClient(MONGODB_URL, {
      serverSelectionTimeoutMS: 3000,
      connectTimeoutMS: 3000,
    });
    await client.connect();
    await client.db('admin').command({ ping: 1 });
    mongoClient = client;
    mongoDb = client.db(MONGODB_DB_NAME);
    usingMongo = true;

    // Create indexes for efficient queries
    await mongoDb.collection('users').createIndex({ email: 1 }, { unique: true });
    await mongoDb.collection('sessions').createIndex({ user_id: 1, started_at: -1 });
    await mongoDb.collection('readings').createIndex({ session_id: 1, timestamp: 1 });
    await mongoDb.collection('content').createIndex({ user_id: 1, created_at: -1 });

    console.log(`[FocusFlow] MongoDB connected: ${MONGODB_URL} (db: ${MONGODB_DB_NAME})`);
  } catch (err: any) {
    console.warn(`[FocusFlow] MongoDB unavailable (${err.message}). Using in-memory store.`);
    usingMongo = false;
    mongoDb = null;
    mongoClient = null;
  }
}

/** Serialize a MongoDB document to the legacy flat format the rest of the code expects */
function serializeDoc<T extends { _id?: ObjectId | string; id?: string }>(doc: T): T & { id: string } {
  const id = doc._id ? doc._id.toString() : doc.id!;
  const { _id, ...rest } = doc as any;
  return { ...rest, id };
}

// ─── DB Abstraction ───────────────────────────────────────────────────────────

const db = {
  users: {
    async findByEmail(email: string): Promise<UserDoc | null> {
      if (usingMongo && mongoDb) {
        const doc = await mongoDb.collection<UserDoc>('users').findOne({ email });
        return doc ? serializeDoc(doc) : null;
      }
      for (const u of memUsers.values()) {
        if (u.email === email) return u;
      }
      return null;
    },
    async findById(id: string): Promise<UserDoc | null> {
      if (usingMongo && mongoDb) {
        let query: any;
        try { query = { _id: new ObjectId(id) }; } catch { query = { _id: id }; }
        const doc = await mongoDb.collection<UserDoc>('users').findOne(query);
        return doc ? serializeDoc(doc) : null;
      }
      return memUsers.get(id) || null;
    },
    async create(data: Omit<UserDoc, '_id' | 'id'>): Promise<UserDoc> {
      if (usingMongo && mongoDb) {
        const result = await mongoDb.collection<UserDoc>('users').insertOne(data as any);
        return serializeDoc({ ...data, _id: result.insertedId });
      }
      const id = generateId();
      const newUser = { ...data, id };
      memUsers.set(id, newUser);
      return newUser;
    },
  },
  content: {
    async listByUser(userId: string): Promise<ContentDoc[]> {
      if (usingMongo && mongoDb) {
        const docs = await mongoDb.collection<ContentDoc>('content')
          .find({ user_id: userId })
          .sort({ created_at: -1 })
          .toArray();
        return docs.map(serializeDoc);
      }
      const result: ContentDoc[] = [];
      for (const item of memContent.values()) {
        if (item.user_id === userId) result.push(item);
      }
      return result.sort((a, b) => new Date(b.created_at!).getTime() - new Date(a.created_at!).getTime());
    },
    async findById(id: string): Promise<ContentDoc | null> {
      if (usingMongo && mongoDb) {
        let query: any;
        try { query = { _id: new ObjectId(id) }; } catch { query = { _id: id }; }
        const doc = await mongoDb.collection<ContentDoc>('content').findOne(query);
        return doc ? serializeDoc(doc) : null;
      }
      return memContent.get(id) || null;
    },
    async create(data: Omit<ContentDoc, '_id' | 'id'>): Promise<ContentDoc> {
      if (usingMongo && mongoDb) {
        const result = await mongoDb.collection<ContentDoc>('content').insertOne(data as any);
        return serializeDoc({ ...data, _id: result.insertedId });
      }
      const id = generateId();
      const newItem = { ...data, id };
      memContent.set(id, newItem);
      return newItem;
    },
    async delete(id: string): Promise<boolean> {
      if (usingMongo && mongoDb) {
        let query: any;
        try { query = { _id: new ObjectId(id) }; } catch { query = { _id: id }; }
        const result = await mongoDb.collection('content').deleteOne(query);
        return result.deletedCount > 0;
      }
      return memContent.delete(id);
    },
  },
  sessions: {
    async listByUser(userId: string): Promise<SessionDoc[]> {
      if (usingMongo && mongoDb) {
        const docs = await mongoDb.collection<SessionDoc>('sessions')
          .find({ user_id: userId })
          .sort({ started_at: -1 })
          .toArray();
        return docs.map(serializeDoc);
      }
      const result: SessionDoc[] = [];
      for (const s of memSessions.values()) {
        if (s.user_id === userId) result.push(s);
      }
      return result.sort((a, b) => new Date(b.started_at!).getTime() - new Date(a.started_at!).getTime());
    },
    async findById(id: string): Promise<SessionDoc | null> {
      if (usingMongo && mongoDb) {
        let query: any;
        try { query = { _id: new ObjectId(id) }; } catch { query = { _id: id }; }
        const doc = await mongoDb.collection<SessionDoc>('sessions').findOne(query);
        return doc ? serializeDoc(doc) : null;
      }
      return memSessions.get(id) || null;
    },
    async create(data: Omit<SessionDoc, '_id' | 'id'>): Promise<SessionDoc> {
      if (usingMongo && mongoDb) {
        const result = await mongoDb.collection<SessionDoc>('sessions').insertOne(data as any);
        return serializeDoc({ ...data, _id: result.insertedId });
      }
      const id = generateId();
      const newSession = { ...data, id };
      memSessions.set(id, newSession);
      return newSession;
    },
    async update(id: string, fields: Partial<SessionDoc>): Promise<void> {
      if (usingMongo && mongoDb) {
        let query: any;
        try { query = { _id: new ObjectId(id) }; } catch { query = { _id: id }; }
        await mongoDb.collection('sessions').updateOne(query, { $set: fields });
        return;
      }
      const s = memSessions.get(id);
      if (s) memSessions.set(id, { ...s, ...fields });
    },
    async increment(id: string, inc: Partial<Record<string, number>>): Promise<void> {
      if (usingMongo && mongoDb) {
        let query: any;
        try { query = { _id: new ObjectId(id) }; } catch { query = { _id: id }; }
        await mongoDb.collection('sessions').updateOne(query, { $inc: inc });
        return;
      }
      const s = memSessions.get(id);
      if (s) {
        const updated = { ...s } as any;
        for (const [k, v] of Object.entries(inc)) {
          updated[k] = (updated[k] || 0) + v;
        }
        memSessions.set(id, updated);
      }
    },
  },
  readings: {
    async listBySession(sessionId: string): Promise<ReadingDoc[]> {
      if (usingMongo && mongoDb) {
        const docs = await mongoDb.collection<ReadingDoc>('readings')
          .find({ session_id: sessionId })
          .sort({ timestamp: 1 })
          .toArray();
        return docs.map(serializeDoc);
      }
      const result: ReadingDoc[] = [];
      for (const r of memReadings.values()) {
        if (r.session_id === sessionId) result.push(r);
      }
      return result.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    },
    async countBySession(sessionId: string): Promise<number> {
      if (usingMongo && mongoDb) {
        return mongoDb.collection('readings').countDocuments({ session_id: sessionId });
      }
      let count = 0;
      for (const r of memReadings.values()) {
        if (r.session_id === sessionId) count++;
      }
      return count;
    },
    async validScoresBySession(sessionId: string): Promise<number[]> {
      if (usingMongo && mongoDb) {
        const docs = await mongoDb.collection<ReadingDoc>('readings')
          .find({ session_id: sessionId, face_detected: true, attention_score: { $ne: null } })
          .toArray();
        return docs.map((d) => d.attention_score as number);
      }
      const scores: number[] = [];
      for (const r of memReadings.values()) {
        if (r.session_id === sessionId && r.face_detected && r.attention_score !== null) {
          scores.push(r.attention_score);
        }
      }
      return scores;
    },
    async create(data: Omit<ReadingDoc, '_id' | 'id'>): Promise<ReadingDoc> {
      if (usingMongo && mongoDb) {
        const result = await mongoDb.collection<ReadingDoc>('readings').insertOne(data as any);
        return serializeDoc({ ...data, _id: result.insertedId });
      }
      const id = generateId();
      const newReading = { ...data, id };
      memReadings.set(id, newReading);
      return newReading;
    },
  },
};

// ─── Auth Middleware ──────────────────────────────────────────────────────────

interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    display_name: string;
  };
}

async function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  let token: string | undefined;
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.cookies && req.cookies.access_token) {
    token = req.cookies.access_token;
  }

  if (!token) {
    res.status(401).json({ detail: 'נדרשת התחברות למערכת. לא סופק מפתח גישה תקף.' });
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    const user = await db.users.findById(payload.sub);
    if (!user) {
      res.status(401).json({ detail: 'המשתמש אינו קיים במערכת.' });
      return;
    }
    req.user = { id: user.id!, email: user.email, display_name: user.display_name };
    next();
  } catch {
    res.status(401).json({ detail: 'טוקן האימות פג תוקף או אינו תקף. אנא התחבר מחדש.' });
  }
}

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'in-memory';
  if (usingMongo && mongoClient) {
    try {
      await mongoClient.db('admin').command({ ping: 1 });
      dbStatus = 'mongodb-connected';
    } catch {
      dbStatus = 'mongodb-disconnected';
    }
  }
  res.status(200).json({
    status: 'healthy',
    app: 'FocusFlow',
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    database: { status: dbStatus, type: usingMongo ? 'mongodb' : 'in-memory' },
    simulation_mode: process.env.ATTENTION_SIMULATION_MODE !== 'false',
    message_he: 'שרת FocusFlow פועל בהצלחה',
  });
});

// ─── Auth Endpoints ───────────────────────────────────────────────────────────

app.post('/api/auth/register', async (req: Request, res: Response) => {
  const { email, password, display_name } = req.body;
  if (!email || !password || !display_name) {
    res.status(400).json({ detail: 'כל השדות הינם שדות חובה.' });
    return;
  }
  const emailClean = String(email).toLowerCase().trim();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(emailClean)) {
    res.status(400).json({ detail: 'כתובת אימייל אינה תקינה.' });
    return;
  }
  if (String(password).length < 8) {
    res.status(400).json({ detail: 'הסיסמה חייבת להכיל לפחות 8 תווים.' });
    return;
  }
  if (String(display_name).trim().length < 2) {
    res.status(400).json({ detail: 'שם התצוגה חייב להכיל לפחות 2 תווים.' });
    return;
  }
  const existing = await db.users.findByEmail(emailClean);
  if (existing) {
    res.status(400).json({ detail: 'כתובת האימייל כבר קיימת במערכת. אנא התחבר.' });
    return;
  }
  const salt = await bcrypt.genSalt(10);
  const password_hash = await bcrypt.hash(password, salt);
  const newUser = await db.users.create({
    email: emailClean,
    password_hash,
    display_name: String(display_name).trim(),
    created_at: new Date().toISOString(),
  });
  const token = jwt.sign({ sub: newUser.id!, email: emailClean }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.cookie('access_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.status(201).json({
    access_token: token,
    token_type: 'bearer',
    user: { id: newUser.id!, email: newUser.email, display_name: newUser.display_name, created_at: newUser.created_at },
  });
});

app.post('/api/auth/login', async (req: Request, res: Response) => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ detail: 'יש להזין אימייל וסיסמה.' });
    return;
  }
  const emailClean = String(email).toLowerCase().trim();
  const foundUser = await db.users.findByEmail(emailClean);
  if (!foundUser) {
    res.status(401).json({ detail: 'כתובת אימייל או סיסמה שגויים. אנא נסה שוב.' });
    return;
  }
  const validPassword = await bcrypt.compare(password, foundUser.password_hash);
  if (!validPassword) {
    res.status(401).json({ detail: 'כתובת אימייל או סיסמה שגויים. אנא נסה שוב.' });
    return;
  }
  const token = jwt.sign({ sub: foundUser.id!, email: foundUser.email }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
  res.cookie('access_token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000, sameSite: 'lax' });
  res.status(200).json({
    access_token: token,
    token_type: 'bearer',
    user: { id: foundUser.id!, email: foundUser.email, display_name: foundUser.display_name, created_at: foundUser.created_at },
  });
});

app.post('/api/auth/logout', (_req: Request, res: Response) => {
  res.clearCookie('access_token');
  res.status(200).json({ message: 'התנתקת בהצלחה מהמערכת', status: 'success' });
});

app.get('/api/auth/me', authenticateToken, (req: AuthenticatedRequest, res: Response) => {
  res.status(200).json({
    id: req.user!.id,
    email: req.user!.email,
    display_name: req.user!.display_name,
    created_at: new Date().toISOString(),
  });
});

// ─── Content Endpoints ────────────────────────────────────────────────────────

app.post('/api/content', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { title, content_type, text, url } = req.body;
  if (!title || String(title).trim().length < 2) {
    res.status(400).json({ detail: 'כותרת התוכן חייבת להכיל לפחות 2 תווים.' });
    return;
  }
  if (content_type !== 'text' && content_type !== 'youtube') {
    res.status(400).json({ detail: 'סוג תוכן לא חוקי. מותר טקסט או יוטיוב בלבד.' });
    return;
  }
  if (content_type === 'text' && (!text || !String(text).trim())) {
    res.status(400).json({ detail: 'תוכן טקסטואלי אינו יכול להיות ריק כאשר סוג התוכן הוא טקסט.' });
    return;
  }
  if (content_type === 'youtube') {
    if (!url || !String(url).trim()) {
      res.status(400).json({ detail: 'קישור וידאו נדרש כאשר סוג התוכן הוא יוטיוב.' });
      return;
    }
    const cleanUrl = String(url).trim();
    if (!cleanUrl.includes('youtube.com') && !cleanUrl.includes('youtu.be')) {
      res.status(400).json({ detail: 'יש להזין כתובת YouTube תקינה (youtube.com או youtu.be).' });
      return;
    }
  }
  const newDoc = await db.content.create({
    user_id: req.user!.id,
    title: String(title).trim(),
    content_type,
    text: text ? String(text).trim() : undefined,
    url: url ? String(url).trim() : undefined,
    created_at: new Date().toISOString(),
  });
  res.status(201).json(newDoc);
});

app.get('/api/content', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const items = await db.content.listByUser(req.user!.id);
  res.status(200).json(items);
});

app.get('/api/content/:content_id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const item = await db.content.findById(req.params.content_id);
  if (!item) {
    res.status(404).json({ detail: 'חומר הלמידה המבוקש לא נמצא.' });
    return;
  }
  if (item.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לגשת לחומר למידה זה.' });
    return;
  }
  res.status(200).json(item);
});

app.delete('/api/content/:content_id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const item = await db.content.findById(req.params.content_id);
  if (!item) {
    res.status(404).json({ detail: 'חומר הלמידה המבוקש לא נמצא.' });
    return;
  }
  if (item.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה למחוק חומר למידה זה.' });
    return;
  }
  await db.content.delete(req.params.content_id);
  res.status(200).json({ message: 'חומר הלמידה נמחק בהצלחה', id: req.params.content_id });
});

// ─── Session Endpoints ────────────────────────────────────────────────────────

app.post('/api/sessions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const { content_id } = req.body;
  if (!content_id) {
    res.status(400).json({ detail: 'נדרש מזהה חומר למידה.' });
    return;
  }
  const contentDoc = await db.content.findById(content_id);
  if (!contentDoc) {
    res.status(404).json({ detail: 'חומר הלמידה המבוקש עבור הסשן לא נמצא.' });
    return;
  }
  if (contentDoc.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לפתוח סשן עבור תוכן זה.' });
    return;
  }
  const newSession = await db.sessions.create({
    user_id: req.user!.id,
    content_id: contentDoc.id!,
    content_title: contentDoc.title,
    started_at: new Date().toISOString(),
    ended_at: null,
    duration_seconds: 0,
    status: 'active',
    average_attention: null,
    valid_readings_count: 0,
    total_readings_count: 0,
  });
  res.status(201).json(newSession);
});

app.post('/api/sessions/:session_id/readings', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const session = await db.sessions.findById(req.params.session_id);
  if (!session) {
    res.status(404).json({ detail: 'סשן הלמידה לא נמצא.' });
    return;
  }
  if (session.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה להוסיף נתונים לסשן זה.' });
    return;
  }
  if (session.status === 'completed') {
    res.status(400).json({ detail: 'הסשן כבר הסתיים. לא ניתן להוסיף דגימות נוספות.' });
    return;
  }
  const { timestamp, attention_score, face_detected, prediction_source } = req.body;
  const validScore = face_detected && typeof attention_score === 'number'
    ? Math.max(0, Math.min(1, attention_score))
    : null;

  const reading = await db.readings.create({
    session_id: session.id!,
    timestamp: timestamp || new Date().toISOString(),
    attention_score: validScore,
    face_detected: Boolean(face_detected),
    prediction_source: prediction_source || 'simulation',
  });

  const inc: any = { total_readings_count: 1 };
  if (validScore !== null) inc.valid_readings_count = 1;
  await db.sessions.increment(session.id!, inc);

  res.status(201).json(reading);
});

app.post('/api/sessions/:session_id/end', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const session = await db.sessions.findById(req.params.session_id);
  if (!session) {
    res.status(404).json({ detail: 'סשן הלמידה לא נמצא.' });
    return;
  }
  if (session.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לסיים סשן זה.' });
    return;
  }

  const now = new Date();
  const startedAt = new Date(session.started_at);
  const durationSeconds = Math.max(1, Math.round((now.getTime() - startedAt.getTime()) / 1000));

  const validScores = await db.readings.validScoresBySession(session.id!);
  const totalReadings = await db.readings.countBySession(session.id!);

  const avgAttention = validScores.length > 0
    ? Math.round((validScores.reduce((a, b) => a + b, 0) / validScores.length) * 1000) / 1000
    : null;

  const updateFields: Partial<SessionDoc> = {
    ended_at: now.toISOString(),
    duration_seconds: durationSeconds,
    status: 'completed',
    average_attention: avgAttention,
    valid_readings_count: validScores.length,
    total_readings_count: totalReadings,
  };

  await db.sessions.update(session.id!, updateFields);

  res.status(200).json({ ...session, ...updateFields });
});

app.get('/api/sessions', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const userSessions = await db.sessions.listByUser(req.user!.id);
  res.status(200).json(userSessions);
});

app.get('/api/sessions/:session_id', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  const session = await db.sessions.findById(req.params.session_id);
  if (!session) {
    res.status(404).json({ detail: 'סשן הלמידה לא נמצא.' });
    return;
  }
  if (session.user_id !== req.user!.id) {
    res.status(403).json({ detail: 'אין לך הרשאה לצפות בסשן זה.' });
    return;
  }
  const sessionReadings = await db.readings.listBySession(session.id!);
  res.status(200).json({ ...session, readings: sessionReadings });
});

// ─── Vite / Static Serving ────────────────────────────────────────────────────

async function startServer() {
  await connectToMongo();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FocusFlow Server running on http://0.0.0.0:${PORT} [DB: ${usingMongo ? 'MongoDB' : 'in-memory'}]`);
  });
}

startServer();
