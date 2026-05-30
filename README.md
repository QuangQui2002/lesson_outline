# NgÄ‚Â¢n HÄ‚Â ng Ă„ÂĂ¡Â»Â CĂ†Â°Ă†Â¡ng CÄ‚Â¢u HĂ¡Â»Âi & Ă„ÂÄ‚Â¡p Ä‚Ân ThÄ‚Â´ng Minh (OCR Q&A Bank)

HĂ¡Â»â€¡ thĂ¡Â»â€˜ng lĂ†Â°u trĂ¡Â»Â¯ Ă„â€˜Ă¡Â»Â cĂ†Â°Ă†Â¡ng cÄ‚Â¢u hĂ¡Â»Âi nĂ¡Â»â„¢i bĂ¡Â»â„¢ sĂ¡Â»Â­ dĂ¡Â»Â¥ng **Vue.js 3 (Vite) + Node.js Express** vÄ‚Â  lĂ†Â°u trĂ¡Â»Â¯ dĂ¡Â»Â¯ liĂ¡Â»â€¡u thÄ‚Â´ng qua tĂ¡Â»â€¡p tin JSON Ă„â€˜Ă†Â¡n giĂ¡ÂºÂ£n. HĂ¡Â»â€¡ thĂ¡Â»â€˜ng Ă„â€˜Ă†Â°Ă¡Â»Â£c trang bĂ¡Â»â€¹ cÄ‚Â´ng nghĂ¡Â»â€¡ nhĂ¡ÂºÂ­n dĂ¡ÂºÂ¡ng kÄ‚Â½ tĂ¡Â»Â± quang hĂ¡Â»Âc **Tesseract.js** giÄ‚Âºp quÄ‚Â©t vÄ‚Â  tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng trÄ‚Â­ch xuĂ¡ÂºÂ¥t nĂ¡Â»â„¢i dung cÄ‚Â¢u hĂ¡Â»Âi tĂ¡Â»Â« hÄ‚Â¬nh Ă¡ÂºÂ£nh Ă„â€˜Ă¡Â»Â cĂ†Â°Ă†Â¡ng mĂ¡Â»â„¢t cÄ‚Â¡ch nhanh chÄ‚Â³ng.

