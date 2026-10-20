# FocusFlow — מערכת מעקב קשב ולמידה

FocusFlow היא מערכת Full-Stack חכמה למעקב וניטור רמת קשב וריכוז של סטודנטים ותלמידים במהלך למידה עצמאית. המערכת מזהה נקודות ציון פנים באמצעות מצלמת הרשת, מעבדת רצפי תנועה ומפיקה מדדי קשב בזמן אמת, תוך שמירה מלאה על פרטיות המשתמש.

---

## 🛠️ טכנולוגיות הפרויקט

### Frontend
* **Framework:** React 19 + TypeScript + Vite
* **UI:** Tailwind CSS, Recharts
* **ML:** TensorFlow.js - רשת נוירונים בת 4 שכבות (client-side inference)
* **Face Detection:** זיהוי פיקסלים מבוסס צבע עור + מצב סימולציה
* **State Management:** React Context (Auth)

### Backend
* **Framework:** FastAPI + Pydantic v2
* **Database:** MongoDB 6.0 (Motor async driver)
* **Auth:** JWT (PyJWT) + Bcrypt password hashing
* **Validation:** Email validation, input sanitization

### Database
* **MongoDB 6.0** עם Volume עמיד (`mongo_data`)
* **Collections:** users, sessions, content

### DevOps
* **Docker + Docker Compose**
* **Health checks** לכל השירותים
* **Network isolation** (frontend ↔ backend ↔ mongodb)

---

## 🚀 אופני הרצה

### 1️⃣ Docker Compose (מומלץ - הפריסה הרשמית)

זוהי שיטת ההרצה הרשמית למטלה. כל השירותים פועלים במכולות מבודדות עם שמירת נתונים עמידה.

```bash
# העתק קובץ הגדרות סביבה
cp .env.example .env

# הרץ את כל השירותים (frontend, backend, mongodb)
docker-compose up --build

# או במצב detached
docker-compose up --build -d

# צפה בלוגים
docker-compose logs -f backend
docker-compose logs -f frontend

# עצור
docker-compose down

# עצור ומחק volumes (נקה את MongoDB)
docker-compose down -v
```

**גישה:**
* Frontend: http://localhost:3000
* Backend API: http://localhost:8000
* API Docs (Swagger): http://localhost:8000/docs
* Health Check: http://localhost:8000/health

**שמירת נתונים:** MongoDB Volume (`mongo_data`) - הנתונים נשמרים בין הפעלות

---

### 2️⃣ פיתוח מקומי (npm run dev)

פיתוח מהיר עם hot-reload. שרת Express מקומי (`server.ts`) עם MongoDB או in-memory fallback.

```bash
# התקן תלויות
npm install

# התקן תלויות Python (אופציונלי - רק אם רוצים להריץ בדיקות)
cd backend
pip install -r requirements.txt
cd ..

# הרץ שרת פיתוח (ציפייה: MongoDB פועל מקומית או fallback ל-in-memory)
npm run dev
```

**גישה:** http://localhost:3000

**שמירת נתונים:** 
- MongoDB אם פועל על `mongodb://localhost:27017`
- אחרת: In-memory (אבד בהפעלה מחדש)

---

## 🧪 בדיקות Backend

```bash
cd backend

# הרץ את כל הבדיקות
python -m pytest tests/test_api.py -v

# הרץ רק בדיקות שלא זקוקות ל-MongoDB (מהיר - 0.06s)
python -m pytest tests/test_api.py -v -k "not requires_db"

# הרץ רק בדיקות שזקוקות ל-MongoDB
python -m pytest tests/test_api.py -v -m requires_db
```

**בדיקות קיימות:**
- ✅ Health endpoint
- ✅ Registration validation (email, password strength)
- ✅ Protected endpoints (401 without auth)
- ✅ Full auth flow (register → login → JWT → protected routes) [requires MongoDB]
- ✅ Session CRUD flow [requires MongoDB]
- ✅ User isolation (users can't access each other's sessions) [requires MongoDB]

---

## 📂 מבנה התיקיות