## Ä‘Å¸Å’Å¸ TÄ‚Â­nh NĂ„Æ’ng ChÄ‚Â­nh
1. **QuĂ¡ÂºÂ£n LÄ‚Â½ MÄ‚Â´n HĂ¡Â»Âc:** ThÄ‚Âªm mÄ‚Â´n hĂ¡Â»Âc, xÄ‚Â³a mÄ‚Â´n hĂ¡Â»Âc trĂ¡Â»Â±c tiĂ¡ÂºÂ¿p Ă¡Â»Å¸ sidebar (xÄ‚Â³a mÄ‚Â´n hĂ¡Â»Âc sĂ¡ÂºÂ½ tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng xÄ‚Â³a tĂ¡ÂºÂ¥t cĂ¡ÂºÂ£ cÄ‚Â¢u hĂ¡Â»Âi liÄ‚Âªn quan dĂ¡ÂºÂ¡ng cascade).
2. **QuĂ¡ÂºÂ£n LÄ‚Â½ CÄ‚Â¢u HĂ¡Â»Âi:** ThÄ‚Âªm mĂ¡Â»â€ºi, cĂ¡ÂºÂ­p nhĂ¡ÂºÂ­t nĂ¡Â»â„¢i dung, Ă„â€˜Ä‚Â¡p Ä‚Â¡n vÄ‚Â  tĂ¡Â»Â« khÄ‚Â³a (tags) cho tĂ¡Â»Â«ng cÄ‚Â¢u hĂ¡Â»Âi thuĂ¡Â»â„¢c mÄ‚Â´n hĂ¡Â»Âc.
3. **TÄ‚Â¬m KiĂ¡ÂºÂ¿m ThĂ¡Â»Âi Gian ThĂ¡Â»Â±c:** Ä‚â€ tÄ‚Â¬m kiĂ¡ÂºÂ¿m hiĂ¡Â»â€¡u nĂ„Æ’ng cao lĂ¡Â»Âc kĂ¡ÂºÂ¿t quĂ¡ÂºÂ£ trĂ¡Â»Â±c tiĂ¡ÂºÂ¿p ngay khi gÄ‚Âµ tĂ¡Â»Â« khÄ‚Â³a (tÄ‚Â¬m kiĂ¡ÂºÂ¿m theo nĂ¡Â»â„¢i dung, Ă„â€˜Ä‚Â¡p Ä‚Â¡n hoĂ¡ÂºÂ·c cÄ‚Â¡c tags tĂ¡Â»Â« khÄ‚Â³a).
4. **QuÄ‚Â©t ChĂ¡Â»Â¯ HÄ‚Â¬nh Ă¡ÂºÂ¢nh (OCR):** TĂ¡ÂºÂ£i hÄ‚Â¬nh Ă¡ÂºÂ£nh Ă„â€˜Ă¡Â»Â cĂ†Â°Ă†Â¡ng lÄ‚Âªn (kÄ‚Â©o thĂ¡ÂºÂ£ hoĂ¡ÂºÂ·c chĂ¡Â»Ân tĂ¡Â»â€¡p), hĂ¡Â»â€¡ thĂ¡Â»â€˜ng sĂ¡ÂºÂ½ sĂ¡Â»Â­ dĂ¡Â»Â¥ng **Tesseract.js** Ă¡Â»Å¸ backend Ă„â€˜Ă¡Â»Æ’ nhĂ¡ÂºÂ­n diĂ¡Â»â€¡n chĂ¡Â»Â¯ tiĂ¡ÂºÂ¿ng ViĂ¡Â»â€¡t vÄ‚Â  hiĂ¡Â»Æ’n thĂ¡Â»â€¹ khung soĂ¡ÂºÂ¡n thĂ¡ÂºÂ£o cho phÄ‚Â©p bĂ¡ÂºÂ¡n kiĂ¡Â»Æ’m tra, chĂ¡Â»â€°nh sĂ¡Â»Â­a trĂ†Â°Ă¡Â»â€ºc khi lĂ†Â°u vÄ‚Â o cĂ†Â¡ sĂ¡Â»Å¸ dĂ¡Â»Â¯ liĂ¡Â»â€¡u.
5. **Giao DiĂ¡Â»â€¡n HiĂ¡Â»â€¡n Ă„ÂĂ¡ÂºÂ¡i & Dark Mode:** Ă„ÂĂ†Â°Ă¡Â»Â£c thiĂ¡ÂºÂ¿t kĂ¡ÂºÂ¿ tĂ¡Â»â€˜i giĂ¡ÂºÂ£n, responsive, mang Ă„â€˜Ă¡ÂºÂ­m phong cÄ‚Â¡ch dashboard cao cĂ¡ÂºÂ¥p vĂ¡Â»â€ºi cÄ‚Â¡c hiĂ¡Â»â€¡u Ă¡Â»Â©ng kÄ‚Â­nh (glassmorphism), chuyĂ¡Â»Æ’n giao diĂ¡Â»â€¡n sÄ‚Â¡ng/tĂ¡Â»â€˜i mĂ†Â°Ă¡Â»Â£t mÄ‚Â .

---

## Ä‘Å¸â€ºÂ Ă¯Â¸Â YÄ‚Âªu CĂ¡ÂºÂ§u HĂ¡Â»â€¡ ThĂ¡Â»â€˜ng
* MÄ‚Â¡y tÄ‚Â­nh Ă„â€˜Ä‚Â£ cÄ‚Â i Ă„â€˜Ă¡ÂºÂ·t **Node.js** (KhuyĂ¡ÂºÂ¿n nghĂ¡Â»â€¹ phiÄ‚Âªn bĂ¡ÂºÂ£n 18 trĂ¡Â»Å¸ lÄ‚Âªn)
* KĂ¡ÂºÂ¿t nĂ¡Â»â€˜i Internet (trong lĂ¡ÂºÂ§n chĂ¡ÂºÂ¡y OCR Ă„â€˜Ă¡ÂºÂ§u tiÄ‚Âªn, Tesseract.js cĂ¡ÂºÂ§n tĂ¡ÂºÂ£i gÄ‚Â³i dĂ¡Â»Â¯ liĂ¡Â»â€¡u ngÄ‚Â´n ngĂ¡Â»Â¯ tiĂ¡ÂºÂ¿ng ViĂ¡Â»â€¡t vÄ‚Â  tiĂ¡ÂºÂ¿ng Anh)

---

## Ä‘Å¸Ââ‚¬ HĂ†Â°Ă¡Â»â€ºng DĂ¡ÂºÂ«n CÄ‚Â i Ă„ÂĂ¡ÂºÂ·t VÄ‚Â  ChĂ¡ÂºÂ¡y DĂ¡Â»Â± Ä‚Ân

DĂ¡Â»Â± Ä‚Â¡n Ă„â€˜Ă†Â°Ă¡Â»Â£c chia lÄ‚Â m hai phĂ¡ÂºÂ§n chÄ‚Â­nh: **backend** (API Express) vÄ‚Â  **frontend** (VueJS Vite). DĂ†Â°Ă¡Â»â€ºi Ă„â€˜Ä‚Â¢y lÄ‚Â  cÄ‚Â¡ch khĂ¡Â»Å¸i Ă„â€˜Ă¡Â»â„¢ng chi tiĂ¡ÂºÂ¿t.

### BĂ†Â°Ă¡Â»â€ºc 1: KhĂ¡Â»Å¸i Ă„â€˜Ă¡Â»â„¢ng Backend (Express API)
1. MĂ¡Â»Å¸ terminal vÄ‚Â  chuyĂ¡Â»Æ’n hĂ†Â°Ă¡Â»â€ºng vÄ‚Â o thĂ†Â° mĂ¡Â»Â¥c backend:
   ```bash
   cd backend
   ```
2. CÄ‚Â i Ă„â€˜Ă¡ÂºÂ·t cÄ‚Â¡c gÄ‚Â³i phĂ¡Â»Â¥ thuĂ¡Â»â„¢c:
   ```bash
   npm install
   ```
3. ChĂ¡ÂºÂ¡y Server Ă¡Â»Å¸ chĂ¡ÂºÂ¿ Ă„â€˜Ă¡Â»â„¢ phÄ‚Â¡t triĂ¡Â»Æ’n (SĂ¡Â»Â­ dĂ¡Â»Â¥ng `nodemon` Ă„â€˜Ă¡Â»Æ’ tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng khĂ¡Â»Å¸i Ă„â€˜Ă¡Â»â„¢ng lĂ¡ÂºÂ¡i khi thay Ă„â€˜Ă¡Â»â€¢i code):
   ```bash
   npm run dev
   ```
   * *Server API sĂ¡ÂºÂ½ chĂ¡ÂºÂ¡y tĂ¡ÂºÂ¡i: **http://localhost:3000***
   * *DĂ¡Â»Â¯ liĂ¡Â»â€¡u Ă„â€˜Ă¡Â»Â cĂ†Â°Ă†Â¡ng Ă„â€˜Ă†Â°Ă¡Â»Â£c lĂ†Â°u tĂ¡ÂºÂ¡i file local: `backend/data/db.json`*