```text
├── backend/
│   ├── app/
│   │   ├── api/              # API routers (auth, sessions, content)
│   │   ├── auth/             # JWT, password hashing, dependencies
│   │   ├── database/         # MongoDB connection (Motor)
│   │   ├── models/           # Pydantic models (User, Session, Content)
│   │   ├── config.py         # Settings (env vars)
│   │   └── main.py           # FastAPI app + CORS
│   ├── tests/                # Pytest test suite
│   ├── requirements.txt      # Python dependencies
│   └── Dockerfile            # Backend container image
│
├── src/
│   ├── components/           # React components
│   ├── pages/                # Page components (Login, Session, History, Library)
│   ├── context/              # AuthContext
│   ├── services/             # API client
│   ├── ml/                   # Neural network model + trained weights
│   │   ├── model.ts          # 4-layer TypeScript NN
│   │   ├── trained_model_weights.json
│   │   ├── inference.ts      # Real-time attention prediction
│   │   └── featureExtractor.ts
│   └── main.tsx              # App entry
│
├── docker-compose.yml        # Multi-container orchestration
├── Dockerfile                # Frontend container (Vite build + serve)
├── server.ts                 # Express dev server (MongoDB + in-memory fallback)
├── .env.example              # Environment variables template
├── .env                      # Local environment config (not committed)
└── README.md                 # זה המסמך
```


---

## 🧠 ארכיטקטורת Machine Learning

### איך זה עובד?

**FocusFlow משתמש ברשת נוירונים client-side** שרצה לגמרי בדפדפן (JavaScript/TypeScript).

1. **זיהוי פנים:** זיהוי מבוסס פיקסלים (skin color detection) או מצב סימולציה
2. **Feature Extraction:** עיבוד 68 נקודות ציון → 15 תכונות מתקדמות
3. **Neural Network:** 4 שכבות (input: 15 → hidden: 64 → 32 → output: 1)
4. **Inference:** חיזוי רמת קשב בזמן אמת (0-100)

### מצבי הפעלה

**מצב סימולציה (Simulation Mode):**
- יוצר נתוני landmarks סינתטיים ריאליסטיים
- מומלץ להדגמה ובדיקה
- אין צורך במצלמה

**מצב מצלמה (Camera Mode):**
- זיהוי פנים אמיתי מהמצלמה
- דיוק נמוך יותר (פיקסלים בלבד, לא MediaPipe)
- דורש הרשאת מצלמה

### המודל המאומן

* **קובץ:** `src/ml/trained_model_weights.json`
* **ארכיטקטורה:** Dense layers [15, 64, 32, 1]
* **אימון:** נתונים סינתטיים + augmentation
* **הערה:** לדיוק אמיתי יש לאמן על נתוני קשב אמיתיים

**הערה חשובה:** ה-backend (Python/FastAPI) **לא** מבצע inference. כל ה-ML רץ ב-browser.

---

## 🔒 אבטחה ופרטיות

* **אימות:** JWT tokens עם Bcrypt password hashing (cost=12)
* **HTTPS-only cookies** (בפרודקשן)
* **CORS configuration** מוגדר ב-.env
* **Password validation:** אורך מינימלי, חוזק
* **Email validation:** Pydantic + email-validator
* **Private by design:** זיהוי פנים רץ במכשיר המשתמש, אין העלאת וידאו לשרת

---

## 🐛 Troubleshooting

### Docker Compose לא עולה

```bash
# בדוק שהפורטים פנויים
netstat -ano | findstr :3000
netstat -ano | findstr :8000
netstat -ano | findstr :27017

# בדוק את לוגים של השירותים
docker-compose logs backend
docker-compose logs frontend
docker-compose logs mongodb
```

### MongoDB לא מתחבר

```bash
# ודא ש-MongoDB פועל
docker-compose ps

# הכנס למכולת MongoDB
docker-compose exec mongodb mongosh

# בדוק קישוריות
docker-compose exec backend ping mongodb
```

### Frontend לא רואה Backend

**בעיה:** Calls ל-`/api/...` מחזירים 404

**פתרון:** וודא ש-`VITE_API_URL=http://localhost:8000` מוגדר ב-`docker-compose.yml` כ-**build arg**.

```yaml
frontend:
  build:
    context: .
    args:
      VITE_API_URL: http://localhost:8000  # ← זה חשוב!
```