### BĂ†Â°Ă¡Â»â€ºc 2: KhĂ¡Â»Å¸i Ă„â€˜Ă¡Â»â„¢ng Frontend (VueJS + Vite)
1. MĂ¡Â»Å¸ mĂ¡Â»â„¢t terminal mĂ¡Â»â€ºi vÄ‚Â  chuyĂ¡Â»Æ’n hĂ†Â°Ă¡Â»â€ºng vÄ‚Â o thĂ†Â° mĂ¡Â»Â¥c frontend:
   ```bash
   cd frontend
   ```
2. CÄ‚Â i Ă„â€˜Ă¡ÂºÂ·t cÄ‚Â¡c gÄ‚Â³i phĂ¡Â»Â¥ thuĂ¡Â»â„¢c:
   ```bash
   npm install
   ```
3. KhĂ¡Â»Å¸i Ă„â€˜Ă¡Â»â„¢ng Vite dev server:
   ```bash
   npm run dev
   ```
   * *Ă¡Â»Â¨ng dĂ¡Â»Â¥ng Web sĂ¡ÂºÂ½ Ă„â€˜Ă†Â°Ă¡Â»Â£c khĂ¡Â»Å¸i tĂ¡ÂºÂ¡o tĂ¡ÂºÂ¡i: **http://localhost:5173***
   * MĂ¡Â»Å¸ trÄ‚Â¬nh duyĂ¡Â»â€¡t vÄ‚Â  truy cĂ¡ÂºÂ­p Ă„â€˜Ă¡Â»â€¹a chĂ¡Â»â€° trÄ‚Âªn Ă„â€˜Ă¡Â»Æ’ trĂ¡ÂºÂ£i nghiĂ¡Â»â€¡m Ă¡Â»Â©ng dĂ¡Â»Â¥ng.

---

## Ä‘Å¸â€”â€Ă¯Â¸Â CĂ¡ÂºÂ¥u TrÄ‚Âºc DĂ¡Â»Â± Ä‚Ân
```
d:\lesson_outline\
Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ backend\                   # NodeJS Express API
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ data/db.json           # File lĂ†Â°u trĂ¡Â»Â¯ dĂ¡Â»Â¯ liĂ¡Â»â€¡u JSON cĂ¡Â»Â¥c bĂ¡Â»â„¢
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ controllers/           # XĂ¡Â»Â­ lÄ‚Â½ logic nghiĂ¡Â»â€¡p vĂ¡Â»Â¥ API
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ routes/                # CĂ¡ÂºÂ¥u hÄ‚Â¬nh Ă„â€˜Ă¡Â»â€¹nh tuyĂ¡ÂºÂ¿n API
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ services/              # DĂ¡Â»â€¹ch vĂ¡Â»Â¥ Ă„â€˜Ă¡Â»Âc ghi DB, xĂ¡Â»Â­ lÄ‚Â½ OCR
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ middleware/            # CĂ¡ÂºÂ¥u hÄ‚Â¬nh tĂ¡ÂºÂ£i Ă¡ÂºÂ£nh Multer, bĂ¡ÂºÂ¯t lĂ¡Â»â€”i
Ă¢â€â€   Ă¢â€â€Ă¢â€â‚¬Ă¢â€â‚¬ server.js              # Entrypoint cĂ¡Â»Â§a Backend
Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ frontend\                  # VueJS Vite Web App
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ src/
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ assets/styles.css  # Giao diĂ¡Â»â€¡n CSS tÄ‚Â¹y biĂ¡ÂºÂ¿n cao cĂ¡ÂºÂ¥p (Light/Dark Mode)
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ components/        # CÄ‚Â¡c component dÄ‚Â¹ng chung (Modal, Danh sÄ‚Â¡ch mÄ‚Â´n hĂ¡Â»Âc/cÄ‚Â¢u hĂ¡Â»Âi)
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ composables/       # QuĂ¡ÂºÂ£n lÄ‚Â½ trĂ¡ÂºÂ¡ng thÄ‚Â¡i giao diĂ¡Â»â€¡n tĂ¡Â»â€˜i (useDarkMode)
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ layouts/           # DefaultLayout (sidebar & top-bar)
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ pages/Dashboard.vue# Trang Dashboard chÄ‚Â­nh cĂ¡Â»Â§a Ă¡Â»Â©ng dĂ¡Â»Â¥ng
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ services/api.js    # Axios Client kĂ¡ÂºÂ¿t nĂ¡Â»â€˜i Backend API
Ă¢â€â€   Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ App.vue            # Component gĂ¡Â»â€˜c cĂ¡Â»Â§a Vue
Ă¢â€â€   Ă¢â€â€   Ă¢â€â€Ă¢â€â‚¬Ă¢â€â‚¬ main.js            # Entrypoint cĂ¡Â»Â§a Frontend
Ă¢â€â€   Ă¢â€Å“Ă¢â€â‚¬Ă¢â€â‚¬ index.html             # HTML Shell chÄ‚Â­nh
Ă¢â€â€   Ă¢â€â€Ă¢â€â‚¬Ă¢â€â‚¬ vite.config.js         # CĂ¡ÂºÂ¥u hÄ‚Â¬nh Vite
Ă¢â€â€Ă¢â€â‚¬Ă¢â€â‚¬ README.md                  # HĂ†Â°Ă¡Â»â€ºng dĂ¡ÂºÂ«n chĂ¡ÂºÂ¡y dĂ¡Â»Â± Ä‚Â¡n nÄ‚Â y
```