### בדיקות Backend נכשלות

```bash
# וודא שכל התלויות מותקנות
cd backend
pip install -r requirements.txt

# הרץ רק בדיקות שלא זקוקות ל-MongoDB
python -m pytest tests/test_api.py -v -k "not requires_db"
```

---

## 📊 תכונות מרכזיות

### דף Session (מעקב בזמן אמת)
- ✅ זיהוי פנים (simulation או camera mode)
- ✅ חיזוי קשב בזמן אמת (0-100)
- ✅ גרף מד קשב (Gauge)
- ✅ גרף Timeline
- ✅ שמירה אוטומטית של רצפי קשב לשרת

### דף History (היסטוריה אישית)
- ✅ טבלת כל ה-Sessions
- ✅ גרף מגמות לאורך זמן
- ✅ **Empty state** כשאין sessions
- ✅ פילטר לפי תוכן
- ✅ מחיקת sessions

### דף Library (ספרייה משותפת)
- ✅ רשימת תכנים
- ✅ תגיות (tags)
- ✅ חיפוש וסינון
- ✅ קישורים חיצוניים

### אימות משתמשים
- ✅ הרשמה (email + password + display_name)
- ✅ התחברות (JWT tokens)
- ✅ Protected routes
- ✅ שמירת username ב-localStorage + רענון מהשרת
- ✅ בידוד מלא בין משתמשים

---

## 🔄 שינויים שבוצעו במהלך הפיתוח

### 1. תיקון Graph חסר (HistoryPage)
**בעיה:** הגרף לא הופיע כשלא היו sessions.

**פתרון:** Empty state עם הודעה בעברית וכפתור CTA.

### 2. Session Persistence (server.ts)
**בעיה:** כל הנתונים אבדו בהפעלה מחדש (in-memory Maps).

**פתרון:** שכתוב מלא של `server.ts` עם MongoDB + fallback graceful.

### 3. Docker Frontend/Backend Communication
**בעיה:** Frontend קרא ל-`/api/...` יחסי, הגיע לשרת הסטטי (3000) במקום ל-backend (8000).

**פתרון:** 
- `VITE_API_URL` כ-build arg ב-`docker-compose.yml`
- Embed ב-bundle הסטטי בזמן build
- Browser עושה absolute calls ל-`http://localhost:8000/api/...`

### 4. Backend Tests
**בעיה:** Missing dependencies, Pydantic v2 deprecations, תלות ב-MongoDB.

**פתרון:**
- התקנת `email-validator`
- עדכון ל-`SettingsConfigDict`
- הפרדת בדיקות: basic (ללא DB) vs. full (עם `@pytest.mark.requires_db`)

### 5. Health Endpoint
**תיעוד:** הבהרה ש-ML רץ client-side בלבד, ONNX_MODEL_PATH לא בשימוש.

---

## 👥 תרומה

פרויקט זה פותח כחלק ממטלת Full-Stack Development.

**Technologies Stack Summary:**
- Frontend: React 19 + TypeScript + Vite + Tailwind CSS
- Backend: FastAPI + Motor (async MongoDB)
- ML: TensorFlow.js (client-side neural network)
- DevOps: Docker + Docker Compose

---

## 📄 License

This project is part of an academic assignment.

---

## 📞 קבלת עזרה

אם אתה נתקל בבעיות:

1. בדוק את ה-**Troubleshooting section** למעלה
2. צפה בלוגים: `docker-compose logs -f`
3. בדוק שהפורטים פנויים: 3000, 8000, 27017
4. וודא שיש לך Docker Desktop פועל

**שאלות נפוצות:**

**שאלה:** "הגרף לא מופיע בדף History"
**תשובה:** נורמלי אם אין sessions. לך ל-Session, הרץ session, וחזור ל-History.

**שאלה:** "Backend לא מגיב ב-Docker"
**תשובה:** וודא ש-`VITE_API_URL=http://localhost:8000` מוגדר כ-build arg (לא env).

**שאלה:** "MongoDB לא שומר נתונים"
**תשובה:** וודא שלא הרצת `docker-compose down -v` (זה מוחק volumes).

---

**✨ בהצלחה! ✨**