---

## Ä‘Å¸â€™Â¡ LĂ†Â°u Ä‚Â½ khi quÄ‚Â©t Ă¡ÂºÂ£nh OCR
* LĂ¡ÂºÂ§n Ă„â€˜Ă¡ÂºÂ§u tiÄ‚Âªn bĂ¡ÂºÂ¡n sĂ¡Â»Â­ dĂ¡Â»Â¥ng tÄ‚Â­nh nĂ„Æ’ng **QuÄ‚Â©t Ă¡ÂºÂ¢nh OCR**, thĂ†Â° viĂ¡Â»â€¡n `tesseract.js` sĂ¡ÂºÂ½ tĂ¡Â»Â± Ă„â€˜Ă¡Â»â„¢ng tĂ¡ÂºÂ£i 2 file ngÄ‚Â´n ngĂ¡Â»Â¯ `vie.traineddata` (TiĂ¡ÂºÂ¿ng ViĂ¡Â»â€¡t) vÄ‚Â  `eng.traineddata` (TiĂ¡ÂºÂ¿ng Anh) tĂ¡Â»Â« CDN toÄ‚Â n cĂ¡ÂºÂ§u vĂ¡Â»Â lĂ†Â°u trĂ¡Â»Â¯ cĂ¡Â»Â¥c bĂ¡Â»â„¢ Ă„â€˜Ă¡Â»Æ’ xĂ¡Â»Â­ lÄ‚Â½. CÄ‚Â¡c lĂ¡ÂºÂ§n quÄ‚Â©t tiĂ¡ÂºÂ¿p theo sĂ¡ÂºÂ½ diĂ¡Â»â€¦n ra cĂ¡Â»Â±c kĂ¡Â»Â³ nhanh chÄ‚Â³ng mÄ‚Â  khÄ‚Â´ng cĂ¡ÂºÂ§n tĂ¡ÂºÂ£i lĂ¡ÂºÂ¡i.
* Ă„ÂĂ¡Â»Æ’ Ă„â€˜Ă¡ÂºÂ¡t Ă„â€˜Ă¡Â»â„¢ chÄ‚Â­nh xÄ‚Â¡c cao nhĂ¡ÂºÂ¥t cho OCR, hÄ‚Â£y Ă„â€˜Ă¡ÂºÂ£m bĂ¡ÂºÂ£o Ă¡ÂºÂ£nh tĂ¡ÂºÂ£i lÄ‚Âªn rÄ‚Âµ chĂ¡Â»Â¯, khÄ‚Â´ng bĂ¡Â»â€¹ nhÄ‚Â²e vÄ‚Â  cÄ‚Â³ gÄ‚Â³c xoay thĂ¡ÂºÂ³ng.

## LĂ†Â°u trĂ¡Â»Â¯ dĂ¡Â»Â¯ liĂ¡Â»â€¡u bĂ¡ÂºÂ±ng Supabase

Production nÄ‚Âªn dÄ‚Â¹ng Supabase thay cho `backend/data/db.json` Ă„â€˜Ă¡Â»Æ’ dĂ¡Â»Â¯ liĂ¡Â»â€¡u khÄ‚Â´ng mĂ¡ÂºÂ¥t khi Render/Vercel redeploy.

### 1. TĂ¡ÂºÂ¡o bĂ¡ÂºÂ£ng

VÄ‚Â o Supabase Dashboard Ă¢â€ â€™ SQL Editor Ă¢â€ â€™ chĂ¡ÂºÂ¡y nĂ¡Â»â„¢i dung file:

```text
backend/supabase/schema.sql
```

### 2. CĂ¡ÂºÂ¥u hÄ‚Â¬nh biĂ¡ÂºÂ¿n mÄ‚Â´i trĂ†Â°Ă¡Â»Âng backend

Local dev: copy file mĂ¡ÂºÂ«u rĂ¡Â»â€œi Ă„â€˜iĂ¡Â»Ân key thĂ¡ÂºÂ­t:

```powershell
Copy-Item backend/.env.example backend/.env
```

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Render/Vercel: thÄ‚Âªm cÄ‚Â¹ng cÄ‚Â¡c biĂ¡ÂºÂ¿n trÄ‚Âªn trong Environment Variables cĂ¡Â»Â§a backend service.

KhÄ‚Â´ng Ă„â€˜Ă†Â°a `backend/.env` hoĂ¡ÂºÂ·c `SUPABASE_SERVICE_ROLE_KEY` vÄ‚Â o frontend/GitHub.

### 3. Import dĂ¡Â»Â¯ liĂ¡Â»â€¡u cĂ…Â© tĂ¡Â»Â« JSON

ChĂ¡ÂºÂ¡y mĂ¡Â»â„¢t lĂ¡ÂºÂ§n Ă¡Â»Å¸ mÄ‚Â¡y local sau khi Ă„â€˜Ä‚Â£ set env:

```powershell
cd backend
$env:SUPABASE_URL="https://your-project.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
npm run seed:supabase
```

Khi cÄ‚Â³ `SUPABASE_URL` vÄ‚Â  `SUPABASE_SERVICE_ROLE_KEY`, backend tĂ¡Â»Â± Ă„â€˜Ă¡Â»Âc/ghi Supabase. NĂ¡ÂºÂ¿u thiĂ¡ÂºÂ¿u env, backend fallback vĂ¡Â»Â `backend/data/db.json` cho local dev.
## Telegram API notifications

Backend can send a Telegram message whenever the website calls an `/api` endpoint.

Add these variables to `backend/.env` or to your hosting provider environment variables:

```env
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_CHAT_ID=your-chat-id
TELEGRAM_NOTIFY_IGNORE_PATHS=/api/ping,/api/health/db
TELEGRAM_DAILY_REPORT_CRON=59 23 * * *
```

How to get values:

1. Create a bot with BotFather and copy the bot token.
2. Send a message to your bot or add it to a group.
3. Get the chat id, then set `TELEGRAM_CHAT_ID`.

`TELEGRAM_NOTIFY_IGNORE_PATHS` is optional. It prevents noisy notifications from health checks or keep-alive pings.

Daily report runs at 23:59 Asia/Ho_Chi_Minh by default. API stats are stored in Supabase table `api_daily_stats`; if Supabase env is missing, the backend falls back to in-memory stats for local dev.

